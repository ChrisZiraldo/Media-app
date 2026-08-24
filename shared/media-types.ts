import type { LibraryStatus, MediaType } from "./media-schema.js";
import type { CastMember, WatchProvider } from "./catalog-types.js";

export interface LibraryItem {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  firstAirDate: string | null;
  runtimeMinutes: number | null;
  showStatus: string | null;
  status: LibraryStatus;
  note: string | null;
  watchedEpisodes: number;
  totalEpisodes: number | null;
  currentSeason: number | null;
  genre: string[];
  provider: string | null;
  nextEpisode: string | null;
  nextEpisodeDate: string | null;
  updatedAt: string;
  libraryView: "continue" | "caught-up" | "watchlist" | "finished" | "stopped";
}

export interface EpisodeState {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  stillPath: string | null;
  watched: boolean;
  watchedAt: string | null;
}

export interface ActivityItem {
  id: string;
  mediaId: string;
  title: string;
  eventType: "episode_watched" | "episode_unwatched" | "status_changed";
  seasonNumber: number | null;
  episodeNumber: number | null;
  occurredAt: string;
}

export interface UpcomingEpisode {
  mediaId: string;
  title: string;
  posterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  airDate: string;
}

export interface ShowDetail {
  item: LibraryItem;
  episodes: EpisodeState[];
  cast: CastMember[];
  providers: WatchProvider[];
  providerAttribution: "JustWatch";
}
