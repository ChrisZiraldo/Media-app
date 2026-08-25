import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../database.js";
import { MediaRepository } from "./media-repository.js";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    ),
);

describe("MediaRepository", () => {
  it("upserts a title and derives watchlist without duplicating it", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database);
    const item = {
      tmdbId: 1405,
      mediaType: "tv" as const,
      title: "Dexter",
      overview: null,
      posterPath: "/poster.jpg",
      backdropPath: null,
      releaseDate: null,
      firstAirDate: "2006-10-01",
      totalSeasons: 8,
      totalEpisodes: 96,
      showStatus: "Ended",
      genres: ["Crime", "Drama"],
    };
    const firstId = repository.addOrUpdate(item, "watchlist");
    expect(
      repository.addOrUpdate({ ...item, title: "Dexter Updated" }, "watchlist"),
    ).toBe(firstId);
    expect(repository.list({ view: "watchlist" })).toHaveLength(1);
    expect(repository.list()[0]).toMatchObject({
      title: "Dexter Updated",
      watchedEpisodes: 0,
    });
    database.close();
  });

  it("promotes a watchlist show to watching when progress begins", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      id = repository.addOrUpdate(
        {
          tmdbId: 1405,
          mediaType: "tv",
          title: "Dexter",
          overview: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2006-10-01",
          totalEpisodes: 2,
          showStatus: "Ended",
          genres: ["Crime"],
        },
        "watchlist",
      );
    repository.upsertEpisodes(id, [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Dexter",
        overview: null,
        airDate: "2006-10-01",
        runtimeMinutes: 50,
        stillPath: null,
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Crocodile",
        overview: null,
        airDate: "2006-10-08",
        runtimeMinutes: 50,
        stillPath: null,
      },
    ]);

    repository.setEpisodeWatched(id, 1, 1, true);

    expect(repository.list({ view: "watchlist" })).toHaveLength(0);
    expect(repository.list({ view: "continue" })[0]).toMatchObject({
      id,
      status: "watching",
      watchedEpisodes: 1,
    });
    expect(
      repository
        .activity()
        .filter((event) => event.eventType === "status_changed"),
    ).toHaveLength(1);

    repository.setEpisodeWatched(id, 1, 2, true);
    expect(repository.list()[0]).toMatchObject({
      status: "watched",
      libraryView: "finished",
      watchedEpisodes: 2,
    });
    repository.setEpisodeWatched(id, 1, 1, false);
    expect(repository.list()[0]).toMatchObject({
      status: "watching",
      libraryView: "continue",
      watchedEpisodes: 1,
    });
    repository.setEpisodeWatched(id, 1, 2, false);
    expect(repository.list({ view: "continue" })).toHaveLength(0);
    expect(repository.list({ view: "watchlist" })[0]).toMatchObject({
      id,
      status: "watchlist",
      libraryView: "watchlist",
      watchedEpisodes: 0,
    });
    database.close();
  });

  it("combines canonical filters and stable server-side sorting", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      base = {
        overview: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: "2025-01-01",
        firstAirDate: null,
        genres: ["Drama"],
      };
    repository.addOrUpdate(
      { ...base, tmdbId: 91, mediaType: "movie", title: "Alpha" },
      "watchlist",
    );
    repository.addOrUpdate(
      { ...base, tmdbId: 92, mediaType: "movie", title: "Zulu" },
      "watchlist",
    );
    repository.addOrUpdate(
      { ...base, tmdbId: 93, mediaType: "tv", title: "TV Entry" },
      "watching",
    );
    expect(
      repository
        .list({
          type: "movie",
          status: "watchlist",
          sort: "title",
          direction: "desc",
        })
        .map((item) => item.title),
    ).toEqual(["Zulu", "Alpha"]);
    database.close();
  });

  it("records non-sequential episodes idempotently", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database);
    const id = repository.addOrUpdate(
      {
        tmdbId: 1,
        mediaType: "tv",
        title: "Test",
        overview: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        firstAirDate: "2025-01-01",
        totalEpisodes: 5,
        showStatus: "Ended",
        genres: [],
      },
      "watching",
    );
    repository.upsertEpisodes(
      id,
      Array.from({ length: 5 }, (_, index) => ({
        seasonNumber: 1,
        episodeNumber: index + 1,
        title: `Episode ${index + 1}`,
        overview: null,
        airDate: "2025-01-01",
        runtimeMinutes: 45,
        stillPath: null,
      })),
    );
    repository.setEpisodeWatched(id, 1, 1, true);
    repository.setEpisodeWatched(id, 1, 3, true);
    repository.setEpisodeWatched(id, 1, 5, true);
    repository.setEpisodeWatched(id, 1, 3, true);
    expect(repository.list()[0]?.watchedEpisodes).toBe(3);
    expect(
      repository
        .activity()
        .filter((event) => event.eventType !== "status_changed"),
    ).toHaveLength(3);
    repository.setEpisodeWatched(id, 1, 3, false);
    repository.setEpisodeWatched(id, 1, 3, false);
    expect(repository.list()[0]?.watchedEpisodes).toBe(2);
    expect(
      repository
        .activity()
        .filter((event) => event.eventType !== "status_changed"),
    ).toHaveLength(4);
    expect(
      repository
        .activity()
        .find((event) => event.seasonNumber === 1 && event.episodeNumber === 3),
    ).toMatchObject({
      episodeTitle: "Episode 3",
      posterPath: null,
    });
    expect(() => repository.setEpisodeWatched(id, 9, 99, true)).toThrow(
      "Episode not found",
    );
    expect(
      repository
        .activity()
        .filter((event) => event.eventType !== "status_changed"),
    ).toHaveLength(4);
    database.close();
  });

  it("uses the same episode records for season/show bulk actions and activity", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database);
    const id = repository.addOrUpdate(
      {
        tmdbId: 2,
        mediaType: "tv",
        title: "Episodes",
        overview: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        firstAirDate: "2025-01-01",
        totalEpisodes: 3,
        totalSeasons: 2,
        showStatus: "Returning Series",
        genres: [],
      },
      "watching",
    );
    repository.upsertEpisodes(id, [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: "One",
        overview: null,
        airDate: "2025-01-01",
        runtimeMinutes: 45,
        stillPath: null,
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Two",
        overview: null,
        airDate: "2025-01-08",
        runtimeMinutes: 45,
        stillPath: null,
      },
      {
        seasonNumber: 2,
        episodeNumber: 1,
        title: "Three",
        overview: null,
        airDate: "2099-01-01",
        runtimeMinutes: 45,
        stillPath: null,
      },
    ]);
    repository.setSeasonWatched(id, 1, true);
    repository.setSeasonWatched(id, 1, true);
    expect(
      repository.listEpisodes(id, 1).every((episode) => episode.watched),
    ).toBe(true);
    expect(repository.list()[0]?.currentSeason).toBe(2);
    expect(repository.upcoming()[0]).toMatchObject({
      title: "Episodes",
      seasonNumber: 2,
      episodeNumber: 1,
    });
    repository.setShowWatched(id, false);
    repository.setShowWatched(id, false);
    expect(
      repository.listEpisodes(id).every((episode) => !episode.watched),
    ).toBe(true);
    expect(repository.list()[0]?.currentSeason).toBe(1);
    expect(
      repository
        .activity()
        .filter((event) => event.eventType !== "status_changed"),
    ).toHaveLength(4);
    expect(repository.upcoming()).toHaveLength(0);
    database.close();
  });

  it("keeps a future next episode in caught up with its expected date", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      id = repository.addOrUpdate(
        {
          tmdbId: 22,
          mediaType: "tv",
          title: "Future Show",
          overview: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2025-01-01",
          totalEpisodes: 2,
          showStatus: "Returning Series",
          genres: [],
        },
        "watching",
      );
    repository.upsertEpisodes(id, [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Released",
        overview: null,
        airDate: "2025-01-01",
        runtimeMinutes: 45,
        stillPath: null,
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Coming Soon",
        overview: null,
        airDate: "2099-06-10",
        runtimeMinutes: 45,
        stillPath: null,
      },
    ]);
    repository.setEpisodeWatched(id, 1, 1, true);
    expect(repository.list({ view: "continue" })).toHaveLength(0);
    expect(repository.list({ view: "caught-up" })[0]).toMatchObject({
      nextEpisode: "S1 E2 · Coming Soon",
      nextEpisodeDate: "2099-06-10",
    });
    database.close();
  });

  it("replaces ordered cast and region-scoped providers", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database);
    const id = repository.addOrUpdate(
      {
        tmdbId: 3,
        mediaType: "tv",
        title: "Metadata",
        overview: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        firstAirDate: "2025-01-01",
        genres: [],
      },
      "watchlist",
    );
    repository.replaceCast(id, [
      {
        tmdbPersonId: 1,
        name: "Lead",
        characterName: "Hero",
        profilePath: null,
        sortOrder: 0,
      },
    ]);
    repository.replaceWatchProviders(id, "CA", [
      {
        tmdbProviderId: 8,
        name: "Netflix",
        logoPath: null,
        region: "CA",
        accessType: "subscription",
        displayPriority: 1,
      },
    ]);
    expect(repository.cast(id)[0]).toMatchObject({
      name: "Lead",
      characterName: "Hero",
    });
    expect(repository.watchProviders(id, "CA")[0]).toMatchObject({
      name: "Netflix",
      accessType: "subscription",
    });
    expect(repository.list()[0]?.provider).toBe("Netflix");
    database.close();
  });
  it("changes canonical status once and records the activity", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      id = repository.addOrUpdate(
        {
          tmdbId: 4,
          mediaType: "tv",
          title: "Status",
          overview: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2025-01-01",
          genres: [],
        },
        "watching",
      );
    repository.setStatus(id, "stopped");
    repository.setStatus(id, "stopped");
    expect(repository.list()[0]?.status).toBe("stopped");
    expect(
      repository
        .activity()
        .filter((event) => event.eventType === "status_changed"),
    ).toHaveLength(1);
    database.close();
  });
  it("refuses to move recorded progress back to watchlist", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      item = {
        tmdbId: 41,
        mediaType: "tv" as const,
        title: "Started",
        overview: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        firstAirDate: "2025-01-01",
        totalEpisodes: 1,
        genres: [],
      },
      id = repository.addOrUpdate(item, "watching");
    repository.upsertEpisodes(id, [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Pilot",
        overview: null,
        airDate: "2025-01-01",
        runtimeMinutes: 45,
        stillPath: null,
      },
    ]);
    repository.setEpisodeWatched(id, 1, 1, true);
    expect(() => repository.setStatus(id, "watchlist")).toThrow(
      "Watchlist titles cannot have progress",
    );
    expect(() => repository.addOrUpdate(item, "watchlist")).toThrow(
      "Watchlist titles cannot have progress",
    );
    expect(repository.list()[0]).toMatchObject({
      status: "watched",
      watchedEpisodes: 1,
    });
    database.close();
  });
  it("normalizes and persists a private note", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      id = repository.addOrUpdate(
        {
          tmdbId: 44,
          mediaType: "tv",
          title: "Notes",
          overview: "A useful synopsis.",
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2025-01-01",
          genres: [],
        },
        "watching",
      );
    repository.setNote(id, "Remember this episode");
    repository.setFavorite(id, true);
    expect(repository.list()[0]).toMatchObject({
      note: "Remember this episode",
      favorite: true,
      overview: "A useful synopsis.",
    });
    repository.setFavorite(id, false);
    expect(repository.list()[0]?.favorite).toBe(false);
    repository.setNote(id, null);
    expect(repository.list()[0]?.note).toBeNull();
    database.close();
  });
  it("runs quick start, next, and latest actions against canonical episodes", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-repo-"));
    directories.push(directory);
    const database = openDatabase(directory),
      repository = new MediaRepository(database),
      id = repository.addOrUpdate(
        {
          tmdbId: 5,
          mediaType: "tv",
          title: "Quick",
          overview: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2025-01-01",
          totalEpisodes: 3,
          genres: [],
        },
        "watchlist",
      );
    repository.upsertEpisodes(
      id,
      [1, 2, 3].map((episodeNumber) => ({
        seasonNumber: 1,
        episodeNumber,
        title: String(episodeNumber),
        overview: null,
        airDate: "2025-01-01",
        runtimeMinutes: null,
        stillPath: null,
      })),
    );
    expect(repository.startWatching(id)).toEqual({
      seasonNumber: 1,
      episodeNumber: 1,
    });
    expect(repository.markNextAvailable(id)).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
    });
    expect(repository.unwatchLatest(id)).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
    });
    expect(
      repository
        .listEpisodes(id)
        .filter((episode) => episode.watched)
        .map((episode) => episode.episodeNumber),
    ).toEqual([1]);
    database.close();
  });
});
