import type {
  CatalogMedia,
  CatalogEpisodeDetail,
  CatalogSearchPage,
  PersonDetail,
} from "../../shared/catalog-types";
import type { LibraryStatus } from "../../shared/media-schema";
import type {
  ActivityItem,
  CatalogDetail,
  LibraryItem,
  ShowDetail,
  UpcomingEpisode,
} from "../../shared/media-types";

function applicationUrl(url: string): string {
  if (import.meta.env.DEV) return url;
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${url}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(applicationUrl(url), {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error("The request could not be completed");
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export const api = {
  async library(view: string): Promise<LibraryItem[]> {
    return (
      await request<{ items: LibraryItem[] }>(
        `/api/v1/library?libraryView=${encodeURIComponent(view)}`,
      )
    ).items;
  },
  search(
    query: string,
    type: "movie" | "tv" | "all" = "all",
  ): Promise<CatalogSearchPage> {
    return request(
      `/api/v1/search?query=${encodeURIComponent(query)}&type=${type}&page=1`,
    );
  },
  catalogDetail(
    tmdbId: number,
    mediaType: "movie" | "tv",
  ): Promise<CatalogDetail> {
    return request(`/api/v1/catalog/${mediaType}/${tmdbId}`);
  },
  person(tmdbPersonId: number): Promise<PersonDetail> {
    return request(`/api/v1/people/${tmdbPersonId}`);
  },
  catalogEpisode(
    tmdbId: number,
    season: number,
    episode: number,
  ): Promise<CatalogEpisodeDetail> {
    return request(
      `/api/v1/catalog/tv/${tmdbId}/seasons/${season}/episodes/${episode}`,
    );
  },
  add(item: CatalogMedia, status: LibraryStatus): Promise<{ id: string }> {
    return request("/api/v1/library", {
      method: "POST",
      body: JSON.stringify({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        status,
      }),
    });
  },
  status(id: string, status: LibraryStatus): Promise<void> {
    return request(`/api/v1/library/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  note(id: string, note: string | null): Promise<void> {
    return request(`/api/v1/library/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    });
  },
  favorite(id: string, favorite: boolean): Promise<void> {
    return request(`/api/v1/library/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ favorite }),
    });
  },
  start(id: string): Promise<unknown> {
    return request(`/api/v1/library/${id}/actions/start`, { method: "POST" });
  },
  markNext(id: string): Promise<unknown> {
    return request(`/api/v1/library/${id}/actions/mark-next`, {
      method: "POST",
    });
  },
  refresh(id: string): Promise<void> {
    return request(`/api/v1/library/${id}/actions/refresh`, {
      method: "POST",
    });
  },
  unwatchLatest(id: string): Promise<unknown> {
    return request(`/api/v1/library/${id}/actions/unwatch-latest`, {
      method: "POST",
    });
  },
  remove(id: string): Promise<void> {
    return request(`/api/v1/library/${id}?confirm=true`, { method: "DELETE" });
  },
  async diary(): Promise<ActivityItem[]> {
    return (await request<{ items: ActivityItem[] }>("/api/v1/activity/diary"))
      .items;
  },
  async upcoming(): Promise<UpcomingEpisode[]> {
    return (
      await request<{ items: UpcomingEpisode[] }>("/api/v1/activity/upcoming")
    ).items;
  },
  detail(id: string): Promise<ShowDetail> {
    return request(`/api/v1/library/${id}`);
  },
  episode(
    id: string,
    season: number,
    episode: number,
    watched: boolean,
  ): Promise<void> {
    return request(`/api/v1/library/${id}/episodes/${season}/${episode}`, {
      method: watched ? "PUT" : "DELETE",
    });
  },
  season(id: string, season: number, watched: boolean): Promise<void> {
    return request(`/api/v1/library/${id}/seasons/${season}/watched`, {
      method: watched ? "PUT" : "DELETE",
    });
  },
  show(id: string, watched: boolean): Promise<void> {
    return request(`/api/v1/library/${id}/episodes/watched`, {
      method: watched ? "PUT" : "DELETE",
    });
  },
  async exportCsv(): Promise<Blob> {
    const response = await fetch(applicationUrl("/api/v1/admin/export.csv"));
    if (!response.ok) throw new Error("Export failed");
    return response.blob();
  },
  async importCsv(csv: string): Promise<{ imported: number }> {
    const response = await fetch(applicationUrl("/api/v1/admin/import.csv"), {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csv,
    });
    if (!response.ok) throw new Error("Import failed");
    return response.json() as Promise<{ imported: number }>;
  },
  deleteAllData(): Promise<void> {
    return request("/api/v1/admin/data", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE ALL DATA" }),
    });
  },
};
