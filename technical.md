# Media Tracker Technical Specification

## 1. Purpose

Media Tracker is a private, Tailnet-only application for tracking movies and TV
series. It searches TMDB for catalog metadata while keeping personal library
state, notes, statuses, and episode progress in a local SQLite database.

This document defines the system architecture, data model, interfaces, security
boundaries, implementation sequence, testing requirements, and deployment model.
Product behavior and interface guidance are defined in [design.md](design.md).

## 2. Technical goals

- Keep the TMDB credential and all personal state off the browser.
- Maintain one canonical set of domain rules shared by HTTP and MCP interfaces.
- Store personal data locally in a durable, migration-managed SQLite database.
- Expose the web application only through an existing Tailscale Serve instance.
- Make mutations explicit, validated, idempotent where appropriate, and safe to
  retry.
- Deliver each behavior test-first and verify every layer before deployment.

## 3. Technology stack

| Layer              | Technology                                    |
| ------------------ | --------------------------------------------- |
| Language           | TypeScript                                    |
| Web client         | React 19, Vite 8                              |
| HTTP server        | Fastify 5                                     |
| Validation         | Zod 4                                         |
| Persistence        | SQLite via `better-sqlite3`                   |
| Testing            | Vitest 4, Testing Library                     |
| Quality            | ESLint, Prettier, TypeScript                  |
| Agent interface    | `@modelcontextprotocol/sdk`, native stdio MCP |
| Process management | systemd user service                          |
| Private ingress    | Tailscale Serve                               |

## 4. System architecture

```text
Tailnet browser
    |
    | HTTPS /media/*
    v
Tailscale Serve
    |
    | strips /media prefix; proxies to 127.0.0.1:3460
    v
Fastify application
    |-- serves compiled React application
    |-- exposes /health and /api/v1/*
    |
    v
MediaService <---------------- native stdio MCP server
    |                                  ^
    |                                  |
    |-- MediaRepository                Hermes
    |      |
    |      v
    |   local SQLite
    |
    `-- TMDB client --> TMDB HTTPS API
```

### 4.1 Boundaries

- The React client calls only same-origin `/api/v1/...` endpoints.
- Fastify is the only web component permitted to call TMDB.
- `MediaService` owns domain behavior and is shared by HTTP and MCP adapters.
- MCP must not call the browser API or reproduce repository/domain rules.
- SQLite is authoritative for personal state. TMDB supplies catalog enrichment.
- Production media records store normalized TMDB poster, backdrop, and profile
  paths rather than credential-bearing URLs. The client builds image URLs from
  a fixed public TMDB image base. A bundled local fallback asset is served when
  artwork is missing or fails to load. Locally downloaded TMDB images in the
  HTML prototype are design fixtures, not the production caching strategy.

## 5. Runtime and security constraints

1. Bind only to `127.0.0.1:3460`.
2. Publish only the new `/media/` path at
   `https://hermes.tailaab0c.ts.net/media/` through Tailscale Serve.
3. Preserve all existing Serve handlers, including `/`, `/lists`, `/location`,
   `/owntracks`, and `/reminders`.
4. Do not enable Tailscale Funnel or another public ingress.
5. Store `TMDB_API_KEY` only in a host-local, mode-0600 environment file.
6. Never commit, log, return, or place the key in browser JavaScript.
7. Do not expose stack traces, database paths, credentials, raw TMDB payloads,
   credential-bearing URLs, request headers, or environment values through HTTP
   or MCP.
8. All inputs crossing HTTP or MCP boundaries must be validated with Zod.

Required runtime values:

```dotenv
MEDIA_APP_HOST=127.0.0.1
MEDIA_APP_PORT=3460
MEDIA_APP_DATA_DIR=/home/hermes/.local/share/media-app
TMDB_API_KEY=<host-local-secret>
```

The repository must ignore `.env`, `*.db`, and application runtime data. Only a
placeholder environment example may be committed.

## 6. Domain model

### 6.1 Enumerations

```ts
type MediaType = "movie" | "tv";
type LibraryStatus = "watchlist" | "watching" | "stopped" | "watched";
```

### 6.2 Persistence schema

Use numbered TypeScript migrations and a `schema_version` table. Migrations must
be idempotent, and foreign keys must be enabled on every connection.

```sql
CREATE TABLE media_items (
  id TEXT PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date TEXT,
  first_air_date TEXT,
  runtime_minutes INTEGER,
  total_seasons INTEGER,
  total_episodes INTEGER,
  show_status TEXT,
  genres_json TEXT NOT NULL DEFAULT '[]',
  network_name TEXT,
  provider_name TEXT,
  provider_region TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tmdb_id, media_type)
);

CREATE TABLE library_entries (
  id TEXT PRIMARY KEY,
  media_item_id TEXT NOT NULL UNIQUE REFERENCES media_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'stopped', 'watched')),
  note TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE watched_episodes (
  id TEXT PRIMARY KEY,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL CHECK (season_number >= 0),
  episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
  watched_at TEXT NOT NULL,
  UNIQUE (media_item_id, season_number, episode_number)
);

CREATE TABLE tv_episodes (
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL CHECK (season_number >= 0),
  episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
  title TEXT,
  overview TEXT,
  air_date TEXT,
  runtime_minutes INTEGER,
  still_path TEXT,
  PRIMARY KEY (media_item_id, season_number, episode_number)
);

CREATE TABLE cast_members (
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  tmdb_person_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  character_name TEXT,
  profile_path TEXT,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (media_item_id, tmdb_person_id, character_name)
);

CREATE TABLE watch_providers (
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  tmdb_provider_id INTEGER NOT NULL,
  provider_name TEXT NOT NULL,
  logo_path TEXT,
  access_type TEXT NOT NULL CHECK (access_type IN ('subscription', 'free', 'ads', 'rent', 'buy')),
  display_priority INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (media_item_id, region, tmdb_provider_id, access_type)
);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('episode_watched', 'episode_unwatched', 'status_changed')),
  season_number INTEGER,
  episode_number INTEGER,
  previous_status TEXT,
  new_status TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE schema_version (version INTEGER NOT NULL);
```

Only stable, normalized display fields may be imported from TMDB. Do not persist
raw TMDB JSON, credentials, or search history.

### 6.3 Domain invariants

- `(tmdb_id, media_type)` uniquely identifies a catalog title.
- Adding an existing title updates its library entry rather than duplicating it.
- Notes are optional plain text, trimmed, and limited to 2,000 characters.
- Marking a movie watched sets `status = watched` and sets `completed_at` only if
  it is empty.
- Marking a TV episode watched is idempotent.
- Marking an episode unwatched removes exactly the identified episode row.
- Marking a season watched inserts the known episodes for that season in one
  transaction using the same idempotent watched-episode records. It does not
  persist an independent season-complete flag.
- Marking a season unwatched deletes its watched-episode records transactionally.
  Marking an entire show watched or unwatched applies the equivalent operation
  across every known episode in every known season. Both bulk directions are
  explicit and idempotent; the client confirms whole-show changes.
- TV progress is derived from watched episode rows and the known total episode
  count. A second mutable progress counter is forbidden. Progress sorting uses
  the derived completion ratio, not the raw watched count or season number.
- `continue`, `caught-up`, and `finished` are derived query/view states. Continue
  means explicit status `watching` with a known available unwatched episode;
  caught up means `watching`, still airing, with no available unwatched episode;
  finished means the show has ended and every known episode is watched. None may
  be added to the `library_entries.status` enum or persisted independently.
- Watchlist presentation may use a star, but it continues to map to the canonical
  `watchlist` status and must contain no recorded viewing progress.
- Stopped is an explicit canonical status for a started series the user does not
  plan to continue. It is filterable in All shows, excluded from Continue,
  Caught up, Finished, and Upcoming, and does not erase episode history.
- Upcoming is derived from announced future episode air dates for series with
  explicit status `watching`. Unknown dates remain unknown and are never guessed.
- Diary is derived from explicit viewing and status-change events ordered by
  event time; metadata refreshes do not create diary entries.
- Next-episode output may include a normalized air date. Clients label future
  values as Expected and past values as Released; missing values are omitted
  rather than replaced with a guessed date.
- Completing all known episodes does not silently change the series status. A
  series becomes watched only through an explicit status mutation.
- Genre, network, provider, episode, and cast values are normalized TMDB
  metadata snapshots. Provider labels are region-aware and remain nullable.
- Every show response provides a poster path or instructs the client to use the
  bundled fallback. Broken remote artwork must fall back client-side.
- Library view membership remains derived even when CSV uses the user-facing
  `library_view` labels for transfer.
- Removing a library entry is always an explicit destructive action.

## 7. TMDB integration

Implement a dependency-injected server-side client against TMDB v3 HTTPS
endpoints. The client must:

- support movie, TV, and combined searches;
- accept a positive page number and clamp it to TMDB's documented bounds;
- URL-encode query text;
- attach the credential only to the outbound server request;
- handle non-success responses, malformed payloads, timeouts, and transport
  failures;
- normalize missing optional metadata; and
- return no raw TMDB response objects.

Watch-provider availability uses TMDB's JustWatch-backed provider endpoint for
an explicit ISO 3166-1 region. Store only normalized provider name, logo path,
access type, priority, region, and refresh time. The UI must display JustWatch
attribution. V1 does not construct provider deep links or expose a Watch now
action; the provider response is availability metadata, not evidence that an
episode-level destination exists.

Normalized catalog output:

```ts
interface CatalogMedia {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  firstAirDate: string | null;
  runtimeMinutes?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  showStatus?: string | null;
  genres: string[];
  networkName?: string | null;
  providerName?: string | null;
  providerRegion?: string | null;
}

interface CatalogEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  stillPath: string | null;
}

interface CastMember {
  tmdbPersonId: number;
  name: string;
  characterName: string | null;
  profilePath: string | null;
  sortOrder: number;
}

interface WatchProvider {
  tmdbProviderId: number;
  name: string;
  logoPath: string | null;
  region: string;
  accessType: "subscription" | "free" | "ads" | "rent" | "buy";
  displayPriority: number;
}
```

## 8. Service and repository responsibilities

### MediaRepository

- Execute parameterized SQL only.
- Encapsulate persistence and transaction behavior.
- Add or update media by `(tmdb_id, media_type)`.
- Filter and sort library entries.
- Apply status timestamp changes.
- Add/remove watched episodes idempotently.
- Bulk-add or bulk-remove one season's known episodes transactionally.
- Bulk-add or bulk-remove every known episode for one show transactionally.
- Upsert normalized episode and cast snapshots.
- Replace region-scoped watch-provider snapshots transactionally and retain the
  provider access type and display priority.
- Append explicit activity events and query them chronologically.
- Query Continue, Caught up, Watchlist, Finished, All shows, and Upcoming from
  canonical status, episode, air-date, and show-status data.
- Return normalized domain records rather than raw database rows.

### MediaService

- Coordinate TMDB catalog lookup with local persistence.
- Own note normalization and all domain invariants.
- Fetch and validate catalog metadata before writing an addition in one
  transaction.
- Derive series progress from episode records.
- Derive library views, next episode, upcoming schedule, and progress-sort ratio.
- Provide show-detail data containing summary, artwork, cast, season metadata,
  episodes, watched state, and next episode.
- Provide ordered full-cast data independently from the featured subset shown on
  the primary detail page.
- Apply whole-season and confirmed whole-show watched-state mutations through
  idempotent service methods.
- Validate and transact CSV import/export without exposing secrets or raw TMDB
  payloads.
- Provide the only application-facing operations consumed by HTTP and MCP.

## 9. HTTP API contract

Tailscale Serve strips the external `/media` prefix. The application therefore
registers local routes without that prefix. Production browser requests retain
Vite's `/media` base (for example `/media/api/v1/library`) so they reach the
configured Serve path; after prefix stripping, Fastify receives
`/api/v1/library`. Development requests use the unprefixed Vite proxy directly.

```text
GET    /health
GET    /api/v1/search?query=<text>&type=movie|tv|all&page=<positive integer>
GET    /api/v1/library?status=...&type=...&query=...&libraryView=...&genre=...&provider=...&sort=title|progress|nextEpisode|lastUpdated&direction=asc|desc
GET    /api/v1/library/views/:view?query=...&genre=...&provider=...&sort=title|progress|nextEpisode|lastUpdated&direction=asc|desc
POST   /api/v1/library
GET    /api/v1/library/:id
PATCH  /api/v1/library/:id
DELETE /api/v1/library/:id
POST   /api/v1/library/:id/actions/refresh
GET    /shows/:id
GET    /shows/:id/cast
GET    /api/v1/library/:id/cast
GET    /api/v1/library/:id/watch-providers?region=<ISO-3166-1-code>
GET    /api/v1/library/:id/episodes?season=<integer>
PUT    /api/v1/library/:id/episodes/:season/:episode
DELETE /api/v1/library/:id/episodes/:season/:episode
PUT    /api/v1/library/:id/seasons/:season/watched
DELETE /api/v1/library/:id/seasons/:season/watched
PUT    /api/v1/library/:id/episodes/watched
DELETE /api/v1/library/:id/episodes/watched
GET    /api/v1/activity/diary
GET    /api/v1/activity/upcoming
GET    /api/v1/admin/export.csv
POST   /api/v1/admin/import.csv
```

`:view` accepts `continue`, `caught-up`, `watchlist`, `finished`, or `shows`.
The `shows` view may additionally filter canonical status `stopped`; Stopped is
not a standalone derived-view route.
The view endpoint returns show-level rows shaped for the Compact Tracker tables,
including poster path, derived progress, current season, genre, provider/network,
next episode, relevant activity date, and derived view label. The server validates
sort and filter keys against the selected view rather than accepting arbitrary
SQL fields. Title uses direct A/Z sorting; progress, next episode, and activity
dates use direct two-direction toggles. Genre and provider are filter-only, and
Library View is filter-only in All shows.

Every query, path parameter, and request body must use a shared Zod schema.
Return a stable safe error envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request." } }
```

Status code policy:

| Status | Meaning                                        |
| ------ | ---------------------------------------------- |
| `400`  | Invalid input                                  |
| `404`  | Unknown library entry                          |
| `409`  | Genuine state conflict only                    |
| `502`  | Safe representation of a TMDB upstream failure |

Central error mapping must prevent internal `Error.message` content from leaking
to the client.

The refresh action re-fetches normalized details, cast, regional watch
providers, and every reported television season from TMDB before beginning one
database transaction. It updates the local catalog snapshot and adds newly
announced episodes without changing the canonical library status, personal
note, or existing watched episode records. An upstream or persistence failure
must leave the previous snapshot intact.

### 9.1 CSV library transfer

Settings exposes explicit library CSV import and export actions. Both use the
same normalized UTF-8 schema. A `show` record preserves library metadata and an
`episode` record preserves the state of one specific episode:

```csv
record_type,title,year,airing_status,library_view,current_season,total_episodes,next_episode,last_updated,genre,provider_network,poster_url,season_number,episode_number,episode_title,air_date,watched,watched_at
```

Every exported show has exactly one `show` record and exactly one `episode`
record for each known episode. Episode identity is the composite of show,
season number, and episode number. `watched` is an explicit `true` or `false`;
`watched_at` is an optional ISO 8601 timestamp. The watched total is derived
from episode records and is never imported as an aggregate. This preserves
non-sequential viewing such as S1 E1, S1 E3, and S1 E5 without implying that
S1 E2 or S1 E4 was watched. Episode titles and air dates are included when
known so a subsequent import can restore the same local snapshot.

`library_view` accepts `continue`, `caught-up`, `watchlist`, `finished`, or
`stopped`.
Import maps Continue and Caught up to canonical `watching`, Watchlist to
`watchlist`, Stopped to `stopped`, and Finished to `watched`, then re-derives the final view from
normalized metadata and episode progress. Reject a row when its claimed view is
inconsistent with its ended/airing state or progress.
`last_updated` uses `YYYY-MM-DD`; `genre` and `provider_network` are display
labels sourced from the stored TMDB metadata snapshot. `poster_url` is optional
for backward-compatible imports; when omitted or unavailable, the client uses
the bundled branded fallback poster. New TMDB-backed additions persist their
poster path so every library view can reuse the same artwork. Accept poster URLs
only from the configured TMDB image origin; never allow arbitrary imported URLs
to become browser requests.
Export includes a header row and quotes all values. Import accepts standard CSV
escaped quotes, validates required headers and values, rejects duplicate shows
or episode identities, verifies that each episode belongs to a show record, and
verifies that the number of episode records matches `total_episodes`. Shows are
upserted by normalized title plus year and episode states by show, season, and
episode number in one database transaction. Invalid rows must not partially
mutate the library; return a safe validation error with row numbers.
The file upload limit is 5 MB. CSV files never contain TMDB credentials or other
server configuration.

### 9.2 SQLite backup and restore

`media-tracker.db` inside `MEDIA_APP_DATA_DIR` is the canonical database. The
compiled `dist/server/backup-main.js` CLI provides `backup`, `verify`, and
`restore` commands. Backup uses the `better-sqlite3` online backup API so a
consistent snapshot includes committed WAL data without stopping the service.
It refuses to overwrite an existing destination and verifies `quick_check` and
`foreign_key_check` before reporting success.

Restore requires `--confirm` and operationally requires the systemd service to
be stopped first. It verifies the source before touching the active database,
creates a timestamped online `media-tracker.pre-restore-*.db` recovery copy,
stages and verifies the replacement, and restores the prior active file if the
final rename fails. Stale WAL/SHM sidecars are removed only after successful
replacement. The service is restarted and its local health endpoint checked
before the restored database is accepted. Backup paths and contents are never
returned through HTTP or MCP.

## 10. MCP contract

Implement a native stdio MCP entry point at `server/mcp-main.ts`. Register it
with Hermes only after compilation and deployment.

| Tool                        | Mutation    | Purpose                                                         |
| --------------------------- | ----------- | --------------------------------------------------------------- |
| `search_media`              | No          | Search TMDB by title and type.                                  |
| `list_media_library`        | No          | Filter tracked media.                                           |
| `get_media_details`         | No          | Return one tracked entry and progress.                          |
| `list_library_view`         | No          | Return a derived Compact Tracker view.                          |
| `list_upcoming_episodes`    | No          | Return announced future episodes for Watching series.           |
| `list_viewing_activity`     | No          | Return explicit diary events.                                   |
| `add_media_to_library`      | Yes         | Add a TMDB title with an explicit status.                       |
| `update_media_status`       | Yes         | Change status or note.                                          |
| `mark_episode_watched`      | Yes         | Mark or unmark one explicit TV episode.                         |
| `mark_season_watched`       | Yes         | Mark or unmark one known season transactionally.                |
| `mark_show_watched`         | Yes         | Mark or unmark every known episode of one show transactionally. |
| `remove_media_from_library` | Destructive | Remove only when `confirm: true`.                               |
| `get_media_service_status`  | No          | Report safe service availability.                               |

Requirements:

- Inputs mirror `MediaService` operations and are validated by Zod.
- Mutation results return normalized updated entries.
- Removal rejects every call without `confirm === true`.
- Outputs omit secrets, raw upstream data, database paths, and arbitrary host
  status.
- Tool descriptions clearly identify mutations and destructive behavior.
- Restart the Hermes gateway externally after any deployed schema or MCP
  implementation change before claiming live availability.

## 11. Repository structure

```text
Media-app/
|-- client/
|   |-- main.tsx
|   |-- App.tsx
|   |-- App.test.tsx
|   |-- styles.css and view-specific CSS files
|   `-- lib/
|       `-- api.ts
|-- server/
|   |-- api.ts
|   |-- api.test.ts
|   |-- backup.ts
|   |-- backup-main.ts
|   |-- backup.test.ts
|   |-- config.ts
|   |-- config.test.ts
|   |-- database.ts
|   |-- database.test.ts
|   |-- migrations.ts
|   |-- repositories/media-repository.ts
|   |-- services/media-service.ts
|   |-- tmdb/tmdb-client.ts
|   |-- tmdb/tmdb-client.test.ts
|   |-- transfer/csv-transfer.ts
|   |-- transfer/csv-transfer.test.ts
|   |-- mcp.ts
|   |-- mcp.test.ts
|   |-- mcp-main.ts
|   `-- main.ts
|-- shared/
|   |-- catalog-types.ts
|   |-- media-schema.ts
|   |-- media-types.ts
|   `-- transfer-types.ts
|-- deploy/
|   |-- media-app.service
|   |-- media-app.env.example
|   |-- media-app-watchdog.sh
|   `-- deployment-assets.test.ts
|-- package.json
|-- tsconfig.json
|-- vite.config.ts
|-- eslint.config.js
|-- README.md
|-- design.md
|-- technical.md
|-- research.md
|-- web-design.html
|-- ui-concepts.html
|-- show-detail-concepts.html
|-- show-cast.html
|-- watch-action-concepts.html
|-- assets/design/
`-- plan.md
```

## 12. Implementation plan

Each milestone follows the same delivery loop:

1. Write a focused failing test for the behavior.
2. Run it and confirm the expected failure.
3. Implement the smallest coherent behavior.
4. Run focused tests, then all quality gates.
5. Commit the completed milestone.

### Milestone 1: Application skeleton

- Configure TypeScript, React, Vite, Fastify, Vitest, ESLint, and Prettier.
- Set Vite `base` to `/media/`.
- Add a tested `Media Tracker` application shell.
- Add a tested Fastify factory and `GET /health` returning `{ "ok": true }`.
- Add the loopback-capable server entry point.
- Commit: `feat: bootstrap Media Tracker application`.

### Milestone 2: Schemas, configuration, and migrations

- Add shared media/status schemas and types.
- Test blank and oversized notes and invalid configuration.
- Add environment parsing and enforce the fixed host, port, and data directory.
- Open SQLite with foreign keys and numbered idempotent migrations.
- Add the safe environment example and runtime-data ignores.
- Commit: `feat: add Media Tracker storage and configuration`.

### Milestone 3: TMDB client

- Test movie, TV, combined search, pagination, normalization, missing fields,
  show status, genres, network/provider, regional watch availability and access
  types, cast, seasons, episodes, artwork paths,
  upstream errors, malformed data, timeout, and transport failures.
- Implement the dependency-injected normalized client.
- Commit: `feat: add TMDB catalog client`.

### Milestone 4: Repository and service

- Test add-or-update identity, filters, sorting, timestamps, note trimming,
  episode and season idempotency, activity events, derived progress/views,
  upcoming episodes, cast snapshots, and explicit deletion.
- Implement parameterized repository operations and transactional service logic.
- Commit: `feat: add personal media library service`.

### Milestone 5: HTTP API

- Test every route through Fastify injection, including validation, not-found,
  upstream failure, duplicate addition, episode/season idempotency, derived
  views, activity, cast, CSV transfer, and deletion.
- Inject one `MediaService` instance into route registration.
- Add centralized safe error mapping.
- Commit: `feat: add Media Tracker API`.

### Milestone 6: Search and library UI

- Implement the behaviors and states defined in `design.md`.
- Test debounced search, validation threshold, loading, empty/error states, labels,
  poster fallback, addition, derived-view navigation, icon-only column menus,
  combined filtering, per-view sorting, Diary, Upcoming, Settings, CSV transfer,
  responsive sidebar collapse/drawer behavior, and idempotent rendering.
- Keep ephemeral UI state in React and all catalog requests behind local APIs.
- Commit: `feat: add media search and library UI`.

### Milestone 7: Detail and progress UI

- Test linked-title navigation, movie updates, show summary/cast rendering, season
  selection, full-cast navigation, episode toggle behavior, bulk season marking
  and unmarking, confirmed whole-show marking and unmarking, derived progress,
  Where to watch rendering and attribution, missing metadata fallbacks, and
  destructive confirmation.
- Implement accessible detail views and confirmation dialog.
- Scope pending state to the mutation being performed and make errors recoverable.
- Commit: `feat: add media detail and episode progress`.

### Milestone 8: MCP server

- Test registration and every tool through a fake service.
- Test invalid identifiers, dates, and statuses; mandatory delete confirmation;
  and absence of secret/internal fields.
- Implement the native stdio composition root over the shared service.
- Commit: `feat: add Media Tracker MCP server`.

### Milestone 9: Deployment and documentation

- Add static tests for service hardening and watchdog behavior.
- Create a unit with `Restart=on-failure`, `NoNewPrivileges=true`, a fixed working
  directory, loopback configuration, and a mode-0600 environment file.
- Use `ReadWritePaths=/home/hermes/.local/share/media-app` if compatible with the
  host's user-service sandbox.
- Make the watchdog check the user service, local `/health`, and Tailnet
  `/media/health`; it must be silent while healthy.
- Document setup, contracts, privacy, commands, and verification in `README.md`.
- Commit: `docs: add Media Tracker deployment guide`.

### Milestone 10: Integrate, deploy, and verify

Run before integration:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
git diff --check
git status --short --branch
```

Push a feature branch, create and review a PR with test/build evidence, merge it,
and update local `main`.

Snapshot existing ingress configuration:

```bash
tailscale serve status --json > /tmp/media-app-serve-before.json
```

Install and verify the local process:

```bash
systemctl --user daemon-reload
systemctl --user enable --now media-app.service
systemctl --user is-active media-app.service
curl -fsS http://127.0.0.1:3460/health
```

After checking the installed Tailscale CLI syntax, add only the new path:

```bash
tailscale serve --bg --https=443 --set-path /media http://127.0.0.1:3460
tailscale serve status --json
```

Verify the Tailnet interface:

```bash
curl -fsS https://hermes.tailaab0c.ts.net/media/health
curl -fsS 'https://hermes.tailaab0c.ts.net/media/api/v1/library'
```

Use a Tailnet browser to test search, add, status update, episode toggle, reload
persistence, delete confirmation, and all pre-existing application routes.

Register the compiled `dist/server/mcp-main.js` with Hermes, restart the gateway
externally, and test search, list, details, and status. Any live mutation must use
a clearly identified temporary entry and remove it with explicit confirmation.

Only after successful deployment, schedule the silent watchdog at a modest
interval such as 30 minutes.

## 13. Verification matrix

| Area             | Required evidence                                                         |
| ---------------- | ------------------------------------------------------------------------- |
| Unit/integration | Vitest suite passes                                                       |
| Static quality   | ESLint, formatting, typecheck, and build pass                             |
| Storage          | Migration succeeds from an empty database; foreign keys enabled           |
| Recovery         | WAL-aware backup and confirmed restore pass on a disposable database      |
| HTTP             | Fastify injection covers all routes and safe error cases                  |
| UI               | Testing Library covers primary flows, states, and accessibility behavior  |
| MCP              | Tool registration, validation, mutation semantics, and safe output tested |
| Service          | systemd user unit is enabled and active after restart                     |
| Network          | Local and Tailnet health/API requests succeed; no public exposure         |
| Regression       | Existing Tailscale Serve routes continue to work                          |
| Operations       | Watchdog reports failures and produces no output while healthy            |

## 14. Technical acceptance criteria

- No secret is committed or returned by any interface.
- Browser code never contacts TMDB directly.
- SQLite remains canonical for personal data.
- A title has one library entry per TMDB ID and media type.
- Episode mutation is idempotent and TV progress is derived correctly.
- Season-level marking mutates canonical episode records transactionally.
- Whole-show marking and unmarking mutate every known episode record
  transactionally and never infer a canonical status change.
- Continue, Caught up, Finished, Upcoming, and progress sorting are derived from
  canonical status, show metadata, episode air dates, and watched records.
- Linked show details expose normalized cast and episode metadata without raw
  TMDB payloads.
- Where to watch uses region-scoped normalized provider records, distinguishes
  access types, includes JustWatch attribution, and exposes no playback link.
- Full-cast navigation uses the ordered cast endpoint and preserves a return path
  to the originating show detail.
- Desktop navigation can collapse without removing the menu control; phone
  navigation starts closed as an inert off-canvas drawer with backdrop,
  destination, and Escape dismissal.
- Missing or failed artwork renders the bundled fallback; arbitrary imported
  poster origins are rejected.
- Backup uses SQLite's online backup API, verifies integrity, and never
  overwrites an existing destination. Restore requires explicit confirmation,
  preserves a verified pre-restore recovery copy, and is documented as an
  offline service operation.
- CSV export emits one show row and one explicit watched/unwatched row per known
  episode. Import is transactional, validates every row before mutation,
  preserves non-sequential watched history, and remains backward-compatible
  when optional artwork, episode-title, air-date, or watched-time columns are
  absent.
- HTTP and MCP both use the same service and validation rules.
- All tests, lint, typecheck, build, and diff checks pass.
- The process listens only on loopback.
- `/media/` is added without modifying existing Serve routes.
- Local HTTP, Tailnet HTTP, and MCP checks pass after deployment.
