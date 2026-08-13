using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.UserRating.Import;

public sealed class ImportResultDto
{
    public bool DryRun { get; set; }
    public int CsvCount { get; set; }
    public int LibraryWithImdb { get; set; }
    public int Matched { get; set; }
    public int Written { get; set; }
    public int Unchanged { get; set; }
    public int UnmatchedCount { get; set; }
    public IReadOnlyList<UnmatchedRowDto> Unmatched { get; set; } = [];
}

public sealed class UnmatchedRowDto
{
    public string ImdbId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Year { get; set; } = string.Empty;
    public string TitleType { get; set; } = string.Empty;
    public double Rating { get; set; }
}

internal sealed class ImdbRatingsImporter
{
    private const int UnmatchedCap = 200;

    private readonly ILibraryManager _libraryManager;
    private readonly IUserDataManager _userDataManager;

    public ImdbRatingsImporter(ILibraryManager libraryManager, IUserDataManager userDataManager)
    {
        _libraryManager = libraryManager;
        _userDataManager = userDataManager;
    }

    public ImportResultDto Run(User user, IReadOnlyList<ImdbRatingRow> rows, bool dryRun, BaseItemKind[] types)
    {
        var query = new InternalItemsQuery
        {
            IncludeItemTypes = types,
            Recursive = true
        };
        var items = _libraryManager.GetItemList(query);
        var library = new Dictionary<string, BaseItem>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            var imdb = item.GetProviderId(MetadataProvider.Imdb);
            if (string.IsNullOrWhiteSpace(imdb))
            {
                continue;
            }

            library.TryAdd(imdb.Trim(), item);
        }

        var unmatched = new List<UnmatchedRowDto>();
        var matched = 0;
        var written = 0;
        var unchanged = 0;

        foreach (var row in rows)
        {
            if (!library.TryGetValue(row.ImdbId, out var item))
            {
                unmatched.Add(new UnmatchedRowDto
                {
                    ImdbId = row.ImdbId,
                    Title = row.Title,
                    Year = row.Year,
                    TitleType = row.TitleType,
                    Rating = row.Rating
                });
                continue;
            }

            matched++;
            var current = _userDataManager.GetUserData(user, item)?.Rating;
            if (current is not null && Math.Abs(current.Value - row.Rating) < 0.01)
            {
                unchanged++;
                continue;
            }

            if (!dryRun)
            {
                _userDataManager.SaveUserData(
                    user,
                    item,
                    new UpdateUserItemDataDto { Rating = row.Rating },
                    UserDataSaveReason.UpdateUserRating);
            }

            written++;
        }

        return new ImportResultDto
        {
            DryRun = dryRun,
            CsvCount = rows.Count,
            LibraryWithImdb = library.Count,
            Matched = matched,
            Written = written,
            Unchanged = unchanged,
            UnmatchedCount = unmatched.Count,
            Unmatched = unmatched
                .OrderByDescending(x => x.Rating)
                .ThenBy(x => x.Title, StringComparer.CurrentCultureIgnoreCase)
                .Take(UnmatchedCap)
                .ToList()
        };
    }
}
