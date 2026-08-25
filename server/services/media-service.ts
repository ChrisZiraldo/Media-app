import type {
  CastMember,
  CatalogMedia,
  CatalogSearchPage,
  WatchProvider,
} from "../../shared/catalog-types.js";
import type { LibraryStatus } from "../../shared/media-schema.js";
import type {
  ActivityItem,
  CatalogDetail,
  EpisodeState,
  LibraryItem,
  ShowDetail,
  UpcomingEpisode,
} from "../../shared/media-types.js";
import type {
  LibraryQuery,
  MediaRepository,
} from "../repositories/media-repository.js";
import type { TmdbClient } from "../tmdb/tmdb-client.js";
import { exportCsv, importCsv } from "../transfer/csv-transfer.js";

export class ServiceUnavailableError extends Error {
  statusCode = 503;
}

export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly tmdb?: TmdbClient,
    private readonly region = "CA",
  ) {}

  listLibrary(query: LibraryQuery = {}): LibraryItem[] {
    return this.repository.list(query);
  }

  searchCatalog(
    query: string,
    type: "movie" | "tv" | "all",
    page: number,
  ): Promise<CatalogSearchPage> {
    if (!this.tmdb)
      throw new ServiceUnavailableError("Catalog search is not configured");
    return this.tmdb.search(query, type, page);
  }

  personDetail(tmdbPersonId: number) {
    if (!this.tmdb)
      throw new ServiceUnavailableError("TMDB person details are not configured");
    return this.tmdb.getPerson(tmdbPersonId);
  }

  episodeDetail(tmdbId: number, seasonNumber: number, episodeNumber: number) {
    if (!this.tmdb)
      throw new ServiceUnavailableError("TMDB episode details are not configured");
    return this.tmdb.getEpisode(tmdbId, seasonNumber, episodeNumber);
  }

  async catalogDetail(
    tmdbId: number,
    mediaType: "movie" | "tv",
  ): Promise<CatalogDetail> {
    const detail = await this.catalogMetadata(tmdbId, mediaType);
    return { ...detail, providerAttribution: "JustWatch" };
  }

  addNormalizedCatalogItem(item: CatalogMedia, status: LibraryStatus): string {
    return this.repository.addOrUpdate(item, status);
  }

  async addFromCatalog(
    tmdbId: number,
    mediaType: "movie" | "tv",
    status: LibraryStatus,
  ): Promise<string> {
    if (!this.tmdb)
      throw new ServiceUnavailableError("Catalog search is not configured");
    if (this.repository.findByCatalogIdentity(tmdbId, mediaType))
      throw Object.assign(new Error("This title is already in the library"), {
        statusCode: 409,
      });
    const { item, cast, providers, episodes } = await this.catalogMetadata(
      tmdbId,
      mediaType,
    );
    if (this.repository.findByCatalogIdentity(tmdbId, mediaType))
      throw Object.assign(new Error("This title is already in the library"), {
        statusCode: 409,
      });
    return this.persistCatalogMetadata(item, status, cast, providers, episodes);
  }

  async refreshFromCatalog(id: string): Promise<void> {
    const existing = this.repository
      .list()
      .find((candidate) => candidate.id === id);
    if (!existing)
      throw Object.assign(new Error("Library item not found"), {
        statusCode: 404,
      });
    const { item, cast, providers, episodes } = await this.catalogMetadata(
      existing.tmdbId,
      existing.mediaType,
    );
    this.persistCatalogMetadata(
      item,
      existing.status,
      cast,
      providers,
      episodes,
    );
  }

  private async catalogMetadata(tmdbId: number, mediaType: "movie" | "tv") {
    if (!this.tmdb)
      throw new ServiceUnavailableError("Catalog search is not configured");
    const item = await this.tmdb.getDetails(tmdbId, mediaType);
    const [cast, providers, episodes] = await Promise.all([
      this.tmdb.getCast(tmdbId, mediaType),
      this.tmdb.getWatchProviders(tmdbId, mediaType, this.region),
      mediaType === "tv" && item.totalSeasons
        ? Promise.all(
            Array.from({ length: item.totalSeasons }, (_, index) =>
              this.tmdb!.getSeason(tmdbId, index + 1),
            ),
          ).then((seasons) => seasons.flat())
        : Promise.resolve([]),
    ]);
    return { item, cast, providers, episodes };
  }

  private persistCatalogMetadata(
    item: CatalogMedia,
    status: LibraryStatus,
    cast: CastMember[],
    providers: WatchProvider[],
    episodes: Awaited<ReturnType<TmdbClient["getSeason"]>>,
  ): string {
    return this.repository.transaction(() => {
      const id = this.repository.addOrUpdate(item, status);
      this.repository.replaceCast(id, cast);
      this.repository.replaceWatchProviders(id, this.region, providers);
      if (episodes.length) this.repository.upsertEpisodes(id, episodes);
      return id;
    });
  }

  setEpisodeWatched(
    id: string,
    seasonNumber: number,
    episodeNumber: number,
    watched: boolean,
  ): void {
    this.repository.setEpisodeWatched(id, seasonNumber, episodeNumber, watched);
  }
  setStatus(id: string, status: LibraryStatus): void {
    this.repository.setStatus(id, status);
  }
  setNote(id: string, note: string | null): void {
    this.repository.setNote(id, note);
  }
  setFavorite(id: string, favorite: boolean): void {
    this.repository.setFavorite(id, favorite);
  }
  markNext(id: string) {
    return this.repository.markNextAvailable(id);
  }
  unwatchLatest(id: string) {
    return this.repository.unwatchLatest(id);
  }
  startWatching(id: string) {
    return this.repository.startWatching(id);
  }
  remove(id: string): void {
    if (!this.repository.remove(id))
      throw Object.assign(new Error("Library item not found"), {
        statusCode: 404,
      });
  }
  listEpisodes(id: string, season?: number): EpisodeState[] {
    return this.repository.listEpisodes(id, season);
  }
  setSeasonWatched(id: string, season: number, watched: boolean): void {
    this.repository.setSeasonWatched(id, season, watched);
  }
  setShowWatched(id: string, watched: boolean): void {
    this.repository.setShowWatched(id, watched);
  }
  activity(): ActivityItem[] {
    return this.repository.activity();
  }
  upcoming(): UpcomingEpisode[] {
    return this.repository.upcoming();
  }
  cast(id: string): CastMember[] {
    return this.repository.cast(id);
  }
  watchProviders(id: string, region: string): WatchProvider[] {
    return this.repository.watchProviders(id, region);
  }
  detail(id: string, region = this.region): ShowDetail | undefined {
    const item = this.repository
      .list()
      .find((candidate) => candidate.id === id);
    if (!item) return undefined;
    return {
      item,
      episodes: this.repository.listEpisodes(id),
      cast: this.repository.cast(id),
      providers: this.repository.watchProviders(id, region),
      providerAttribution: "JustWatch",
    };
  }
  exportLibraryCsv(): string {
    return exportCsv(this.repository.exportSnapshot());
  }
  importLibraryCsv(csv: string): number {
    const shows = importCsv(csv);
    return this.repository.transaction(() => {
      for (const show of shows) {
        const existingId = this.repository.findByCatalogIdentity(
            show.item.tmdbId,
            show.item.mediaType,
          ),
          current = existingId
            ? this.repository.list().find((item) => item.id === existingId)
            : undefined,
          currentEpisodes = existingId
            ? this.repository.listEpisodes(existingId)
            : [],
          currentByEpisode = new Map(
            currentEpisodes.map((episode) => [
              `${episode.seasonNumber}:${episode.episodeNumber}`,
              episode,
            ]),
          ),
          mergedEpisodes = show.episodes.map((episode) => {
            const existing = currentByEpisode.get(
              `${episode.seasonNumber}:${episode.episodeNumber}`,
            );
            currentByEpisode.delete(
              `${episode.seasonNumber}:${episode.episodeNumber}`,
            );
            return {
              ...episode,
              watched: episode.watched || Boolean(existing?.watched),
              watchedAt: existing?.watched
                ? existing.watchedAt
                : episode.watchedAt,
            };
          });
        mergedEpisodes.push(...currentByEpisode.values());
        const watchedCount = mergedEpisodes.filter(
            (episode) => episode.watched,
          ).length,
          mergedStatus: LibraryStatus =
            current?.status === "watched" ||
            show.status === "watched" ||
            (mergedEpisodes.length > 0 && watchedCount === mergedEpisodes.length)
              ? "watched"
              : current?.status === "stopped" || show.status === "stopped"
                ? "stopped"
                : watchedCount > 0
                  ? "watching"
                  : "watchlist",
          id = existingId ??
            this.repository.addOrUpdate(show.item, mergedStatus);
        this.repository.upsertEpisodes(id, mergedEpisodes);
        this.repository.replaceEpisodeStates(id, mergedEpisodes);
        this.repository.addOrUpdate(show.item, mergedStatus);
        this.repository.setFavorite(
          id,
          Boolean(current?.favorite) || show.favorite,
        );
        this.repository.setLibraryUpdatedAt(id, show.updatedAt);
      }
      return shows.length;
    });
  }
  deleteAllData(): void {
    this.repository.deleteAllData();
  }
}
