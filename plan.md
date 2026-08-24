# Media Tracker Implementation Plan

> **For Claude:** Implement this plan task-by-task with strict TDD. This repository is intentionally empty; treat this document as the initial product and architecture specification.

**Goal:** Build a private, Tailnet-only app for tracking Chris's movies and TV shows—discovering titles through TMDB, maintaining a personal watchlist/library, and recording movie/episode progress.

**Architecture:** A TypeScript Fastify server owns a local SQLite library and talks to TMDB server-side. A React/Vite UI consumes a narrow local API. The same service layer powers a native, read-only-plus-explicit-mutation MCP server so Hermes can search and manage Chris's media without duplicating rules.

**Tech stack:** TypeScript, React 19, Vite 8, Fastify 5, Zod 4, SQLite through `better-sqlite3`, Vitest 4 + Testing Library, ESLint, Prettier, `@modelcontextprotocol/sdk`, systemd user service, and Tailscale Serve.

---

## Product scope

### V1 user stories

- I can search TMDB for movies and TV shows without exposing the TMDB key to my browser.
- I can add a movie or series to one of: **Watchlist**, **Watching**, **Watched**, or **Dropped**.
- I can see a unified library and filter it by type, status, and title.
- I can view title artwork, metadata, synopsis, release/first-air date, runtime where available, and my personal status/notes.
- For a movie, I can mark it watched or change its status.
- For a series, I can select seasons and mark individual episodes watched; progress is derived from recorded watched episodes.
- I can remove a title from my library only through an explicit destructive confirmation in the UI/MCP contract.
- Hermes can use MCP to search TMDB, list tracked media, add/change a status, mark an episode watched, and report progress.

### Explicit non-goals for v1

- No torrent/download-client integration, media-server integration, automation, or piracy workflows.
- No streaming links, provider availability, recommendation engine, ratings/reviews, social features, or multi-user accounts.
- No public hosting, Funnel, cloud database, or browser-side TMDB calls.
- No automatic inference that something was watched; all library/progress changes are explicit.
- No image/file storage in SQLite; use TMDB-hosted image URLs with safe fallback presentation.

## Non-negotiable constraints

1. **Private hosting:** bind only to `127.0.0.1:3460` (currently unused) and expose only through the new `/media/` Tailscale Serve path at `https://hermes.tailaab0c.ts.net/media/`. Do not replace existing route handlers.
2. **TMDB secret:** configure `TMDB_API_KEY` only in a mode-0600 host-local environment file. Never commit it, log it, put it in `plan.md`, return it from an API/MCP tool, or put it in browser JavaScript.
3. **Data ownership:** SQLite is canonical for personal library/status/progress/notes. TMDB is a catalog enrichment source, not the source of personal state.
4. **Client boundary:** React calls only same-origin `/api/v1/...`; Fastify is the sole component that calls TMDB.
5. **MCP boundary:** MCP calls the same `MediaService` as HTTP. It never calls the browser API or duplicates storage rules.
6. **TDD/delivery:** write and run a failing focused test before each implementation behavior, then run `npm test`, lint, typecheck, build, PR, merge, deploy, and live-verify.

## Canonical data model

Use migrations (via a small `schema_version` table and numbered TypeScript migrations) rather than relying on ad-hoc schema creation. Enable foreign keys on every SQLite connection.

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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tmdb_id, media_type)
);

CREATE TABLE library_entries (
  id TEXT PRIMARY KEY,
  media_item_id TEXT NOT NULL UNIQUE REFERENCES media_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'watched', 'dropped')),
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

CREATE TABLE schema_version (version INTEGER NOT NULL);
```

Store only stable display fields imported from TMDB. Do not save raw TMDB JSON, credentials, or unbounded search history.

### Domain rules

- `tmdb_id + media_type` uniquely identifies a catalog title.
- Adding an existing title updates its library entry rather than creating a duplicate.
- Marking a movie watched sets status to `watched` and `completed_at` if it was empty.
- Marking a TV episode watched is idempotent; marking it unwatched removes exactly that episode record.
- Series progress is derived: `watched episode count / known total episode count`; never maintain a second mutable progress counter.
- A series becomes `watched` only through an explicit status action; do not silently mark it finished when all currently known episodes are checked.
- Notes are optional, trimmed, bounded to 2,000 characters, and plain text.

## Proposed repository layout

```text
Media-app/
├── client/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── styles.css
│   ├── components/
│   │   ├── MediaCard.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── SearchResults.tsx
│   │   ├── FilterBar.tsx
│   │   ├── MovieDetail.tsx
│   │   ├── SeriesDetail.tsx
│   │   ├── EpisodeList.tsx
│   │   └── ConfirmDialog.tsx
│   └── lib/
│       ├── api.ts
│       ├── formatters.ts
│       └── image-url.ts
├── server/
│   ├── api.ts
│   ├── api.test.ts
│   ├── config.ts
│   ├── config.test.ts
│   ├── database.ts
│   ├── database.test.ts
│   ├── migrations.ts
│   ├── repositories/
│   │   └── media-repository.ts
│   ├── services/
│   │   └── media-service.ts
│   ├── tmdb/
│   │   ├── tmdb-client.ts
│   │   └── tmdb-client.test.ts
│   ├── mcp.ts
│   ├── mcp.test.ts
│   ├── mcp-main.ts
│   └── main.ts
├── shared/
│   ├── media-schema.ts
│   └── media-types.ts
├── deploy/
│   ├── media-app.service
│   ├── media-app.env.example
│   └── media-app-watchdog.sh
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── .gitignore
├── README.md
└── plan.md
```

## API contract

Serve local paths without `/media` because Tailscale Serve strips the public prefix before proxying.

```text
GET    /health
GET    /api/v1/search?query=<text>&type=movie|tv|all&page=<positive integer>
GET    /api/v1/library?status=...&type=...&query=...&sort=updated|title
POST   /api/v1/library
GET    /api/v1/library/:id
PATCH  /api/v1/library/:id
DELETE /api/v1/library/:id
GET    /api/v1/library/:id/episodes?season=<integer>
PUT    /api/v1/library/:id/episodes/:season/:episode
DELETE /api/v1/library/:id/episodes/:season/:episode
```

Use Zod for every query/body/path parameter. Error responses are safe and predictable:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request." } }
```

Use `404` for unknown library entries, `409` only for a real state conflict, `400` for invalid input, and `502` for a safe TMDB upstream failure. Never include TMDB URLs with credentials, headers, raw responses, stack traces, or environment data in browser output.

## MCP contract

Implement a native stdio MCP entry point at `server/mcp-main.ts`. Register it with Hermes only after it has been compiled and deployed. Initial tool set:

| Tool                        | Mutation         | Purpose                                         |
| --------------------------- | ---------------- | ----------------------------------------------- |
| `search_media`              | No               | Search TMDB catalog by title/type.              |
| `list_media_library`        | No               | Filter tracked media by type/status/query.      |
| `get_media_details`         | No               | Get one tracked entry plus progress.            |
| `add_media_to_library`      | Yes              | Add a TMDB movie/series with explicit status.   |
| `update_media_status`       | Yes              | Change status/note of an existing entry.        |
| `mark_episode_watched`      | Yes              | Mark/unmark one explicit series episode.        |
| `remove_media_from_library` | Yes, destructive | Require `confirm: true` in the tool input.      |
| `get_media_service_status`  | No               | Safe service/database/TMDB availability status. |

MCP design requirements:

- Input schemas mirror `MediaService` methods and are validated with Zod.
- Mutation output returns the normalized updated entry—not raw database rows.
- `remove_media_from_library` rejects calls unless `confirm === true`.
- MCP does not expose the TMDB key, raw TMDB results beyond normalized fields, local database path, or arbitrary system status.
- Restart the Hermes gateway from an external shell after changing MCP schema/implementation before making claims about live tool availability.

---

# Implementation sequence

## Task 1: Bootstrap a testable app skeleton

**Files:** create `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `client/main.tsx`, `client/App.tsx`, `client/App.test.tsx`, `client/styles.css`, `server/api.ts`, `server/api.test.ts`, `server/main.ts`.

1. Write failing UI test expecting `Media Tracker` heading and API test expecting `GET /health` → `200 { ok: true }`.
2. Run `npm test -- --run client/App.test.tsx server/api.test.ts` and confirm red.
3. Configure React/Vite/Fastify/Vitest/TypeScript/ESLint. Set Vite `base: "/media/"`.
4. Implement only the title shell, Fastify factory, health route, and loopback-capable server entry point.
5. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
6. Commit: `feat: bootstrap Media Tracker application`.

## Task 2: Implement shared schemas, validated configuration, and migrations

**Files:** create `shared/media-schema.ts`, `shared/media-types.ts`, `server/config.ts`, `server/config.test.ts`, `server/database.ts`, `server/database.test.ts`, `server/migrations.ts`, `deploy/media-app.env.example`.

1. Write failing tests for library status/type schemas, blank/oversize note rejection, invalid `TMDB_API_KEY` configuration, and migration from empty DB to latest schema.
2. Confirm tests fail.
3. Implement Zod schema/types, environment parser, SQLite connection with foreign keys, and idempotent numbered migrations.
4. Require `MEDIA_APP_HOST=127.0.0.1`, `MEDIA_APP_PORT=3460`, `MEDIA_APP_DATA_DIR=/home/hermes/.local/share/media-app`, and host-only `TMDB_API_KEY`.
5. Ensure `.gitignore` ignores `.env`, `*.db`, and app runtime data; do not create or commit an actual secret file.
6. Run focused tests then all quality gates.
7. Commit: `feat: add Media Tracker storage and configuration`.

## Task 3: Add a normalized server-side TMDB client

**Files:** create `server/tmdb/tmdb-client.ts`, `server/tmdb/tmdb-client.test.ts`; modify `shared/media-schema.ts`.

1. Write failing tests with a mocked fetch transport for movie search, TV search, type `all`, pagination input, image-path normalization, missing optional metadata, non-200 responses, malformed payloads, and timeout/transport errors.
2. Confirm red with `npm test -- --run server/tmdb/tmdb-client.test.ts`.
3. Implement a dependency-injected TMDB client. Use TMDB v3 HTTPS endpoints and attach the secret only in the server request.
4. Normalize results into `CatalogMedia` fields: `tmdbId`, `mediaType`, `title`, `overview`, `posterPath`, `backdropPath`, `releaseDate`, `firstAirDate`, `runtimeMinutes?`, `totalSeasons?`, `totalEpisodes?`.
5. URL-encode query input and clamp page to TMDB's documented bounds. Do not return raw TMDB payloads.
6. Run focused/all tests and commit: `feat: add TMDB catalog client`.

## Task 4: Implement repository and personal-library service

**Files:** create `server/repositories/media-repository.ts`, `server/services/media-service.ts`, `server/services/media-service.test.ts`.

1. Write failing tests for add-or-update by `(tmdb_id, media_type)`, filter/sort behavior, status transition timestamps, note trimming, no duplicate watched episode, mark/unmark episode, derived series progress, and explicit delete.
2. Confirm red.
3. Implement repository SQL with parameterized statements only. Implement `MediaService` over repository + TMDB client.
4. Make `addToLibrary` fetch/validate catalog metadata first, then write one transaction.
5. Never generate movie/TV progress from guesswork; only episode rows determine TV progress.
6. Run tests and commit: `feat: add personal media library service`.

## Task 5: Add the HTTP API

**Files:** modify `server/api.ts`, `server/api.test.ts`, `server/main.ts`.

1. Write failing injection tests for every documented route: valid results, Zod validation failure, library not found, TMDB upstream failure, duplicate add behavior, episode idempotency, and delete.
2. Confirm red.
3. Inject a single `MediaService` into Fastify route registration. Parse all API input through shared Zod schemas.
4. Add a centralized safe error mapping. Do not leak `Error.message` from TMDB/database to the client.
5. Run `npm test -- --run server/api.test.ts`, then all gates.
6. Commit: `feat: add Media Tracker API`.

## Task 6: Build search and library UI

**Files:** create `client/lib/api.ts`, `client/lib/formatters.ts`, `client/lib/image-url.ts`, `client/components/MediaCard.tsx`, `StatusBadge.tsx`, `SearchResults.tsx`, `FilterBar.tsx`; modify `client/App.tsx`, `client/App.test.tsx`, `client/styles.css`.

1. Write failing Testing Library tests for debounced search (minimum 2 non-whitespace characters), loading, empty results, TMDB error state, card type/source labels, image fallback, add-to-library, filters, and no duplicate card after an idempotent add.
2. Confirm red.
3. Implement a keyboard-accessible search panel, list/grid library, status filters, large click/touch targets, clear loading/empty/error states, and image fallback. Use React state only for ephemeral UI state.
4. Do not make direct browser calls to TMDB.
5. Run UI tests, all quality gates, and commit: `feat: add media search and library UI`.

## Task 7: Build detail and episodic-progress UI

**Files:** create `client/components/MovieDetail.tsx`, `SeriesDetail.tsx`, `EpisodeList.tsx`, `ConfirmDialog.tsx`; add focused tests; modify API client/styles/App routing state.

1. Write failing tests for movie status/note update, series season selection, watched/unwatched episode actions, derived progress label, absent season/episode lists, and delete confirmation behavior.
2. Confirm red.
3. Implement detail views. Use an accessible native dialog or correctly implemented modal. The delete action must have a visible confirmation naming the title.
4. Disable a mutation control only while its own request is pending; display a recoverable error if it fails.
5. Run focused/all tests and commit: `feat: add media detail and episode progress`.

## Task 8: Implement MCP server and test it

**Files:** create `server/mcp.ts`, `server/mcp-main.ts`, `server/mcp.test.ts`.

1. Write failing tests that inspect registered tools, invoke a fake service through each tool, reject invalid date/status/id inputs, require `confirm: true` for removal, and assert no secret/internal-path fields in output.
2. Confirm red.
3. Implement native stdio MCP server with `@modelcontextprotocol/sdk`; its composition root reuses `MediaService`, database config, and TMDB client.
4. Ensure descriptions describe mutation/destructive semantics accurately.
5. Run focused/all tests and commit: `feat: add Media Tracker MCP server`.

## Task 9: Add deployment assets and documentation

**Files:** create `deploy/media-app.service`, `deploy/media-app-watchdog.sh`, `deploy/deployment-assets.test.ts`; create `README.md`.

1. Write a failing static test asserting the unit has `Restart=on-failure`, `NoNewPrivileges=true`, fixed working directory, loopback configuration, and a mode-0600 `EnvironmentFile`; assert watchdog checks service, loopback `/health`, and Tailnet `/media/health` and is silent when healthy.
2. Confirm red.
3. Implement the service unit using compiled `dist/server/main.js`. Use `ReadWritePaths=/home/hermes/.local/share/media-app` if sandboxing directives allow it. Never hardcode the secret.
4. Document exact setup, API, MCP tools, data ownership, privacy, test commands, and deploy verification. Mention `/media/` externally and local root routes internally.
5. Run tests/gates and commit: `docs: add Media Tracker deployment guide`.

## Task 10: PR, deploy, and verify every layer

1. Run:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short --branch
```

2. Push a feature branch, create a PR with the test/build results, review, merge, and pull `main` locally.
3. Snapshot the existing Serve configuration before changing it:

```bash
tailscale serve status --json > /tmp/media-app-serve-before.json
```

4. Install safely:

```bash
systemctl --user daemon-reload
systemctl --user enable --now media-app.service
systemctl --user is-active media-app.service
curl -fsS http://127.0.0.1:3460/health
```

5. Add only the path route; inspect `tailscale serve --help` first if syntax differs. Preserve existing `/`, `/lists`, `/location`, `/owntracks`, and `/reminders` handlers:

```bash
tailscale serve --bg --https=443 --set-path /media http://127.0.0.1:3460
tailscale serve status --json
```

6. Verify live end-to-end:

```bash
curl -fsS https://hermes.tailaab0c.ts.net/media/health
curl -fsS 'https://hermes.tailaab0c.ts.net/media/api/v1/library'
```

Use a Tailnet browser to verify search, add, status update, a series episode toggle, reload persistence, delete confirmation, and existing application routes.

7. Register `dist/server/mcp-main.js` with Hermes as a native MCP server. Restart the Hermes gateway externally, then execute safe live MCP checks: search a title, list library, and get status. Perform any live mutation only on a clearly designated temporary test item and remove it using explicit confirmation.

8. Add the script-only watchdog only after successful deployment; schedule it at a modest interval (for example 30 minutes) and require silence when healthy.

---

## Acceptance checklist

### Product

- [ ] TMDB searches work for movie, TV, and all types without browser-side secret exposure.
- [ ] A title can be added once, status/note edited, filtered, and explicitly removed.
- [ ] Movie status works; TV episodes can be marked watched/unwatched idempotently.
- [ ] TV progress is derived accurately from stored watched episode records.
- [ ] Search/library/detail views have loading, empty, error, and image-fallback states.

### Security and privacy

- [ ] No committed secret; only `TMDB_API_KEY` placeholder in example config.
- [ ] API/MCP do not leak secrets, paths, raw TMDB bodies, or DB internals.
- [ ] Listener is loopback-only and public network exposure/Funnel is absent.
- [ ] Tailscale Serve has an additional `/media` path without disturbing current routes.

### Engineering

- [ ] All tests, lint, typecheck, and build pass.
- [ ] User service is enabled/active and survives restart.
- [ ] Local and Tailnet health/API requests work.
- [ ] MCP tools are live after gateway restart and match their schemas.
- [ ] Watchdog is silent when all three health layers are healthy.

## Open product decisions to defer until after v1

- Whether Chris wants a separate `owned` status from watched/watchlist.
- Ratings and reviews.
- Provider availability/streaming-service links.
- NAS/media-server or automated download integration.
- Family/shared profiles or Sarah-specific library state.
- Recommendations and notifications.
