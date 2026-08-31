using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Reports the requesting user's personal rating in the rating fields that native clients
/// actually render, and re-sorts the matching <c>SortBy=</c> pages accordingly.
///
/// Native clients — Android, Android TV, FireTV, webOS, Chromecast — know nothing about
/// <c>UserData.Rating</c>: 10.11 has no <c>UserRating</c> member in <c>ItemSortBy</c> and no
/// client renders the field. They do render <c>CriticRating</c> and <c>CommunityRating</c>
/// and offer both as sort options, so borrowing one of those slots is the only way to reach
/// them at all. Each field is switched on separately in the plugin settings.
///
/// Deliberately response-only. Nothing is written to the database, the stored ratings stay
/// intact, and turning a toggle off restores them on the next request.
/// </summary>
public class RatingOverrideMiddleware
{
    /// <summary>
    /// Upper bound on the items pulled in to re-sort one page. Mirrors the cap that
    /// userrating.js uses for the same trick in the browser.
    /// </summary>
    private const int MaxScan = 20000;

    private readonly RequestDelegate _next;
    private readonly ILogger<RatingOverrideMiddleware> _logger;

    public RatingOverrideMiddleware(RequestDelegate next, ILogger<RatingOverrideMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var targets = ActiveTargets();
        if (targets.Count == 0
            || !HttpMethods.IsGet(context.Request.Method)
            || !IsItemResponse(context.Request.Path))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // Read the client's paging intent before the query is rewritten. Only a sort by a
        // field actually being borrowed is intercepted; the other one keeps its real order.
        var sortBy = context.Request.Query["SortBy"].ToString();
        var sorting = targets.Any(t => sortBy.StartsWith(t.Field, StringComparison.OrdinalIgnoreCase));
        var start = sorting ? ReadInt(context.Request.Query["StartIndex"], 0) : 0;
        var limit = sorting ? ReadInt(context.Request.Query["Limit"], int.MaxValue) : int.MaxValue;
        var descending = sorting && string.Equals(
            context.Request.Query["SortOrder"],
            "Descending",
            StringComparison.OrdinalIgnoreCase);

        RewriteQuery(context.Request, sorting);

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context).ConfigureAwait(false);

            buffer.Seek(0, SeekOrigin.Begin);
            context.Response.Body = originalBody;

            if (context.Response.StatusCode is < 200 or >= 300
                || !(context.Response.ContentType ?? string.Empty)
                    .Contains("json", StringComparison.OrdinalIgnoreCase))
            {
                await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                return;
            }

            var encoding = context.Response.Headers.ContentEncoding.ToString();
            var text = await ResponseBody.ReadTextAsync(buffer, encoding).ConfigureAwait(false);
            var root = TryParse(text);
            if (root is null)
            {
                buffer.Seek(0, SeekOrigin.Begin);
                await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                return;
            }

            if (sorting)
            {
                Resort(root, start, limit, descending, context.Request.Path);
            }

            ApplyPersonalRating(root, targets);

            var bytes = Encoding.UTF8.GetBytes(root.ToJsonString());
            context.Response.Headers.Remove("Content-Encoding");
            context.Response.ContentLength = bytes.Length;
            await originalBody.WriteAsync(bytes).ConfigureAwait(false);
        }
        finally
        {
            context.Response.Body = originalBody;
        }
    }

    /// <summary>
    /// Matches the endpoints that return items carrying UserData. Sub-resources such as
    /// <c>/Items/{id}/Images/Primary</c> fall out via the segment count — buffering an
    /// image only to hand it back unchanged would be pure waste.
    /// </summary>
    private static bool IsItemResponse(PathString path)
    {
        var value = path.Value;
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }

        var segments = value.Trim('/').ToLowerInvariant().Split('/');

        // Users/{userId}/… is the obsolete alias of the same endpoints.
        if (segments.Length >= 3 && segments[0] == "users")
        {
            segments = segments[2..];
        }

        return segments switch
        {
            ["items"] => true,
            ["items", _] => true,
            ["shows", _, "episodes"] => true,
            ["shows", _, "seasons"] => true,
            ["shows", "nextup"] => true,
            ["shows", "upcoming"] => true,
            ["playlists", _, "items"] => true,
            _ => false,
        };
    }

    private static void RewriteQuery(HttpRequest request, bool sorting)
    {
        var query = new Dictionary<string, StringValues>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in request.Query)
        {
            query[pair.Key] = pair.Value;
        }

        // The rating is read out of the very response being rewritten, so it has to be in it.
        query["EnableUserData"] = "true";

        if (sorting)
        {
            // The server cannot sort by a personal rating — there is no such ItemSortBy — so
            // pull the unpaged result and page it here. Same move userrating.js makes in the
            // browser, just early enough that native clients get it too.
            query.Remove("SortBy");
            query.Remove("SortOrder");
            query["StartIndex"] = "0";
            query["Limit"] = MaxScan.ToString(CultureInfo.InvariantCulture);
        }

        var builder = new QueryBuilder();
        foreach (var pair in query)
        {
            foreach (var value in pair.Value)
            {
                if (value is not null)
                {
                    builder.Add(pair.Key, value);
                }
            }
        }

        request.QueryString = builder.ToQueryString();
    }

    private void Resort(JsonNode root, int start, int limit, bool descending, PathString path)
    {
        if (root is not JsonObject obj || obj["Items"] is not JsonArray items)
        {
            return;
        }

        var total = ReadInt(obj["TotalRecordCount"], items.Count);
        if (total > items.Count)
        {
            _logger.LogWarning(
                "UserRating: {Path} matched {Total} items but only the first {Scanned} were re-sorted by personal rating.",
                path,
                total,
                items.Count);
        }

        // Unrated items go last in both directions, ties break on name — same order the
        // in-browser sort produces, so the two never disagree about the same library.
        var ordered = items
            .Select(node => new
            {
                Node = node,
                Rating = RatingOf(node),
                Name = NameOf(node)
            })
            .OrderBy(entry => entry.Rating is null)
            .ThenBy(entry => descending ? -(entry.Rating ?? 0d) : entry.Rating ?? 0d)
            .ThenBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase)
            .Select(entry => entry.Node)
            .ToList();

        var page = ordered
            .Skip(start)
            .Take(limit)
            .Select(node => node?.DeepClone())
            .ToArray();

        obj["Items"] = new JsonArray(page);
        obj["TotalRecordCount"] = ordered.Count;
        obj["StartIndex"] = start;
    }

    /// <summary>
    /// The fields that can stand in for the personal rating, with the scale each one is
    /// rendered on: CriticRating is 0–100 (jellyfin-androidtv divides by 100, jellyfin-web
    /// flips its fresh/rotten icon at 60), CommunityRating is already 0–10.
    /// </summary>
    private static IReadOnlyList<(string Field, double Scale)> ActiveTargets()
    {
        var config = Plugin.Instance?.Configuration;
        var targets = new List<(string, double)>(2);

        if (config?.OverrideCriticRating == true)
        {
            targets.Add(("CriticRating", 10d));
        }

        if (config?.OverrideCommunityRating == true)
        {
            targets.Add(("CommunityRating", 1d));
        }

        return targets;
    }

    /// <summary>
    /// Replaces the borrowed fields with the personal rating on every item in the payload, at
    /// any depth — list responses, single items and the nested items other endpoints embed.
    /// Items without a personal rating report no value at all: leaving the real one in place
    /// would read as a personal score that was never given.
    /// </summary>
    private static void ApplyPersonalRating(JsonNode? node, IReadOnlyList<(string Field, double Scale)> targets)
    {
        switch (node)
        {
            case JsonObject obj:
                if (obj.ContainsKey("UserData"))
                {
                    var rating = RatingOf(obj);
                    foreach (var (field, scale) in targets)
                    {
                        obj[field] = rating is null ? null : JsonValue.Create(rating.Value * scale);
                    }
                }

                foreach (var pair in obj.ToList())
                {
                    ApplyPersonalRating(pair.Value, targets);
                }

                break;

            case JsonArray array:
                foreach (var child in array.ToList())
                {
                    ApplyPersonalRating(child, targets);
                }

                break;
        }
    }

    private static JsonNode? TryParse(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(text);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private static double? RatingOf(JsonNode? node)
    {
        if (node is not JsonObject obj || obj["UserData"] is not JsonObject userData)
        {
            return null;
        }

        return userData["Rating"] is JsonValue value && value.TryGetValue<double>(out var rating)
            ? rating
            : null;
    }

    private static string NameOf(JsonNode? node)
    {
        if (node is not JsonObject obj)
        {
            return string.Empty;
        }

        var name = obj["SortName"] ?? obj["Name"];
        return name is JsonValue value && value.TryGetValue<string>(out var text)
            ? text ?? string.Empty
            : string.Empty;
    }

    private static int ReadInt(JsonNode? node, int fallback)
        => node is JsonValue value && value.TryGetValue<int>(out var parsed) ? parsed : fallback;

    private static int ReadInt(StringValues raw, int fallback)
        => int.TryParse(raw.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            && parsed > 0
                ? parsed
                : fallback;
}
