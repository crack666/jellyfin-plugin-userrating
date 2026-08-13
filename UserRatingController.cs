using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Serves the injected web-client script.
/// </summary>
[ApiController]
[Route("UserRating")]
public class UserRatingController : ControllerBase
{
    [HttpGet("client.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public IActionResult ClientScript()
    {
        var asm = typeof(UserRatingController).Assembly;
        var name = "Jellyfin.Plugin.UserRating.Web.userrating.js";
        var stream = asm.GetManifestResourceStream(name);
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "no-store, no-cache";
        return File(stream, "application/javascript");
    }
}
