import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CastMember,
  CatalogEpisode,
  CatalogMedia,
  WatchProvider,
} from "../../shared/catalog-types.js";
import type { LibraryStatus, LibraryView } from "../../shared/media-schema.js";
import type {
  ActivityItem,
  EpisodeState,
  LibraryItem,
  UpcomingEpisode,
} from "../../shared/media-types.js";
import type {
  TransferEpisode,
  TransferShow,
} from "../../shared/transfer-types.js";

interface LibraryRow {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  release_date: string | null;
  first_air_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  runtime_minutes: number | null;
  note: string | null;
  status: LibraryStatus;
  total_episodes: number | null;
  total_seasons: number | null;
  genres_json: string;
  provider_name: string | null;
  updated_at: string;
  show_status: string | null;
  watched_episodes: number;
  available_episode_number: number | null;
  next_season: number | null;
  next_episode_number: number | null;
  next_title: string | null;
  next_air_date: string | null;
}

export interface LibraryQuery {
  view?: LibraryView;
  status?: LibraryStatus;
  type?: "movie" | "tv";
  query?: string;
  genre?: string;
  provider?: string;
  sort?: "title" | "progress" | "nextEpisode" | "lastUpdated";
  direction?: "asc" | "desc";
}

function deriveView(row: LibraryRow): Exclude<LibraryView, "shows"> {
  if (row.status === "watchlist") return "watchlist";
  if (row.status === "stopped") return "stopped";
  const ended = ["ended", "canceled", "cancelled"].includes(
    (row.show_status ?? "").toLowerCase(),
  );
  if (
    ended &&
    row.total_episodes !== null &&
    row.watched_episodes >= row.total_episodes
  )
    return "finished";
  return row.available_episode_number === null ? "caught-up" : "continue";
}

export class MediaRepository {
  constructor(private readonly database: Database.Database) {}

  private assertWatchlistHasNoProgress(
    mediaId: string,
    status: LibraryStatus,
  ): void {
    if (status !== "watchlist") return;
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM watched_episodes WHERE media_item_id=?",
      )
      .get(mediaId) as { count: number };
    if (row.count > 0)
      throw Object.assign(new Error("Watchlist titles cannot have progress"), {
        statusCode: 409,
      });
  }

  addOrUpdate(item: CatalogMedia, status: LibraryStatus): string {
    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const existing = this.database
        .prepare(
          "SELECT id FROM media_items WHERE tmdb_id = ? AND media_type = ?",
        )
        .get(item.tmdbId, item.mediaType) as { id: string } | undefined;
      const mediaId = existing?.id ?? randomUUID();
      this.database
        .prepare(
          `INSERT INTO media_items (id,tmdb_id,media_type,title,overview,poster_path,backdrop_path,release_date,first_air_date,runtime_minutes,total_seasons,total_episodes,show_status,genres_json,network_name,created_at,updated_at)
        VALUES (@id,@tmdbId,@mediaType,@title,@overview,@posterPath,@backdropPath,@releaseDate,@firstAirDate,@runtimeMinutes,@totalSeasons,@totalEpisodes,@showStatus,@genresJson,@networkName,@now,@now)
        ON CONFLICT(tmdb_id,media_type) DO UPDATE SET title=excluded.title,overview=excluded.overview,poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,release_date=excluded.release_date,first_air_date=excluded.first_air_date,runtime_minutes=excluded.runtime_minutes,total_seasons=excluded.total_seasons,total_episodes=excluded.total_episodes,show_status=excluded.show_status,genres_json=excluded.genres_json,network_name=excluded.network_name,updated_at=excluded.updated_at`,
        )
        .run({
          id: mediaId,
          ...item,
          genresJson: JSON.stringify(item.genres),
          runtimeMinutes: item.runtimeMinutes ?? null,
          totalSeasons: item.totalSeasons ?? null,
          totalEpisodes: item.totalEpisodes ?? null,
          showStatus: item.showStatus ?? null,
          networkName: item.networkName ?? null,
          now,
        });
      const entry = this.database
        .prepare("SELECT id FROM library_entries WHERE media_item_id = ?")
        .get(mediaId) as { id: string } | undefined;
      this.assertWatchlistHasNoProgress(mediaId, status);
      this.database
        .prepare(
          `INSERT INTO library_entries (id,media_item_id,status,created_at,updated_at) VALUES (?,?,?,?,?)
        ON CONFLICT(media_item_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`,
        )
        .run(entry?.id ?? randomUUID(), mediaId, status, now, now);
      return mediaId;
    })();
  }

  setStatus(mediaId: string, status: LibraryStatus): void {
    this.database.transaction(() => {
      const previous = this.database
        .prepare("SELECT status FROM library_entries WHERE media_item_id=?")
        .get(mediaId) as { status: LibraryStatus } | undefined;
      if (!previous)
        throw Object.assign(new Error("Library item not found"), {
          statusCode: 404,
        });
      this.assertWatchlistHasNoProgress(mediaId, status);
      if (previous.status === status) return;
      const now = new Date().toISOString();
      this.database
        .prepare(
          "UPDATE library_entries SET status=?,started_at=CASE WHEN ?='watching' THEN COALESCE(started_at,?) ELSE started_at END,completed_at=CASE WHEN ?='watched' THEN ? ELSE NULL END,updated_at=? WHERE media_item_id=?",
        )
        .run(status, status, now, status, now, now, mediaId);
      this.database
        .prepare(
          "INSERT INTO activity_events (id,media_item_id,event_type,previous_status,new_status,occurred_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          mediaId,
          "status_changed",
          previous.status,
          status,
          now,
        );
    })();
  }
  setNote(mediaId: string, note: string | null): void {
    const result = this.database
      .prepare(
        "UPDATE library_entries SET note=?,updated_at=? WHERE media_item_id=?",
      )
      .run(note, new Date().toISOString(), mediaId);
    if (result.changes === 0)
      throw Object.assign(new Error("Library item not found"), {
        statusCode: 404,
      });
  }
  markNextAvailable(
    mediaId: string,
  ): { seasonNumber: number; episodeNumber: number } | null {
    const row = this.database
      .prepare(
        `SELECT e.season_number,e.episode_number FROM tv_episodes e LEFT JOIN watched_episodes w ON w.media_item_id=e.media_item_id AND w.season_number=e.season_number AND w.episode_number=e.episode_number WHERE e.media_item_id=? AND w.id IS NULL AND (e.air_date IS NULL OR e.air_date<=date('now')) ORDER BY e.season_number,e.episode_number LIMIT 1`,
      )
      .get(mediaId) as
      { season_number: number; episode_number: number } | undefined;
    if (!row) return null;
    this.setEpisodeWatched(
      mediaId,
      row.season_number,
      row.episode_number,
      true,
    );
    return {
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
    };
  }
  unwatchLatest(
    mediaId: string,
  ): { seasonNumber: number; episodeNumber: number } | null {
    const row = this.database
      .prepare(
        "SELECT season_number,episode_number FROM watched_episodes WHERE media_item_id=? ORDER BY season_number DESC,episode_number DESC LIMIT 1",
      )
      .get(mediaId) as
      { season_number: number; episode_number: number } | undefined;
    if (!row) return null;
    this.setEpisodeWatched(
      mediaId,
      row.season_number,
      row.episode_number,
      false,
    );
    return {
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
    };
  }
  startWatching(
    mediaId: string,
  ): { seasonNumber: number; episodeNumber: number } | null {
    return this.database.transaction(() => {
      this.setStatus(mediaId, "watching");
      return this.markNextAvailable(mediaId);
    })();
  }
  remove(mediaId: string): boolean {
    return (
      this.database.prepare("DELETE FROM media_items WHERE id=?").run(mediaId)
        .changes > 0
    );
  }

  list(query: LibraryQuery = {}): LibraryItem[] {
    const rows = this.database
      .prepare(
        `SELECT m.id,m.tmdb_id,m.media_type,m.title,m.release_date,m.first_air_date,m.poster_path,m.backdrop_path,m.overview,m.runtime_minutes,l.status,l.note,
      m.total_episodes,m.total_seasons,m.genres_json,m.provider_name,l.updated_at,m.show_status,
      COUNT(w.id) AS watched_episodes,
      (SELECT e.episode_number FROM tv_episodes e LEFT JOIN watched_episodes we ON we.media_item_id=e.media_item_id AND we.season_number=e.season_number AND we.episode_number=e.episode_number WHERE e.media_item_id=m.id AND we.id IS NULL AND (e.air_date IS NULL OR e.air_date <= date('now')) ORDER BY e.season_number,e.episode_number LIMIT 1) AS available_episode_number,
      (SELECT e.season_number FROM tv_episodes e LEFT JOIN watched_episodes we ON we.media_item_id=e.media_item_id AND we.season_number=e.season_number AND we.episode_number=e.episode_number WHERE e.media_item_id=m.id AND we.id IS NULL ORDER BY e.season_number,e.episode_number LIMIT 1) AS next_season,
      (SELECT e.episode_number FROM tv_episodes e LEFT JOIN watched_episodes we ON we.media_item_id=e.media_item_id AND we.season_number=e.season_number AND we.episode_number=e.episode_number WHERE e.media_item_id=m.id AND we.id IS NULL ORDER BY e.season_number,e.episode_number LIMIT 1) AS next_episode_number,
      (SELECT e.title FROM tv_episodes e LEFT JOIN watched_episodes we ON we.media_item_id=e.media_item_id AND we.season_number=e.season_number AND we.episode_number=e.episode_number WHERE e.media_item_id=m.id AND we.id IS NULL ORDER BY e.season_number,e.episode_number LIMIT 1) AS next_title,
      (SELECT e.air_date FROM tv_episodes e LEFT JOIN watched_episodes we ON we.media_item_id=e.media_item_id AND we.season_number=e.season_number AND we.episode_number=e.episode_number WHERE e.media_item_id=m.id AND we.id IS NULL ORDER BY e.season_number,e.episode_number LIMIT 1) AS next_air_date
      FROM media_items m JOIN library_entries l ON l.media_item_id=m.id LEFT JOIN watched_episodes w ON w.media_item_id=m.id
      GROUP BY m.id,l.id ORDER BY lower(m.title)`,
      )
      .all() as LibraryRow[];
    const items = rows.flatMap((row) => {
      const view = deriveView(row),
        genres = JSON.parse(row.genres_json) as string[];
      if (query.view && query.view !== "shows" && view !== query.view)
        return [];
      if (query.status && row.status !== query.status) return [];
      if (query.type && row.media_type !== query.type) return [];
      if (
        query.query &&
        !row.title.toLowerCase().includes(query.query.toLowerCase())
      )
        return [];
      if (
        query.genre &&
        !genres.some(
          (genre) => genre.toLowerCase() === query.genre!.toLowerCase(),
        )
      )
        return [];
      if (
        query.provider &&
        row.provider_name?.toLowerCase() !== query.provider.toLowerCase()
      )
        return [];
      const nextEpisode =
        row.next_episode_number === null
          ? null
          : `S${row.next_season} E${row.next_episode_number}${row.next_title ? ` · ${row.next_title}` : ""}`;
      return [
        {
          id: row.id,
          tmdbId: row.tmdb_id,
          mediaType: row.media_type,
          title: row.title,
          year: (row.release_date ?? row.first_air_date)?.slice(0, 4) ?? null,
          posterPath: row.poster_path,
          backdropPath: row.backdrop_path,
          overview: row.overview,
          firstAirDate: row.first_air_date,
          runtimeMinutes: row.runtime_minutes,
          showStatus: row.show_status,
          status: row.status,
          note: row.note,
          watchedEpisodes: row.watched_episodes,
          totalEpisodes: row.total_episodes,
          currentSeason: row.total_seasons,
          genre: genres,
          provider: row.provider_name,
          nextEpisode,
          nextEpisodeDate: row.next_air_date,
          updatedAt: row.updated_at,
          libraryView: view,
        },
      ];
    });
    const direction = query.direction === "desc" ? -1 : 1,
      sort = query.sort ?? "title";
    return items.sort((first, second) => {
      let comparison: number;
      if (sort === "progress") {
        const firstRatio =
            first.watchedEpisodes / Math.max(first.totalEpisodes ?? 1, 1),
          secondRatio =
            second.watchedEpisodes / Math.max(second.totalEpisodes ?? 1, 1);
        comparison = firstRatio - secondRatio;
      } else if (sort === "nextEpisode") {
        comparison = (first.nextEpisodeDate ?? "9999-12-31").localeCompare(
          second.nextEpisodeDate ?? "9999-12-31",
        );
      } else if (sort === "lastUpdated") {
        comparison = first.updatedAt.localeCompare(second.updatedAt);
      } else {
        comparison = first.title.localeCompare(second.title, undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }
      return comparison === 0
        ? first.title.localeCompare(second.title, undefined, {
            sensitivity: "base",
            numeric: true,
          })
        : comparison * direction;
    });
  }

  setEpisodeWatched(
    mediaId: string,
    seasonNumber: number,
    episodeNumber: number,
    watched: boolean,
    watchedAt = new Date().toISOString(),
  ): void {
    this.database.transaction(() => {
      const episodeExists = this.database
        .prepare(
          "SELECT 1 FROM tv_episodes WHERE media_item_id=? AND season_number=? AND episode_number=?",
        )
        .get(mediaId, seasonNumber, episodeNumber);
      if (!episodeExists)
        throw Object.assign(new Error("Episode not found"), {
          statusCode: 404,
        });
      const result = watched
        ? this.database
            .prepare(
              `INSERT INTO watched_episodes (id,media_item_id,season_number,episode_number,watched_at) VALUES (?,?,?,?,?) ON CONFLICT(media_item_id,season_number,episode_number) DO NOTHING`,
            )
            .run(randomUUID(), mediaId, seasonNumber, episodeNumber, watchedAt)
        : this.database
            .prepare(
              "DELETE FROM watched_episodes WHERE media_item_id=? AND season_number=? AND episode_number=?",
            )
            .run(mediaId, seasonNumber, episodeNumber);
      if (result.changes === 0) return;
      this.database
        .prepare(
          "INSERT INTO activity_events (id,media_item_id,event_type,season_number,episode_number,occurred_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          mediaId,
          watched ? "episode_watched" : "episode_unwatched",
          seasonNumber,
          episodeNumber,
          watchedAt,
        );
    })();
  }

  upsertEpisodes(mediaId: string, episodes: CatalogEpisode[]): void {
    const statement = this.database
      .prepare(`INSERT INTO tv_episodes (media_item_id,season_number,episode_number,title,overview,air_date,runtime_minutes,still_path)
      VALUES (@mediaId,@seasonNumber,@episodeNumber,@title,@overview,@airDate,@runtimeMinutes,@stillPath)
      ON CONFLICT(media_item_id,season_number,episode_number) DO UPDATE SET title=excluded.title,overview=excluded.overview,air_date=excluded.air_date,runtime_minutes=excluded.runtime_minutes,still_path=excluded.still_path`);
    this.database.transaction(() =>
      episodes.forEach((episode) => statement.run({ mediaId, ...episode })),
    )();
  }

  replaceCast(mediaId: string, members: CastMember[]): void {
    const insert = this.database.prepare(
      "INSERT INTO cast_members (media_item_id,tmdb_person_id,name,character_name,profile_path,sort_order) VALUES (@mediaId,@tmdbPersonId,@name,@characterName,@profilePath,@sortOrder)",
    );
    this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM cast_members WHERE media_item_id=?")
        .run(mediaId);
      members.forEach((member) => insert.run({ mediaId, ...member }));
    })();
  }

  cast(mediaId: string): CastMember[] {
    return (
      this.database
        .prepare(
          "SELECT tmdb_person_id,name,character_name,profile_path,sort_order FROM cast_members WHERE media_item_id=? ORDER BY sort_order",
        )
        .all(mediaId) as Array<{
        tmdb_person_id: number;
        name: string;
        character_name: string | null;
        profile_path: string | null;
        sort_order: number;
      }>
    ).map((row) => ({
      tmdbPersonId: row.tmdb_person_id,
      name: row.name,
      characterName: row.character_name,
      profilePath: row.profile_path,
      sortOrder: row.sort_order,
    }));
  }

  replaceWatchProviders(
    mediaId: string,
    region: string,
    providers: WatchProvider[],
  ): void {
    const now = new Date().toISOString(),
      insert = this.database.prepare(
        "INSERT INTO watch_providers (media_item_id,region,tmdb_provider_id,provider_name,logo_path,access_type,display_priority,updated_at) VALUES (@mediaId,@region,@tmdbProviderId,@name,@logoPath,@accessType,@displayPriority,@now)",
      );
    this.database.transaction(() => {
      this.database
        .prepare(
          "DELETE FROM watch_providers WHERE media_item_id=? AND region=?",
        )
        .run(mediaId, region);
      providers.forEach((provider) =>
        insert.run({ mediaId, ...provider, now }),
      );
      this.database
        .prepare(
          "UPDATE media_items SET provider_name=?,provider_region=?,updated_at=? WHERE id=?",
        )
        .run(providers[0]?.name ?? null, region, now, mediaId);
    })();
  }

  watchProviders(mediaId: string, region: string): WatchProvider[] {
    return (
      this.database
        .prepare(
          "SELECT tmdb_provider_id,provider_name,logo_path,region,access_type,display_priority FROM watch_providers WHERE media_item_id=? AND region=? ORDER BY display_priority",
        )
        .all(mediaId, region) as Array<{
        tmdb_provider_id: number;
        provider_name: string;
        logo_path: string | null;
        region: string;
        access_type: WatchProvider["accessType"];
        display_priority: number;
      }>
    ).map((row) => ({
      tmdbProviderId: row.tmdb_provider_id,
      name: row.provider_name,
      logoPath: row.logo_path,
      region: row.region,
      accessType: row.access_type,
      displayPriority: row.display_priority,
    }));
  }

  listEpisodes(mediaId: string, seasonNumber?: number): EpisodeState[] {
    const seasonClause =
      seasonNumber === undefined ? "" : "AND e.season_number = ?";
    return this.database
      .prepare(
        `SELECT e.season_number,e.episode_number,e.title,e.overview,e.air_date,e.runtime_minutes,e.still_path,w.watched_at
      FROM tv_episodes e LEFT JOIN watched_episodes w ON w.media_item_id=e.media_item_id AND w.season_number=e.season_number AND w.episode_number=e.episode_number
      WHERE e.media_item_id = ? ${seasonClause} ORDER BY e.season_number,e.episode_number`,
      )
      .all(
        ...(seasonNumber === undefined ? [mediaId] : [mediaId, seasonNumber]),
      )
      .map((raw) => {
        const row = raw as {
          season_number: number;
          episode_number: number;
          title: string | null;
          overview: string | null;
          air_date: string | null;
          runtime_minutes: number | null;
          still_path: string | null;
          watched_at: string | null;
        };
        return {
          seasonNumber: row.season_number,
          episodeNumber: row.episode_number,
          title: row.title,
          overview: row.overview,
          airDate: row.air_date,
          runtimeMinutes: row.runtime_minutes,
          stillPath: row.still_path,
          watched: row.watched_at !== null,
          watchedAt: row.watched_at,
        };
      });
  }

  setSeasonWatched(
    mediaId: string,
    seasonNumber: number,
    watched: boolean,
  ): void {
    const episodes = this.listEpisodes(mediaId, seasonNumber);
    this.database.transaction(() =>
      episodes.forEach((episode) =>
        this.setEpisodeWatched(
          mediaId,
          seasonNumber,
          episode.episodeNumber,
          watched,
        ),
      ),
    )();
  }

  setShowWatched(mediaId: string, watched: boolean): void {
    const episodes = this.listEpisodes(mediaId);
    this.database.transaction(() =>
      episodes.forEach((episode) =>
        this.setEpisodeWatched(
          mediaId,
          episode.seasonNumber,
          episode.episodeNumber,
          watched,
        ),
      ),
    )();
  }

  activity(limit = 100): ActivityItem[] {
    return (
      this.database
        .prepare(
          `SELECT a.id,a.media_item_id,m.title,a.event_type,a.season_number,a.episode_number,a.occurred_at FROM activity_events a JOIN media_items m ON m.id=a.media_item_id ORDER BY a.occurred_at DESC LIMIT ?`,
        )
        .all(limit) as Array<{
        id: string;
        media_item_id: string;
        title: string;
        event_type: ActivityItem["eventType"];
        season_number: number | null;
        episode_number: number | null;
        occurred_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      mediaId: row.media_item_id,
      title: row.title,
      eventType: row.event_type,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
      occurredAt: row.occurred_at,
    }));
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  replaceEpisodeStates(mediaId: string, episodes: TransferEpisode[]): void {
    const insert = this.database.prepare(
      "INSERT INTO watched_episodes (id,media_item_id,season_number,episode_number,watched_at) VALUES (?,?,?,?,?)",
    );
    this.database
      .prepare("DELETE FROM watched_episodes WHERE media_item_id=?")
      .run(mediaId);
    episodes
      .filter((episode) => episode.watched)
      .forEach((episode) =>
        insert.run(
          randomUUID(),
          mediaId,
          episode.seasonNumber,
          episode.episodeNumber,
          episode.watchedAt ?? new Date().toISOString(),
        ),
      );
  }
  setLibraryUpdatedAt(mediaId: string, updatedAt: string): void {
    this.database
      .prepare("UPDATE library_entries SET updated_at=? WHERE media_item_id=?")
      .run(updatedAt, mediaId);
  }

  exportSnapshot(): TransferShow[] {
    const rows = this.database
      .prepare(
        "SELECT m.*,l.status,l.updated_at AS library_updated_at FROM media_items m JOIN library_entries l ON l.media_item_id=m.id ORDER BY lower(m.title)",
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      item: {
        tmdbId: Number(row.tmdb_id),
        mediaType: row.media_type as "movie" | "tv",
        title: String(row.title),
        overview: row.overview === null ? null : String(row.overview),
        posterPath: row.poster_path === null ? null : String(row.poster_path),
        backdropPath:
          row.backdrop_path === null ? null : String(row.backdrop_path),
        releaseDate:
          row.release_date === null ? null : String(row.release_date),
        firstAirDate:
          row.first_air_date === null ? null : String(row.first_air_date),
        ...(row.runtime_minutes === null
          ? {}
          : { runtimeMinutes: Number(row.runtime_minutes) }),
        ...(row.total_seasons === null
          ? {}
          : { totalSeasons: Number(row.total_seasons) }),
        ...(row.total_episodes === null
          ? {}
          : { totalEpisodes: Number(row.total_episodes) }),
        showStatus: row.show_status === null ? null : String(row.show_status),
        genres: JSON.parse(String(row.genres_json)) as string[],
        networkName:
          row.network_name === null ? null : String(row.network_name),
      },
      status: row.status as LibraryStatus,
      currentSeason:
        row.total_seasons === null ? null : Number(row.total_seasons),
      updatedAt: String(row.library_updated_at),
      episodes: this.listEpisodes(String(row.id)).map((episode) => ({
        ...episode,
        watchedAt: episode.watchedAt,
      })),
    }));
  }

  upcoming(): UpcomingEpisode[] {
    return (
      this.database
        .prepare(
          `SELECT m.id AS media_id,m.title,m.poster_path,e.season_number,e.episode_number,e.title AS episode_title,e.air_date FROM media_items m JOIN library_entries l ON l.media_item_id=m.id JOIN tv_episodes e ON e.media_item_id=m.id WHERE l.status='watching' AND e.air_date > date('now') ORDER BY e.air_date,m.title`,
        )
        .all() as Array<{
        media_id: string;
        title: string;
        poster_path: string | null;
        season_number: number;
        episode_number: number;
        episode_title: string | null;
        air_date: string;
      }>
    ).map((row) => ({
      mediaId: row.media_id,
      title: row.title,
      posterPath: row.poster_path,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
      episodeTitle: row.episode_title,
      airDate: row.air_date,
    }));
  }
}
