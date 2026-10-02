# Project Zomboid Monitor

Постійний вебмонітор сервера **[FRESH WIPE] [GER/EN] 28 Kills Later | PvE | Beginner Friendly**, `2.28.54.80:16261`. Node.js 24+, CommonJS, стандартний HTTP, вбудований `node:sqlite`. Єдина пряма production dependency — `gamedig`. Немає React, CDN, build step, ORM або Dockerfile.

## Локальний запуск

Потрібен Node.js >=24.

```sh
npm install
cp .env.example .env
npm start
```

Відкрити http://localhost:3000. `.env` завантажується автоматично; системні environment variables мають пріоритет. Без `.env` використовуються defaults.

```sh
npm run dev       # Node watch mode
npm run migrate   # safe to repeat
npm test          # isolated in-memory SQLite tests; no live server required
```

Міграції автоматично застосовуються перед запуском. `server.js` також перевіряє їх для прямого запуску. `schema_migrations` зберігає застосовані SQL-файли; кожна міграція виконується в транзакції. Не редагуйте вже застосовані міграції: додайте наступний файл.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port; bind `0.0.0.0` |
| `GAME_HOST` | `2.28.54.80` | Game server IP/hostname |
| `GAME_PORT` | `16261` | A2S query port |
| `CHECK_INTERVAL` | `5000` | Delay in ms after a completed query |
| `DATABASE_PATH` | `./data/zomboid.db` | SQLite path, relative to working directory or absolute |

Одна база належить одному host/port. Для моніторингу іншого сервера використовуйте інший файл бази, щоб не змішувати історію.

## Railway

1. Підключіть репозиторій як Node service. Railpack визначає Node через `engines.node`; Docker не потрібен. Start command: `npm start`.
2. Створіть **Volume**, приєднайте до цього service і задайте mount path **`/data`**.
3. Додайте variables:

```dotenv
DATABASE_PATH=/data/zomboid.db
GAME_HOST=2.28.54.80
GAME_PORT=16261
CHECK_INTERVAL=5000
```

4. `PORT` вручну не задавайте: Railway передає його сам. Healthcheck path: **`/health`**. Згенеруйте public domain.
5. Використовуйте одну replica та вимкніть Serverless/App Sleeping для постійного моніторингу. Налаштуйте restart policy On Failure. Для завершення поточного запиту рекомендовано `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15`.

Міграції залишаються в start command: база має відкриватися після монтування Volume. Без Volume історія може втрачатися після redeploy. Не запускайте два монітори одночасно на одній базі. Налаштуйте Volume backups. Для ручної файлової копії спершу зупиніть процес; не копіюйте лише `.db`, поки активний WAL.

Документація: [Railway Volumes](https://docs.railway.com/volumes), [Healthchecks](https://docs.railway.com/deployments/healthchecks), [Node detection](https://railpack.com/languages/node/).

## API

Усі JSON endpoints — GET, `Cache-Control: no-store`.

| Endpoint | Response |
| --- | --- |
| `/health` | Monitor health: `status`, `monitorRunning`, `lastCheck`, `serverOnline` |
| `/api/status` | Current server state, metadata, error, updatedAt, metadataUpdatedAt, stale |
| `/api/players` | Last observed online named players |
| `/api/leaderboard` | All tracked players, ordered by `maxKills DESC`, then name |
| `/api/stats` | Status, counters, availability, ping aggregates, peak, tracked players, state duration, downtime, latest 60 minute samples |
| `/api/events?limit=50` | Combined server/player event array, newest first; max 200 |
| `/api/mods` | `reportedCount`, `totalCount`, `complete`, `mods`, `updatedAt` |

Некоректний `limit` повертає 400; понад 200 обмежується до 200. Невідомий шлях — 404, інший HTTP method — 405. `/health` повертає 200, коли монітор працює, навіть якщо game server offline; зупинений монітор — 503. До першого запиту `online` / `serverOnline` — `null`, `lastCheck` — `null`. Healthcheck перевіряє працездатність монітора, а не доступність ігрового сервера.

## Дані та семантика

- GameDig queries виконуються послідовно: завершення query, потім `CHECK_INTERVAL`. Час між початками запитів дорівнює тривалості query плюс delay. Помилка query зберігає OFFLINE/error та не зупиняє loop.
- Players беруться з `raw.players`: `score` — zombie kills, `time` — секунди поточної сесії. `currentKills` може зменшуватися; `maxKills` — історичний максимум спостережень, а не сума kills усіх персонажів. Гравці ідентифікуються за точним name, бо A2S не дає надійного player ID. Зміна nickname створює інший запис.
- Перший побачений гравець та повернення offline гравця створюють `join`. Зникнення з отриманого списку або query failure створює `leave`. `lastSessionSeconds` стає останнім `currentSessionSeconds`; `currentSessionSeconds` залишається останнім відомим значенням. `lastSeen` не змінюється при leave.
- Якщо `raw.players` відсутнє, остання присутність зберігається без помилкових leave. Явний порожній масив означає, що жодного named player немає. A2S може повернути менше імен, ніж `numplayers`; UI показує це обмеження.
- `server_up` / `server_down` створюються лише при зміні стану. Перша відповідь встановлює початковий стан і створює відповідну подію. Перезапуск не генерує зайві join/up, якщо підтверджений стан не змінився.
- `availability = (totalChecks - failedChecks) / totalChecks * 100`. Лічильники зберігаються в одному SQLite row; таблиці кожного query немає. Ping aggregates враховують тільки успішні перевірки з валідним ping.
- `server_samples`: один UTC bucket на хвилину, оновлюваний транзакційно на кожній перевірці. `online` — останній стан bucket; `failed_checks` зберігає проміжні failures; average ping — середнє наявних ping; average players — середнє доступних online counts; failed query не прирівнюється до нуля гравців. Немає порожніх buckets за час без моніторингу. При безперервній роботі максимум 1440 samples на добу. Події зберігаються при переходах; автоматичне видалення історії не виконується.
- Downtime — оцінка між послідовними завершеними checks: інтервал зараховується попередньому стану. `downtimeSeconds` і `observedSeconds` persisted, але період вимкненого Node процесу не враховується. Точний момент падіння між checks невідомий. Поточний state duration рахується від останньої спостереженої зміни та може включати перерву моніторингу; це не доказ безперервної доступності. `stale` позначає старі дані.
- Metadata при offline зберігається з останньої успішної відповіді; current ping/player count стають `null`. Час metadata відображений у UI. Невідомі flags/counts — `null`/Unknown, а не вигадані значення.
- `raw.rules.version` має пріоритет. `modCount` — оголошений total, reported IDs — лише доступна частина; `complete` true тільки якщо count збігається. Description fragments сортуються за числовим індексом; `<LINE>` перетворюється на newline, `<RGB:…>` прибирається.
- UI опитує API без reload, після завершення попереднього fetch cycle. Server strings проходять `escapeHtml()` або вставляються через `textContent`. Зовнішніх scripts/fonts немає. Live game time, weather, world age та інші недоступні A2S показники не додаються.
- SIGINT/SIGTERM зупиняють timer, очікують поточний query та HTTP requests, закривають SQLite; є shutdown deadline 15 секунд. Persistence failure зупиняє процес із nonzero exit code замість продовження без запису історії.

## Структура

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
public/                   HTML, CSS, browser JavaScript
test/monitor.test.js      persistence and monitoring tests
```

## Перевірка

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

SQLite створюється автоматично разом із directory; WAL і foreign keys ввімкнені. Тести перевіряють міграції, kill reset, join/leave, offline збереження, відновлення repository, minute buckets, downtime, відсутній player list, description ordering і sequential loop після query failure.
