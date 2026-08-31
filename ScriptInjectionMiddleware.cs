using System.Text;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Injects a script tag into jellyfin-web's index.html without touching Jellyfin source.
/// Only buffers GET /web and /web/index.html — never media or API streams.
/// Decompresses gzip/br first: rewriting compressed bytes as UTF-8 blanks the UI.
/// </summary>
public class ScriptInjectionMiddleware
{
    private const string Marker = "UserRating/client.js";
    private readonly RequestDelegate _next;

    public ScriptInjectionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!ShouldInject(context))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context).ConfigureAwait(false);

            buffer.Seek(0, SeekOrigin.Begin);
            context.Response.Body = originalBody;

            if (context.Response.StatusCode is < 200 or >= 300)
            {
                await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                return;
            }

            var encoding = context.Response.Headers.ContentEncoding.ToString();
            var html = await ResponseBody.ReadTextAsync(buffer, encoding).ConfigureAwait(false);
            if (html is null
                || !html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            {
                buffer.Seek(0, SeekOrigin.Begin);
                await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
                return;
            }

            if (!html.Contains(Marker, StringComparison.Ordinal))
            {
                var v = Plugin.Instance?.Version;
                var tags =
                    $"<script src=\"/UserRating/i18n.js?v={v}\"></script>"
                    + $"<script src=\"/UserRating/client.js?v={v}\" defer></script>";
                html = html.Replace("</body>", tags + "</body>", StringComparison.OrdinalIgnoreCase);
            }

            var bytes = Encoding.UTF8.GetBytes(html);
            context.Response.Headers.Remove("Content-Encoding");
            context.Response.ContentLength = bytes.Length;
            await originalBody.WriteAsync(bytes).ConfigureAwait(false);
        }
        finally
        {
            context.Response.Body = originalBody;
        }
    }

    private static bool ShouldInject(HttpContext context)
    {
        if (!HttpMethods.IsGet(context.Request.Method))
        {
            return false;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        return path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase);
    }
}
