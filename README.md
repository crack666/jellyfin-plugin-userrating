# Jellyfin Plugin: User Rating

Community-Plugin für **Jellyfin 10.11** (TrueNAS `ix-jellyfin`). Kein Fork von jellyfin/jellyfin-web.

Liest und schreibt das vorhandene Feld `UserData.Rating` (genau das, was der IMDb-Import befüllt).

## Was die Web-UI danach kann

1. **Sortieren** nach eigener Bewertung — Eintrag „Eigene Bewertung“ im Sort-Menü.
   - Classic-Layout: Option in `select.selectSortBy` (wie `movies.js`).
   - Experimental-Layout (`SortButton.tsx`, `id="sort-popover"`): Extra-Button, weil die MUI-Select-Optionen in React hardcoded sind.
   - Der Server 10.11 ignoriert `SortBy=UserRating`. Das Plugin lädt die Library und sortiert **clientseitig**.
2. **Cover-Hover:** Badge oben links auf `.cardOverlayContainer`.
3. **Detailseite:** eigene Note direkt hinter `.starRatingContainer` (Community).
4. **Setzen:** Hover auf die eigene Note → 1–10, `POST /Users/{id}/Items/{itemId}/UserData`.

## Bauen

```powershell
dotnet pack -c Release
# oder:
dotnet build -c Release
```

DLL: `bin\Release\net9.0\Jellyfin.Plugin.UserRating.dll`

Zip für Jellyfin: nur die DLL in `Jellyfin.Plugin.UserRating_1.0.0.0.zip`.

## Install auf TrueNAS (ix-jellyfin)

Plugins-Ordner im Container: `/config/plugins/`  
Host: `/mnt/DataPool/apps/jellyfin/config/plugins/User Rating_1.0.0.0/` (UID 568).

1. DLL + `meta.json` in diesen Ordner legen.
2. Jellyfin-App neu starten.
3. Dashboard → Plugins → User Rating sollte erscheinen.
4. Web-UI mit Strg+F5 laden.

Die Script-Injection puffert **nur** `GET /web` und `GET /web/index.html`, keine Streams.
Gzip/Brotli wird erst dekomprimiert, sonst bleibt die Web-UI schwarz (Browser `Accept-Encoding`).

## Quellenanalyse

Gegen **jellyfin-web `v10.11.11`** (lokal `D:\repos\jellyfin-web`):

- Sort Experimental: `src/apps/experimental/components/library/SortButton.tsx`
- Sort Classic: `src/controllers/movies/movies.js` (`libraryBrowser.showSortMenu`)
- Community-Sterne: `src/components/mediainfo/mediainfo.js` → `getStarIconsHtml`
- Cover-Hover: `src/components/cardbuilder/cardBuilder.js` → `.cardOverlayContainer`
