import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../database.js";
import { MediaRepository } from "../repositories/media-repository.js";
import type { TmdbClient } from "../tmdb/tmdb-client.js";
import { exportCsv } from "../transfer/csv-transfer.js";
import { MediaService } from "./media-service.js";

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    );
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-service-"));
  directories.push(directory);
  const database = openDatabase(directory),
    repository = new MediaRepository(database);
  return { database, repository };
}

const details = {
  tmdbId: 1405,
  mediaType: "tv" as const,
  title: "Dexter",
  overview: "A forensic analyst.",
  posterPath: "/poster.jpg",
  backdropPath: null,
  releaseDate: null,
  firstAirDate: "2006-10-01",
  totalSeasons: 1,
  totalEpisodes: 1,
  showStatus: "Ended",
  genres: ["Crime"],
};

describe("MediaService catalog additions", () => {
  it("assigns canonical statuses when importing into an empty library", () => {
    const { database, repository } = setup(),
      service = new MediaService(repository),
      episodes = [1, 2].map((episodeNumber) => ({
        seasonNumber: 1,
        episodeNumber,
        title: `Episode ${episodeNumber}`,
        overview: null,
        airDate: `2006-10-0${episodeNumber}`,
        runtimeMinutes: 55,
        stillPath: null,
        watched: episodeNumber === 1,
        watchedAt:
          episodeNumber === 1 ? "2026-08-24T12:00:00.000Z" : null,
      }));

    service.importLibraryCsv(
      exportCsv([
        {
          item: { ...details, totalEpisodes: 2 },
          status: "watching",
          favorite: false,
          currentSeason: 1,
          updatedAt: "2026-08-24T12:00:00.000Z",
          episodes,
        },
      ]),
    );

    expect(repository.list()).toEqual([
      expect.objectContaining({ status: "watching", watchedEpisodes: 1 }),
    ]);
    database.close();
  });
  it("merges imported watched episodes and favourites without losing either source", () => {
    const { database, repository } = setup(),
      service = new MediaService(repository),
      id = repository.addOrUpdate({ ...details, totalEpisodes: 2 }, "watching"),
      episodes = [1, 2].map((episodeNumber) => ({
        seasonNumber: 1,
        episodeNumber,
        title: `Episode ${episodeNumber}`,
        overview: null,
        airDate: `2006-10-0${episodeNumber}`,
        runtimeMinutes: 55,
        stillPath: null,
      }));
    repository.upsertEpisodes(id, episodes);
    repository.setEpisodeWatched(id, 1, 1, true);
    repository.setFavorite(id, true);

    service.importLibraryCsv(
      exportCsv([
        {
          item: { ...details, totalEpisodes: 2 },
          status: "watching",
          favorite: false,
          currentSeason: 1,
          updatedAt: "2026-08-24T12:00:00.000Z",
          episodes: episodes.map((episode) => ({
            ...episode,
            watched: episode.episodeNumber === 2,
            watchedAt:
              episode.episodeNumber === 2
                ? "2026-08-24T12:00:00.000Z"
                : null,
          })),
        },
      ]),
    );

    expect(service.detail(id)?.item.favorite).toBe(true);
    expect(service.detail(id)?.item.status).toBe("watched");
    expect(service.listEpisodes(id).map((episode) => episode.watched)).toEqual([
      true,
      true,
    ]);
    database.close();
  });
  it("rejects adding the same TMDB title more than once", async () => {
    const { database, repository } = setup(),
      tmdb = {
        getDetails: vi.fn(async () => ({
          ...details,
          totalSeasons: undefined,
        })),
        getCast: vi.fn(async () => []),
        getWatchProviders: vi.fn(async () => []),
        getSeason: vi.fn(async () => []),
      } as unknown as TmdbClient,
      service = new MediaService(repository, tmdb);

    await service.addFromCatalog(1405, "tv", "watchlist");
    await expect(
      service.addFromCatalog(1405, "tv", "watchlist"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.list()).toHaveLength(1);
    database.close();
  });

  it("uses the configured region for provider fetches and detail output", async () => {
    const { database, repository } = setup(),
      getWatchProviders = vi.fn(async () => [
        {
          tmdbProviderId: 8,
          name: "Netflix",
          logoPath: null,
          region: "US",
          accessType: "subscription" as const,
          displayPriority: 1,
        },
      ]),
      tmdb = {
        getDetails: vi.fn(async () => ({
          ...details,
          totalSeasons: undefined,
        })),
        getCast: vi.fn(async () => []),
        getWatchProviders,
        getSeason: vi.fn(async () => []),
      } as unknown as TmdbClient,
      service = new MediaService(repository, tmdb, "US"),
      id = await service.addFromCatalog(1405, "tv", "watchlist");
    expect(getWatchProviders).toHaveBeenCalledWith(1405, "tv", "US");
    expect(service.detail(id)?.providers[0]).toMatchObject({
      name: "Netflix",
      region: "US",
    });
    database.close();
  });

  it("does not write a title when upstream metadata collection fails", async () => {
    const { database, repository } = setup(),
      tmdb = {
        getDetails: vi.fn(async () => details),
        getCast: vi.fn(async () => {
          throw new Error("upstream failed");
        }),
        getWatchProviders: vi.fn(async () => []),
        getSeason: vi.fn(async () => []),
      } as unknown as TmdbClient,
      service = new MediaService(repository, tmdb);
    await expect(
      service.addFromCatalog(1405, "tv", "watchlist"),
    ).rejects.toThrow();
    expect(repository.list()).toHaveLength(0);
    database.close();
  });

  it("rolls back the title if a metadata persistence step fails", async () => {
    const { database, repository } = setup(),
      tmdb = {
        getDetails: vi.fn(async () => details),
        getCast: vi.fn(async () => []),
        getWatchProviders: vi.fn(async () => []),
        getSeason: vi.fn(async () => []),
      } as unknown as TmdbClient,
      service = new MediaService(repository, tmdb);
    vi.spyOn(repository, "replaceCast").mockImplementation(() => {
      throw new Error("write failed");
    });
    await expect(
      service.addFromCatalog(1405, "tv", "watchlist"),
    ).rejects.toThrow();
    expect(repository.list()).toHaveLength(0);
    database.close();
  });

  it("refreshes catalog metadata without losing personal state", async () => {
    const { database, repository } = setup(),
      id = repository.addOrUpdate(details, "watching");
    repository.upsertEpisodes(id, [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Old title",
        overview: null,
        airDate: "2006-10-01",
        runtimeMinutes: 50,
        stillPath: null,
      },
    ]);
    repository.setEpisodeWatched(id, 1, 1, true);
    repository.setNote(id, "Keep this note");
    const tmdb = {
        getDetails: vi.fn(async () => ({
          ...details,
          title: "Dexter refreshed",
          totalEpisodes: 2,
        })),
        getCast: vi.fn(async () => []),
        getWatchProviders: vi.fn(async () => []),
        getSeason: vi.fn(async () => [
          {
            seasonNumber: 1,
            episodeNumber: 1,
            title: "Pilot",
            overview: null,
            airDate: "2006-10-01",
            runtimeMinutes: 53,
            stillPath: null,
          },
          {
            seasonNumber: 1,
            episodeNumber: 2,
            title: "Crocodile",
            overview: null,
            airDate: "2006-10-08",
            runtimeMinutes: 55,
            stillPath: null,
          },
        ]),
      } as unknown as TmdbClient,
      service = new MediaService(repository, tmdb);

    await service.refreshFromCatalog(id);

    expect(service.detail(id)?.item).toMatchObject({
      title: "Dexter refreshed",
      status: "watching",
      note: "Keep this note",
      watchedEpisodes: 1,
      totalEpisodes: 2,
    });
    expect(service.listEpisodes(id)).toEqual([
      expect.objectContaining({
        episodeNumber: 1,
        title: "Pilot",
        watched: true,
      }),
      expect.objectContaining({
        episodeNumber: 2,
        title: "Crocodile",
        watched: false,
      }),
    ]);
    database.close();
  });
});
