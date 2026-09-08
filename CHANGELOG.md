# Changelog

`build.yaml` carries only the current version's entry, because everything in it is
copied verbatim into the plugin repository manifest and manifest history is
append-only. The full history lives here.

## 1.3.0.0

- Jellyfin 12 port: `net10.0`, `targetAbi` 12.0.0.0, `IUserManager.GetUsers()`.
- 10.11 remains on 1.2.0.1; a 12 build will not load there.
- Web: Personal rating in the Jellyfin 12 Sort menu; pick up ratings if the first library fetch races the injected script.
- Web: actually reorder the grid on JF12 (no `refreshItems`); load `client.js` before the first `/Items` fetch.
- Web: Personal-rating sort keeps the native asc/desc arrow and toggles direction on a second click.

## 1.2.0.1

- No functional change; the DLL is identical in behaviour to 1.2.0.0.
- First release published through the plugin repository, cut so the install and update path could be verified end to end rather than assumed.

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
