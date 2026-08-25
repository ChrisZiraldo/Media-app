import { z } from "zod";
import type { TransferShow } from "../../shared/transfer-types.js";
export const csvHeaders = [
  "record_type",
  "title",
  "year",
  "tmdb_id",
  "media_type",
  "airing_status",
  "library_status",
  "favorite",
  "current_season",
  "total_episodes",
  "last_updated",
  "genre",
  "network",
  "poster_path",
  "backdrop_path",
  "season_number",
  "episode_number",
  "episode_title",
  "air_date",
  "runtime_minutes",
  "still_path",
  "watched",
  "watched_at",
] as const;
const quote = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
export function exportCsv(shows: TransferShow[]): string {
  const lines = [csvHeaders.map(quote).join(",")];
  for (const show of shows) {
    const item = show.item;
    lines.push(
      [
        "show",
        item.title,
        (item.releaseDate ?? item.firstAirDate)?.slice(0, 4) ?? "",
        item.tmdbId,
        item.mediaType,
        item.showStatus ?? "",
        show.status,
        show.favorite ? "true" : "false",
        show.currentSeason ?? "",
        item.totalEpisodes ?? "",
        show.updatedAt,
        item.genres.join("|"),
        item.networkName ?? "",
        item.posterPath ?? "",
        item.backdropPath ?? "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map(quote)
        .join(","),
    );
    for (const episode of show.episodes)
      lines.push(
        [
          "episode",
          item.title,
          "",
          item.tmdbId,
          item.mediaType,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          episode.seasonNumber,
          episode.episodeNumber,
          episode.title ?? "",
          episode.airDate ?? "",
          episode.runtimeMinutes ?? "",
          episode.stillPath ?? "",
          episode.watched ? "true" : "false",
          episode.watchedAt ?? "",
        ]
          .map(quote)
          .join(","),
      );
  }
  return "\ufeff" + lines.join("\r\n");
}
function parseRows(value: string): string[][] {
  const source = value.replace(/^\ufeff/, ""),
    rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some(Boolean));
}
const showSchema = z.object({
  record_type: z.literal("show"),
  title: z.string().min(1),
  year: z.string(),
  tmdb_id: z.coerce.number().int().positive(),
  media_type: z.enum(["movie", "tv"]),
  airing_status: z.string(),
  library_status: z.enum(["watchlist", "watching", "stopped", "watched"]),
  favorite: z.enum(["true", "false", ""]).default(""),
  current_season: z.string(),
  total_episodes: z.string(),
  last_updated: z.string().datetime(),
  genre: z.string(),
  network: z.string(),
  poster_path: z.string(),
  backdrop_path: z.string(),
});
const episodeSchema = z.object({
  record_type: z.literal("episode"),
  title: z.string().min(1),
  tmdb_id: z.coerce.number().int().positive(),
  media_type: z.enum(["movie", "tv"]),
  season_number: z.coerce.number().int().min(0),
  episode_number: z.coerce.number().int().min(1),
  episode_title: z.string(),
  air_date: z.string(),
  runtime_minutes: z.string(),
  still_path: z.string(),
  watched: z.enum(["true", "false"]),
  watched_at: z.string(),
});
export function importCsv(text: string): TransferShow[] {
  const rows = parseRows(text),
    header = rows.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  if (csvHeaders.filter((name) => name !== "favorite").some((name) => !header.includes(name)))
    throw new Error("Missing required CSV columns");
  const records = rows.map((values, index) => ({
    ...Object.fromEntries(
      header.map((name, column) => [name, values[column] ?? ""]),
    ),
    row: index + 2,
  })) as Array<Record<string, string> & { row: number }>;
  if (
    records.some((record) => !["show", "episode"].includes(record.record_type))
  )
    throw new Error("Invalid record type");
  const showRecords = records.filter((record) => record.record_type === "show"),
    episodeRecords = records.filter(
      (record) => record.record_type === "episode",
    ),
    seen = new Set<string>();
  return showRecords.map((raw) => {
    const parsed = showSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Invalid show row ${raw.row}`);
    const show = parsed.data,
      key = `${show.media_type}:${show.tmdb_id}`;
    if (seen.has(key)) throw new Error(`Duplicate show row ${raw.row}`);
    seen.add(key);
    const episodes = episodeRecords
      .filter(
        (record) =>
          record.media_type === show.media_type &&
          record.tmdb_id === String(show.tmdb_id),
      )
      .map((record) => {
        const result = episodeSchema.safeParse(record);
        if (!result.success)
          throw new Error(`Invalid episode row ${record.row}`);
        return {
          seasonNumber: result.data.season_number,
          episodeNumber: result.data.episode_number,
          title: result.data.episode_title || null,
          overview: null,
          airDate: result.data.air_date || null,
          runtimeMinutes: result.data.runtime_minutes
            ? Number(result.data.runtime_minutes)
            : null,
          stillPath: result.data.still_path || null,
          watched: result.data.watched === "true",
          watchedAt: result.data.watched_at || null,
        };
      });
    if (
      new Set(
        episodes.map(
          (episode) => `${episode.seasonNumber}:${episode.episodeNumber}`,
        ),
      ).size !== episodes.length
    )
      throw new Error(`Duplicate episode for ${show.title}`);
    const total = show.total_episodes
      ? Number(show.total_episodes)
      : episodes.length;
    if (total !== episodes.length)
      throw new Error(`${show.title} episode count does not match total`);
    return {
      item: {
        tmdbId: show.tmdb_id,
        mediaType: show.media_type,
        title: show.title,
        overview: null,
        posterPath: show.poster_path || null,
        backdropPath: show.backdrop_path || null,
        releaseDate:
          show.media_type === "movie" && show.year
            ? `${show.year}-01-01`
            : null,
        firstAirDate:
          show.media_type === "tv" && show.year ? `${show.year}-01-01` : null,
        ...(show.media_type === "tv" && show.current_season
          ? { totalSeasons: Number(show.current_season) }
          : {}),
        totalEpisodes: total,
        showStatus: show.airing_status || null,
        genres: show.genre ? show.genre.split("|") : [],
        networkName: show.network || null,
      },
      status: show.library_status,
      favorite: show.favorite === "true",
      currentSeason: show.current_season ? Number(show.current_season) : null,
      updatedAt: show.last_updated,
      episodes,
    };
  });
}
