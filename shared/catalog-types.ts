import type { MediaType } from "./media-schema.js";

export interface CatalogMedia {
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
}

export interface CatalogSearchPage {
  items: CatalogMedia[];
  page: number;
  totalPages: number;
}

export interface CatalogEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  stillPath: string | null;
}

export interface CastMember {
  tmdbPersonId: number;
  name: string;
  characterName: string | null;
  profilePath: string | null;
  sortOrder: number;
}

export interface WatchProvider {
  tmdbProviderId: number;
  name: string;
  logoPath: string | null;
  region: string;
  accessType: "subscription" | "free" | "ads" | "rent" | "buy";
  displayPriority: number;
}
