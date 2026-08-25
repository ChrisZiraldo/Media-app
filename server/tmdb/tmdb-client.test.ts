import { describe, expect, it, vi } from "vitest";
import { TmdbClient, TmdbError } from "./tmdb-client.js";

describe("TMDB client", () => {
  it("encodes queries, clamps pages, attaches the key server-side, and normalizes results", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            page: 500,
            total_pages: 700,
            results: [
              {
                id: 1405,
                media_type: "tv",
                name: "Dexter",
                overview: null,
                poster_path: "/poster.jpg",
                first_air_date: "2006-10-01",
                genre_ids: [80, 18],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const client = new TmdbClient("secret", fetcher as typeof fetch);
    const result = await client.search(" Dexter & Deb ", "all", 999);
    const [url, options] = (
      fetcher.mock.calls as unknown as [URL, RequestInit][]
    )[0]!;
    expect(String(url)).toContain("query=Dexter+%26+Deb");
    expect(String(url)).toContain("page=500");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(result.items[0]).toMatchObject({
      tmdbId: 1405,
      mediaType: "tv",
      title: "Dexter",
      genres: ["Crime", "Drama"],
    });
  });

  it("does not call TMDB for a query shorter than two characters", async () => {
    const fetcher = vi.fn();
    expect(await new TmdbClient("secret", fetcher).search("d")).toEqual({
      items: [],
      page: 1,
      totalPages: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("supports a TMDB v3 API key without sending it as a bearer token", async () => {
    const key = "0123456789abcdef0123456789abcdef",
      fetcher = vi.fn(async () =>
        Response.json({ page: 1, total_pages: 0, results: [] }),
      ),
      client = new TmdbClient(key, fetcher as typeof fetch);
    await client.search("Dexter");
    const [url, options] = (
      fetcher.mock.calls as unknown as [URL, RequestInit][]
    )[0]!;
    expect(url.searchParams.get("api_key")).toBe(key);
    expect(options.headers).not.toMatchObject({
      Authorization: expect.anything(),
    });
  });

  it("ignores people returned by combined catalog search", async () => {
    const fetcher = vi.fn(async () =>
        Response.json({
          page: 1,
          total_pages: 1,
          results: [
            { id: 1, media_type: "person", name: "An Actor" },
            { id: 2, media_type: "tv", name: "A Show" },
          ],
        }),
      ),
      result = await new TmdbClient("token", fetcher as typeof fetch).search(
        "Actor",
      );
    expect(result.items).toEqual([
      expect.objectContaining({ tmdbId: 2, mediaType: "tv", title: "A Show" }),
    ]);
  });

  it("returns a safe error for malformed upstream data", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      new TmdbClient("secret", fetcher as typeof fetch).search("dexter"),
    ).rejects.toBeInstanceOf(TmdbError);
  });

  it("normalizes trusted TV details before persistence", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 1405,
            name: "Dexter",
            overview: "A forensic analyst.",
            poster_path: "/poster.jpg",
            backdrop_path: null,
            first_air_date: "2006-10-01",
            number_of_seasons: 8,
            number_of_episodes: 96,
            status: "Ended",
            genres: [{ name: "Crime" }],
            networks: [{ name: "Showtime" }],
          }),
          { status: 200 },
        ),
    );
    const result = await new TmdbClient(
      "secret",
      fetcher as typeof fetch,
    ).getDetails(1405, "tv");
    expect(result).toMatchObject({
      title: "Dexter",
      totalSeasons: 8,
      totalEpisodes: 96,
      showStatus: "Ended",
      networkName: "Showtime",
    });
  });

  it("normalizes season episodes, ordered cast, and regional providers", async () => {
    const fetcher = vi.fn(async (url: unknown) => {
      const value = String(url);
      if (value.includes("/season/"))
        return new Response(
          JSON.stringify({
            episodes: [
              {
                season_number: 1,
                episode_number: 3,
                name: "Three",
                air_date: "2025-01-03",
              },
            ],
          }),
        );
      if (value.includes("/aggregate_credits"))
        return new Response(
          JSON.stringify({
            cast: [
              { id: 2, name: "Second", order: 2, roles: [] },
              {
                id: 1,
                name: "First",
                order: 0,
                roles: [
                  { character: "Lead", episode_count: 8 },
                  { character: "Double", episode_count: 1 },
                ],
              },
            ],
          }),
        );
      return new Response(
        JSON.stringify({
          results: {
            CA: {
              flatrate: [
                {
                  provider_id: 8,
                  provider_name: "Netflix",
                  display_priority: 1,
                },
              ],
            },
          },
        }),
      );
    });
    const client = new TmdbClient("secret", fetcher as typeof fetch);
    expect(await client.getSeason(1, 1)).toMatchObject([
      { seasonNumber: 1, episodeNumber: 3, title: "Three" },
    ]);
    expect((await client.getCast(1, "tv"))[0]).toMatchObject({
      name: "First",
      characterName: "Lead / Double",
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/3/tv/1/aggregate_credits" }),
      expect.anything(),
    );
    expect(await client.getWatchProviders(1, "tv", "ca")).toMatchObject([
      { name: "Netflix", region: "CA", accessType: "subscription" },
    ]);
  });
});
