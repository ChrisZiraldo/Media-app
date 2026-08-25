import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem, ShowDetail } from "../shared/media-types";
import { App } from "./App";

const id = "00000000-0000-4000-8000-000000000000";
function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    tmdbId: 1405,
    mediaType: "tv",
    title: "Dexter",
    year: "2006",
    posterPath: null,
    backdropPath: null,
    overview: "A forensic analyst.",
    firstAirDate: "2006-10-01",
    runtimeMinutes: null,
    showStatus: "Ended",
    status: "watching",
    favorite: false,
    note: null,
    watchedEpisodes: 1,
    totalEpisodes: 2,
    currentSeason: 1,
    genre: ["Crime"],
    provider: "Netflix",
    nextEpisode: "S1 E2 Crocodile",
    nextEpisodeDate: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    libraryView: "continue",
    ...overrides,
  };
}
function showDetail(): ShowDetail {
  return {
    item: item(),
    episodes: [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Pilot",
        overview: null,
        airDate: "2006-10-01",
        runtimeMinutes: 50,
        stillPath: null,
        watched: true,
        watchedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Crocodile",
        overview: null,
        airDate: "2006-10-08",
        runtimeMinutes: 50,
        stillPath: null,
        watched: false,
        watchedAt: null,
      },
    ],
    cast: [],
    providers: [],
    providerAttribution: "JustWatch",
  };
}

function json(value: unknown) {
  return Response.json(value);
}

describe("Media Tracker shell", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });
  it("navigates between library views", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Watchlist" }));
    expect(
      screen.getByRole("heading", { name: "Watchlist" }),
    ).toBeInTheDocument();
  });

  it("lists starred shows under the User favourites view", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("libraryView=shows")
        ? json({ items: [item({ favorite: true })] })
        : json({ items: [] }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Favourites" }));

    expect(
      await screen.findByRole("heading", { name: "Favourites" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Dexter" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "User" })).toBeVisible();
  });

  it("reloads the selected library when leaving show details", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith(`/api/v1/library/${id}`)) return json(showDetail());
      if (url.includes("libraryView=continue"))
        return json({ items: [item()] });
      return json({ items: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState({}, "", `/shows/${id}`);
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Dexter" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes("libraryView=continue"),
        ),
      ).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes("libraryView=continue"),
        ),
      ).toHaveLength(2),
    );
    expect(screen.queryByText("Loading library…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dexter" })).toBeInTheDocument();
  });

  it("matches the balanced detail hierarchy", async () => {
    const detail = showDetail();
    let favorite = false;
    detail.item.status = "watched";
    detail.providers = [
      {
        tmdbProviderId: 8,
        name: "Netflix",
        logoPath: null,
        region: "CA",
        accessType: "subscription",
        displayPriority: 1,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init) => {
        if (String(input).endsWith(`/api/v1/library/${id}`)) {
          if (init?.method === "PATCH") {
            favorite = true;
            return new Response(null, { status: 204 });
          }
          return json({ ...detail, item: { ...detail.item, favorite } });
        }
        return json({ items: [] });
      }),
    );
    window.history.replaceState({}, "", `/shows/${id}`);
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Dexter" }),
    ).toBeVisible();
    expect(screen.getByText("2006")).toBeInTheDocument();
    expect(screen.getByText("Crime")).toBeInTheDocument();
    expect(screen.getAllByText("Netflix").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Your progress" }),
    ).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Streaming subscription")).toBeInTheDocument();
    expect(screen.getByText("Canada")).toBeInTheDocument();
    expect(screen.getByLabelText("Canonical status: Watching")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mark S1 E2 watched" }),
    ).toHaveClass("primary-action");
    fireEvent.click(
      screen.getByRole("button", { name: "Add Dexter to favourites" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Remove Dexter from favourites",
      }),
    ).toHaveTextContent("★");
  });

  it("renders prototype-style Diary and Upcoming rows", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v1/activity/diary"))
        return json({
          items: [
            {
              id: "event-1",
              mediaId: id,
              title: "Dexter",
              eventType: "episode_watched",
              seasonNumber: 1,
              episodeNumber: 2,
              episodeTitle: "Crocodile",
              posterPath: "/poster.jpg",
              occurredAt: new Date().toISOString(),
            },
          ],
        });
      if (url.endsWith("/api/v1/activity/upcoming"))
        return json({
          items: [
            {
              mediaId: id,
              title: "Silo",
              posterPath: "/silo.jpg",
              seasonNumber: 3,
              episodeNumber: 9,
              episodeTitle: "Farewell",
              airDate: "2099-08-27",
            },
          ],
        });
      return json({ items: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Diary" }));
    expect(
      await screen.findByRole("heading", { name: "Recent viewing" }),
    ).toBeVisible();
    expect(screen.getByText("Crocodile")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dexter" }));
    expect(window.location.pathname).toBe(`/shows/${id}`);

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(await screen.findByRole("button", { name: "Silo" })).toBeVisible();
    expect(screen.getByText("· S3 E9")).toBeInTheDocument();
    expect(screen.getByText("Farewell")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Silo" }));
    expect(window.location.pathname).toBe(`/shows/${id}`);
  });

  it("collapses and restores the desktop navigation", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Collapse navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Expand navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("primary-navigation")).toHaveAttribute(
      "inert",
    );
  });

  it("searches the selected movie catalog", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.includes("/api/v1/search")
            ? { items: [], page: 1, totalPages: 0 }
            : { items: [] },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Search category" }),
      {
        target: { value: "movie" },
      },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search shows" }), {
      target: { value: "Dexter" },
    });
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("type=movie"),
        expect.anything(),
      ),
    );
  });

  it("offers a retry when show details fail to load", async () => {
    const id = "00000000-0000-4000-8000-000000000000",
      fetcher = vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(`/api/v1/library/${id}`))
          return new Response("unavailable", { status: 503 });
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState({}, "", `/shows/${id}`);
    render(<App />);

    expect(await screen.findByText("Show unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).endsWith(`/api/v1/library/${id}`),
        ),
      ).toHaveLength(2),
    );
  });

  it("retries a failed library request", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("libraryView=continue"))
        return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);

    expect(await screen.findByText("Library unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes("libraryView=continue"),
        ),
      ).toHaveLength(2),
    );
  });

  it("retries the same catalog search after a failure", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/v1/search"))
        return new Response("unavailable", { status: 502 });
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search shows" }), {
      target: { value: "Dexter" },
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Retry search" }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes("/api/v1/search"),
        ),
      ).toHaveLength(2),
    );
  });

  it("opens the first existing catalog result with Enter", async () => {
    const id = "00000000-0000-4000-8000-000000000000",
      catalogItem = {
        tmdbId: 1405,
        mediaType: "tv",
        title: "Dexter",
        overview: null,
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        firstAirDate: "2006-10-01",
        genres: ["Crime"],
      },
      trackedItem = {
        id,
        ...catalogItem,
        year: "2006",
        runtimeMinutes: null,
        showStatus: "Ended",
        status: "watching",
        note: null,
        watchedEpisodes: 1,
        totalEpisodes: 96,
        currentSeason: 1,
        genre: ["Crime"],
        provider: null,
        nextEpisode: "S1 E2",
        nextEpisodeDate: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
        libraryView: "continue",
      },
      fetcher = vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/v1/search"))
          return Response.json({
            items: [catalogItem],
            page: 1,
            totalPages: 1,
          });
        if (url.includes("libraryView=shows"))
          return Response.json({ items: [trackedItem] });
        if (url.endsWith(`/api/v1/library/${id}`))
          return new Response("unavailable", { status: 503 });
        return Response.json({ items: [] });
      });
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    const search = screen.getByRole("textbox", { name: "Search shows" });
    fireEvent.change(search, {
      target: { value: "Dexter" },
    });

    expect(await screen.findByText("✓ In library")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "★ Watchlist" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(window.location.pathname).toBe(`/shows/${id}`);
  });

  it("dismisses search outside and opens untracked catalog details without adding", async () => {
    const id = "00000000-0000-4000-8000-000000000001",
      catalogItem = {
        tmdbId: 1405,
        mediaType: "tv" as const,
        title: "Dexter",
        overview: "A forensic analyst.",
        posterPath: null,
        backdropPath: null,
        releaseDate: null,
        firstAirDate: "2006-10-01",
        genres: ["Crime"],
      },
      fetcher = vi.fn(
        async (input: string | URL | Request, _init?: RequestInit) => {
          const url = String(input);
          if (url.endsWith("/api/v1/library") && _init?.method === "POST")
            return json({ id });
          if (
            url.endsWith(`/api/v1/library/${id}/episodes/1/1`) &&
            _init?.method === "PUT"
          )
            return new Response(null, { status: 204 });
          if (url.includes("/api/v1/search"))
            return json({ items: [catalogItem], page: 1, totalPages: 1 });
          if (url.endsWith("/api/v1/catalog/tv/1405"))
            return json({
              item: catalogItem,
              episodes: [
                {
                  seasonNumber: 1,
                  episodeNumber: 1,
                  title: "Dexter",
                  overview: null,
                  airDate: "2006-10-01",
                  runtimeMinutes: 50,
                  stillPath: null,
                },
              ],
              cast: [],
              providers: [],
              providerAttribution: "JustWatch",
            });
          return json({ items: [] });
        },
      );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    const search = screen.getByRole("textbox", { name: "Search shows" });
    fireEvent.change(search, { target: { value: "Dexter" } });

    expect(await screen.findByRole("button", { name: "Dexter" })).toBeVisible();
    expect(screen.getByRole("button", { name: "★ Watchlist" })).toBeVisible();
    expect(screen.getByRole("button", { name: "View details" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start watching" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add as watched" })).toBeNull();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText("TMDB search results")).toBeNull();
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole("button", { name: "Dexter" }));
    expect(window.location.pathname).toBe("/catalog/tv/1405");
    expect(
      await screen.findByRole("heading", { name: "Dexter" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View full cast" }));
    expect(window.location.pathname).toBe("/catalog/tv/1405/cast");
    expect(
      await screen.findByRole("heading", { name: "Full cast" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "← Back to Dexter" }));
    expect(window.location.pathname).toBe("/catalog/tv/1405");
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Mark S1 E1 watched" }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}/episodes/1/1`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(window.location.pathname).toBe(`/shows/${id}`);
  });

  it("performs episode, season, show, status, and note mutations", async () => {
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input),
          method = init?.method ?? "GET";
        if (url.endsWith(`/api/v1/library/${id}`) && method === "GET")
          return json(showDetail());
        if (method !== "GET") return new Response(null, { status: 204 });
        return json({ items: [] });
      },
    );
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState({}, "", `/shows/${id}`);
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Dexter" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark S1 E2 watched" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}/actions/mark-next`,
        expect.objectContaining({ method: "POST" }),
      ),
    );

    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}/episodes/1/2`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const episodeRequest = fetcher.mock.calls.find(([input]) =>
      String(input).endsWith(`/episodes/1/2`),
    )?.[1];
    expect(new Headers(episodeRequest?.headers).has("Content-Type")).toBe(
      false,
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes("libraryView=continue"),
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark season watched" }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}/seasons/1/watched`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark entire show as watched" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Mark entire show as watched",
      })[1]!,
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}/episodes/watched`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Personal note" }), {
      target: { value: "Darkly funny" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ note: "Darkly funny" }),
        }),
      ),
    );
  });

  it("confirms removal and restores focus when cancellation is safe", async () => {
    let removed = false;
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input),
          method = init?.method ?? "GET";
        if (method === "DELETE") {
          removed = true;
          return new Response(null, { status: 204 });
        }
        if (url.includes("/api/v1/library?"))
          return json({ items: removed ? [] : [item()] });
        return json({ items: [] });
      },
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    const menu = await screen.findByLabelText("Quick actions for Dexter");
    fireEvent.click(menu);
    const remove = screen.getByRole("button", { name: "Remove from library" });
    fireEvent.click(remove);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(remove).toHaveFocus());

    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: "Remove Dexter" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/library/${id}?confirm=true`,
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(await screen.findByText("No titles here yet")).toBeInTheDocument();
  });

  it("sorts and filters the visible library without changing its columns", async () => {
    const alpha = item({
        id: "00000000-0000-4000-8000-000000000001",
        tmdbId: 2,
        title: "Alpha",
        genre: ["Drama"],
      }),
      fetcher = vi.fn(async () => json({ items: [item(), alpha] }));
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await screen.findByRole("button", { name: "Dexter" });
    const titles = () =>
      screen
        .getAllByRole("button")
        .filter((button) =>
          ["Alpha", "Dexter"].includes(button.textContent ?? ""),
        )
        .map((button) => button.textContent);
    expect(titles()).toEqual(["Dexter", "Alpha"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort title" }));
    expect(titles()).toEqual(["Alpha", "Dexter"]);
    fireEvent.click(screen.getByLabelText("Filter by genre"));
    fireEvent.click(screen.getByRole("button", { name: "Drama" }));
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dexter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /Provider/ }),
    ).toBeInTheDocument();
  });

  it("opens mobile navigation as an inert dismissible drawer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ items: [] })),
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(max-width: 720px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    render(<App />);
    const navigation = document.getElementById("primary-navigation")!;
    expect(navigation).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));
    expect(navigation).not.toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(navigation).toHaveAttribute("inert");
  });

  it("exports and imports episode-level CSV from Settings", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v1/admin/export.csv"))
        return new Response("record_type,title\nshow,Dexter", {
          headers: { "Content-Type": "text/csv" },
        });
      if (url.endsWith("/api/v1/admin/import.csv"))
        return json({ imported: 1 });
      if (url.endsWith("/api/v1/admin/data"))
        return new Response(null, { status: 204 });
      return json({ items: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    const createObjectURL = vi.fn(() => "blob:media-export"),
      revokeObjectURL = vi.fn(),
      click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText("Library exported")).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:media-export");

    const csvFile = {
      text: vi.fn(async () => "record_type,title\nshow,Dexter"),
    };
    fireEvent.change(screen.getByLabelText("Choose CSV"), {
      target: { files: [csvFile] },
    });
    expect(await screen.findByText("1 show imported")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/admin/import.csv",
      expect.objectContaining({
        method: "POST",
        body: "record_type,title\nshow,Dexter",
      }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes("libraryView=shows"),
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete all data" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "This permanently deletes every show",
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete all data" })[1]!,
    );
    expect(await screen.findByText("All library data deleted")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/admin/data",
      expect.objectContaining({ method: "DELETE" }),
    );
    click.mockRestore();
  });
});
