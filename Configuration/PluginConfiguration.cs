using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.UserRating.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether item responses report the requesting user's
    /// personal rating in the CriticRating field (0-100 scale, tomato icon), and whether
    /// sorting by critic rating sorts by it. Off by default.
    ///
    /// Rewrites responses only: the stored critic ratings are never touched and come back as
    /// soon as this is switched off.
    /// </summary>
    public bool OverrideCriticRating { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether item responses report the requesting user's
    /// personal rating in the CommunityRating field (0-10 stars), and whether sorting by
    /// community rating sorts by it. Off by default.
    ///
    /// Same mechanism as <see cref="OverrideCriticRating"/>, but far more visible: the stars
    /// show on cards as well as detail pages, so the community score is out of sight while
    /// this is on. Rewrites responses only, nothing is written to the database.
    /// </summary>
    public bool OverrideCommunityRating { get; set; }
}
