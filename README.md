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

Migrations run automatically before startup. `server.js` also checks them when started directly. `schema_migrations` records applied SQL files, and each migration runs in a transaction. Add a new migration file instead of editing an already applied migration.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port; bind `0.0.0.0` |
| `GAME_HOST` | `2.28.54.80` | Game server IP/hostname |
| `GAME_PORT` | `16261` | A2S query port |
| `CHECK_INTERVAL` | `5000` | Delay in ms after a completed query |
| `DATABASE_PATH` | `./data/zomboid.db` | SQLite path, relative to working directory or absolute |

Each database belongs to one host/port combination. Use a separate database file when monitoring another server to avoid mixing histories.

## Railway

1. Connect the repository as a Node service. Railpack selects Node using `engines.node`; Docker is unnecessary. Start command: `npm start`.
2. Create a **Volume**, attach it to this service, and set its mount path to **`/data`**.
3. Set these variables:

```dotenv
DATABASE_PATH=/data/zomboid.db
GAME_HOST=2.28.54.80
GAME_PORT=16261
CHECK_INTERVAL=5000
```

4. Leave `PORT` unset: Railway supplies it automatically. Set the healthcheck path to **`/health`** and generate a public domain.
5. Use one replica and disable Serverless/App Sleeping for continuous monitoring. Set the restart policy to On Failure. To allow the current query to finish during shutdown, set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15`.

Keep migrations in the start command so the database opens after the Volume is mounted. Without a Volume, history may be lost after a redeploy. Run only one monitor against a database at a time. Configure Volume backups. Before making a manual file copy, stop the process; do not copy only the `.db` file while WAL is active.

Documentation: [Railway Volumes](https://docs.railway.com/volumes), [Healthchecks](https://docs.railway.com/deployments/healthchecks), [Node detection](https://railpack.com/languages/node/).

## API

All JSON endpoints use GET and return `Cache-Control: no-store`.

| Endpoint | Response |
| --- | --- |
| `/health` | Monitor health: `status`, `monitorRunning`, `lastCheck`, `serverOnline` |
| `/api/status` | Current server state, metadata, error, updatedAt, metadataUpdatedAt, stale |
| `/api/players` | Last observed online named players |
| `/api/leaderboard` | All tracked players, ordered by `maxKills DESC`, then name |
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

Migration `003_player_tracking.sql` adds `tracked_kill_gain`, `longest_session_seconds`, `join_count`, and `gain_tracked_since` without deleting any player or event records. The longest known session and existing join count are backfilled from stored values and events. Historical kill gain cannot be reconstructed from maxima, so existing players start at zero gain when this migration is applied. New players also start at zero gain; their initial score is a baseline. Subsequent positive score deltas accumulate, while decreases contribute zero. For example, `100 → 120 → 150 → 5 → 25` produces a gain of 70 and a maximum of 150. Changes between observations cannot be reconstructed if the score resets and rises again before the next check.

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
migrations/*.sql          schema and indexes
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

The SQLite file and its parent directory are created automatically. WAL and foreign keys are enabled. Tests cover migrations, kill resets, join/leave events, offline persistence, database reopening, minute buckets, downtime, missing player lists, description ordering, and sequential monitoring after a query failure, tracked gain after resets, migration compatibility with existing data, weighted history downsampling, and names containing HTML characters.


## Deploying the redesigned dashboard

Environment variables, the Railway Volume mount, and the start command are unchanged. Keep `DATABASE_PATH=/data/zomboid.db`, mount the same persistent Volume at `/data`, and deploy the new code. `npm start` applies migration 003 automatically. Back up the Volume before deployment. Do not remove the existing database or edit migrations 001/002. Tracking gain starts at migration time; existing leaderboard maxima and offline players are retained.

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

The dashboard supports English and Ukrainian. UI strings live in `public/locales/en.json` and `public/locales/uk.json`. The header language buttons apply translations immediately, including dates, numbers, chart tooltips, events, and player details. An explicit choice is stored under `zomboid-monitor.language` in localStorage and overrides the browser language on subsequent visits. Without a saved choice, Ukrainian browsers use Ukrainian; other browsers use English. Server descriptions, player names, and mod IDs remain as reported by the game server. Initial HTML and social metadata are rendered in English for crawlers and visitors without JavaScript.
