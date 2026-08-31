using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.UserRating.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether item responses report the requesting user's
    /// personal rating in the CriticRating field, and whether sorting by critic rating sorts
    /// by that instead. Off by default.
    ///
    /// This is the only lever that reaches native clients — they have no notion of a personal
    /// rating. It rewrites responses only: the stored critic ratings are never touched and
    /// come back as soon as this is switched off.
    /// </summary>
    public bool OverrideCriticRating { get; set; }
}
