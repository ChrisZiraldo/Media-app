import type Database from "better-sqlite3";

interface Migration {
  version: number;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY, tmdb_id INTEGER NOT NULL, media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
      title TEXT NOT NULL, original_title TEXT, overview TEXT, poster_path TEXT, backdrop_path TEXT,
      release_date TEXT, first_air_date TEXT, runtime_minutes INTEGER, total_seasons INTEGER,
      total_episodes INTEGER, show_status TEXT, genres_json TEXT NOT NULL DEFAULT '[]', network_name TEXT,
      provider_name TEXT, provider_region TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (tmdb_id, media_type)
    );
    CREATE TABLE IF NOT EXISTS library_entries (
      id TEXT PRIMARY KEY, media_item_id TEXT NOT NULL UNIQUE REFERENCES media_items(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('watchlist','watching','stopped','watched')), note TEXT,
      started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tv_episodes (
      media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE, season_number INTEGER NOT NULL CHECK (season_number >= 0),
      episode_number INTEGER NOT NULL CHECK (episode_number >= 1), title TEXT, overview TEXT, air_date TEXT,
      runtime_minutes INTEGER, still_path TEXT, PRIMARY KEY (media_item_id, season_number, episode_number)
    );
    CREATE TABLE IF NOT EXISTS watched_episodes (
      id TEXT PRIMARY KEY, media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL CHECK (season_number >= 0), episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
      watched_at TEXT NOT NULL, UNIQUE (media_item_id, season_number, episode_number)
    );
    CREATE TABLE IF NOT EXISTS cast_members (
      media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE, tmdb_person_id INTEGER NOT NULL,
      name TEXT NOT NULL, character_name TEXT, profile_path TEXT, sort_order INTEGER NOT NULL,
      PRIMARY KEY (media_item_id, tmdb_person_id, character_name)
    );
    CREATE TABLE IF NOT EXISTS watch_providers (
      media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE, region TEXT NOT NULL,
      tmdb_provider_id INTEGER NOT NULL, provider_name TEXT NOT NULL, logo_path TEXT,
      access_type TEXT NOT NULL CHECK (access_type IN ('subscription','free','ads','rent','buy')),
      display_priority INTEGER NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (media_item_id, region, tmdb_provider_id, access_type)
    );
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY, media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('episode_watched','episode_unwatched','status_changed')),
      season_number INTEGER, episode_number INTEGER, previous_status TEXT, new_status TEXT, occurred_at TEXT NOT NULL
    );
  `,
  },
  {
    version: 2,
    sql: `
    UPDATE library_entries
    SET status='watching', completed_at=NULL, updated_at=datetime('now')
    WHERE status IN ('watchlist','watched')
      AND EXISTS (SELECT 1 FROM tv_episodes e WHERE e.media_item_id=library_entries.media_item_id)
      AND EXISTS (
        SELECT 1 FROM tv_episodes e
        LEFT JOIN watched_episodes w ON w.media_item_id=e.media_item_id AND w.season_number=e.season_number AND w.episode_number=e.episode_number
        WHERE e.media_item_id=library_entries.media_item_id AND w.id IS NULL
      )
      AND (
        status='watched' OR EXISTS (
          SELECT 1 FROM watched_episodes w WHERE w.media_item_id=library_entries.media_item_id
        )
      );
    UPDATE library_entries
    SET status='watched', completed_at=COALESCE(completed_at,datetime('now')), updated_at=datetime('now')
    WHERE status<>'stopped'
      AND EXISTS (SELECT 1 FROM tv_episodes e WHERE e.media_item_id=library_entries.media_item_id)
      AND NOT EXISTS (
        SELECT 1 FROM tv_episodes e
        LEFT JOIN watched_episodes w ON w.media_item_id=e.media_item_id AND w.season_number=e.season_number AND w.episode_number=e.episode_number
        WHERE e.media_item_id=library_entries.media_item_id AND w.id IS NULL
      );
  `,
  },
  {
    version: 3,
    sql: `
    UPDATE library_entries
    SET status='watchlist', started_at=NULL, completed_at=NULL, updated_at=datetime('now')
    WHERE status IN ('watching','watched')
      AND EXISTS (SELECT 1 FROM tv_episodes e WHERE e.media_item_id=library_entries.media_item_id)
      AND NOT EXISTS (
        SELECT 1 FROM watched_episodes w WHERE w.media_item_id=library_entries.media_item_id
      );
  `,
  },
  {
    version: 4,
    sql: `ALTER TABLE library_entries ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1));`,
  },
];

export function runMigrations(database: Database.Database): void {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
  );
  const current = database
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_version")
    .get() as { version: number };
  for (const migration of migrations.filter(
    ({ version }) => version > current.version,
  )) {
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_version (version) VALUES (?)")
        .run(migration.version);
    })();
  }
}
