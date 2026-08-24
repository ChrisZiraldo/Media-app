import { describe, expect, it } from "vitest";
import type { TransferShow } from "../../shared/transfer-types.js";
import { exportCsv, importCsv } from "./csv-transfer.js";

describe("episode CSV transfer", () => {
  it("round trips non-sequential watched state and metadata", () => {
    const shows: TransferShow[] = [
      {
        item: {
          tmdbId: 99,
          mediaType: "tv",
          title: "Pattern",
          overview: null,
          posterPath: "/poster.jpg",
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2025-01-01",
          totalEpisodes: 5,
          totalSeasons: 1,
          showStatus: "Ended",
          genres: ["Drama"],
          networkName: "Test",
        },
        status: "watching",
        currentSeason: 1,
        updatedAt: "2026-08-23T12:00:00.000Z",
        episodes: Array.from({ length: 5 }, (_, index) => ({
          seasonNumber: 1,
          episodeNumber: index + 1,
          title: `Episode ${index + 1}`,
          overview: null,
          airDate: `2025-01-0${index + 1}`,
          runtimeMinutes: 45,
          stillPath: null,
          watched: [0, 2, 4].includes(index),
          watchedAt: [0, 2, 4].includes(index)
            ? "2026-08-23T12:00:00.000Z"
            : null,
        })),
      },
    ];
    const imported = importCsv(exportCsv(shows));
    expect(
      imported[0]?.episodes
        .filter((episode) => episode.watched)
        .map((episode) => episode.episodeNumber),
    ).toEqual([1, 3, 5]);
    expect(imported[0]?.item).toMatchObject({
      title: "Pattern",
      tmdbId: 99,
      posterPath: "/poster.jpg",
      totalSeasons: 1,
    });
  });
  it("rejects mismatched episode totals before persistence", () => {
    const csv = exportCsv([
      {
        item: {
          tmdbId: 1,
          mediaType: "tv",
          title: "Bad",
          overview: null,
          posterPath: null,
          backdropPath: null,
          releaseDate: null,
          firstAirDate: "2025-01-01",
          totalEpisodes: 2,
          genres: [],
        },
        status: "watchlist",
        currentSeason: 1,
        updatedAt: "2026-08-23T12:00:00.000Z",
        episodes: [],
      },
    ]);
    expect(() => importCsv(csv)).toThrow(/episode count/);
  });
});
