import type {
  CastMember,
  CatalogMedia,
  CatalogSearchPage,
  WatchProvider,
} from "../../shared/catalog-types.js";
import type { LibraryStatus } from "../../shared/media-schema.js";
import type {
  ActivityItem,
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
    const { item, cast, providers, episodes } = await this.catalogMetadata(
      tmdbId,
      mediaType,
    );
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
        const id = this.repository.addOrUpdate(show.item, show.status);
        this.repository.upsertEpisodes(id, show.episodes);
        this.repository.replaceEpisodeStates(id, show.episodes);
        this.repository.setLibraryUpdatedAt(id, show.updatedAt);
      }
      return shows.length;
    });
  }
}
