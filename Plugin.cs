using System.Globalization;
using Jellyfin.Plugin.UserRating.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Surfaces UserData.Rating in jellyfin-web without forking Jellyfin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => "User Rating";

    public override Guid Id => Guid.Parse("7e3c9a12-4b8f-4d71-9e2a-1c5f8b0d4a33");

    public override string Description =>
        "Personal UserData.Rating in the stock web UI: sort, poster badge, 10–1 picker, IMDb CSV import. https://github.com/crack666/jellyfin-plugin-userrating";

    public static Plugin? Instance { get; private set; }

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = string.Format(
                    CultureInfo.InvariantCulture,
                    "{0}.Configuration.configPage.html",
                    GetType().Namespace)
            },
            new PluginPageInfo
            {
                Name = "UserRatingConfig.js",
                EmbeddedResourcePath = string.Format(
                    CultureInfo.InvariantCulture,
                    "{0}.Configuration.config.js",
                    GetType().Namespace)
            }
        ];
    }
}
