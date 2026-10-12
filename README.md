# Project Zomboid Monitor

A persistent web monitor for **[FRESH WIPE] [GER/EN] 28 Kills Later | PvE | Beginner Friendly**, `2.28.54.80:16261`. Built with Node.js 24+, CommonJS, the standard HTTP server, and built-in `node:sqlite`. The only direct production dependency is `gamedig`. No React, CDN, build step, ORM, or Dockerfile is required.

## Local setup

Requires Node.js >=24.

```sh
npm install
cp .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000). The application loads `.env` automatically; existing environment variables take precedence. If `.env` is absent, the defaults apply.

```sh
npm run dev       # Node watch mode
npm run migrate   # safe to repeat
npm test          # isolated SQLite tests; no live game server required
```

Migrations run automatically before startup. `server.js` also checks them when started directly. `schema_migrations` records applied SQL files, and each migration runs in a transaction. The complete initial schema is defined in `001_schema.sql` for a fresh database. Upgrades from the previous eight-migration schema are not supported. Add a new migration file for future schema changes.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port; bind `0.0.0.0` |
| `GAME_HOST` | `2.28.54.80` | Game server IP/hostname |
| `GAME_PORT` | `16261` | A2S query port |
| `CHECK_INTERVAL` | `5000` | Delay in ms after a completed query |
| `SERVER_TIMEZONE` | `+01:00` | Server calendar timezone; fixed offset or IANA name such as `Europe/Berlin` |
| `SERVER_WIPE_ID` | unset | New unique value triggers a one-time statistics reset at startup |
| `PUBLIC_ORIGIN` | `http://localhost:3000` in development | Exact web origin for Steam login; required HTTPS origin in production |
| `DATABASE_PATH` | `./data/zomboid.db` | SQLite path, relative to working directory or absolute |

Each database belongs to one host/port combination. Use a separate database file when monitoring another server to avoid mixing histories.

## Railway

1. Connect the repository as a Node service. Railpack selects Node 24 using `engines.node`; Docker is unnecessary. `railway.json` sets `npm start`, `/health`, one replica, On Failure restarts, and disables sleeping.
2. Create a **Volume**, attach it to this service, and set its mount path to **`/data`**.
3. Set these variables (also available in `.env.railway.example`):

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://zomboid.catemup.com
DATABASE_PATH=/data/zomboid.db
GAME_HOST=2.28.54.80
GAME_PORT=16261
CHECK_INTERVAL=5000
SERVER_TIMEZONE=+01:00
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15
SERVER_WIPE_ID=
```

Leave `SERVER_WIPE_ID` empty on the first deployment. Set a new nonempty ID only when statistics should be cleared; unchanged IDs do not reset statistics again. This resets observations after schema initialization, so it does not upgrade or replace a database from the old migration layout. Use a fresh database/Volume for this deployment.

4. Leave `PORT` unset: Railway supplies it automatically. Set the healthcheck path to **`/health`** and generate a public domain.
5. Use one replica and disable Serverless/App Sleeping for continuous monitoring. Set the restart policy to On Failure. To allow the current query to finish during shutdown, set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15`.

Keep migrations in the start command so the database opens after the Volume is mounted. Without a Volume, history may be lost after a redeploy. Run only one monitor against a database at a time. Configure Volume backups. Before making a manual file copy, stop the process; do not copy only the `.db` file while WAL is active.

Documentation: [Railway Volumes](https://docs.railway.com/volumes), [Healthchecks](https://docs.railway.com/deployments/healthchecks), [Node detection](https://railpack.com/languages/node/).

## API

Monitor JSON endpoints use GET and return `Cache-Control: no-store`. Account and authentication endpoints are documented below.

| Endpoint | Response |
| --- | --- |
| `/health` | Monitor health: `status`, `monitorRunning`, `lastCheck`, `serverOnline` |
| `/api/status` | Current server state, metadata, error, updatedAt, metadataUpdatedAt, stale |
| `/api/players` | Last observed online named players |
| `/api/leaderboard` | All tracked players, ordered by `currentKills DESC`, then name |
| `/api/stats` | Status, counters, availability, ping aggregates, peak, tracked players, state duration, downtime, latest 60 minute samples |
| `/api/events?limit=50` | Combined server/player event array, newest first; max 200 |
| `/api/history?period=24h` | Weighted sample history and period summary; periods: `24h`, `7d`, `30d` |
| `/api/player/:id` | Player metrics and latest 50 join/leave snapshots; unknown ID returns 404 |
| `/api/mods` | `reportedCount`, `totalCount`, `complete`, `mods`, `updatedAt` |

An invalid `limit` returns 400; values above 200 are capped at 200. Unknown paths return 404, and other HTTP methods return 405. `/health` returns 200 while the monitor is running, even if the game server is offline; a stopped monitor returns 503. Before the first query, `online`, `serverOnline`, and `lastCheck` are `null`. The healthcheck reports monitor health separately from game server availability.

## Data and behavior

- GameDig queries run sequentially: each query finishes before the `CHECK_INTERVAL` delay begins. The time between query starts equals the query duration plus the delay. A query failure saves OFFLINE status and its error without stopping the loop.
- Players come from `raw.players`: `score` represents zombie kills, and `time` represents the current session duration in seconds. `currentKills` can decrease; `maxKills` is the highest observed value, rather than the sum across characters. Players are identified by their exact names because A2S does not provide a reliable player ID. A nickname change creates a separate record.
- A newly observed player or a returning offline player generates a `join` event. Disappearing from a returned player list or a query failure generates a `leave` event. `lastSessionSeconds` is set to the last `currentSessionSeconds`; `currentSessionSeconds` retains its last known value. A leave does not change `lastSeen`.
- If `raw.players` is absent, the last observed presence is retained without generating false leave events. An explicit empty array means no named players are present. A2S may return fewer names than `numplayers`; the UI indicates this limitation.
- `server_up` and `server_down` events are created only when the state changes. The first response establishes the initial state and creates the corresponding event. Restarting does not generate duplicate join/up events if the confirmed state is unchanged.
- `availability = (totalChecks - failedChecks) / totalChecks * 100`. Counters are stored in a single SQLite row; there is no row for every query. Ping aggregates include only successful checks with valid ping values.
- `server_samples` stores one UTC bucket per minute, updated transactionally after each check. `online` is the bucket's latest state; `failed_checks` captures failures within the bucket. Average ping uses available ping values, and average players uses available online player counts. A failed query is not treated as zero players. No empty buckets are created for periods without monitoring. Continuous operation produces at most 1,440 samples per day. Events are saved on transitions, and history is not automatically deleted.
- Downtime is estimated between consecutive completed checks, assigning each interval to the previous state. `downtimeSeconds` and `observedSeconds` persist, but time while the Node process is stopped is excluded. The exact failure time between checks is unknown. Current state duration starts at the last observed transition and may include a monitoring gap; it does not prove uninterrupted availability. `stale` marks outdated data.
- While offline, metadata is retained from the last successful response; current ping and player count become `null`. The UI displays the metadata timestamp. Unknown flags and counts are represented as `null`/Unknown.
- `raw.rules.version` takes precedence. `modCount` is the declared total, while reported IDs may be a partial list; `complete` is true only when the counts match. Description fragments are sorted by numeric index, `<LINE>` becomes a newline, and `<RGB:…>` is removed.
- The UI polls the API without reloading, waiting for the previous fetch cycle to finish. Server strings are escaped with `escapeHtml()` or inserted using `textContent`. No external scripts or fonts are loaded. Live game time, weather, world age, and other values unavailable through A2S are not added.
- SIGINT/SIGTERM stop the timer, wait for the current query and HTTP requests, and close SQLite. A 15-second shutdown deadline applies. A persistence failure stops the process with a nonzero exit code instead of continuing without saving history.

## Dashboard and player tracking

The dashboard uses vanilla HTML/CSS/JavaScript with a dark survival theme, a hero background, responsive cards, and no player avatars. Leaderboard and event filters remain selected during polling. Player names open a keyboard-accessible details dialog. The chart supports pointer, touch, and arrow-key inspection.

The default statistics period is 24 hours; 7-day and 30-day views are also available. Period metrics use the real checks accumulated in minute samples. Tracked player count is always the all-time total and is labeled accordingly. History is grouped into 10-minute, 1-hour, or 4-hour buckets, returning at most approximately 145, 169, or 181 points. Averages are weighted by their source check counts. Missing periods are left empty; the chart does not invent observations. Time-window boundaries use available minute samples.

Player tracking stores net kill gain, longest observed session, join count, and the tracking start time. Each new player starts with zero gain; their initial score is a baseline.

`joinedAt` is the latest observed join timestamp for an online player, not an inferred login time. Observed sessions and join count both represent recorded joins; outages may split one actual session into multiple observed sessions. Longest session uses the highest duration actually reported by A2S. The player chart shows join/leave snapshots, not a continuous score history.

Optional assets:

- `public/hero.png` or `public/hero.jpg`: the dashboard uses the PNG first, then JPG, otherwise a gradient. Missing images do not prevent startup.
- `public/og-image.png`: social preview image. Until supplied, the existing JPG is served at this route with its correct JPEG MIME type. Restart/redeploy after replacing assets.
- `public/favicon.ico`: optional favicon; a missing icon returns 204.

The included `hero.png` was generated with the built-in imagegen tool. Prompt: a wide survival-game illustration of an abandoned Kentucky town at sunset, dark pine silhouettes and rooftops, a misty forest horizon, an orange-red sky and water tower on the right, quiet dark space on the left for title text; no UI, text, logos, or watermark.

## Project structure

```text
server.js                 startup and shutdown
src/config.js             environment validation
src/db.js                 SQLite and migration runner
src/repository.js         transactional persistence and API reads
src/monitor.js            sequential GameDig loop
src/utils.js              response normalization
src/http.js               HTTP routing
src/web.js                static asset allowlist
scripts/migrate.js        migration CLI
migrations/001_schema.sql consolidated schema and indexes
public/                   HTML, CSS, browser JavaScript, hero and social assets
public/js/                shared DOM utilities, SVG charts, player tables and dialog
test/monitor.test.js      persistence and monitoring tests
```

## Verification

```sh
npm run migrate
npm run migrate
npm test
node --check server.js
npm start
# In another terminal:
curl http://localhost:3000/health
curl http://localhost:3000/api/status
curl http://localhost:3000/api/leaderboard
```

The SQLite file and its parent directory are created automatically. WAL and foreign keys are enabled. Tests cover migrations, kill resets, join/leave events, offline persistence, database reopening, minute buckets, downtime, missing player lists, description ordering, and sequential monitoring after a query failure, tracked gain after resets, weighted history downsampling, and names containing HTML characters.


## Deploying the redesigned dashboard

For a fresh deployment, set `DATABASE_PATH=/data/zomboid.db`, mount a new persistent Volume at `/data`, and use `npm start`. The initial migration creates the complete schema automatically.

Local verification:

```sh
npm install
npm run migrate
npm run migrate
npm test
npm start
curl 'http://localhost:3000/api/history?period=24h'
curl 'http://localhost:3000/api/history?period=7d'
curl 'http://localhost:3000/api/history?period=30d'
# Use an id returned by /api/leaderboard:
curl http://localhost:3000/api/player/1
```

## Localization

The dashboard supports English and Ukrainian. UI strings live in `public/locales/en.json` and `public/locales/uk.json`. The header language buttons apply translations immediately, including dates, numbers, chart tooltips, events, and player details. An explicit choice is stored under `zomboid-monitor.language` in localStorage and overrides the browser language on subsequent visits. Without a saved choice, Ukrainian browsers use Ukrainian; other browsers use English. Server names (including the hero subtitle), descriptions/MOTD, player names, mod IDs, versions, and other server-provided text remain as reported by the game server. Only interface labels and messages are translated. Initial HTML and social metadata are rendered in English for crawlers and visitors without JavaScript.

## Kill restoration correction

Gain is `max(0, currentKills - baseline)`: decreases reduce it, and restoring lost kills does not count them again. The leaderboard displays and sorts by latest observed kills; the historical maximum remains in player details. A2S cannot distinguish journal restoration from actual kills when a decrease occurs entirely between polls.

Player death counts and death events are persistent. Each observed decrease in kills counts as one death, including decreases first seen after a rejoin. Journal restores increase kills and do not add deaths. Deaths with zero kills cannot be detected. The leaderboard, player details, and recent events show deaths.

## Resetting statistics after a game server wipe

After the game server has been wiped, set `SERVER_WIPE_ID` to a new unique value (for example `2026-10-06-wipe-1`) and restart/redeploy the monitor. On Railway, change this service variable and deploy with the same Volume mounted. Locally, set it in `.env` and run `npm start` after stopping the old process.

A changed nonempty ID clears all players (including kills, deaths and sessions), player/server events, history samples, cached server metadata, and availability/ping counters before the first query. The new ID and the reset are committed in one SQLite transaction. Schema and migration history stay intact. The first query starts fresh tracking from the game server's current values.

Keep the ID unchanged until the next wipe: ordinary restarts and redeployments with the same ID preserve statistics. An unset or blank variable does nothing. Setting it for the first time also clears existing statistics. Removing it does not clear the stored ID; restoring that same ID does not trigger another reset. Use a fresh ID for every wipe. This is an explicit operator trigger; the monitor does not infer a server wipe from player deaths. Run one monitor instance per database and perform the restart after the game server wipe is complete.

## Player records

The record holders panel includes all tracked players, with all tied holders shown. Most kills uses `maxKills`, longest session uses `longestSessionSeconds`, and most deaths uses `deaths`. `bestSessionKills` tracking starts at zero with the first observed score as baseline. Session kills are the largest observed positive net increase from the first observed score in a session; deaths and restores below an already observed score do not inflate the record. A rejoin or a decrease in reported session duration starts a new baseline. This is an observed net-gain estimate: kills before the first poll, losses after a death, or journal restores across session boundaries cannot be reconstructed reliably. Restarting the monitor preserves session baselines; server wipes clear these records with other player data.

## Frontend cache versioning

At startup, the server computes a SHA-256 version from all CSS, JavaScript, and locale JSON content. Served HTML references versioned filenames (for example `/styles.0123456789abcdef.css`); the i18n script also fetches versioned dictionaries. A change to any frontend file changes the version for the whole bundle on the next restart/deploy. Identical content keeps the same version. No separate build step is needed.

Versioned assets are served with a one-year immutable cache; HTML uses `no-store` so normal reloads load the current asset URLs. Original unversioned routes remain available with `no-cache`. Deploy/restart after editing frontend files because assets are loaded into memory at startup.

## Calendar-day kill gain

The leaderboard and player dialog display `killGainToday`: `max(0, sum of observed signed kill changes from server-local midnight through now)`. Set `SERVER_TIMEZONE` in `.env` or Railway service variables and restart the monitor. The default `+01:00` preserves fixed GMT+1; use `Europe/Berlin` for Germany's seasonal clock changes. Other valid IANA timezones and fixed offsets are supported. Invalid timezone values fail startup. Day boundaries are independent of the monitor host timezone, including 23- and 25-hour DST days. At midnight the displayed value returns to zero, including for offline players. Existing changes remain intact when changing the timezone; the day window is recalculated. Player API responses include `serverTimezone`, used in the gain tooltip and player details.

This is net score gain, not total kills across lives. Deaths subtract from the day; restoration within the same day offsets the loss. A journal restore after midnight can appear as gain if its death happened on the previous day; A2S cannot distinguish it from new kills. Initial observed kills are excluded. Daily tracking starts from the first observation without inventing historical values. The previous `trackedKillGain` and rolling `killGain24h` fields remain available in the API for compatibility.

Only score changes are stored, with a player/time primary key and a time index; changes older than 48 hours are pruned after each successful record transaction. Player queries calculate gain at request time. Restarts preserve changes, and `SERVER_WIPE_ID` resets them with all other observations.

## Steam accounts

Set `PUBLIC_ORIGIN` to the exact browser origin, for example `https://zomboid.catemup.com` on Railway. Production requires this variable and HTTPS; development defaults to `http://localhost:3000`. A custom local port must match the browser URL. Do not include paths, query parameters or fragments. The configured origin is used directly for callbacks and logout checks; proxy headers and request Host are not trusted.

The header places Steam login/logout beside the language switcher. The main menu is inside the header, beside the account and language controls, and appears only for signed-in users, with Monitoring as the default page. The Factions and Books pages are visible only to signed-in users. Books contains the user’s faction’s shared collection. Informational account prompts are omitted; authentication errors remain visible. Steam OpenID verifies the SteamID directly with Steam; no Steam API key or stored Steam password is needed. See [Steam browser authentication](https://partner.steamgames.com/doc/features/auth#website). Users are identified by SteamID; Steam display names and avatars are fetched when `STEAM_API_KEY` is configured.

- `GET /auth/steam`: start login; redirects to Steam.
- `GET /auth/steam/callback`: verify Steam assertion and create/update the user.
- `GET /api/me`: `{ user: null }` for guests or the current user (`id`, `steamId`, `profileUrl`, `displayName`, `avatarUrl`, `createdAt`, `lastLoginAt`).
- `GET /api/account`: the same user response, or 401 for guests; foundation for personal data.
- `POST /auth/logout`: revoke the current session; requires an Origin matching `PUBLIC_ORIGIN`.

Migration `002_users.sql` adds separate users, sessions, temporary login attempts and assertion nonces. Users are independent of name-based A2S player records and are preserved by server wipes. Collections reference `factions.id`; users are members and change authors; no automatic SteamID-to-game-nickname mapping is made. Books, magazines, tapes and other items can be entered manually by game item ID. Automatic mod catalog imports are not implemented.

Sessions last 30 days and survive process restarts in the persistent SQLite database. Random tokens are stored only as SHA-256 hashes. HTTPS cookies use the `__Host-` prefix, Secure, HttpOnly and SameSite=Lax. Login attempts expire after 10 minutes, are bound to the initiating browser and consumed once. Assertions require signed identity fields, the configured callback and Steam endpoint, fresh nonces, and server-side Steam verification with a 10-second timeout. Expired auth records are pruned during login requests. Logout revokes only the current browser session.

The automated auth tests mock Steam verification and exercise the HTTP flow, account isolation, token rotation, logout protection, malformed callbacks, expired sessions and wipe preservation. A real Steam account/browser round-trip must be checked on the configured public domain after deployment.


## Factions and shared inventory

Migration `003_factions.sql` adds factions, memberships, hashed invitations, faction items and an item change audit. No item belongs to a user: `(faction_id, item_key)` is the item’s unique key; `updated_by` identifies only its last editor. The same game ID can have independent quantities in different factions. Each account has at most one faction, enforced by a unique database index. Creating a faction or accepting another faction’s invitation atomically leaves the previous faction. Shared items stay with their faction.

In **Factions**, create a faction or accept an invitation after Steam login. The creator is its owner; invited users become members. Owners can invite, revoke invitations and remove members. Every user can leave. Leaders can transfer leadership to another member or disband the faction. A departing leader automatically passes leadership to the longest-standing remaining member (user ID breaks equal-date ties); if no members remain, the faction is disbanded, including its shared collection. The UI confirms these consequences before switching or leaving. Explicit and automatic leadership changes disable joining by link. Administrator roles are not implemented. Every member can edit the shared inventory in **Books**, including books, magazines, tapes and other items. A quantity of zero records a known item as absent; deletion removes it from the list. Saving an existing ID updates its metadata and quantity (the last saved edit wins).

Each faction has one permanent invitation link, without expiry or usage limits. Its leader enables or disables joining by link; disabling immediately prevents previews and new joins, while existing members remain. Re-enabling restores the same URL. Only the leader can retrieve the link or change its state. Leadership changes disable joining until the new leader enables it.

The link contains a random token in the URL fragment, so it is not sent with page requests. The browser preserves a pending invitation in sessionStorage through Steam login and requires an explicit Join action. To display the same URL after restarts, the random link token is stored in `faction_join_links`; session tokens remain hashed. Migration `005_faction_join_links.sql` disables old expiring invitations. Leaders must enable the new permanent link once. The interface shows faction creation only for users without a faction, uses the faction name as its heading, and groups leave/disband actions in the bottom danger section.

All faction endpoints require a valid session. All mutations require `Origin` equal to `PUBLIC_ORIGIN`. Nonmembers cannot read or edit a faction, even by guessing its ID. Monitor wipes preserve factions and inventory; collection resets after game wipes must be handled separately.

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/factions` | GET, POST | List my factions / create with `{name}` |
| `/api/factions/:id` | DELETE | Leader disbands faction and shared collection |
| `/api/factions/:id/leader` | POST | Transfer leadership to `{userId}` within the faction |
| `/api/factions/:id/members` | GET | List faction members |
| `/api/factions/:id/members/:userId` | DELETE | Owner removes a member, or member leaves |
| `/api/factions/:id/invites` | GET, POST | Leader retrieves / sets link state with `{enabled}` |
| `/api/faction-invites/:token` | GET | Preview a valid invitation |
| `/api/faction-invites/:token/accept` | POST | Accept invitation |
| `/api/factions/:id/items` | GET | Read shared items |
| `/api/factions/:id/items/:encodedItemKey` | PUT, DELETE | Set `{name,category,quantity}` / remove item |

Categories: `book`, `magazine`, `tape`, `other`. Use the exact game full type, including the module prefix, such as `Base.BookCarpentry1` or a mod’s own identifier. This distinguishes equally named items from different mods. JSON writes are limited to 8 KiB. Item mutations are recorded in `faction_item_changes`; there is no audit viewer yet. Factions are managed on the website and are not synchronized with in-game factions.

Migration `004_single_faction.sql` upgrades previous multiple memberships without deleting faction collections. It retains each user’s earliest leadership membership, otherwise earliest membership, and appoints the earliest remaining member in factions that lose their leader. If a legacy faction has no remaining members, its collection is retained in the database for operator recovery. Future membership changes follow the single-faction rule. Disbanding is irreversible and removes items, invitations and item audit records; the interface requires explicit confirmation. No database reset is needed.

## Vanilla skill books

The Books page is a faction checklist: 24 vanilla Build 42 skills, sorted by their English names, with volumes 1–5 (120 books). Ukrainian translations appear in smaller muted parentheses beside each English skill name; English mode shows the English name once. The five volume columns use accessible native checkboxes and on phones each skill becomes a compact row card with all five checkboxes visible, sticky volume headings and touch targets at least 48 px high. No horizontal scrolling is required at widths of 320 px or above.

The catalog in `public/js/books.js` follows the [vanilla skill-book XP definitions](https://github.com/Project-Zomboid-Community-Modding/ProjectZomboid-Vanilla-Lua/blob/main/server/XpSystem/XPSystem_SkillBook.lua) and [official literature item keys](https://projectzomboid.com/modding/zombie/scripting/objects/ItemKey.Literature.html), checked on 2026-10-12. Scope is skill books with five volumes, rather than ordinary leisure books or recipe magazines. Game IDs deliberately differ from some display names: Agriculture uses BookFarming, Animal Care uses BookHusbandry, Electrical uses BookElectrician, Knapping uses BookFlintKnapping, Mechanics uses BookMechanic, and Welding uses BookMetalWelding.

Checkboxes use the existing faction items API: quantity above zero means present, checking saves one and unchecking saves zero. Existing matching item IDs are recognized immediately. Changes persist across reloads for all faction members and retain the item audit trail. A failed save restores the last loaded state and shows an error. No schema migration is needed for this table. The old manual collection form is replaced. Custom skill-book rows can be added as described below. Automatic mod catalog imports and magazine/tape tables are future work.


## Steam names and avatars

Set `STEAM_API_KEY` in `.env` locally or in Railway service variables, then restart with `npm start`. Obtain a user Web API key from [Steam API key registration](https://steamcommunity.com/dev/apikey). It is a server-only setting and is never included in API responses, HTML or browser JavaScript. OpenID login does not require this key.

Migration `006_steam_profiles.sql` adds nullable names, avatar URLs and cache timestamps. The server calls [GetPlayerSummaries](https://partner.steamgames.com/doc/webapi/ISteamUser#GetPlayerSummaries) after login and when reading the current account or faction members. Existing sessions populate automatically on the next page load after configuration. Profile reads are cached for six hours, failures retry after ten minutes, and concurrent requests share pending lookups. Calls batch up to 100 SteamIDs with a five-second timeout. Steam outages preserve cached profiles and do not prevent successful login.

The header, faction member list and leadership picker show Steam display names; the header and members also show avatars, with a preview of the selected leadership candidate. Equal display names are distinguished by the last four SteamID digits in the picker, and full IDs appear in profile link tooltips. All profile links use verified SteamIDs. Names are rendered as text. Avatar URLs must be HTTPS on the allowed Steam CDN hosts; images use no-referrer and fall back to initials if unavailable. Without a configured key, placeholders and the last four ID digits are displayed. Names and avatars are preserved by game-server wipes.

Faction property pages use `Faction name - Localized page name` for the heading and browser tab title (also recorded in AGENTS.md for future work). The Books page has a printer icon button that opens the browser print dialog. Print styles output the collection count and table on a white background with explicit check marks, excluding navigation, account controls and faction management. Printing uses the current loaded faction checklist.


## Custom mod skill books

A plus button below the Books table opens one original-name input. Confirm with the check button or Enter to add a faction-wide row with five volumes. Mod rows are never translated and do not display a mod name. Checkboxes use generated internal inventory keys; users do not need game item IDs. Rows remain alphabetized with vanilla skills and appear on mobile and in print.

Migration `008_custom_books_five_volumes.sql` clears old custom translations and mod labels, fills missing volumes and preserves existing checked volumes. The name-only POST `/api/factions/:id/custom-books` generates five unique keys. Deleting a custom row preserves recorded inventory.
