import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./api.js";
import type { MediaService } from "./services/media-service.js";
import { TmdbError } from "./tmdb/tmdb-client.js";

describe("HTTP application", () => {
  it("reports healthy without leaking configuration", async () => {
    const app = createApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("serves a compiled client when a static root is provided", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-static-"));
    fs.writeFileSync(path.join(root, "index.html"), "<h1>Media Tracker</h1>");
    const app = createApp({ staticRoot: root });
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Media Tracker");
    const detail = await app.inject({
      method: "GET",
      url: "/shows/00000000-0000-4000-8000-000000000000",
    });
    const cast = await app.inject({
      method: "GET",
      url: "/shows/00000000-0000-4000-8000-000000000000/cast",
    });
    expect(detail.statusCode).toBe(200);
    expect(cast.statusCode).toBe(200);
    expect(detail.body).toContain("Media Tracker");
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("validates search before invoking the service", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/search?query=d",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid request." },
    });
    await app.close();
  });

  it("does not expose validation details for an oversized note", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/library/00000000-0000-4000-8000-000000000000",
      payload: { note: "x".repeat(2001) },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid request." },
    });
    await app.close();
  });

  it("validates and forwards a dedicated derived-view query", async () => {
    const listLibrary = vi.fn(() => []),
      service = { listLibrary } as unknown as MediaService,
      app = createApp({ service });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/library/views/continue?type=tv&status=watching&sort=progress&direction=desc",
    });
    expect(response.statusCode).toBe(200);
    expect(listLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        view: "continue",
        type: "tv",
        status: "watching",
        sort: "progress",
        direction: "desc",
      }),
    );
    await app.close();
  });

  it("rejects sort columns that are unavailable in a derived view", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/library/views/watchlist?sort=progress",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid request." },
    });
    await app.close();
  });

  it("returns a safe conflict when progress prevents a status change", async () => {
    const setStatus = vi.fn(() => {
        throw Object.assign(
          new Error("Watchlist titles cannot have progress"),
          { statusCode: 409 },
        );
      }),
      service = { setStatus } as unknown as MediaService,
      app = createApp({ service });
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/library/00000000-0000-4000-8000-000000000000",
      payload: { status: "watchlist" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "STATE_CONFLICT",
        message: "The requested change conflicts with existing progress.",
      },
    });
    expect(setStatus).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000000",
      "watchlist",
    );
    await app.close();
  });

  it("refreshes one library title from the catalog", async () => {
    const refreshFromCatalog = vi.fn(async () => undefined),
      service = { refreshFromCatalog } as unknown as MediaService,
      app = createApp({ service }),
      id = "00000000-0000-4000-8000-000000000000";
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/library/${id}/actions/refresh`,
    });
    expect(response.statusCode).toBe(204);
    expect(refreshFromCatalog).toHaveBeenCalledWith(id);
    await app.close();
  });

  it("forwards every HTTP read and transfer route", async () => {
    const id = "00000000-0000-4000-8000-000000000000",
      searchCatalog = vi.fn(async () => ({
        items: [],
        page: 1,
        totalPages: 1,
      })),
      listLibrary = vi.fn(() => []),
      detail = vi.fn(() => ({ id, title: "Detail" })),
      listEpisodes = vi.fn(() => [{ episodeNumber: 1 }]),
      cast = vi.fn(() => [{ name: "Performer" }]),
      watchProviders = vi.fn(() => [{ name: "Provider" }]),
      activity = vi.fn(() => [{ id: "activity" }]),
      upcoming = vi.fn(() => [{ mediaId: id }]),
      exportLibraryCsv = vi.fn(() => "record_type,title\nshow,Example"),
      importLibraryCsv = vi.fn(() => 1),
      service = {
        searchCatalog,
        listLibrary,
        detail,
        listEpisodes,
        cast,
        watchProviders,
        activity,
        upcoming,
        exportLibraryCsv,
        importLibraryCsv,
      } as unknown as MediaService,
      app = createApp({ service });

    const requests = [
      ["GET", "/api/v1/search?query=dexter&type=tv&page=2", 200],
      ["GET", "/api/v1/library?libraryView=shows", 200],
      ["GET", "/api/v1/library/views/caught-up", 200],
      ["GET", `/api/v1/library/${id}`, 200],
      ["GET", `/api/v1/library/${id}/episodes?season=1`, 200],
      ["GET", `/api/v1/library/${id}/cast`, 200],
      ["GET", `/api/v1/library/${id}/watch-providers?region=ca`, 200],
      ["GET", "/api/v1/activity/diary", 200],
      ["GET", "/api/v1/activity/upcoming", 200],
      ["GET", "/api/v1/admin/export.csv", 200],
    ] as const;
    for (const [method, url, expected] of requests) {
      const response = await app.inject({ method, url });
      expect(response.statusCode, `${method} ${url}`).toBe(expected);
    }
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/admin/import.csv",
      headers: { "content-type": "text/csv" },
      payload: "record_type,title\nshow,Example",
    });
    expect(imported.json()).toEqual({ imported: 1 });
    expect(searchCatalog).toHaveBeenCalledWith("dexter", "tv", 2);
    expect(listEpisodes).toHaveBeenCalledWith(id, 1);
    expect(watchProviders).toHaveBeenCalledWith(id, "CA");
    expect(importLibraryCsv).toHaveBeenCalledOnce();
    await app.close();
  });

  it("forwards every HTTP library mutation", async () => {
    const id = "00000000-0000-4000-8000-000000000000",
      service = {
        addFromCatalog: vi.fn(async () => id),
        setStatus: vi.fn(),
        setNote: vi.fn(),
        startWatching: vi.fn(() => ({ episodeNumber: 1 })),
        markNext: vi.fn(() => ({ episodeNumber: 2 })),
        refreshFromCatalog: vi.fn(async () => undefined),
        unwatchLatest: vi.fn(() => ({ episodeNumber: 1 })),
        remove: vi.fn(),
        setEpisodeWatched: vi.fn(),
        setSeasonWatched: vi.fn(),
        setShowWatched: vi.fn(),
      } as unknown as MediaService,
      app = createApp({ service });
    const mutations: Array<{
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      url: string;
      payload?: object;
      expected: number;
    }> = [
      {
        method: "POST",
        url: "/api/v1/library",
        payload: { tmdbId: 1405, mediaType: "tv", status: "watchlist" },
        expected: 201,
      },
      {
        method: "PATCH",
        url: `/api/v1/library/${id}`,
        payload: { status: "watching", note: "  note  " },
        expected: 204,
      },
      {
        method: "POST",
        url: `/api/v1/library/${id}/actions/start`,
        expected: 200,
      },
      {
        method: "POST",
        url: `/api/v1/library/${id}/actions/mark-next`,
        expected: 200,
      },
      {
        method: "POST",
        url: `/api/v1/library/${id}/actions/refresh`,
        expected: 204,
      },
      {
        method: "POST",
        url: `/api/v1/library/${id}/actions/unwatch-latest`,
        expected: 200,
      },
      {
        method: "PUT",
        url: `/api/v1/library/${id}/episodes/1/2`,
        expected: 204,
      },
      {
        method: "DELETE",
        url: `/api/v1/library/${id}/episodes/1/2`,
        expected: 204,
      },
      {
        method: "PUT",
        url: `/api/v1/library/${id}/seasons/1/watched`,
        expected: 204,
      },
      {
        method: "DELETE",
        url: `/api/v1/library/${id}/seasons/1/watched`,
        expected: 204,
      },
      {
        method: "PUT",
        url: `/api/v1/library/${id}/episodes/watched`,
        expected: 204,
      },
      {
        method: "DELETE",
        url: `/api/v1/library/${id}/episodes/watched`,
        expected: 204,
      },
      {
        method: "DELETE",
        url: `/api/v1/library/${id}?confirm=true`,
        expected: 204,
      },
    ];
    for (const request of mutations) {
      const response = await app.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(
        request.expected,
      );
    }
    expect(service.setStatus).toHaveBeenCalledWith(id, "watching");
    expect(service.setNote).toHaveBeenCalledWith(id, "note");
    expect(service.setEpisodeWatched).toHaveBeenNthCalledWith(
      1,
      id,
      1,
      2,
      true,
    );
    expect(service.setEpisodeWatched).toHaveBeenNthCalledWith(
      2,
      id,
      1,
      2,
      false,
    );
    expect(service.setSeasonWatched).toHaveBeenNthCalledWith(1, id, 1, true);
    expect(service.setSeasonWatched).toHaveBeenNthCalledWith(2, id, 1, false);
    expect(service.setShowWatched).toHaveBeenNthCalledWith(1, id, true);
    expect(service.setShowWatched).toHaveBeenNthCalledWith(2, id, false);
    expect(service.remove).toHaveBeenCalledWith(id);
    await app.close();
  });

  it("rejects unsafe destructive and transfer requests", async () => {
    const remove = vi.fn(),
      service = { remove } as unknown as MediaService,
      app = createApp({ service }),
      id = "00000000-0000-4000-8000-000000000000";
    const removal = await app.inject({
      method: "DELETE",
      url: `/api/v1/library/${id}`,
    });
    expect(removal.statusCode).toBe(400);
    expect(remove).not.toHaveBeenCalled();
    const transfer = await app.inject({
      method: "POST",
      url: "/api/v1/admin/import.csv",
      payload: { csv: "not accepted" },
    });
    expect(transfer.statusCode).toBe(400);
    await app.close();
  });

  it("does not leak upstream catalog error details", async () => {
    const searchCatalog = vi.fn(() => {
        throw new TmdbError("secret upstream response");
      }),
      service = { searchCatalog } as unknown as MediaService,
      app = createApp({ service });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/search?query=dexter",
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Catalog service unavailable.",
      },
    });
    expect(response.body).not.toContain("secret upstream response");
    await app.close();
  });
});
