import type { CatalogEpisode, CatalogMedia } from "./catalog-types.js";
import type { LibraryStatus } from "./media-schema.js";
export interface TransferEpisode extends CatalogEpisode {
  watched: boolean;
  watchedAt: string | null;
}
export interface TransferShow {
  item: CatalogMedia;
  status: LibraryStatus;
  favorite: boolean;
  currentSeason: number | null;
  updatedAt: string;
  episodes: TransferEpisode[];
}
