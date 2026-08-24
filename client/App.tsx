import { useEffect, useRef, useState } from "react";
import type { CatalogMedia } from "../shared/catalog-types";
import type {
  ActivityItem,
  LibraryItem,
  ShowDetail as ShowDetailData,
  UpcomingEpisode,
} from "../shared/media-types";
import { api } from "./lib/api";

const navigation = [
  ["Library", ["Continue", "Caught up", "Watchlist", "Finished", "All shows"]],
  ["Activity", ["Diary", "Upcoming"]],
  ["Admin", ["Settings"]],
] as const;
const viewValues: Record<string, string> = {
  Continue: "continue",
  "Caught up": "caught-up",
  Watchlist: "watchlist",
  Finished: "finished",
  "All shows": "shows",
};
type SortKey = "title" | "progress" | "nextEpisode" | "updatedAt";

function readShowRoute() {
  const match = window.location.pathname.match(/\/shows\/([^/]+)(\/cast)?\/?$/);
  return { id: match?.[1] ?? null, cast: Boolean(match?.[2]) };
}

function showUrl(id?: string, cast = false) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return id ? `${base}/shows/${id}${cast ? "/cast" : ""}` : `${base}/`;
}

export function App() {
  const initialRoute = readShowRoute();
  const [view, setView] = useState("Continue"),
    [menuOpen, setMenuOpen] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [isMobile, setIsMobile] = useState(
      () => window.matchMedia?.("(max-width: 720px)").matches ?? false,
    ),
    [query, setQuery] = useState(""),
    [searchType, setSearchType] = useState<"all" | "tv" | "movie">("all");
  const [items, setItems] = useState<LibraryItem[]>([]),
    [results, setResults] = useState<CatalogMedia[]>([]),
    [message, setMessage] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(initialRoute.id),
    [selectedCast, setSelectedCast] = useState(initialRoute.cast),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [trackedTitles, setTrackedTitles] = useState<Record<string, string>>({}),
    [libraryLoading, setLibraryLoading] = useState(true),
    [libraryError, setLibraryError] = useState(""),
    [libraryAttempt, setLibraryAttempt] = useState(0),
    [searchAttempt, setSearchAttempt] = useState(0),
    [searchState, setSearchState] = useState<
      "idle" | "loading" | "success" | "error"
    >("idle");
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
  }
  function leaveShow() {
    window.history.pushState({}, "", showUrl());
    setSelectedId(null);
    setSelectedCast(false);
  }
  useEffect(() => {
    const restoreRoute = () => {
      const route = readShowRoute();
      setSelectedId(route.id);
      setSelectedCast(route.cast);
    };
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);
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
    api
      .library(viewValue)
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
    try {
      await api.add(item, status);
      setMessage(`${item.title} added`);
      setResults((current) =>
        current.filter((result) => result.tmdbId !== item.tmdbId),
      );
      if (viewValue) setItems(await api.library(viewValue));
      await refreshCounts();
    } catch {
      setMessage(`Could not add ${item.title}.`);
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span>H</span> Hermes <b>Media</b>
        </div>
        <div className="search">
          <label className="sr-only" htmlFor="catalog-search">
            Search shows
          </label>
          <input
            id="catalog-search"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (value.trim().length < 2) {
                setResults([]);
                setSearchState("idle");
              } else setSearchState("loading");
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
      {query.trim().length >= 2 && searchState !== "idle" && (
        <section className="search-results" aria-label="TMDB search results">
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
                    <h2>{item.title}</h2>
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
                        <button onClick={() => void add(item, "watchlist")}>
                          ★ Watchlist
                        </button>
                        {item.mediaType === "tv" ? (
                          <button
                            className="primary"
                            onClick={() => void add(item, "watching")}
                          >
                            Start watching
                          </button>
                        ) : (
                          <button
                            className="primary"
                            onClick={() => void add(item, "watched")}
                          >
                            Add as watched
                          </button>
                        )}
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
                    setView(link);
                    if (selectedId) leaveShow();
                    if (viewValues[link]) {
                      setLibraryLoading(true);
                      setLibraryError("");
                    }
                    if (isMobile) setMenuOpen(false);
                  }}
                >
                  <span>{link}</span>
                  {group === "Library" && (
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
              initialFullCast={selectedCast}
              onCast={(cast) => openShow(selectedId, cast)}
              onBack={leaveShow}
              onLibraryChanged={refreshCounts}
            />
          ) : (
            <>
              <header className="page-heading">
                <div>
                  <h1>{view}</h1>
                  <p>
                    {viewValue
                      ? `${items.length} tracked ${items.length === 1 ? "show" : "shows"}`
                      : "Activity and administration"}
                  </p>
                </div>
              </header>
              {message && (
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
                      setItems(await api.library(viewValue));
                      await refreshCounts();
                    }}
                  />
                ) : (
                  <Empty
                    title="No titles here yet"
                    copy="Search TMDB to add your first show."
                  />
                )
              ) : view === "Diary" ? (
                <Diary />
              ) : view === "Upcoming" ? (
                <Upcoming />
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
              <td>{item.genre.join(", ") || "—"}</td>
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
function Diary() {
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
    <div className="activity-list">
      {items.map((item) => (
        <article key={item.id}>
          <div>
            <small>{item.eventType.replaceAll("_", " ")}</small>
            <strong>
              {item.title} ·{" "}
              {item.seasonNumber === null
                ? "Status"
                : `S${item.seasonNumber} E${item.episodeNumber}`}
            </strong>
          </div>
          <time>{new Date(item.occurredAt).toLocaleString()}</time>
        </article>
      ))}
    </div>
  );
}
function Upcoming() {
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
          <div>
            <small>
              S{item.seasonNumber} E{item.episodeNumber}
            </small>
            <strong>
              {item.title} · {item.episodeTitle ?? "Title unavailable"}
            </strong>
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
  const [status, setStatus] = useState("");
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
    try {
      const result = await api.importCsv(await file.text());
      await onImported();
      setStatus(
        `${result.imported} ${result.imported === 1 ? "show" : "shows"} imported`,
      );
    } catch {
      setStatus("Import failed. Check the CSV and try again.");
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
          Choose CSV
          <input
            type="file"
            accept=".csv,text/csv"
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
      {status && (
        <div className="notice" role="status">
          {status}
        </div>
      )}
    </div>
  );
}
function ShowDetail({
  id,
  initialFullCast,
  onCast,
  onBack,
  onLibraryChanged,
}: {
  id: string;
  initialFullCast: boolean;
  onCast: (cast: boolean) => void;
  onBack: () => void;
  onLibraryChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<ShowDetailData | null>(null),
    [loadError, setLoadError] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0),
    [season, setSeason] = useState(1),
    [fullCast, setFullCast] = useState(initialFullCast),
    [note, setNote] = useState(""),
    [saveState, setSaveState] = useState(""),
    [notePending, setNotePending] = useState(false),
    [refreshPending, setRefreshPending] = useState(false),
    [statusPending, setStatusPending] = useState(false),
    [seasonPending, setSeasonPending] = useState(false),
    [seasonError, setSeasonError] = useState(""),
    [episodePending, setEpisodePending] = useState<string | null>(null),
    [episodeErrors, setEpisodeErrors] = useState<Record<string, string>>({}),
    [showConfirmation, setShowConfirmation] = useState(false),
    [showPending, setShowPending] = useState(false),
    [showError, setShowError] = useState("");
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
      detail.episodes.every((episode) => episode.watched);
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
  async function changeStatus(status: LibraryItem["status"]) {
    setStatusPending(true);
    setSaveState("Updating status…");
    try {
      await api.status(id, status);
      await refresh();
      await onLibraryChanged();
      setSaveState("Status updated");
    } catch {
      setSaveState("Couldn’t update the status. Try again.");
    } finally {
      setStatusPending(false);
    }
  }
  async function refreshMetadata() {
    setRefreshPending(true);
    setSaveState("Refreshing from TMDB…");
    try {
      await api.refresh(id);
      await refresh();
      await onLibraryChanged();
      setSaveState("Show information refreshed");
    } catch {
      setSaveState("Couldn’t refresh show information. Try again.");
    } finally {
      setRefreshPending(false);
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
      <section className="full-cast">
        <button
          className="back"
          onClick={() => {
            setFullCast(false);
            onCast(false);
          }}
        >
          ← Back to {detail.item.title}
        </button>
        <header>
          <h1>Full cast</h1>
          <p>
            {detail.item.title} · {detail.cast.length} credited performers
          </p>
        </header>
        <div className="cast-grid">
          {detail.cast.map((person) => (
            <article key={`${person.tmdbPersonId}-${person.characterName}`}>
              <div className="avatar">
                <PersonAvatar name={person.name} path={person.profilePath} />
              </div>
              <strong>{person.name}</strong>
              <span>{person.characterName ?? "Role unavailable"}</span>
            </article>
          ))}
        </div>
      </section>
    );
  return (
    <section className="show-detail">
      <button className="back" onClick={onBack}>
        ← Back to {detail.item.title}
      </button>
      <header>
        <Poster path={detail.item.posterPath} />
        <div>
          <small>
            {detail.item.mediaType === "movie" ? "Movie detail" : "Show detail"}
          </small>
          <h1>{detail.item.title}</h1>
          <p>
            {detail.item.genre.join(" · ")}
            {detail.item.mediaType === "movie" && detail.item.runtimeMinutes
              ? ` · ${detail.item.runtimeMinutes} minutes`
              : ""}
          </p>
          <p className="synopsis">
            {detail.item.overview ?? "No synopsis available."}
          </p>
          {detail.item.mediaType === "tv" && (
            <button onClick={() => setShowConfirmation(true)}>
              {showComplete
                ? "Mark entire show as unwatched"
                : "Mark entire show as watched"}
            </button>
          )}
        </div>
      </header>
      <div className="detail-grid">
        <section>
          <CastPreview
            detail={detail}
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
                      <strong>{episode.title ?? "Title unavailable"}</strong>
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
            <>
              <h2>Your progress</h2>
              <strong>
                {detail.item.totalEpisodes === null
                  ? "Total episode count unavailable"
                  : `${detail.item.watchedEpisodes} of ${detail.item.totalEpisodes} episodes watched`}
              </strong>
            </>
          )}
          <h2>Status</h2>
          <label className="detail-field">
            <span className="sr-only">Library status</span>
            <select
              value={detail.item.status}
              disabled={statusPending}
              onChange={(event) =>
                void changeStatus(event.target.value as LibraryItem["status"])
              }
            >
              <option value="watchlist">Watchlist</option>
              <option value="watching">Watching</option>
              <option value="stopped">Stopped</option>
              <option value="watched">Watched</option>
            </select>
          </label>
          <button
            disabled={refreshPending}
            onClick={() => void refreshMetadata()}
          >
            {refreshPending ? "Refreshing…" : "Refresh from TMDB"}
          </button>
          <h2>Personal note</h2>
          <label className="detail-field">
            <span className="sr-only">Personal note</span>
            <textarea
              value={note}
              maxLength={2000}
              rows={6}
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
          <h2>Where to watch</h2>
          {detail.providers.length ? (
            detail.providers.map((provider) => (
              <div key={`${provider.tmdbProviderId}-${provider.accessType}`}>
                <strong>{provider.name}</strong>
                <span>{provider.accessType}</span>
              </div>
            ))
          ) : (
            <p>Availability unavailable</p>
          )}
          <small>
            Streaming data provided by {detail.providerAttribution}.
          </small>
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
function CastPreview({
  detail,
  onFull,
}: {
  detail: ShowDetailData;
  onFull: () => void;
}) {
  return (
    <>
      <div className="detail-heading">
        <h2>Cast</h2>
        <button onClick={onFull}>View full cast</button>
      </div>
      <div className="cast-row">
        {detail.cast.slice(0, 4).map((person) => (
          <article key={`${person.tmdbPersonId}-${person.characterName}`}>
            <div className="avatar">
              <PersonAvatar name={person.name} path={person.profilePath} />
            </div>
            <strong>{person.name}</strong>
            <span>{person.characterName ?? "Role unavailable"}</span>
          </article>
        ))}
      </div>
    </>
  );
}
function PersonAvatar({ name, path }: { name: string; path: string | null }) {
  if (!path) return <span aria-hidden="true">{name[0]}</span>;
  return (
    <>
      <img
        src={`https://image.tmdb.org/t/p/w185${path}`}
        alt=""
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
      <span aria-hidden="true">{name[0]}</span>
    </>
  );
}
