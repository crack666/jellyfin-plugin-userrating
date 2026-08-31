using System.IO.Compression;
using System.Text;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Reads a buffered response body as text. Jellyfin compresses responses, and rewriting
/// compressed bytes as UTF-8 produces garbage, so the encoding has to be undone first.
/// </summary>
internal static class ResponseBody
{
    /// <summary>
    /// Decodes <paramref name="buffer"/> honouring <paramref name="contentEncoding"/>.
    /// Returns <c>null</c> when the body is not decodable text, in which case the caller
    /// must pass the original bytes through untouched.
    /// </summary>
    public static async Task<string?> ReadTextAsync(MemoryStream buffer, string contentEncoding)
    {
        buffer.Seek(0, SeekOrigin.Begin);
        Stream? decompressor = null;
        try
        {
            if (contentEncoding.Contains("br", StringComparison.OrdinalIgnoreCase))
            {
                decompressor = new BrotliStream(buffer, CompressionMode.Decompress, leaveOpen: true);
            }
            else if (contentEncoding.Contains("gzip", StringComparison.OrdinalIgnoreCase))
            {
                decompressor = new GZipStream(buffer, CompressionMode.Decompress, leaveOpen: true);
            }
            else if (contentEncoding.Contains("deflate", StringComparison.OrdinalIgnoreCase))
            {
                decompressor = new DeflateStream(buffer, CompressionMode.Decompress, leaveOpen: true);
            }

            using var reader = new StreamReader(
                decompressor ?? buffer,
                Encoding.UTF8,
                detectEncodingFromByteOrderMarks: true,
                bufferSize: 1024,
                leaveOpen: true);
            return await reader.ReadToEndAsync().ConfigureAwait(false);
        }
        catch
        {
            return null;
        }
        finally
        {
            if (decompressor is not null)
            {
                await decompressor.DisposeAsync().ConfigureAwait(false);
            }
        }
    }
}
