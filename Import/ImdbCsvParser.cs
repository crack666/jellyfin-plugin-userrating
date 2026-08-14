using System.Globalization;
using System.Text;

namespace Jellyfin.Plugin.UserRating.Import;

internal sealed class ImdbRatingRow
{
    public string ImdbId { get; init; } = string.Empty;
    public double Rating { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Year { get; init; } = string.Empty;
    public string TitleType { get; init; } = string.Empty;
}

internal static class ImdbCsvParser
{
    public static IReadOnlyList<ImdbRatingRow> Parse(Stream stream)
    {
        using var reader = new StreamReader(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), detectEncodingFromByteOrderMarks: true);
        var headerLine = reader.ReadLine();
        if (string.IsNullOrWhiteSpace(headerLine))
        {
            throw new InvalidDataException("CSV has no header row.");
        }

        var headers = SplitCsvLine(headerLine);
        var constIdx = IndexOfHeader(headers, "const");
        var ratingIdx = IndexOfHeader(headers, "your rating", "your_rating");
        if (constIdx < 0 || ratingIdx < 0)
        {
            throw new InvalidDataException(
                "Not an IMDb ratings export (expected columns Const + Your Rating). Found: "
                + string.Join(", ", headers));
        }

        var titleIdx = IndexOfHeader(headers, "title");
        var yearIdx = IndexOfHeader(headers, "year");
        var typeIdx = IndexOfHeader(headers, "title type", "titletype");

        var rows = new List<ImdbRatingRow>();
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var cols = SplitCsvLine(line);
            var imdbId = Get(cols, constIdx).Trim();
            var ratingRaw = Get(cols, ratingIdx).Trim();
            if (string.IsNullOrEmpty(imdbId) || string.IsNullOrEmpty(ratingRaw))
            {
                continue;
            }

            if (!double.TryParse(ratingRaw, NumberStyles.Number, CultureInfo.InvariantCulture, out var rating)
                || rating < 1
                || rating > 10)
            {
                continue;
            }

            rows.Add(new ImdbRatingRow
            {
                ImdbId = imdbId,
                Rating = rating,
                Title = Get(cols, titleIdx).Trim(),
                Year = Get(cols, yearIdx).Trim(),
                TitleType = Get(cols, typeIdx).Trim()
            });
        }

        return rows;
    }

    private static int IndexOfHeader(IReadOnlyList<string> headers, params string[] names)
    {
        for (var i = 0; i < headers.Count; i++)
        {
            var h = headers[i].Trim();
            foreach (var name in names)
            {
                if (string.Equals(h, name, StringComparison.OrdinalIgnoreCase))
                {
                    return i;
                }
            }
        }

        return -1;
    }

    private static string Get(IReadOnlyList<string> cols, int index)
        => index >= 0 && index < cols.Count ? cols[index] : string.Empty;

    internal static List<string> SplitCsvLine(string line)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        sb.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }
            else if (c == '"')
            {
                inQuotes = true;
            }
            else if (c == ',')
            {
                result.Add(sb.ToString());
                sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }

        result.Add(sb.ToString());
        return result;
    }
}
