using System.Reflection;
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
            return BadRequest("CSV-Datei fehlt.");
        }

        if (userId == Guid.Empty)
        {
            return BadRequest("userId fehlt.");
        }

        var user = _userManager.GetUserById(userId);
        if (user is null)
        {
            return NotFound("Benutzer nicht gefunden.");
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
