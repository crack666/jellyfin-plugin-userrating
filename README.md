# Jellyfin Plugin: User Rating

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0.html)

Community plugin for **Jellyfin 10.11**. No fork of `jellyfin/jellyfin-web`.

Repository: **https://github.com/crack666/jellyfin-plugin-userrating**

Reads and writes the existing per-user field `UserData.Rating` (the same field an IMDb ratings CSV import fills).

## What the web UI can do

1. **Sort** by personal rating — entry **Eigene Bewertung** in the sort menu.
   - Classic layout: radio dialog from `libraryBrowser.showSortMenu` (`movies.js`).
   - Also covers `select.selectSortBy` and the experimental MUI `SortButton`.
   - Jellyfin 10.11 ignores `SortBy=UserRating` on the server. The plugin loads the library and sorts **in the browser**.
2. **Poster hover:** badge on `.cardOverlayContainer`.
3. **Detail page:** personal score next to the community stars. Click the score to open a dropdown (10 → 1 → –).
4. **Set:** `POST /Users/{id}/Items/{itemId}/UserData` with `{ "Rating": n }`. List badges update without a full reload.

## Credit

Built by [crack666](https://github.com/crack666) with **Cursor / Grok 4.6** — a working plugin in a short session, against stock Jellyfin 10.11.

## Build

```powershell
dotnet build -c Release
```

DLL: `bin\Release\net9.0\Jellyfin.Plugin.UserRating.dll`

Zip for Jellyfin: only the DLL in `Jellyfin.Plugin.UserRating_1.0.0.2.zip`.

## Install (TrueNAS ix-jellyfin)

Plugins directory in the container: `/config/plugins/`  
Host: `/mnt/DataPool/apps/jellyfin/config/plugins/User Rating_1.0.0.2/` (UID 568).

1. Put the DLL + `meta.json` in that folder.
2. Restart the Jellyfin app.
3. Dashboard → Plugins → User Rating.
4. Hard-reload the web UI (Ctrl+F5).

Script injection buffers **only** `GET /web` and `GET /web/index.html`, never media/API streams.
Gzip/Brotli is decompressed first; rewriting compressed bytes blanks the UI (`Accept-Encoding`).

## Roadmap

- IMDb ratings CSV import on the plugin settings page (same matching as the local Python importer: `Const` / `Your Rating` → `ProviderIds.Imdb`).

## Source notes (jellyfin-web v10.11.11)

- Sort experimental: `src/apps/experimental/components/library/SortButton.tsx`
- Sort classic radios: `src/scripts/libraryBrowser.js` → `showSortMenu`
- Community stars: `src/components/mediainfo/mediainfo.js` → `getStarIconsHtml`
- Cover hover: `src/components/cardbuilder/cardBuilder.js` → `.cardOverlayContainer`

## License

GPL-3.0-or-later (required because the plugin links Jellyfin).
