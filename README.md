# Media Tracker

Private, Tailnet-only movie and television tracking built from the approved
[`design.md`](design.md) and [`technical.md`](technical.md) specifications.

## Local development

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
pnpm dev:server
```

Copy `.env.example` to a host-local `.env` or provide the same variables to the
server process. Never expose `TMDB_API_KEY` to Vite or browser code.
Set `MEDIA_APP_REGION` to the two-letter country code used for regional watch
provider availability; it defaults to `CA`.

## Hermes / MCP

The native stdio MCP server uses the same database, domain service, and TMDB
configuration as the web application:

```bash
pnpm build
pnpm mcp
```

Register the deployed `dist/server/mcp-main.js` entry point with Hermes only
after the application is built and configured. The removal tool always requires
an explicit `confirm: true` argument.

## Private deployment

The production build emits the browser application to `dist/client` and the
compiled HTTP and MCP processes to `dist/server`. The deployment templates are
in `deploy/`.

1. Install the repository at `/home/hermes/media-app` and run `pnpm build`.
2. Create `/home/hermes/.config/media-app/env` from
   `deploy/media-app.env.example`, insert the real TMDB key, and set its mode to
   `0600`.
3. Copy `deploy/media-app.service` into the user systemd unit directory.
4. Run `systemctl --user daemon-reload` and
   `systemctl --user enable --now media-app.service`.
5. Verify `http://127.0.0.1:3460/health` before adding only the `/media` route to
   the existing Tailscale Serve configuration.

The watchdog prints nothing while all configured checks are healthy. Set
`MEDIA_APP_TAILNET_HEALTH_URL` when the Tailnet route is ready; schedule the
watchdog only after local and Tailnet verification succeeds.

## Database backup and restore

The canonical SQLite database is `media-tracker.db` inside
`MEDIA_APP_DATA_DIR`. The deployment template sets that directory to
`/home/hermes/.local/share/media-app`. Do not copy the database file directly
while the service is running because SQLite uses WAL mode.

Build before using the backup CLI. A backup can safely run while the service is
active; it uses SQLite's online backup API and verifies both database integrity
and foreign keys:

```bash
mkdir -p /home/hermes/backups/media-app
pnpm backup -- backup "/home/hermes/backups/media-app/media-tracker-$(date +%F).db"
pnpm backup -- verify /home/hermes/backups/media-app/media-tracker-2026-08-23.db
```

Backup creation refuses to overwrite an existing file. Store backups somewhere
outside `MEDIA_APP_DATA_DIR` and protect them as personal viewing data.

Restoration is deliberately offline and destructive to the active database.
Stop the service, verify the selected file, restore with explicit confirmation,
then start and check the service:

```bash
systemctl --user stop media-app.service
pnpm backup -- verify /home/hermes/backups/media-app/media-tracker-2026-08-23.db
pnpm backup -- restore /home/hermes/backups/media-app/media-tracker-2026-08-23.db --confirm
systemctl --user start media-app.service
systemctl --user is-active media-app.service
curl -fsS http://127.0.0.1:3460/health
```

Before replacement, restore creates and verifies a timestamped
`media-tracker.pre-restore-*.db` recovery copy in `MEDIA_APP_DATA_DIR`. Keep it
until the restored library has been checked through the application. If restore
fails before replacement completes, the active database is put back in place.

## Verification

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

The production server binds to `127.0.0.1:3460`, runs numbered SQLite
migrations on startup, serves `dist/client`, and is designed to sit behind the
existing Tailscale Serve `/media/` path. SQLite library data, notes, and viewing
history remain host-local; the TMDB credential is read only by server processes.
