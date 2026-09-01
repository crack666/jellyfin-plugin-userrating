# Changelog

`build.yaml` carries only the current version's entry, because everything in it is
copied verbatim into the plugin repository manifest and manifest history is
append-only. The full history lives here.

## 1.2.0.0

- Personal rating can stand in for `CriticRating` and/or `CommunityRating`, so native clients (Android, FireTV, webOS, Chromecast) show and sort by it.
- Two independent toggles, response-only, nothing written to the database.
- Rating writes moved to the current `POST /UserItems/{itemId}/UserData` route.
- Settings text translated into all 29 bundled locales.
- Documented the KefinTweaks Watchlist incompatibility.

## 1.1.0.5

- Download unmatched IMDb titles as CSV (current sort, all rows). Never released separately; shipped in 1.2.0.0.

## 1.1.0.4

- Clickable unmatched IMDb ids, paginated sortable unmatched list.
- UI follows the Jellyfin display language (English default, plus de/fr/es/it/nl/pt/pl/ru and others).

## 1.1.0.3

- Library toggle to keep cover badges visible, switched on automatically when sorting by personal rating.

## 1.1.0.2

- Unmatched IMDb titles sorted by rating, highest first.

## 1.1.0.1

- User list on the plugin settings page (dashboard controller plus `/UserRating/Users`).

## 1.1.0.0

- IMDb ratings CSV import on the plugin settings page.

## 1.0.0.3

- Custom 10-to-1 picker on the detail page.

## 1.0.0.2

- Click-to-edit detail rating, live list badges, GitHub credit.

## 1.0.0.1

- Classic radio sort menu, gzip-safe script injection.

## 1.0.0.0

- Initial release for Jellyfin 10.11.
