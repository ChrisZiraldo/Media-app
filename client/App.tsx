import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  CastMember,
  CatalogEpisode,
  CatalogMedia,
  PersonDetail,
} from "../shared/catalog-types";
import type {
  ActivityItem,
  CatalogDetail as CatalogDetailData,
  EpisodeState,
  LibraryItem,
  ShowDetail as ShowDetailData,
  UpcomingEpisode,
} from "../shared/media-types";
import { api } from "./lib/api";

const navigation = [
  ["Library", ["Continue", "Caught up", "Watchlist", "Finished", "All shows"]],
  ["User", ["Diary", "Upcoming", "Favourites"]],
  ["Admin", ["Settings"]],
] as const;
const viewValues: Record<string, string> = {
  Continue: "continue",
  "Caught up": "caught-up",
  Watchlist: "watchlist",
  Finished: "finished",
  "All shows": "shows",
  Favourites: "favorites",
};
type SortKey = "title" | "progress" | "nextEpisode" | "updatedAt";

function useHeroPosterFit() {
  const copyRef = useRef<HTMLDivElement>(null),
    [posterWidth, setPosterWidth] = useState(200);
  useEffect(() => {
    const copy = copyRef.current;
    if (!copy) return;
    const update = () =>
      setPosterWidth(Math.min(200, Math.max(120, copy.offsetHeight * (2 / 3))));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(copy);
    return () => observer.disconnect();
  });
  return { copyRef, posterWidth };
}

function FittedDetailTitle({ title }: { title: string }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    let lastWidth = -1;
    const fit = () => {
      const availableWidth = element.clientWidth;
      if (!availableWidth || availableWidth === lastWidth) return;
      lastWidth = availableWidth;
      element.style.fontSize = "";
      const naturalWidth = element.scrollWidth,
        baseSize = Number.parseFloat(getComputedStyle(element).fontSize);
      if (naturalWidth > availableWidth) {
        const fittedSize = Math.max(
          12,
          Math.floor((baseSize * availableWidth) / naturalWidth),
        );
        element.style.fontSize = `${fittedSize}px`;
      }
    };
    fit();
    const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(fit),
      parent = element.parentElement;
    if (parent) observer?.observe(parent);
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [title]);
  return (
    <h1 ref={titleRef} className={title.length > 18 ? "long-title" : ""}>
      {title}
    </h1>
  );
}

async function loadLibrary(view: string): Promise<LibraryItem[]> {
  const items = await api.library(view === "favorites" ? "shows" : view);
  return view === "favorites" ? items.filter((item) => item.favorite) : items;
}

function readShowRoute() {
  const match = window.location.pathname.match(/\/shows\/([^/]+)(\/cast)?\/?$/);
  return { id: match?.[1] ?? null, cast: Boolean(match?.[2]) };
}

function readCatalogRoute() {
  const match = window.location.pathname.match(
    /\/catalog\/(movie|tv)\/(\d+)(\/cast)?\/?$/,
  );
  return match
    ? {
        mediaType: match[1] as "movie" | "tv",
        tmdbId: Number(match[2]),
        cast: Boolean(match[3]),
      }
    : null;
}

function showUrl(id?: string, cast = false) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return id ? `${base}/shows/${id}${cast ? "/cast" : ""}` : `${base}/`;
}

function catalogUrl(
  item: Pick<CatalogMedia, "mediaType" | "tmdbId">,
  cast = false,
) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/catalog/${item.mediaType}/${item.tmdbId}${cast ? "/cast" : ""}`;
}

export function App() {
  const initialRoute = readShowRoute();
  const initialCatalogRoute = readCatalogRoute();
  const [view, setView] = useState("Continue"),
    [menuOpen, setMenuOpen] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [isMobile, setIsMobile] = useState(
      () => window.matchMedia?.("(max-width: 720px)").matches ?? false,
    ),
    [query, setQuery] = useState(""),
    [searchType, setSearchType] = useState<"all" | "tv" | "movie">("all"),
    [searchOpen, setSearchOpen] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]),
    [results, setResults] = useState<CatalogMedia[]>([]),
    [message, setMessage] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(initialRoute.id),
    [selectedCast, setSelectedCast] = useState(initialRoute.cast),
    [selectedCatalog, setSelectedCatalog] = useState(initialCatalogRoute),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [trackedTitles, setTrackedTitles] = useState<Record<string, string>>({}),
    [addingTitles, setAddingTitles] = useState<Record<string, boolean>>({}),
    [libraryLoading, setLibraryLoading] = useState(true),
    [libraryError, setLibraryError] = useState(""),
    [libraryAttempt, setLibraryAttempt] = useState(0),
    [searchAttempt, setSearchAttempt] = useState(0),
    [searchState, setSearchState] = useState<
      "idle" | "loading" | "success" | "error"
    >("idle");
  const searchRef = useRef<HTMLDivElement>(null),
    searchResultsRef = useRef<HTMLElement>(null);
  const viewValue = viewValues[view];
  const navigationExpanded = isMobile ? menuOpen : !sidebarCollapsed,
    navigationHidden = !navigationExpanded;
  async function refreshCounts() {
    const all = await api.library("shows");
    setCounts(
      all.reduce<Record<string, number>>(
        (totals, item) => ({
          ...totals,
          [item.libraryView]: (totals[item.libraryView] ?? 0) + 1,
          shows: (totals.shows ?? 0) + 1,
          favorites: (totals.favorites ?? 0) + (item.favorite ? 1 : 0),
        }),
        {},
      ),
    );
    setTrackedTitles(
      Object.fromEntries(
        all.map((item) => [`${item.mediaType}-${item.tmdbId}`, item.id]),
      ),
    );
  }
  function openShow(id: string, cast = false) {
    window.history.pushState({}, "", showUrl(id, cast));
    setSelectedId(id);
    setSelectedCast(cast);
    setSelectedCatalog(null);
    setSearchOpen(false);
  }
  function openCatalog(
    item: Pick<CatalogMedia, "mediaType" | "tmdbId">,
    cast = false,
  ) {
    window.history.pushState({}, "", catalogUrl(item, cast));
    setSelectedId(null);
    setSelectedCast(false);
    setSelectedCatalog({ ...item, cast });
    setSearchOpen(false);
  }
  function leaveShow() {
    window.history.pushState({}, "", showUrl());
    setSelectedId(null);
    setSelectedCast(false);
    setSelectedCatalog(null);
  }
  useEffect(() => {
    const restoreRoute = () => {
      const route = readShowRoute();
      setSelectedId(route.id);
      setSelectedCast(route.cast);
      setSelectedCatalog(readCatalogRoute());
    };
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    const dismissSearch = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        searchRef.current?.contains(target) ||
        searchResultsRef.current?.contains(target)
      )
        return;
      setSearchOpen(false);
    };
    document.addEventListener("pointerdown", dismissSearch);
    return () => document.removeEventListener("pointerdown", dismissSearch);
  }, [searchOpen]);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 720px)");
    if (!media) return;
    const update = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!isMobile || !menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobile, menuOpen]);
  useEffect(() => {
    if (!viewValue) return;
    let active = true;
    loadLibrary(viewValue)
      .then((value) => {
        if (active) {
          setItems(value);
          setLibraryLoading(false);
          setLibraryError("");
        }
      })
      .catch(() => {
        if (active) {
          setLibraryLoading(false);
          setLibraryError("Couldn’t load this library view. Try again.");
        }
      });
    return () => {
      active = false;
    };
  }, [viewValue, libraryAttempt]);
  useEffect(() => {
    let active = true;
    api
      .library("shows")
      .then((all) => {
        if (!active) return;
        setCounts(
          all.reduce<Record<string, number>>(
            (totals, item) => ({
              ...totals,
              [item.libraryView]: (totals[item.libraryView] ?? 0) + 1,
              shows: (totals.shows ?? 0) + 1,
              favorites: (totals.favorites ?? 0) + (item.favorite ? 1 : 0),
            }),
            {},
          ),
        );
        setTrackedTitles(
          Object.fromEntries(
            all.map((item) => [`${item.mediaType}-${item.tmdbId}`, item.id]),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(
      () =>
        api
          .search(query, searchType)
          .then((page) => {
            if (active) {
              setResults(page.items);
              setSearchState("success");
            }
          })
          .catch(() => {
            if (active) setSearchState("error");
          }),
      300,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, searchType, searchAttempt]);
  async function add(item: CatalogMedia, status: LibraryItem["status"]) {
    const key = `${item.mediaType}-${item.tmdbId}`;
    if (trackedTitles[key]) {
      setMessage(`${item.title} is already in your library.`);
      return trackedTitles[key];
    }
    if (addingTitles[key]) return undefined;
    setAddingTitles((current) => ({ ...current, [key]: true }));
    try {
      const added = await api.add(item, status);
      setMessage(`${item.title} added`);
      setTrackedTitles((current) => ({ ...current, [key]: added.id }));
      setResults((current) =>
        current.filter((result) => result.tmdbId !== item.tmdbId),
      );
      if (viewValue) setItems(await loadLibrary(viewValue));
      await refreshCounts();
      return added.id;
    } catch {
      setMessage(
        `${item.title} is already in your library or could not be added.`,
      );
      return undefined;
    } finally {
      setAddingTitles((current) => ({ ...current, [key]: false }));
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span>H</span> Hermes <b>Media</b>
        </div>
        <div className="search" ref={searchRef}>
          <label className="sr-only" htmlFor="catalog-search">
            Search shows
          </label>
          <input
            id="catalog-search"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setSearchOpen(true);
              if (value.trim().length < 2) {
                setResults([]);
                setSearchState("idle");
              } else setSearchState("loading");
            }}
            onFocus={() => {
              if (query.trim().length >= 2) setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.nativeEvent.isComposing ||
                searchState !== "success" ||
                results.length === 0
              )
                return;
              event.preventDefault();
              const firstResult = results[0],
                trackedId =
                  trackedTitles[
                    `${firstResult.mediaType}-${firstResult.tmdbId}`
                  ];
              if (trackedId) openShow(trackedId);
              else openCatalog(firstResult);
            }}
            placeholder="Search your library or TMDB"
          />
          <select
            aria-label="Search category"
            value={searchType}
            onChange={(event) => {
              setSearchType(event.target.value as "all" | "tv" | "movie");
              if (query.trim().length >= 2) setSearchState("loading");
            }}
          >
            <option value="all">All</option>
            <option value="tv">TV shows</option>
            <option value="movie">Movies</option>
          </select>
        </div>
      </header>
      {searchOpen && query.trim().length >= 2 && searchState !== "idle" && (
        <section
          className="search-results"
          aria-label="TMDB search results"
          ref={searchResultsRef}
        >
          {searchState === "loading" ? (
            <p className="search-state" role="status">
              Searching TMDB…
            </p>
          ) : searchState === "error" ? (
            <div className="search-state" role="alert">
              <p>Couldn’t search TMDB. Try again.</p>
              <button
                onClick={() => {
                  setSearchState("loading");
                  setSearchAttempt((attempt) => attempt + 1);
                }}
              >
                Retry search
              </button>
            </div>
          ) : results.length === 0 ? (
            <p className="search-state">
              No movies or series found for “{query.trim()}”.
            </p>
          ) : (
            results.slice(0, 5).map((item) => {
              const trackedId =
                trackedTitles[`${item.mediaType}-${item.tmdbId}`];
              return (
                <article key={`${item.mediaType}-${item.tmdbId}`}>
                  <Poster path={item.posterPath} />
                  <div>
                    <small>
                      TMDB result ·{" "}
                      {item.mediaType === "tv" ? "TV show" : "Movie"}
                    </small>
                    <h2>
                      <button
                        className="search-title"
                        onClick={() =>
                          trackedId ? openShow(trackedId) : openCatalog(item)
                        }
                      >
                        {item.title}
                      </button>
                    </h2>
                    <p>
                      {item.firstAirDate?.slice(0, 4) ?? "Date unavailable"} ·{" "}
                      {item.genres.join(", ") || "Genre unavailable"}
                    </p>
                  </div>
                  <div className="result-actions">
                    {trackedId ? (
                      <>
                        <small className="in-library">✓ In library</small>
                        <button
                          className="primary"
                          onClick={() => openShow(trackedId)}
                        >
                          View details
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={
                            addingTitles[`${item.mediaType}-${item.tmdbId}`]
                          }
                          onClick={() => void add(item, "watchlist")}
                        >
                          {addingTitles[`${item.mediaType}-${item.tmdbId}`]
                            ? "Adding…"
                            : "★ Watchlist"}
                        </button>
                        <button
                          className="primary"
                          onClick={() => openCatalog(item)}
                        >
                          View details
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}
      <div
        className={`layout ${menuOpen ? "menu-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <aside
          id="primary-navigation"
          className="sidebar"
          aria-hidden={navigationHidden}
          inert={navigationHidden}
        >
          {navigation.map(([group, links]) => (
            <section key={group}>
              <h2>{group}</h2>
              {links.map((link) => (
                <button
                  aria-label={link}
                  className={view === link ? "active" : ""}
                  key={link}
                  onClick={() => {
                    const libraryView = viewValues[link],
                      reloadSelectedView = Boolean(
                        libraryView && link === view,
                      );
                    setView(link);
                    if (selectedId || selectedCatalog) leaveShow();
                    if (libraryView) {
                      setLibraryLoading(true);
                      setLibraryError("");
                      if (reloadSelectedView)
                        setLibraryAttempt((attempt) => attempt + 1);
                    }
                    if (isMobile) setMenuOpen(false);
                  }}
                >
                  <span>{link}</span>
                  {(group === "Library" || link === "Favourites") && (
                    <b aria-hidden="true">{counts[viewValues[link]] ?? 0}</b>
                  )}
                </button>
              ))}
            </section>
          ))}
        </aside>
        <button
          className="menu-toggle"
          aria-controls="primary-navigation"
          aria-expanded={navigationExpanded}
          aria-label={
            navigationExpanded ? "Collapse navigation" : "Expand navigation"
          }
          onClick={() => {
            if (isMobile) setMenuOpen((value) => !value);
            else setSidebarCollapsed((value) => !value);
          }}
        >
          {navigationExpanded ? "‹" : "›"}
        </button>
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
        <main>
          {selectedId ? (
            <ShowDetail
              key={`${selectedId}-${selectedCast}`}
              id={selectedId}
              backLabel={view}
              initialFullCast={selectedCast}
              onCast={(cast) => openShow(selectedId, cast)}
              onBack={leaveShow}
              onLibraryChanged={async () => {
                await refreshCounts();
                if (viewValue) setItems(await loadLibrary(viewValue));
              }}
            />
          ) : selectedCatalog ? (
            <CatalogDetail
              key={`${selectedCatalog.mediaType}-${selectedCatalog.tmdbId}-${selectedCatalog.cast}`}
              item={selectedCatalog}
              initialFullCast={selectedCatalog.cast}
              onCast={(cast) => openCatalog(selectedCatalog, cast)}
              onBack={leaveShow}
              onWatchlist={async (item) => {
                const id = await add(item, "watchlist");
                if (id) openShow(id);
              }}
              onEpisodeWatched={async (item, season, episode) => {
                const id = await add(item, "watchlist");
                if (!id) throw new Error("Could not add show");
                await api.episode(id, season, episode, true);
                await refreshCounts();
                openShow(id);
              }}
            />
          ) : (
            <>
              <header className="page-heading">
                <div>
                  <h1>{view === "Diary" ? "Recent viewing" : view}</h1>
                  <p>
                    {view === "Diary"
                      ? "A chronological record of explicit viewing actions."
                      : view === "Upcoming"
                        ? "Announced episodes for shows you are currently watching."
                        : view === "Favourites"
                          ? "Shows you have starred as favourites."
                          : viewValue
                            ? `${items.length} tracked ${items.length === 1 ? "show" : "shows"}`
                            : "User activity and administration"}
                  </p>
                </div>
              </header>
              {message && viewValue && (
                <div className="notice" role="status">
                  {message}
                </div>
              )}
              {viewValue ? (
                libraryLoading ? (
                  <Empty
                    title="Loading library…"
                    copy="Fetching your tracked titles."
                  />
                ) : libraryError ? (
                  <Empty
                    title="Library unavailable"
                    copy={libraryError}
                    action={{
                      label: "Retry",
                      onClick: () => {
                        setLibraryLoading(true);
                        setLibraryError("");
                        setLibraryAttempt((attempt) => attempt + 1);
                      },
                    }}
                  />
                ) : items.length > 0 ? (
                  <LibraryTable
                    items={items}
                    view={viewValue}
                    onOpen={(id) => openShow(id)}
                    onChanged={async () => {
                      setItems(await loadLibrary(viewValue));
                      await refreshCounts();
                    }}
                  />
                ) : (
                  <Empty
                    title={
                      view === "Favourites"
                        ? "No favourite shows yet"
                        : "No titles here yet"
                    }
                    copy={
                      view === "Favourites"
                        ? "Use the star on a show’s detail page to add it here."
                        : "Search TMDB to add your first show."
                    }
                  />
                )
              ) : view === "Diary" ? (
                <Diary onOpen={openShow} />
              ) : view === "Upcoming" ? (
                <Upcoming onOpen={openShow} />
              ) : (
                <Settings onImported={refreshCounts} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function Poster({ path }: { path: string | null }) {
  return (
    <div className="poster">
      {path ? (
        <>
          <img
            src={`https://image.tmdb.org/t/p/w154${path}`}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
          <span aria-hidden="true">TV</span>
        </>
      ) : (
        <span>TV</span>
      )}
    </div>
  );
}
function LibraryTable({
  items,
  view,
  onOpen,
  onChanged,
}: {
  items: LibraryItem[];
  view: string;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 } | null>(
      null,
    ),
    [genre, setGenre] = useState(""),
    [provider, setProvider] = useState(""),
    [libraryView, setLibraryView] = useState(""),
    [removeTarget, setRemoveTarget] = useState<LibraryItem | null>(null),
    [removePending, setRemovePending] = useState(false),
    [actionError, setActionError] = useState(""),
    [quickPending, setQuickPending] = useState<string | null>(null),
    [quickErrors, setQuickErrors] = useState<Record<string, string>>({});
  const removeTrigger = useRef<HTMLElement | null>(null);
  const genres = [...new Set(items.flatMap((item) => item.genre))].sort(),
    providers = [
      ...new Set(
        items
          .map((item) => item.provider)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort();
  const visible = items
    .filter(
      (item) =>
        (!genre || item.genre.includes(genre)) &&
        (!provider || item.provider === provider) &&
        (!libraryView || item.libraryView === libraryView),
    )
    .sort((a, b) => {
      if (!sort) return 0;
      const first =
          sort.key === "progress"
            ? a.watchedEpisodes / Math.max(a.totalEpisodes ?? 1, 1)
            : String(a[sort.key] ?? ""),
        second =
          sort.key === "progress"
            ? b.watchedEpisodes / Math.max(b.totalEpisodes ?? 1, 1)
            : String(b[sort.key] ?? "");
      return (
        (typeof first === "number"
          ? first - Number(second)
          : first.localeCompare(String(second), undefined, { numeric: true })) *
        sort.direction
      );
    });
  const hasFilters = Boolean(genre || provider || libraryView);
  function cycle(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: (current.direction * -1) as 1 | -1 }
        : { key, direction: key === "updatedAt" ? -1 : 1 },
    );
  }
  async function primaryAction(item: LibraryItem) {
    setQuickPending(item.id);
    setQuickErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      if (view === "watchlist") {
        if (item.mediaType === "movie") await api.status(item.id, "watched");
        else await api.start(item.id);
      } else if (view === "continue") await api.markNext(item.id);
      else if (view === "caught-up" || view === "finished")
        await api.unwatchLatest(item.id);
      else if (item.status === "stopped") await api.status(item.id, "watching");
      else await api.status(item.id, "stopped");
      await onChanged();
    } catch {
      setQuickErrors((current) => ({
        ...current,
        [item.id]: "Couldn’t update this title. Try again.",
      }));
    } finally {
      setQuickPending(null);
    }
  }
  function primaryLabel(item: LibraryItem) {
    if (view === "watchlist")
      return item.mediaType === "movie"
        ? "Mark movie watched"
        : "Start + mark S1 E1 watched";
    if (view === "continue") return "Mark next episode watched";
    if (view === "caught-up" || view === "finished")
      return "Mark latest episode unwatched";
    return item.status === "stopped" ? "Resume watching" : "Stop watching";
  }
  async function stopWatching(item: LibraryItem) {
    setQuickPending(item.id);
    setQuickErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      await api.status(item.id, "stopped");
      await onChanged();
    } catch {
      setQuickErrors((current) => ({
        ...current,
        [item.id]: "Couldn’t stop this show. Try again.",
      }));
    } finally {
      setQuickPending(null);
    }
  }
  async function remove() {
    if (!removeTarget) return;
    setRemovePending(true);
    setActionError("");
    try {
      await api.remove(removeTarget.id);
      setRemoveTarget(null);
      await onChanged();
    } catch {
      setActionError("Couldn’t remove this show. Try again.");
    } finally {
      setRemovePending(false);
    }
  }
  function closeRemoveDialog() {
    if (removePending) return;
    setRemoveTarget(null);
    requestAnimationFrame(() => removeTrigger.current?.focus());
  }
  const showsProgress = ["continue", "caught-up", "shows"].includes(view),
    showsProvider = true,
    showsNext = ["continue", "caught-up", "shows"].includes(view),
    showsUpdated = view !== "continue",
    showsStatus = ["watchlist", "finished"].includes(view),
    showsLibraryView = view === "shows";
  const viewLabels: Record<string, string> = {
    continue: "Continue",
    "caught-up": "Caught up",
    watchlist: "Watchlist",
    finished: "Finished",
    stopped: "Stopped",
  };
  return (
    <div className="table-wrap">
      <div className="result-count">
        {visible.length} {visible.length === 1 ? "show" : "shows"}
      </div>
      <table className="library-table">
        <thead>
          <tr>
            <th>
              <span className="column-heading">
                Title
                <button
                  className="sort-button alpha"
                  onClick={() => cycle("title")}
                  aria-label="Sort title"
                >
                  AZ
                  <span>
                    {sort?.key === "title"
                      ? sort.direction === 1
                        ? "↓"
                        : "↑"
                      : "⇅"}
                  </span>
                </button>
              </span>
            </th>
            {showsLibraryView && (
              <th>
                <span className="column-heading">
                  Library view
                  <FilterMenu
                    label="library view"
                    values={Object.keys(viewLabels)}
                    selected={libraryView}
                    onSelect={setLibraryView}
                    formatValue={(value) => viewLabels[value]}
                  />
                </span>
              </th>
            )}
            {showsProgress && (
              <th>
                <span className="column-heading">
                  Progress
                  <button
                    className="sort-button"
                    onClick={() => cycle("progress")}
                    aria-label="Sort progress"
                  >
                    {sort?.key === "progress"
                      ? sort.direction === 1
                        ? "↓"
                        : "↑"
                      : "⇅"}
                  </button>
                </span>
              </th>
            )}
            <th>
              <span className="column-heading">
                Genre
                <FilterMenu
                  label="genre"
                  values={genres}
                  selected={genre}
                  onSelect={setGenre}
                />
              </span>
            </th>
            {showsProvider && (
              <th className="mobile-hide">
                <span className="column-heading">
                  Provider
                  <FilterMenu
                    label="provider"
                    values={providers}
                    selected={provider}
                    onSelect={setProvider}
                  />
                </span>
              </th>
            )}
            {view === "continue" && (
              <UpdatedHeading label="Last watched" sort={sort} cycle={cycle} />
            )}
            {view === "caught-up" && (
              <UpdatedHeading sort={sort} cycle={cycle} />
            )}
            {showsUpdated && !showsNext && (
              <UpdatedHeading sort={sort} cycle={cycle} />
            )}
            {showsStatus && <th>Status</th>}
            {showsNext && (
              <th className="mobile-hide">
                <span className="column-heading">
                  Next episode
                  <button
                    className="sort-button"
                    onClick={() => cycle("nextEpisode")}
                    aria-label="Sort next episode"
                  >
                    {sort?.key === "nextEpisode"
                      ? sort.direction === 1
                        ? "↓"
                        : "↑"
                      : "⇅"}
                  </button>
                </span>
              </th>
            )}
            {view === "shows" && <UpdatedHeading sort={sort} cycle={cycle} />}
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && hasFilters && (
            <tr>
              <td colSpan={8}>
                <div className="filter-empty">
                  <span>No titles match these filters.</span>
                  <button
                    onClick={() => {
                      setGenre("");
                      setProvider("");
                      setLibraryView("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </td>
            </tr>
          )}
          {visible.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="title">
                  <Poster path={item.posterPath} />
                  <div>
                    <button
                      className="title-link"
                      onClick={() => onOpen(item.id)}
                    >
                      {item.title}
                    </button>
                    <span>{item.year ?? "Year unavailable"}</span>
                  </div>
                </div>
              </td>
              {showsLibraryView && (
                <td>
                  <span className={`view-badge ${item.libraryView}`}>
                    {viewLabels[item.libraryView]}
                  </span>
                </td>
              )}
              {showsProgress && (
                <td>
                  <div className="progress-copy">
                    <strong>Season {item.currentSeason ?? "—"}</strong>{" "}
                    <span>
                      ({item.watchedEpisodes}/{item.totalEpisodes ?? "—"})
                    </span>
                  </div>
                  <div
                    className="progress-track"
                    aria-label={`${item.watchedEpisodes} of ${item.totalEpisodes ?? "unknown"} episodes watched`}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (item.watchedEpisodes / Math.max(item.totalEpisodes ?? 1, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
              )}
              <td className="genre-cell">
                <span>{item.genre.join(", ") || "—"}</span>
              </td>
              {showsProvider && (
                <td className="mobile-hide">{item.provider ?? "—"}</td>
              )}
              {view === "continue" && (
                <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
              )}
              {view === "caught-up" && (
                <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
              )}
              {showsUpdated && !showsNext && (
                <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
              )}
              {showsStatus && (
                <td>
                  <span className="status-badge">
                    {item.status === "watchlist" ? "★ Watchlist" : "Finished"}
                  </span>
                </td>
              )}
              {showsNext && (
                <td className="mobile-hide">
                  <span className="next-episode">
                    {item.nextEpisode ?? "—"}
                  </span>
                  {item.nextEpisodeDate && (
                    <small className="episode-date">
                      {item.nextEpisodeDate >
                      new Date().toISOString().slice(0, 10)
                        ? "Expected"
                        : "Released"}{" "}
                      {new Date(
                        `${item.nextEpisodeDate}T12:00:00`,
                      ).toLocaleDateString()}
                    </small>
                  )}
                </td>
              )}
              {view === "shows" && (
                <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
              )}
              <td>
                <details className="quick-menu">
                  <summary aria-label={`Quick actions for ${item.title}`}>
                    •••
                  </summary>
                  <div>
                    <button
                      disabled={quickPending === item.id}
                      onClick={() => void primaryAction(item)}
                    >
                      {quickPending === item.id
                        ? "Updating…"
                        : primaryLabel(item)}
                    </button>
                    <button onClick={() => onOpen(item.id)}>
                      View show details
                    </button>
                    {(view === "continue" || view === "caught-up") &&
                      item.status === "watching" && (
                        <button
                          disabled={quickPending === item.id}
                          onClick={() => void stopWatching(item)}
                        >
                          Stop watching
                        </button>
                      )}
                    <button
                      onClick={(event) => {
                        removeTrigger.current = event.currentTarget;
                        setRemoveTarget(item);
                      }}
                    >
                      Remove from library
                    </button>
                  </div>
                </details>
                {quickErrors[item.id] && (
                  <small className="row-error" role="alert">
                    {quickErrors[item.id]}
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.title}?`}
          description="This permanently removes the show and all of its episode history from your library."
          confirmLabel={`Remove ${removeTarget.title}`}
          pendingLabel="Removing…"
          pending={removePending}
          error={actionError}
          onCancel={closeRemoveDialog}
          onConfirm={() => void remove()}
        />
      )}
    </div>
  );
}
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel = "Working…",
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    return () => {
      if (element.open && typeof element.close === "function") element.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      <p>{description}</p>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button autoFocus disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button className="danger" disabled={pending} onClick={onConfirm}>
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
function UpdatedHeading({
  label = "Last updated",
  sort,
  cycle,
}: {
  label?: string;
  sort: { key: SortKey; direction: 1 | -1 } | null;
  cycle: (key: SortKey) => void;
}) {
  return (
    <th>
      <span className="column-heading">
        {label}
        <button
          className="sort-button"
          onClick={() => cycle("updatedAt")}
          aria-label={`Sort ${label.toLowerCase()}`}
        >
          {sort?.key === "updatedAt"
            ? sort.direction === -1
              ? "↓"
              : "↑"
            : "⇅"}
        </button>
      </span>
    </th>
  );
}
function FilterMenu({
  label,
  values,
  selected,
  onSelect,
  formatValue = (value) => value,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
  formatValue?: (value: string) => string;
}) {
  return (
    <details className={`filter-menu ${selected ? "active" : ""}`}>
      <summary aria-label={`Filter by ${label}`}>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M2 3h12l-4.7 5.2v3.6L6.7 13V8.2L2 3Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div>
        <button onClick={() => onSelect("")}>All {label}s</button>
        {values.map((value) => (
          <button key={value} onClick={() => onSelect(value)}>
            {formatValue(value)}
          </button>
        ))}
      </div>
    </details>
  );
}

function Empty({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section className="empty">
      <strong>{title}</strong>
      <span>{copy}</span>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </section>
  );
}
function Diary({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .diary()
      .then((value) => {
        if (active) setItems(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (failed)
    return (
      <Empty
        title="Diary unavailable"
        copy="Couldn’t load viewing history. Try again."
        action={{
          label: "Retry",
          onClick: () => {
            setFailed(false);
            setAttempt((value) => value + 1);
          },
        }}
      />
    );
  if (!items?.length)
    return (
      <Empty
        title={items ? "No viewing history yet" : "Loading diary…"}
        copy={
          items
            ? "Episode activity will appear here."
            : "Fetching recent activity."
        }
      />
    );
  return (
    <div className="activity-feed">
      {Object.entries(
        items.reduce<Record<string, ActivityItem[]>>((groups, item) => {
          const date = new Date(item.occurredAt),
            today = new Date(),
            yesterday = new Date();
          yesterday.setDate(today.getDate() - 1);
          const key = date.toDateString();
          const label =
            key === today.toDateString()
              ? "Today"
              : key === yesterday.toDateString()
                ? "Yesterday"
                : date.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  });
          (groups[label] ??= []).push(item);
          return groups;
        }, {}),
      ).map(([day, dayItems]) => (
        <section className="activity-day" key={day}>
          <h2>{day}</h2>
          <div className="activity-list">
            {dayItems.map((item) => (
              <article key={item.id}>
                <Poster path={item.posterPath} />
                <div className="activity-copy">
                  <small>{item.eventType.replaceAll("_", " ")}</small>
                  <div className="activity-show-line">
                    <button
                      className="activity-title"
                      onClick={() => onOpen(item.mediaId)}
                    >
                      {item.title}
                    </button>
                    {item.seasonNumber !== null && (
                      <span className="activity-episode-number">
                        · S{item.seasonNumber} E{item.episodeNumber}
                      </span>
                    )}
                  </div>
                  <span>
                    {item.episodeTitle ??
                      (item.eventType === "status_changed"
                        ? "Library status updated"
                        : "Episode progress updated")}
                  </span>
                </div>
                <time>
                  {new Date(item.occurredAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
function Upcoming({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<UpcomingEpisode[] | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .upcoming()
      .then((value) => {
        if (active) setItems(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (failed)
    return (
      <Empty
        title="Upcoming unavailable"
        copy="Couldn’t load announced episodes. Try again."
        action={{
          label: "Retry",
          onClick: () => {
            setFailed(false);
            setAttempt((value) => value + 1);
          },
        }}
      />
    );
  if (!items?.length)
    return (
      <Empty
        title={items ? "No announced episodes" : "Loading upcoming…"}
        copy={
          items
            ? "Future episodes for currently watched shows will appear here."
            : "Fetching announced episodes."
        }
      />
    );
  return (
    <div className="activity-list">
      {items.map((item) => (
        <article
          key={`${item.mediaId}-${item.seasonNumber}-${item.episodeNumber}`}
        >
          <Poster path={item.posterPath} />
          <div className="activity-copy">
            <small>Upcoming episode</small>
            <div className="activity-show-line">
              <button
                className="activity-title"
                onClick={() => onOpen(item.mediaId)}
              >
                {item.title}
              </button>
              <span className="activity-episode-number">
                · S{item.seasonNumber} E{item.episodeNumber}
              </span>
            </div>
            <span>{item.episodeTitle ?? "Title unavailable"}</span>
          </div>
          <time>
            {new Date(`${item.airDate}T12:00:00`).toLocaleDateString()}
          </time>
        </article>
      ))}
    </div>
  );
}
function Settings({ onImported }: { onImported: () => Promise<void> }) {
  const [status, setStatus] = useState(""),
    [importPending, setImportPending] = useState(false),
    [deleteDialogOpen, setDeleteDialogOpen] = useState(false),
    [deletePending, setDeletePending] = useState(false),
    [deleteError, setDeleteError] = useState("");
  async function download() {
    try {
      const blob = await api.exportCsv(),
        link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `media-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus("Library exported");
    } catch {
      setStatus("Export failed");
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setImportPending(true);
    try {
      const csv = await file.text();
      const result = await api.importCsv(csv);
      await onImported();
      setStatus(
        `${result.imported} ${result.imported === 1 ? "show" : "shows"} imported`,
      );
    } catch {
      setStatus("Import failed. Check the CSV and try again.");
    } finally {
      setImportPending(false);
    }
  }
  async function deleteAllData() {
    setDeletePending(true);
    setDeleteError("");
    try {
      await api.deleteAllData();
      await onImported();
      setDeleteDialogOpen(false);
      setStatus("All library data deleted");
    } catch {
      setDeleteError("Couldn’t delete the data. Try again.");
    } finally {
      setDeletePending(false);
    }
  }
  return (
    <div className="settings-grid">
      <article>
        <h2>Import library</h2>
        <p>
          Restore show metadata and every episode&apos;s explicit watched state.
        </p>
        <label className="file-button">
          {importPending ? "Importing…" : "Choose CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={importPending}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </label>
      </article>
      <article>
        <h2>Export library</h2>
        <p>
          Download all shows and individual watched or unwatched episode states.
        </p>
        <button onClick={() => void download()}>Export CSV</button>
      </article>
      <article className="danger-zone">
        <h2>Delete all data</h2>
        <p>
          Permanently remove every show, episode history, favourite, note, and
          activity entry from this app.
        </p>
        <button
          className="delete-data-button"
          onClick={() => {
            setDeleteError("");
            setDeleteDialogOpen(true);
          }}
        >
          Delete all data
        </button>
      </article>
      {status && (
        <p className="settings-status" role="status">
          {status}
        </p>
      )}
      {deleteDialogOpen && (
        <ConfirmDialog
          title="Delete all data?"
          description="This permanently deletes every show, watched episode, favourite, note, and activity entry. This cannot be undone."
          confirmLabel="Delete all data"
          pendingLabel="Deleting…"
          pending={deletePending}
          error={deleteError}
          onCancel={() => {
            if (!deletePending) setDeleteDialogOpen(false);
          }}
          onConfirm={() => void deleteAllData()}
        />
      )}
    </div>
  );
}
function CatalogDetail({
  item,
  initialFullCast,
  onCast,
  onBack,
  onWatchlist,
  onEpisodeWatched,
}: {
  item: Pick<CatalogMedia, "mediaType" | "tmdbId">;
  initialFullCast: boolean;
  onCast: (cast: boolean) => void;
  onBack: () => void;
  onWatchlist: (item: CatalogMedia) => Promise<void>;
  onEpisodeWatched: (
    item: CatalogMedia,
    season: number,
    episode: number,
  ) => Promise<void>;
}) {
  const { copyRef, posterWidth } = useHeroPosterFit(),
    [detail, setDetail] = useState<CatalogDetailData | null>(null),
    [failed, setFailed] = useState(false),
    [pending, setPending] = useState(false),
    [fullCast, setFullCast] = useState(initialFullCast),
    [selectedPerson, setSelectedPerson] = useState<CastMember | null>(null),
    [selectedEpisode, setSelectedEpisode] = useState<CatalogEpisode | null>(null),
    [episodePending, setEpisodePending] = useState<string | null>(null),
    [episodeError, setEpisodeError] = useState(""),
    [season, setSeason] = useState(1);
  useEffect(() => {
    let active = true;
    void api
      .catalogDetail(item.tmdbId, item.mediaType)
      .then((value) => {
        if (active) {
          setDetail(value);
          setSeason(value.episodes[0]?.seasonNumber ?? 1);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [item.mediaType, item.tmdbId]);
  if (failed)
    return (
      <Empty
        title="Details unavailable"
        copy="Couldn’t load this TMDB title. Return to search and try again."
        action={{ label: "Back to library", onClick: onBack }}
      />
    );
  if (!detail)
    return <Empty title="Loading details…" copy="Fetching TMDB information." />;
  const seasons = [
      ...new Set(detail.episodes.map((episode) => episode.seasonNumber)),
    ],
    episodes = detail.episodes.filter(
      (episode) => episode.seasonNumber === season,
    ),
    primaryProvider =
      detail.providers.find(
        (provider) => provider.accessType === "subscription",
      )?.name ?? detail.providers[0]?.name,
    year = (detail.item.firstAirDate ?? detail.item.releaseDate)?.slice(0, 4),
    region = detail.providers[0]?.region ?? "CA";
  if (selectedPerson)
    return (
      <PersonDetailPage
        person={selectedPerson}
        onBack={() => setSelectedPerson(null)}
      />
    );
  if (selectedEpisode)
    return (
      <EpisodeDetailPage
        showTitle={detail.item.title}
        tmdbId={detail.item.tmdbId}
        episode={selectedEpisode}
        onBack={() => setSelectedEpisode(null)}
      />
    );
  if (fullCast)
    return (
      <FullCastPage
        title={detail.item.title}
        cast={detail.cast}
        onPerson={setSelectedPerson}
        onBack={() => {
          setFullCast(false);
          onCast(false);
        }}
      />
    );
  return (
    <section className="show-detail catalog-detail">
      <button className="back" onClick={onBack}>
        ← Back to library
      </button>
      <header
        className="detail-hero"
        style={
          {
            "--detail-backdrop": detail.item.backdropPath
              ? `url(https://image.tmdb.org/t/p/original${detail.item.backdropPath})`
              : "linear-gradient(135deg, #24343d 0%, #111a20 48%, #090e12 100%)",
          } as CSSProperties
        }
      >
        <div
          className="detail-hero-content"
          style={
            { "--detail-poster-width": `${posterWidth}px` } as CSSProperties
          }
        >
          <DetailPoster
            title={detail.item.title}
            path={detail.item.posterPath}
          />
          <div className="detail-hero-copy" ref={copyRef}>
            <small className="eyebrow">
              {detail.item.mediaType === "movie"
                ? "Movie detail"
                : "Show detail"}
            </small>
            <FittedDetailTitle title={detail.item.title} />
            <div className="detail-meta">
              {year && <span>{year}</span>}
              {detail.item.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
              {primaryProvider && <span>{primaryProvider}</span>}
            </div>
            <p className="synopsis">
              {detail.item.overview ?? "No synopsis available."}
            </p>
            <button
              disabled={pending}
              onClick={() => {
                setPending(true);
                void onWatchlist(detail.item).finally(() => setPending(false));
              }}
            >
              {pending ? "Adding…" : "★ Watchlist"}
            </button>
          </div>
        </div>
      </header>
      <div className="detail-grid">
        <section>
          <div className="detail-heading">
            <h2>Cast</h2>
            <button
              onClick={() => {
                setFullCast(true);
                onCast(true);
              }}
            >
              View full cast
            </button>
          </div>
          <div className="cast-row">
            {detail.cast.slice(0, 5).map((person) => (
              <article key={`${person.tmdbPersonId}-${person.characterName}`}>
                <div className="avatar">
                  <PersonAvatar name={person.name} path={person.profilePath} />
                </div>
                <button
                  className="detail-text-link"
                  onClick={() => setSelectedPerson(person)}
                >
                  {person.name}
                </button>
                <span>{person.characterName ?? "Role unavailable"}</span>
              </article>
            ))}
          </div>
          {detail.item.mediaType === "tv" && (
            <>
              <div className="detail-heading">
                <h2>Episodes</h2>
                <select
                  aria-label="Season"
                  value={season}
                  onChange={(event) => setSeason(Number(event.target.value))}
                >
                  {seasons.map((value) => (
                    <option key={value} value={value}>
                      Season {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="episode-list catalog-episodes">
                {episodes.map((episode) => (
                  <article key={episode.episodeNumber}>
                    <span>
                      S{episode.seasonNumber} E{episode.episodeNumber}
                    </span>
                    <div>
                      <button
                        className="detail-text-link"
                        onClick={() => setSelectedEpisode(episode)}
                      >
                        {episode.title ?? "Title unavailable"}
                      </button>
                      <small>
                        {episode.airDate
                          ? new Date(
                              `${episode.airDate}T12:00:00`,
                            ).toLocaleDateString()
                          : "Air date unavailable"}
                      </small>
                    </div>
                    <input
                      type="checkbox"
                      aria-label={`Mark S${episode.seasonNumber} E${episode.episodeNumber} watched`}
                      disabled={
                        episodePending ===
                        `${episode.seasonNumber}-${episode.episodeNumber}`
                      }
                      onChange={() => {
                        const key = `${episode.seasonNumber}-${episode.episodeNumber}`;
                        setEpisodePending(key);
                        setEpisodeError("");
                        void onEpisodeWatched(
                          detail.item,
                          episode.seasonNumber,
                          episode.episodeNumber,
                        )
                          .catch(() =>
                            setEpisodeError(
                              "Couldn’t mark this episode watched. Try again.",
                            ),
                          )
                          .finally(() => setEpisodePending(null));
                      }}
                    />
                  </article>
                ))}
              </div>
              {episodeError && (
                <p className="row-error" role="alert">
                  {episodeError}
                </p>
              )}
            </>
          )}
        </section>
        <aside>
          <section className="side-card watch-card">
            <small className="eyebrow">
              {region === "CA" ? "Canada" : region}
            </small>
            <h2>Where to watch</h2>
            {detail.providers.length ? (
              detail.providers.map((provider) => (
                <div
                  className="provider-row"
                  key={`${provider.tmdbProviderId}-${provider.accessType}`}
                >
                  {provider.logoPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${provider.logoPath}`}
                      alt=""
                    />
                  ) : (
                    <span className="provider-mark" aria-hidden="true">
                      {provider.name.slice(0, 2)}
                    </span>
                  )}
                  <div>
                    <strong>{provider.name}</strong>
                    <span>{provider.accessType}</span>
                  </div>
                </div>
              ))
            ) : (
              <p>Availability unavailable</p>
            )}
            <p className="provider-note">
              Availability can change. Streaming data provided by{" "}
              {detail.providerAttribution}.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
function ShowDetail({
  id,
  backLabel,
  initialFullCast,
  onCast,
  onBack,
  onLibraryChanged,
}: {
  id: string;
  backLabel: string;
  initialFullCast: boolean;
  onCast: (cast: boolean) => void;
  onBack: () => void;
  onLibraryChanged: () => Promise<void>;
}) {
  const { copyRef, posterWidth } = useHeroPosterFit(),
    [detail, setDetail] = useState<ShowDetailData | null>(null),
    [loadError, setLoadError] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0),
    [season, setSeason] = useState(1),
    [fullCast, setFullCast] = useState(initialFullCast),
    [note, setNote] = useState(""),
    [saveState, setSaveState] = useState(""),
    [notePending, setNotePending] = useState(false),
    [seasonPending, setSeasonPending] = useState(false),
    [seasonError, setSeasonError] = useState(""),
    [episodePending, setEpisodePending] = useState<string | null>(null),
    [episodeErrors, setEpisodeErrors] = useState<Record<string, string>>({}),
    [showConfirmation, setShowConfirmation] = useState(false),
    [showPending, setShowPending] = useState(false),
    [showError, setShowError] = useState(""),
    [nextPending, setNextPending] = useState(false),
    [nextError, setNextError] = useState(""),
    [favoritePending, setFavoritePending] = useState(false),
    [favoriteError, setFavoriteError] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<CastMember | null>(null),
    [selectedEpisode, setSelectedEpisode] = useState<EpisodeState | null>(null);
  const refresh = () => api.detail(id).then(setDetail);
  useEffect(() => {
    let active = true;
    void api
      .detail(id)
      .then((value) => {
        if (active) {
          setDetail(value);
          setNote(value.item.note ?? "");
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [id, loadAttempt]);
  if (loadError)
    return (
      <Empty
        title="Show unavailable"
        copy="Couldn’t load this show. Check the connection and try again."
        action={{
          label: "Retry",
          onClick: () => {
            setLoadError(false);
            setLoadAttempt((attempt) => attempt + 1);
          },
        }}
      />
    );
  if (!detail)
    return (
      <Empty
        title="Loading show…"
        copy="Fetching episodes, cast, and providers."
      />
    );
  const seasons = [
      ...new Set(detail.episodes.map((episode) => episode.seasonNumber)),
    ],
    episodes = detail.episodes.filter(
      (episode) => episode.seasonNumber === season,
    ),
    seasonComplete =
      episodes.length > 0 && episodes.every((episode) => episode.watched),
    showComplete =
      detail.episodes.length > 0 &&
      detail.episodes.every((episode) => episode.watched),
    progressPercent = detail.item.totalEpisodes
      ? Math.round(
          (detail.item.watchedEpisodes / detail.item.totalEpisodes) * 100,
        )
      : 0,
    primaryProvider =
      detail.providers.find(
        (provider) => provider.accessType === "subscription",
      )?.name ??
      detail.item.provider ??
      detail.providers[0]?.name,
    providerRegion = detail.providers[0]?.region ?? "CA";
  const effectiveStatus =
      detail.item.status === "stopped"
        ? "stopped"
        : showComplete
          ? "watched"
          : detail.item.watchedEpisodes === 0
            ? "watchlist"
            : detail.item.status === "watched" ||
                (detail.item.status === "watchlist" &&
                  detail.item.watchedEpisodes > 0)
              ? "watching"
              : detail.item.status,
    nextEpisodeNumber = detail.item.nextEpisode?.match(/^S\d+\s*E\d+/i)?.[0],
    canonicalStatus = {
      watchlist: "★ Watchlist",
      watching: "★ Watching",
      stopped: "Stopped",
      watched: "✓ Watched",
    }[effectiveStatus];
  if (selectedPerson)
    return (
      <PersonDetailPage
        person={selectedPerson}
        onBack={() => setSelectedPerson(null)}
      />
    );
  if (selectedEpisode)
    return (
      <EpisodeDetailPage
        showTitle={detail.item.title}
        tmdbId={detail.item.tmdbId}
        episode={selectedEpisode}
        onBack={() => setSelectedEpisode(null)}
      />
    );
  async function toggleEpisode(
    seasonNumber: number,
    episodeNumber: number,
    watched: boolean,
  ) {
    const key = `${seasonNumber}-${episodeNumber}`;
    setEpisodePending(key);
    setEpisodeErrors((current) => ({ ...current, [key]: "" }));
    try {
      await api.episode(id, seasonNumber, episodeNumber, watched);
      await refresh();
      await onLibraryChanged();
    } catch {
      setEpisodeErrors((current) => ({
        ...current,
        [key]: "Couldn’t update this episode. Try again.",
      }));
    } finally {
      setEpisodePending(null);
    }
  }
  async function toggleSeason() {
    setSeasonPending(true);
    setSeasonError("");
    try {
      await api.season(id, season, !seasonComplete);
      await refresh();
      await onLibraryChanged();
    } catch {
      setSeasonError("Couldn’t update this season. Try again.");
    } finally {
      setSeasonPending(false);
    }
  }
  async function markNextEpisode() {
    setNextPending(true);
    setNextError("");
    try {
      await api.markNext(id);
      await refresh();
      await onLibraryChanged();
    } catch {
      setNextError("Couldn’t mark the next episode watched. Try again.");
    } finally {
      setNextPending(false);
    }
  }
  async function saveNote() {
    setNotePending(true);
    setSaveState("Saving…");
    try {
      await api.note(id, note || null);
      await refresh();
      setSaveState("Note saved");
    } catch {
      setSaveState("Couldn’t save your note. Try again.");
    } finally {
      setNotePending(false);
    }
  }
  async function toggleFavorite() {
    setFavoritePending(true);
    setFavoriteError("");
    try {
      await api.favorite(id, !detail!.item.favorite);
      await refresh();
      await onLibraryChanged();
    } catch {
      setFavoriteError("Couldn’t update this favourite. Try again.");
    } finally {
      setFavoritePending(false);
    }
  }
  async function toggleShow() {
    setShowPending(true);
    setShowError("");
    try {
      await api.show(id, !showComplete);
      await refresh();
      await onLibraryChanged();
      setShowConfirmation(false);
    } catch {
      setShowError("Couldn’t update the show. Try again.");
    } finally {
      setShowPending(false);
    }
  }
  if (fullCast)
    return (
      <FullCastPage
        title={detail.item.title}
        cast={detail.cast}
        onPerson={setSelectedPerson}
        onBack={() => {
          setFullCast(false);
          onCast(false);
        }}
      />
    );
  return (
    <section className="show-detail">
      <button className="back" onClick={onBack}>
        ← Back to {backLabel}
      </button>
      <header
        className="detail-hero"
        style={
          {
            "--detail-backdrop": detail.item.backdropPath
              ? `url(https://image.tmdb.org/t/p/original${detail.item.backdropPath})`
              : "linear-gradient(135deg, #24343d 0%, #111a20 48%, #090e12 100%)",
          } as CSSProperties
        }
      >
        <button
          className={`favorite-toggle ${detail.item.favorite ? "selected" : ""}`}
          aria-label={
            detail.item.favorite
              ? `Remove ${detail.item.title} from favourites`
              : `Add ${detail.item.title} to favourites`
          }
          aria-pressed={detail.item.favorite}
          disabled={favoritePending}
          onClick={() => void toggleFavorite()}
        >
          {detail.item.favorite ? "★" : "☆"}
        </button>
        <div
          className="detail-hero-content"
          style={
            { "--detail-poster-width": `${posterWidth}px` } as CSSProperties
          }
        >
          <DetailPoster
            title={detail.item.title}
            path={detail.item.posterPath}
          />
          <div className="detail-hero-copy" ref={copyRef}>
            <small className="eyebrow">
              {detail.item.mediaType === "movie"
                ? "Movie detail"
                : "Show detail"}
            </small>
            <FittedDetailTitle title={detail.item.title} />
            <div className="detail-meta" aria-label="Show facts">
              {detail.item.year && <span>{detail.item.year}</span>}
              {detail.item.genre.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
              {primaryProvider && <span>{primaryProvider}</span>}
              {detail.item.mediaType === "movie" &&
                detail.item.runtimeMinutes && (
                  <span>{detail.item.runtimeMinutes} minutes</span>
                )}
            </div>
            <p className="synopsis">
              {detail.item.overview ?? "No synopsis available."}
            </p>
            {detail.item.mediaType === "tv" && (
              <>
                <div className="hero-actions">
                  <button
                    className="primary-action"
                    disabled={!nextEpisodeNumber || nextPending}
                    onClick={() => void markNextEpisode()}
                  >
                    {nextPending
                      ? "Updating…"
                      : nextEpisodeNumber
                        ? `Mark ${nextEpisodeNumber} watched`
                        : "All available episodes watched"}
                  </button>
                  <button onClick={() => setShowConfirmation(true)}>
                    {showComplete
                      ? "Mark entire show as unwatched"
                      : "Mark entire show as watched"}
                  </button>
                  <span
                    className="canonical-status"
                    aria-label={`Canonical status: ${canonicalStatus.replace(/^[★✓]\s*/, "")}`}
                  >
                    {canonicalStatus}
                  </span>
                </div>
                {nextError && (
                  <p className="hero-action-error" role="alert">
                    {nextError}
                  </p>
                )}
              </>
            )}
            {favoriteError && (
              <p className="hero-action-error" role="alert">
                {favoriteError}
              </p>
            )}
          </div>
        </div>
      </header>
      <div className="detail-grid">
        <section>
          <CastPreview
            detail={detail}
            onPerson={setSelectedPerson}
            onFull={() => {
              setFullCast(true);
              onCast(true);
            }}
          />
          {detail.item.mediaType === "tv" && (
            <>
              <div className="detail-heading">
                <h2>Episodes</h2>
                <div>
                  <select
                    aria-label="Season"
                    value={season}
                    onChange={(event) => setSeason(Number(event.target.value))}
                  >
                    {seasons.map((value) => (
                      <option key={value} value={value}>
                        Season {value}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={seasonPending}
                    onClick={() => void toggleSeason()}
                  >
                    {seasonPending
                      ? "Updating…"
                      : seasonComplete
                        ? "Mark season unwatched"
                        : "Mark season watched"}
                  </button>
                </div>
              </div>
              {seasonError && (
                <p className="row-error" role="alert">
                  {seasonError}
                </p>
              )}
              <div className="episode-list">
                {episodes.length ? (
                  episodes.map((episode) => (
                    <label key={episode.episodeNumber}>
                      <span>
                        S{episode.seasonNumber} E{episode.episodeNumber}
                      </span>
                      <button
                        type="button"
                        className="detail-text-link"
                        onClick={() => setSelectedEpisode(episode)}
                      >
                        {episode.title ?? "Title unavailable"}
                      </button>
                      <input
                        type="checkbox"
                        checked={episode.watched}
                        disabled={
                          episodePending ===
                          `${episode.seasonNumber}-${episode.episodeNumber}`
                        }
                        onChange={(event) =>
                          void toggleEpisode(
                            episode.seasonNumber,
                            episode.episodeNumber,
                            event.target.checked,
                          )
                        }
                      />
                      {episodeErrors[
                        `${episode.seasonNumber}-${episode.episodeNumber}`
                      ] && (
                        <small className="row-error" role="alert">
                          {
                            episodeErrors[
                              `${episode.seasonNumber}-${episode.episodeNumber}`
                            ]
                          }
                        </small>
                      )}
                    </label>
                  ))
                ) : (
                  <p>Episode information is not available for this season.</p>
                )}
              </div>
            </>
          )}
        </section>
        <aside>
          {detail.item.mediaType === "tv" && (
            <section className="side-card progress-card">
              <h2>Your progress</h2>
              <div className="detail-progress" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="detail-fact">
                <span>Watched</span>
                <strong>
                  {detail.item.totalEpisodes === null
                    ? "Unavailable"
                    : `${detail.item.watchedEpisodes} of ${detail.item.totalEpisodes}`}
                </strong>
              </div>
              <div className="detail-fact">
                <span>Next</span>
                <strong>{detail.item.nextEpisode ?? "Caught up"}</strong>
              </div>
              <div className="detail-fact">
                <span>Status</span>
                <strong>
                  {
                    {
                      continue: "Continue",
                      "caught-up": "Caught up",
                      watchlist: "Watchlist",
                      finished: "Finished",
                      stopped: "Stopped",
                    }[detail.item.libraryView]
                  }
                </strong>
              </div>
              {primaryProvider && (
                <div className="detail-fact">
                  <span>Network</span>
                  <strong>{primaryProvider}</strong>
                </div>
              )}
            </section>
          )}
          <section className="side-card watch-card">
            <small className="eyebrow">
              {providerRegion === "CA" ? "Canada" : providerRegion}
            </small>
            <h2>Where to watch</h2>
            {detail.providers.length ? (
              detail.providers.map((provider) => (
                <div
                  className="provider-row"
                  key={`${provider.tmdbProviderId}-${provider.accessType}`}
                >
                  {provider.logoPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${provider.logoPath}`}
                      alt=""
                    />
                  ) : (
                    <span className="provider-mark" aria-hidden="true">
                      {provider.name.slice(0, 2)}
                    </span>
                  )}
                  <div>
                    <strong>{provider.name}</strong>
                    <span>
                      {
                        {
                          subscription: "Streaming subscription",
                          free: "Free streaming",
                          ads: "Streaming with ads",
                          rent: "Available to rent",
                          buy: "Available to buy",
                        }[provider.accessType]
                      }
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p>Availability unavailable</p>
            )}
            <p className="provider-note">
              Availability can change. Streaming data provided by{" "}
              {detail.providerAttribution}.
            </p>
          </section>
          <section className="side-card manage-card">
            <h2>Personal note</h2>
            <label className="detail-field">
              <span className="sr-only">Personal note</span>
              <textarea
                value={note}
                maxLength={2000}
                rows={5}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a private note about this show"
              />
            </label>
            <div className="note-actions">
              <small>{note.length} / 2,000</small>
              <button disabled={notePending} onClick={() => void saveNote()}>
                {notePending ? "Saving…" : "Save note"}
              </button>
            </div>
            {saveState && (
              <p className="save-state" role="status">
                {saveState}
              </p>
            )}
          </section>
        </aside>
      </div>
      {showConfirmation && detail.item.mediaType === "tv" && (
        <ConfirmDialog
          title={
            showComplete
              ? `Mark ${detail.item.title} as unwatched?`
              : `Mark ${detail.item.title} as watched?`
          }
          description={
            showComplete
              ? "Every known episode will be marked unwatched. You can change individual episodes again afterward."
              : "Every known episode will be marked watched. You can still unmark individual episodes afterward."
          }
          confirmLabel={
            showComplete
              ? "Mark entire show as unwatched"
              : "Mark entire show as watched"
          }
          pendingLabel="Updating…"
          pending={showPending}
          error={showError}
          onCancel={() => {
            if (!showPending) setShowConfirmation(false);
          }}
          onConfirm={() => void toggleShow()}
        />
      )}
    </section>
  );
}
function PersonDetailPage({
  person,
  onBack,
}: {
  person: CastMember;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<PersonDetail | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .person(person.tmdbPersonId)
      .then((value) => active && setDetail(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [person.tmdbPersonId]);
  return (
    <section className="person-detail">
      <button className="back" onClick={onBack}>
        ← Back to cast
      </button>
      <div className="person-detail-grid">
        <div className="person-portrait">
          <PersonAvatar
            name={person.name}
            path={detail?.profilePath ?? person.profilePath}
          />
        </div>
        <article>
          <small className="eyebrow">TMDB person detail</small>
          <h1>{detail?.name ?? person.name}</h1>
          <p className="person-role">{person.characterName ?? "Cast member"}</p>
          {failed ? (
            <p>Additional TMDB information is unavailable.</p>
          ) : !detail ? (
            <p>Loading TMDB information…</p>
          ) : (
            <>
              <div className="person-facts">
                {detail.knownForDepartment && (
                  <span>{detail.knownForDepartment}</span>
                )}
                {detail.gender && <span>{detail.gender}</span>}
                {detail.birthday && <span>Born {detail.birthday}</span>}
                {detail.deathday && <span>Died {detail.deathday}</span>}
                {detail.placeOfBirth && <span>{detail.placeOfBirth}</span>}
                {detail.popularity !== null && (
                  <span>TMDB popularity {detail.popularity.toFixed(1)}</span>
                )}
              </div>
              <p>{detail.biography ?? "No biography is available from TMDB."}</p>
              {detail.alsoKnownAs.length > 0 && (
                <p className="person-aliases">
                  <strong>Also known as:</strong>{" "}
                  {detail.alsoKnownAs.join(", ")}
                </p>
              )}
              <div className="person-links">
                <a
                  href={`https://www.themoviedb.org/person/${detail.tmdbPersonId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on TMDB
                </a>
                {detail.imdbId && (
                  <a
                    href={`https://www.imdb.com/name/${detail.imdbId}/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on IMDb
                  </a>
                )}
                {detail.homepage?.startsWith("http") && (
                  <a href={detail.homepage} target="_blank" rel="noreferrer">
                    Official website
                  </a>
                )}
              </div>
            </>
          )}
        </article>
      </div>
      {detail && detail.knownCredits.length > 0 && (
        <section className="known-credits">
          <h2>Complete acting credits</h2>
          <PersonCreditSection
            title="Television"
            credits={detail.knownCredits.filter(
              (credit) => credit.mediaType === "tv",
            )}
          />
          <PersonCreditSection
            title="Movies"
            credits={detail.knownCredits.filter(
              (credit) => credit.mediaType === "movie",
            )}
          />
        </section>
      )}
    </section>
  );
}

function PersonCreditSection({
  title,
  credits,
}: {
  title: string;
  credits: PersonDetail["knownCredits"];
}) {
  if (credits.length === 0) return null;
  return (
    <section className="credit-section">
      <div className="detail-heading">
        <h3>{title}</h3>
        <span>{credits.length} credits</span>
      </div>
      <div className="credit-grid">
        {credits.map((credit, index) => (
          <article
            key={`${credit.mediaType}-${credit.tmdbId}-${credit.characterName}-${index}`}
          >
            <Poster path={credit.posterPath} />
            <strong>{credit.title}</strong>
            <span>
              {credit.year ?? "Year unavailable"} ·{" "}
              {credit.mediaType === "tv" ? "TV" : "Movie"}
            </span>
            {credit.characterName && <small>{credit.characterName}</small>}
            {credit.episodeCount !== null && (
              <small>
                {credit.episodeCount}{" "}
                {credit.episodeCount === 1 ? "episode" : "episodes"}
              </small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function EpisodeDetailPage({
  showTitle,
  tmdbId,
  episode,
  onBack,
}: {
  showTitle: string;
  tmdbId: number;
  episode: CatalogEpisode | EpisodeState;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState(episode),
    [cast, setCast] = useState<CastMember[]>([]),
    [castFailed, setCastFailed] = useState(false),
    [selectedPerson, setSelectedPerson] = useState<CastMember | null>(null);
  useEffect(() => {
    let active = true;
    void api
      .catalogEpisode(
        tmdbId,
        episode.seasonNumber,
        episode.episodeNumber,
      )
      .then((value) => {
        if (active) {
          setDetail(value);
          setCast(value.cast);
        }
      })
      .catch(() => active && setCastFailed(true));
    return () => {
      active = false;
    };
  }, [episode.episodeNumber, episode.seasonNumber, tmdbId]);
  if (selectedPerson)
    return (
      <PersonDetailPage
        person={selectedPerson}
        onBack={() => setSelectedPerson(null)}
      />
    );
  return (
    <section className="episode-detail-page">
      <button className="back" onClick={onBack}>
        ← Back to {showTitle}
      </button>
      {detail.stillPath && (
        <img
          className="episode-still"
          src={`https://image.tmdb.org/t/p/w780${detail.stillPath}`}
          alt=""
        />
      )}
      <small className="eyebrow">TMDB episode detail</small>
      <h1>{detail.title ?? "Title unavailable"}</h1>
      <div className="person-facts">
        <span>
          Season {detail.seasonNumber}, Episode {detail.episodeNumber}
        </span>
        {detail.airDate && <span>Aired {detail.airDate}</span>}
        {detail.runtimeMinutes && <span>{detail.runtimeMinutes} minutes</span>}
      </div>
      <p>{detail.overview ?? "No episode synopsis is available from TMDB."}</p>
      <section className="episode-cast">
        <h2>Episode cast</h2>
        {cast.length > 0 ? (
          <div className="cast-grid">
            {cast.map((person) => (
              <article
                key={`${person.tmdbPersonId}-${person.characterName}`}
              >
                <div className="avatar">
                  <PersonAvatar name={person.name} path={person.profilePath} />
                </div>
                <button
                  className="detail-text-link"
                  onClick={() => setSelectedPerson(person)}
                >
                  {person.name}
                </button>
                <span>{person.characterName ?? "Role unavailable"}</span>
              </article>
            ))}
          </div>
        ) : (
          <p>
            {castFailed
              ? "Episode cast is unavailable from TMDB."
              : "Loading episode cast…"}
          </p>
        )}
      </section>
    </section>
  );
}

function FullCastPage({
  title,
  cast,
  onPerson,
  onBack,
}: {
  title: string;
  cast: CastMember[];
  onPerson: (person: CastMember) => void;
  onBack: () => void;
}) {
  return (
    <section className="full-cast">
      <button className="back" onClick={onBack}>
        ← Back to {title}
      </button>
      <header>
        <h1>Full cast</h1>
        <p>
          {title} · {cast.length} credited performers
        </p>
      </header>
      <div className="cast-grid">
        {cast.map((person) => (
          <article key={`${person.tmdbPersonId}-${person.characterName}`}>
            <div className="avatar">
              <PersonAvatar name={person.name} path={person.profilePath} />
            </div>
            <button
              className="detail-text-link"
              onClick={() => onPerson(person)}
            >
              {person.name}
            </button>
            <span>{person.characterName ?? "Role unavailable"}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function CastPreview({
  detail,
  onFull,
  onPerson,
}: {
  detail: ShowDetailData;
  onFull: () => void;
  onPerson: (person: CastMember) => void;
}) {
  return (
    <>
      <div className="detail-heading">
        <h2>Cast</h2>
        <button onClick={onFull}>View full cast</button>
      </div>
      <div className="cast-row">
        {detail.cast.slice(0, 5).map((person) => (
          <article key={`${person.tmdbPersonId}-${person.characterName}`}>
            <div className="avatar">
              <PersonAvatar name={person.name} path={person.profilePath} />
            </div>
            <button
              className="detail-text-link"
              onClick={() => onPerson(person)}
            >
              {person.name}
            </button>
            <span>{person.characterName ?? "Role unavailable"}</span>
          </article>
        ))}
      </div>
    </>
  );
}
function PersonAvatar({ name, path }: { name: string; path: string | null }) {
  const nameParts = name.trim().split(/\s+/).filter(Boolean),
    initials =
      `${nameParts[0]?.[0] ?? ""}${nameParts.length > 1 ? (nameParts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
  if (!path)
    return (
      <span className="avatar-initials" aria-hidden="true">
        {initials}
      </span>
    );
  return (
    <>
      <img
        src={`https://image.tmdb.org/t/p/w185${path}`}
        alt=""
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
      <span className="avatar-initials" aria-hidden="true">
        {initials}
      </span>
    </>
  );
}

function DetailPoster({ title, path }: { title: string; path: string | null }) {
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="detail-poster">
      {path && (
        <img
          src={`https://image.tmdb.org/t/p/w342${path}`}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <span aria-hidden="true">{initials || "TV"}</span>
    </div>
  );
}
