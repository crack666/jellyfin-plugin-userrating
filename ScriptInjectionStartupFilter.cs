using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.UserRating;

/// <summary>
/// Inserts the plugin's middleware at the start of the ASP.NET pipeline: script injection
/// into jellyfin-web, and the optional CriticRating override for native clients.
/// </summary>
public class ScriptInjectionStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<ScriptInjectionMiddleware>();
            app.UseMiddleware<RatingOverrideMiddleware>();
            next(app);
        };
    }
}
