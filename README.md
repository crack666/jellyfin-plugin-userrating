# Jellyfin Plugin: User Rating

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Community plugin for **Jellyfin 10.11**. No fork of `jellyfin/jellyfin-web`.

**https://github.com/crack666/jellyfin-plugin-userrating**

Uses the existing per-user field `UserData.Rating` — the same value Jellyfin already stores. Nothing extra in the database.

![Library overview with personal rating badges on posters and the star toggle in the toolbar](docs/library-overview.png)

## Features

- **Sort** by personal rating (menu entry *Eigene Bewertung*). Jellyfin 10.11 ignores `SortBy=UserRating` on the server, so the plugin loads the library and sorts in the browser.
- **Poster badge:** personal score on the cover. Hover by default; a star button in the library toolbar keeps badges visible. Sorting by *Eigene Bewertung* turns that on automatically (toggle still wins). Preference is stored in the browser (`localStorage`).
- **Detail page:** score next to the community stars. Click it for a 10→1 picker.
- **IMDb import:** Dashboard → Plugins → User Rating. Upload an IMDb *Your Ratings* CSV (`Const` + `Your Rating`). Dry-run first. Match is `ProviderIds.Imdb`. Only `UserData.Rating` is written; play state is left alone. Unmatched titles are listed, highest score first.

## Requirements

- Jellyfin **10.11** (built against ABI 10.11.0, tested on 10.11.11)
- .NET 9 to build from source

## Install

1. Download the latest `Jellyfin.Plugin.UserRating_*.zip` from [Releases](https://github.com/crack666/jellyfin-plugin-userrating/releases), or build (below) and zip **only** `Jellyfin.Plugin.UserRating.dll`.
2. Dashboard → Plugins → Catalog → gear → **Install from file** (or copy the DLL into a folder named `User Rating_<version>` under the server `plugins` directory).
3. Restart Jellyfin.
4. Hard-reload the web UI (**Ctrl+F5**).

Sideloaded plugins show a catalog warning; that is expected until this lives in the official plugin repo.

### TrueNAS SCALE (ix-jellyfin)

Plugins live in the container at `/config/plugins/` (host dataset, UID 568). Example:

`/mnt/…/apps/jellyfin/config/plugins/User Rating_1.1.0.3/Jellyfin.Plugin.UserRating.dll`

Restart the app after copying. Do not rewrite compressed `/web` HTML by hand — the plugin decompresses gzip/br before injecting its script.

## IMDb CSV

How to get the file (desktop site only — not in the IMDb app):

1. Sign in at [imdb.com](https://www.imdb.com).
2. Profile menu (top right) → **Your Ratings**.
3. Top right: **Export**, or the ⋮ menu → **Export**. You usually get `ratings.csv`. If nothing downloads, open [imdb.com/exports](https://www.imdb.com/exports/) and fetch it there.

Required columns:

- `Const` (e.g. `tt0133093`)
- `Your Rating` (1–10)

Optional but shown in the unmatched table: `Title`, `Year`, `Title Type`.

Always run **Prüfen (Dry-Run)** before **Importieren**.

## Build

```powershell
dotnet build -c Release
```

Output: `bin/Release/net9.0/Jellyfin.Plugin.UserRating.dll`

Zip that DLL as `Jellyfin.Plugin.UserRating_1.1.0.3.zip` for Dashboard install-from-file.

## Limitations

- Sort is client-side (server 10.11 does not honor `UserRating`).
- Injected web-UI strings are currently German.
- Not in the official Jellyfin plugin catalog yet (manual install).

## Contributing

Issues and pull requests are welcome. Fork the repo and open a PR against `master`.

## Credit

Built by [crack666](https://github.com/crack666) with **Cursor / Grok 4.6**, against stock Jellyfin 10.11.

## License

GPL-3.0-or-later (required: the plugin links Jellyfin).
