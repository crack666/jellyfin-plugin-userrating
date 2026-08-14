using Jellyfin.Data.Enums;
using Jellyfin.Plugin.UserRating.Import;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Serves the injected web-client script and IMDb CSV import.
/// </summary>
[ApiController]
[Route("UserRating")]
public class UserRatingController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IUserDataManager _userDataManager;

    public UserRatingController(
        ILibraryManager libraryManager,
        IUserManager userManager,
        IUserDataManager userDataManager)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _userDataManager = userDataManager;
    }

    [HttpGet("client.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public IActionResult ClientScript() => EmbeddedJs("Jellyfin.Plugin.UserRating.Web.userrating.js");

    [HttpGet("i18n.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public IActionResult I18nScript()
    {
        const string prefix = "Jellyfin.Plugin.UserRating.Web.i18n.";
        const string suffix = ".json";
        var parts = new List<string>();
        foreach (var name in typeof(UserRatingController).Assembly.GetManifestResourceNames()
                     .Where(n => n.StartsWith(prefix, StringComparison.Ordinal)
                                 && n.EndsWith(suffix, StringComparison.Ordinal))
                     .OrderBy(n => n, StringComparer.Ordinal))
        {
            var locale = name[prefix.Length..^suffix.Length];
            var json = ReadEmbeddedText(name);
            if (string.IsNullOrWhiteSpace(json) || locale.StartsWith('_'))
            {
                continue;
            }

            parts.Add(System.Text.Json.JsonSerializer.Serialize(locale) + ":" + json);
        }

        if (parts.Count == 0 || !parts.Exists(p => p.StartsWith("\"en\":", StringComparison.Ordinal)))
        {
            return NotFound();
        }

        var js =
            "(function(w){"
            + "var packs={" + string.Join(",", parts) + "};"
            + "function locale(){"
            + "var raw=(document.documentElement.getAttribute('lang')"
            + "||document.documentElement.getAttribute('data-culture')"
            + "||navigator.language||'en').toLowerCase().replace('_','-');"
            + "if(packs[raw])return raw;"
            + "var short=raw.split('-')[0];"
            + "if(short==='zh'){"
            + "if(/tw|hk|hant/.test(raw))return packs['zh-tw']?'zh-tw':'en';"
            + "return packs['zh-cn']?'zh-cn':'en';"
            + "}"
            + "if(short==='pt'&&/br/.test(raw))return packs['pt-br']||packs.pt||'en';"
            + "if(packs[short])return short;"
            + "return 'en';"
            + "}"
            + "w.UserRatingI18n={"
            + "locale:locale,"
            + "t:function(key){"
            + "var loc=locale();"
            + "var pack=packs[loc]||packs.en;"
            + "return (pack&&pack[key])||packs.en[key]||key;"
            + "},"
            + "format:function(key,map){"
            + "var s=this.t(key);"
            + "if(!map){return s;}"
            + "Object.keys(map).forEach(function(k){s=s.replace(new RegExp('\\\\{'+k+'\\\\}','g'),String(map[k]));});"
            + "return s;"
            + "}"
            + "};"
            + "})(window);";

        Response.Headers.CacheControl = "no-store, no-cache";
        return Content(js, "application/javascript");
    }

    private IActionResult EmbeddedJs(string resourceName)
    {
        var stream = typeof(UserRatingController).Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "no-store, no-cache";
        return File(stream, "application/javascript");
    }

    private static string? ReadEmbeddedText(string resourceName)
    {
        var stream = typeof(UserRatingController).Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return null;
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().Trim();
    }

    [HttpGet("Users")]
    [Authorize]
    public ActionResult<IEnumerable<PluginUserDto>> ListUsers()
    {
        var users = _userManager.Users
            .OrderBy(u => u.Username, StringComparer.CurrentCultureIgnoreCase)
            .Select(u => new PluginUserDto { Id = u.Id, Name = u.Username })
            .ToList();
        return Ok(users);
    }

    [HttpPost("Import")]
    [Authorize]
    [RequestSizeLimit(10_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ImportResultDto>> Import(
        IFormFile file,
        [FromQuery] bool dryRun = true,
        [FromQuery] Guid userId = default,
        [FromQuery] string types = "Movie,Series")
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest("CSV file is missing.");
        }

        if (userId == Guid.Empty)
        {
            return BadRequest("userId is missing.");
        }

        var user = _userManager.GetUserById(userId);
        if (user is null)
        {
            return NotFound("User not found.");
        }

        IReadOnlyList<ImdbRatingRow> rows;
        try
        {
            await using var stream = file.OpenReadStream();
            rows = ImdbCsvParser.Parse(stream);
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(ex.Message);
        }

        var kinds = ParseTypes(types);
        var importer = new ImdbRatingsImporter(_libraryManager, _userDataManager);
        var result = importer.Run(user, rows, dryRun, kinds);
        return Ok(result);
    }

    private static BaseItemKind[] ParseTypes(string types)
    {
        var list = new List<BaseItemKind>();
        foreach (var raw in (types ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (Enum.TryParse<BaseItemKind>(raw, ignoreCase: true, out var kind))
            {
                list.Add(kind);
            }
        }

        return list.Count > 0 ? list.ToArray() : [BaseItemKind.Movie, BaseItemKind.Series];
    }
}

public sealed class PluginUserDto
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;
}
