import { z } from "zod";
import type {
  CastMember,
  CatalogEpisode,
  CatalogEpisodeDetail,
  CatalogMedia,
  CatalogSearchPage,
  PersonDetail,
  WatchProvider,
} from "../../shared/catalog-types.js";
import type { MediaType } from "../../shared/media-schema.js";

type SearchType = MediaType | "all";
type Fetcher = typeof fetch;

const resultSchema = z.object({
  id: z.number().int().positive(),
  media_type: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  overview: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  first_air_date: z.string().nullable().optional(),
  genre_ids: z.array(z.number()).optional(),
});

const responseSchema = z.object({
  page: z.number().int().positive(),
  total_pages: z.number().int().min(0),
  results: z.array(resultSchema),
});

const detailsSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  name: z.string().optional(),
  overview: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  first_air_date: z.string().nullable().optional(),
  runtime: z.number().nullable().optional(),
  episode_run_time: z.array(z.number()).optional(),
  number_of_seasons: z.number().int().nullable().optional(),
  number_of_episodes: z.number().int().nullable().optional(),
  status: z.string().nullable().optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  networks: z.array(z.object({ name: z.string() })).optional(),
});
const seasonSchema = z.object({
  episodes: z.array(
    z.object({
      season_number: z.number().int().min(0),
      episode_number: z.number().int().min(1),
      name: z.string().nullable().optional(),
      overview: z.string().nullable().optional(),
      air_date: z.string().nullable().optional(),
      runtime: z.number().nullable().optional(),
      still_path: z.string().nullable().optional(),
    }),
  ),
});
const episodeDetailSchema = z.object({
  season_number: z.number().int().min(0),
  episode_number: z.number().int().min(1),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  air_date: z.string().nullable().optional(),
  runtime: z.number().nullable().optional(),
  still_path: z.string().nullable().optional(),
  guest_stars: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        character: z.string().nullable().optional(),
        profile_path: z.string().nullable().optional(),
        order: z.number().int().min(0).optional(),
      }),
    )
    .optional(),
});
const episodeCreditPersonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  character: z.string().nullable().optional(),
  profile_path: z.string().nullable().optional(),
  order: z.number().int().min(0).optional(),
});
const episodeCreditsSchema = z.object({
  cast: z.array(episodeCreditPersonSchema).optional(),
  guest_stars: z.array(episodeCreditPersonSchema).optional(),
});
const creditsSchema = z.object({
  cast: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      character: z.string().nullable().optional(),
      profile_path: z.string().nullable().optional(),
      order: z.number().int().min(0),
    }),
  ),
});
const aggregateCreditsSchema = z.object({
  cast: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      profile_path: z.string().nullable().optional(),
      order: z.number().int().min(0),
      roles: z.array(
        z.object({
          character: z.string().nullable().optional(),
          episode_count: z.number().int().min(0).optional(),
        }),
      ),
    }),
  ),
});
const personSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  biography: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  deathday: z.string().nullable().optional(),
  place_of_birth: z.string().nullable().optional(),
  known_for_department: z.string().nullable().optional(),
  profile_path: z.string().nullable().optional(),
  also_known_as: z.array(z.string()).optional(),
  gender: z.number().int().min(0).max(3).optional(),
  homepage: z.string().nullable().optional(),
  imdb_id: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
  combined_credits: z
    .object({
      cast: z.array(
        z.object({
          id: z.number().int().positive(),
          media_type: z.enum(["movie", "tv"]),
          title: z.string().optional(),
          name: z.string().optional(),
          character: z.string().nullable().optional(),
          release_date: z.string().nullable().optional(),
          first_air_date: z.string().nullable().optional(),
          poster_path: z.string().nullable().optional(),
          popularity: z.number().optional(),
          episode_count: z.number().int().min(0).optional(),
        }),
      ),
    })
    .optional(),
});
const providerSchema = z.object({
  results: z.record(
    z.string(),
    z.object({
      flatrate: z
        .array(
          z.object({
            provider_id: z.number(),
            provider_name: z.string(),
            logo_path: z.string().nullable().optional(),
            display_priority: z.number().int(),
          }),
        )
        .optional(),
      free: z
        .array(
          z.object({
            provider_id: z.number(),
            provider_name: z.string(),
            logo_path: z.string().nullable().optional(),
            display_priority: z.number().int(),
          }),
        )
        .optional(),
      ads: z
        .array(
          z.object({
            provider_id: z.number(),
            provider_name: z.string(),
            logo_path: z.string().nullable().optional(),
            display_priority: z.number().int(),
          }),
        )
        .optional(),
      rent: z
        .array(
          z.object({
            provider_id: z.number(),
            provider_name: z.string(),
            logo_path: z.string().nullable().optional(),
            display_priority: z.number().int(),
          }),
        )
        .optional(),
      buy: z
        .array(
          z.object({
            provider_id: z.number(),
            provider_name: z.string(),
            logo_path: z.string().nullable().optional(),
            display_priority: z.number().int(),
          }),
        )
        .optional(),
    }),
  ),
});

const genreNames: Record<number, string> = {
  16: "Animation",
  18: "Drama",
  35: "Comedy",
  80: "Crime",
  9648: "Mystery",
  10759: "Action & Adventure",
  10765: "Science Fiction & Fantasy",
};

export class TmdbError extends Error {
  constructor(message = "TMDB request failed") {
    super(message);
    this.name = "TmdbError";
  }
}

export class TmdbClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly baseUrl = "https://api.themoviedb.org/3",
  ) {}

  private fetchAuthenticated(url: URL, signal: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (/^[a-f0-9]{32}$/i.test(this.apiKey))
      url.searchParams.set("api_key", this.apiKey);
    else headers.Authorization = `Bearer ${this.apiKey}`;
    return this.fetcher(url, { headers, signal });
  }

  async search(
    query: string,
    type: SearchType = "all",
    requestedPage = 1,
  ): Promise<CatalogSearchPage> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2)
      return { items: [], page: 1, totalPages: 0 };
    const page = Math.min(500, Math.max(1, Math.trunc(requestedPage) || 1));
    const endpoint = type === "all" ? "search/multi" : `search/${type}`;
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set("query", normalizedQuery);
    url.searchParams.set("page", String(page));
    url.searchParams.set("include_adult", "false");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetchAuthenticated(url, controller.signal);
      if (!response.ok) throw new TmdbError();
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) throw new TmdbError("TMDB returned malformed data");
      const items = parsed.data.results.flatMap((item): CatalogMedia[] => {
        const mediaType = type === "all" ? item.media_type : type;
        if (mediaType !== "movie" && mediaType !== "tv") return [];
        const title = (mediaType === "movie" ? item.title : item.name)?.trim();
        if (!title) return [];
        return [
          {
            tmdbId: item.id,
            mediaType,
            title,
            overview: item.overview || null,
            posterPath: item.poster_path || null,
            backdropPath: item.backdrop_path || null,
            releaseDate: item.release_date || null,
            firstAirDate: item.first_air_date || null,
            genres: (item.genre_ids ?? [])
              .map((id) => genreNames[id])
              .filter((name): name is string => Boolean(name)),
          },
        ];
      });
      return {
        items,
        page: parsed.data.page,
        totalPages: parsed.data.total_pages,
      };
    } catch (error) {
      if (error instanceof TmdbError) throw error;
      throw new TmdbError(
        error instanceof Error && error.name === "AbortError"
          ? "TMDB request timed out"
          : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async getDetails(
    tmdbId: number,
    mediaType: MediaType,
  ): Promise<CatalogMedia> {
    const url = new URL(`${this.baseUrl}/${mediaType}/${tmdbId}`);
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetchAuthenticated(url, controller.signal);
      if (!response.ok) throw new TmdbError();
      const parsed = detailsSchema.safeParse(await response.json());
      if (!parsed.success) throw new TmdbError("TMDB returned malformed data");
      const value = parsed.data,
        title = (mediaType === "movie" ? value.title : value.name)?.trim();
      if (!title) throw new TmdbError("TMDB returned malformed data");
      return {
        tmdbId: value.id,
        mediaType,
        title,
        overview: value.overview || null,
        posterPath: value.poster_path || null,
        backdropPath: value.backdrop_path || null,
        releaseDate: value.release_date || null,
        firstAirDate: value.first_air_date || null,
        ...(mediaType === "movie" && value.runtime
          ? { runtimeMinutes: value.runtime }
          : {}),
        ...(mediaType === "tv" &&
        value.number_of_seasons !== null &&
        value.number_of_seasons !== undefined
          ? { totalSeasons: value.number_of_seasons }
          : {}),
        ...(mediaType === "tv" &&
        value.number_of_episodes !== null &&
        value.number_of_episodes !== undefined
          ? { totalEpisodes: value.number_of_episodes }
          : {}),
        ...(mediaType === "tv"
          ? {
              showStatus: value.status ?? null,
              networkName: value.networks?.[0]?.name ?? null,
            }
          : {}),
        genres: (value.genres ?? []).map((genre) => genre.name),
      };
    } catch (error) {
      if (error instanceof TmdbError) throw error;
      throw new TmdbError(
        error instanceof Error && error.name === "AbortError"
          ? "TMDB request timed out"
          : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getJson(url: URL): Promise<unknown> {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetchAuthenticated(url, controller.signal);
      if (!response.ok) throw new TmdbError();
      return await response.json();
    } catch (error) {
      if (error instanceof TmdbError) throw error;
      throw new TmdbError(
        error instanceof Error && error.name === "AbortError"
          ? "TMDB request timed out"
          : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async getSeason(
    tmdbId: number,
    seasonNumber: number,
  ): Promise<CatalogEpisode[]> {
    const parsed = seasonSchema.safeParse(
      await this.getJson(
        new URL(`${this.baseUrl}/tv/${tmdbId}/season/${seasonNumber}`),
      ),
    );
    if (!parsed.success) throw new TmdbError("TMDB returned malformed data");
    return parsed.data.episodes.map((episode) => ({
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      title: episode.name || null,
      overview: episode.overview || null,
      airDate: episode.air_date || null,
      runtimeMinutes: episode.runtime ?? null,
      stillPath: episode.still_path || null,
    }));
  }

  async getEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<CatalogEpisodeDetail> {
    const [episodeResult, creditsResult] = await Promise.all([
      this.getJson(
        new URL(
          `${this.baseUrl}/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`,
        ),
      ),
      this.getJson(
        new URL(
          `${this.baseUrl}/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}/credits`,
        ),
      ),
    ]);
    const parsed = episodeDetailSchema.safeParse(episodeResult),
      parsedCredits = episodeCreditsSchema.safeParse(creditsResult);
    if (!parsed.success || !parsedCredits.success)
      throw new TmdbError("TMDB returned malformed data");
    const episode = parsed.data,
      creditedPeople = [
        ...(parsedCredits.data.cast ?? []),
        ...(parsedCredits.data.guest_stars ?? []),
        ...(episode.guest_stars ?? []),
      ].filter(
        (person, index, people) =>
          people.findIndex((candidate) => candidate.id === person.id) === index,
      );
    return {
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      title: episode.name || null,
      overview: episode.overview || null,
      airDate: episode.air_date || null,
      runtimeMinutes: episode.runtime ?? null,
      stillPath: episode.still_path || null,
      cast: creditedPeople.map((person, index) => ({
        tmdbPersonId: person.id,
        name: person.name,
        characterName: person.character || null,
        profilePath: person.profile_path || null,
        sortOrder: person.order ?? index,
      })),
    };
  }

  async getCast(tmdbId: number, mediaType: MediaType): Promise<CastMember[]> {
    const aggregate = mediaType === "tv";
    const parsed = (
      aggregate ? aggregateCreditsSchema : creditsSchema
    ).safeParse(
      await this.getJson(
        new URL(
          `${this.baseUrl}/${mediaType}/${tmdbId}/${aggregate ? "aggregate_credits" : "credits"}`,
        ),
      ),
    );
    if (!parsed.success) throw new TmdbError("TMDB returned malformed data");
    return parsed.data.cast
      .map((person) => ({
        tmdbPersonId: person.id,
        name: person.name,
        characterName:
          "roles" in person
            ? [
                ...new Set(
                  person.roles.map((role) => role.character).filter(Boolean),
                ),
              ].join(" / ") || null
            : person.character || null,
        profilePath: person.profile_path || null,
        sortOrder: person.order,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getPerson(tmdbPersonId: number): Promise<PersonDetail> {
    const url = new URL(`${this.baseUrl}/person/${tmdbPersonId}`);
    url.searchParams.set("append_to_response", "combined_credits");
    const parsed = personSchema.safeParse(
      await this.getJson(url),
    );
    if (!parsed.success) throw new TmdbError("TMDB returned malformed data");
    const person = parsed.data;
    return {
      tmdbPersonId: person.id,
      name: person.name,
      biography: person.biography || null,
      birthday: person.birthday || null,
      deathday: person.deathday || null,
      placeOfBirth: person.place_of_birth || null,
      knownForDepartment: person.known_for_department || null,
      profilePath: person.profile_path || null,
      alsoKnownAs: person.also_known_as ?? [],
      gender:
        ({ 1: "Female", 2: "Male", 3: "Non-binary" } as Record<number, string>)[
          person.gender ?? 0
        ] ?? null,
      homepage: person.homepage || null,
      imdbId: person.imdb_id || null,
      popularity: person.popularity ?? null,
      knownCredits: (person.combined_credits?.cast ?? [])
        .flatMap((credit) => {
          const title = (credit.media_type === "movie" ? credit.title : credit.name)?.trim();
          if (!title) return [];
          const date =
            credit.media_type === "movie"
              ? credit.release_date
              : credit.first_air_date;
          return [{
            tmdbId: credit.id,
            mediaType: credit.media_type,
            title,
            characterName: credit.character || null,
            year: date?.slice(0, 4) || null,
            posterPath: credit.poster_path || null,
            episodeCount:
              credit.media_type === "tv" ? credit.episode_count ?? null : null,
            popularity: credit.popularity ?? 0,
          }];
        })
        .sort(
          (a, b) =>
            Number(b.year ?? 0) - Number(a.year ?? 0) ||
            b.popularity - a.popularity,
        )
        .map((credit) => ({
          tmdbId: credit.tmdbId,
          mediaType: credit.mediaType,
          title: credit.title,
          characterName: credit.characterName,
          year: credit.year,
          posterPath: credit.posterPath,
          episodeCount: credit.episodeCount,
        })),
    };
  }

  async getWatchProviders(
    tmdbId: number,
    mediaType: MediaType,
    region: string,
  ): Promise<WatchProvider[]> {
    const parsed = providerSchema.safeParse(
      await this.getJson(
        new URL(`${this.baseUrl}/${mediaType}/${tmdbId}/watch/providers`),
      ),
    );
    if (!parsed.success) throw new TmdbError("TMDB returned malformed data");
    const value = parsed.data.results[region.toUpperCase()];
    if (!value) return [];
    const groups = [
      ["flatrate", "subscription"],
      ["free", "free"],
      ["ads", "ads"],
      ["rent", "rent"],
      ["buy", "buy"],
    ] as const;
    return groups.flatMap(([source, accessType]) =>
      (value[source] ?? []).map((provider) => ({
        tmdbProviderId: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path || null,
        region: region.toUpperCase(),
        accessType,
        displayPriority: provider.display_priority,
      })),
    );
  }
}
