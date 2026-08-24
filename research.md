# Media Tracker Competitive Research

**Research date:** August 21, 2026
**Primary product references:** [design.md](design.md) and [technical.md](technical.md)

## Executive summary

Media tracking products tend to compete on one of four promises:

1. **Remember what I watched** — episode history, diary entries, statuses, and
   progress.
2. **Tell me what comes next** — upcoming episodes, calendars, notifications,
   and continue-watching queues.
3. **Help me choose** — recommendations, trending titles, lists, ratings, and
   streaming availability.
4. **Let me participate** — reviews, reactions, comments, friends, and public
   identity.

TV Time combines all four, but its most distinctive interaction is the small
post-viewing ritual: mark an episode watched, see progress change, then optionally
react or read episode-specific discussion. Letterboxd builds a similar ritual
around logging a film to a dated diary. Trakt and Simkl prioritize automatic
tracking and interoperability. Serializd specializes in TV diaries and community.
JustWatch uses tracking primarily to support its streaming-availability product.

Media Tracker should not try to reproduce these broad networks. Its advantage is
different: a fast, private, self-owned library with explicit state changes and a
second first-class interface through Hermes. The best near-term opportunities are
therefore:

- make the next episode exceptionally easy to identify and mark;
- distinguish a durable viewing event from a simple status;
- preserve local data portability from the beginning;
- support lightweight bulk episode actions with explicit confirmation; and
- keep discovery, social features, provider data, ratings, and automatic
  scrobbling outside V1.

## Current implementation status

Status was reconciled with the production implementation on August 23, 2026.

**Legend**

- ✅ **Production implemented** — behavior is backed by the React client,
  Fastify service, SQLite persistence, and relevant automated tests.
- 🧪 **Release verification remaining** — implementation and deployment assets
  exist, but live Hermes/Tailnet verification has not been completed.
- ⬜ **Deferred** — research recommendation is intentionally outside V1.

> **Production status:** The local application is implemented and passes its
> automated test, lint, typecheck, and production-build gates. The remaining
> release work is version-control integration and live Hermes/Tailnet deployment
> verification. Local production-build browser QA has passed at desktop and
> phone widths through a strict `/media` prefix-stripping proxy.

### Feature inventory

| Status                            | Feature                                  | Current evidence                                                                          | Production work remaining                   |
| --------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| ✅ Production implemented         | Unified movie and TV library             | React views load normalized entries from Fastify and SQLite                               | Live deployment verification                |
| ✅ Production implemented         | Filters and column-specific sorting      | Per-view controls use validated repository queries and derived views                      | Broader browser coverage                    |
| ✅ Production implemented         | TMDB catalog search                      | Live v3-key smoke test verified movie/TV search, duplicate suppression, posters, and add  | None                                        |
| ✅ Production implemented         | Existing-title “In library” state        | TMDB/media-type identity index suppresses duplicate add actions                           | None                                        |
| ✅ Production implemented         | Add, status, and personal-note editing   | Validated mutations persist through the shared service and have browser-level coverage    | Live browser verification                   |
| ✅ Production implemented         | Episode, season, and whole-show progress | Transactional mutations and their UI request paths are tested                             | Live browser verification                   |
| ✅ Production implemented         | Derived progress and smart library views | Continue, Caught up, Watchlist, Finished, Stopped, and All shows are derived consistently | Live data verification                      |
| ✅ Production implemented         | Explicit destructive confirmation        | Removal requires UI confirmation and API/MCP confirmation                                 | Accessibility regression coverage           |
| ✅ Production implemented         | Loading, empty, error, and retry states  | Library, search, detail, Diary, and Upcoming distinguish failure from empty data          | Browser accessibility audit                 |
| ✅ Production implemented         | Responsive navigation and reduced motion | Desktop collapse and inert/Escape phone drawer behavior are tested                        | Physical-phone verification                 |
| ✅ Production implemented         | SQLite, migrations, and local service    | WAL-backed SQLite and loopback-only Fastify composition are tested                        | Live service verification                   |
| ✅ Production implemented         | Server-side TMDB boundary and refresh    | Credentials remain server-only; explicit refresh preserves personal state                 | Scheduled refresh is deferred               |
| ✅ Production implemented         | HTTP API and Hermes MCP                  | Shared service validation; every route and tool is exercised through its transport        | Live MCP verification                       |
| 🧪 Release verification remaining | Tailnet deployment                       | Hardened systemd, environment, watchdog, and Serve instructions exist                     | Install and verify on Hermes                |
| ✅ Production implemented         | Next-unwatched episode shortcut          | Repository ordering and API/UI mutations are implemented and tested                       | None                                        |
| ✅ Production implemented         | CSV import/export                        | Show and explicit per-episode state round-trip transactionally                            | Additional large-file UI coverage           |
| ✅ Production implemented         | Recent viewing history/diary             | Canonical activity events are persisted and exposed through API/MCP                       | Rewatch events remain post-V1               |
| ✅ Production implemented         | Upcoming/caught-up views                 | Live refresh verified seasons, episodes, air dates, providers, and derived availability   | None                                        |
| ✅ Production implemented         | Backup and verified restore              | Online SQLite backup, integrity checks, confirmation, and recovery copy are tested        | Operational Hermes smoke test               |
| ⬜ Deferred                       | Native TV Time/Trakt import              | Generic normalized CSV transfer exists; vendor-specific mapping does not                  | Research vendor formats for a later release |

## Method and limitations

This is desk research based primarily on current official product pages, support
documentation, and app-store listings. App-store reviews and community posts are
used only as directional evidence of user expectations or pain points; they are
not treated as representative usability studies.

The products were selected because each provides a useful comparison to Media
Tracker:

- **TV Time** — closest broad movie-and-TV tracking competitor;
- **Letterboxd** — strongest film diary and collection model;
- **Trakt** — mature tracking platform and integration ecosystem;
- **Serializd** — TV-focused diary and community product;
- **JustWatch** — availability-led discovery with tracking; and
- **Simkl** — multi-format tracking with automation and import/export emphasis.

Features and policies can change. Findings describe the products as observed on
the research date.

## Comparison matrix

| Product    | Core promise                   | Movies | Episode tracking | Primary organization                    | Social layer |                    Automation/integrations | Strongest lesson for Media Tracker                               |
| ---------- | ------------------------------ | -----: | ---------------: | --------------------------------------- | -----------: | -----------------------------------------: | ---------------------------------------------------------------- |
| TV Time    | Track, discover, and react     |    Yes |              Yes | Watch list, upcoming, progress          |       Strong |                      Notifications/widgets | Make episode completion a satisfying recurring action            |
| Letterboxd | Your life in film              |    Yes |               No | Diary, watchlist, lists, profile        |       Strong |       Imports/exports; limited partner API | Separate “seen” state from a dated viewing event                 |
| Trakt      | Discover, track, share, sync   |    Yes |              Yes | History, lists, up next                 |       Strong | Very strong; scrobbling and community apps | A stable domain/API layer creates long-term leverage             |
| Serializd  | Letterboxd-style TV tracking   |     No |              Yes | TV diary, lists, reviews                |       Strong |                   TV Time and Trakt import | Episode-level records and migration matter to power users        |
| JustWatch  | Find where to watch            |    Yes |              Yes | Watchlist, Continue Watching, Caught Up |      Limited |                     Provider notifications | Availability can dominate and complicate a tracking product      |
| Simkl      | Automatically track everything |    Yes |              Yes | TV, movies, anime, history              |     Moderate |        Very strong; scrobblers and imports | Portability and automation are valuable but operationally costly |

## Deep dive: TV Time

### Product position

TV Time presents itself as a free companion for organizing shows and movies, not
as a streaming service. Its current listing emphasizes a single place to track
watching, save titles across platforms, find where to watch, receive release
alerts, discover recommendations and trending titles, view personal statistics,
and participate in episode/movie discussion. The Google Play listing reports
more than 25 million users in its product copy and more than 10 million Android
downloads. [TV Time on Google Play](https://play.google.com/store/apps/details?id=com.tozelabs.tvshowtime)

The public web experience reinforces four main value propositions: tracking,
where-to-watch information, notifications, and discovery. It also prominently
surfaces trending, most-reacted-to, most-binged, and most-added titles. [TV Time
official site](https://www.tvtime.com/?lang=en)

### Core experience model

TV Time's value is not just its feature list. Its interaction loop is compact:

```text
Open watch list
    → see the next unwatched episode
    → mark it watched
    → progress/history updates
    → optionally rate, react, or read spoiler-bounded discussion
```

Its official app listing describes the following capabilities:

- unified movie, television, and anime tracking;
- a watch list and availability information;
- notifications for new episodes and movies;
- recommendations, trending browsing, genres, and show status;
- personal viewing statistics;
- episode and movie ratings;
- character/emotion voting, reviews, memes, and spoiler-aware discussion;
- custom lists, widgets, custom posters, and achievement badges.

[TV Time on Google Play](https://play.google.com/store/apps/details?id=com.tozelabs.tvshowtime)

### What TV Time does well

#### 1. It gives episodic tracking a clear home

Users do not need to rediscover the show before every update. The watch list is
oriented around what is ready to watch or mark next. This turns tracking from an
administrative library task into a repeatable post-episode habit.

**Media Tracker implication:** the series detail screen should identify the next
unwatched episode, and the library card should show actionable progress. V1 can
do this without notifications, automatic completion, or provider data.

#### 2. It makes progress visible and emotionally legible

Episode completion changes a count, a show position, and potentially what the
user sees next. Reactions and comments add a reward after the tracking action.

**Media Tracker implication:** preserve the explicit episode toggle, but ensure
the response feels consequential: update the progress label immediately, retain
the user's place in the season, and make the next episode visually obvious.

#### 3. It treats episodes as discussion boundaries

Episode-specific conversation reduces spoilers compared with a single show-wide
feed. Users can react after confirming they watched the episode.

**Media Tracker implication:** do not add social features, but retain the useful
boundary. Notes could eventually exist at the episode or viewing-event level
without creating a public community.

#### 4. It supports both lightweight and deeper engagement

A user can simply check an episode or choose to rate, react, comment, build lists,
or inspect statistics. The tracking action remains the entry point.

**Media Tracker implication:** keep the primary mutation fast. Additional fields
must never become prerequisites for marking something watched.

### Risks and weaknesses to avoid

TV Time's breadth introduces competing navigation priorities: tracking, discovery,
availability, social activity, statistics, and gamification all want attention.
The product can therefore feel less like a private utility and more like a
content network.

Recent Google Play reviews visible on the official listing include complaints
about long loading states, watch-list failures, and reinstalling to recover from
freezes. These are anecdotes, not representative measurements, but they reinforce
an important product risk: a tracking tool loses trust quickly when its core list
or mutation path feels unreliable. [TV Time reviews and product listing](https://play.google.com/store/apps/details?id=com.tozelabs.tvshowtime)

TV Time also states that it may share location, personal information, and other
data types with third parties, while supporting encrypted transit and deletion
requests. The exact behavior depends on platform, region, and use. [TV Time data
safety disclosure](https://play.google.com/store/apps/details?id=com.tozelabs.tvshowtime)

**Media Tracker implication:** privacy and local ownership are meaningful product
differentiators, not just deployment details. The application should remain useful
without an account, advertising identifiers, behavioral tracking, or public
activity.

### TV Time patterns worth adopting

- ✅ **Production implemented:** a next-unwatched-episode action advances through
  canonical ordered episode records.
- ✅ **Production implemented:** visible derived progress in every applicable
  library table.
- ✅ **Production implemented:** idempotent episode-level marking with scoped
  pending and failure feedback.
- ✅ **Production implemented:** Continue, Caught Up, and Upcoming smart views,
  plus explicit TMDB metadata refresh. Notifications remain deferred.
- ✅ **Production implemented:** transactional bulk season marking and unmarking
  with explicit user intent.
- ✅ **Production implemented:** a persisted diary records explicit watched,
  unwatched, and status-change events.

### TV Time patterns to reject or defer

- Public comments, reactions, followers, memes, and popularity feeds.
- Badges and streak mechanics that pressure the user to watch.
- Trending content as the default home screen.
- Notifications and provider playback/deep links in V1.
- Automatic inference of watched status.
- Custom poster selection before the core tracking loop is mature.

## Other comparable products

### Letterboxd

Letterboxd defines itself as a social network for film discussion and discovery.
Its core concepts are watched state, a watchlist, a dated diary entry, ratings,
reviews, tags, likes, lists, profiles, and following. Crucially, it distinguishes
marking a film as watched from logging a specific viewing in the diary. A diary
entry can carry a date, review, rating, like, and tags. [Letterboxd FAQ](https://letterboxd.com/about/faq/)

That distinction is structurally important. “I have seen this” and “I watched
this on this date” answer different questions. Letterboxd also offers user data
export as CSV files, making portability a visible account feature. [Letterboxd
data export details](https://letterboxd.com/about/faq/)

Letterboxd's watchlist automatically removes a title when the user marks or logs
it watched. That behavior is convenient, but it conflicts with Media Tracker's
explicit-state rule if applied silently. [Letterboxd watchlist behavior](https://letterboxd.com/about/faq/)

**Lessons:**

- Consider a future `viewing_events` model rather than overloading
  `library_entries.completed_at` if rewatches or history become important.
- Add export early; importing later is easier when the native export is stable.
- Preserve explicit status transitions even when a common default seems obvious.
- Keep reviews, ratings, profiles, and public lists out of V1.

### Trakt

Trakt combines movie/TV history, lists, discovery, availability, recommendations,
ratings, and a large ecosystem of community applications. It promotes automatic
sync from streaming services and media centers as a primary benefit. [Trakt
product overview](https://widgets.trakt.tv/)

Its scrobbling API models playback as start, pause, and stop/finish events sent by
a media client. [Trakt scrobble documentation](https://docs.trakt.tv/reference/about-scrobble)

**Lessons:**

- The existing `MediaService` boundary is strategically valuable: it leaves room
  for future clients without duplicating rules.
- Automatic scrobbling creates identity matching, partial-playback, retry,
  duplication, and trust problems. It should remain explicitly out of V1.
- If integrations are added later, idempotency keys and viewing-event semantics
  will be more robust than inferring from current status.

### Serializd

Serializd positions itself as a TV-specific tracking and community platform. It
supports show tracking, rewatches, ratings, reviews, a TV diary, lists, friends,
episode discussion, trending content, and member recommendations. It uses TMDB
for catalog data and supports imports from TV Time and Trakt. [Serializd official
site](https://serializd.com/)

**Lessons:**

- TV users value episode-level records and diary history, not just a single show
  status.
- Imports are a competitive acquisition feature and a user-trust feature.
- A TV-focused information architecture can remain clear even with deep episode
  data, but the social feed should not be copied into this private product.

### JustWatch

JustWatch's primary job is answering where a movie or show can legally be watched.
It supplements that with a watchlist, availability notifications, and TV progress
tracking. Its tracking model groups shows into Continue Watching, Haven't Started,
Caught Up, and Seen. It automatically moves a completed, ended series into Seen.
[JustWatch TV tracking guide](https://support.justwatch.com/article/what-is-tv-show-tracking)

The broader product uses service, price, rating, year, and other filters to narrow
content availability. [JustWatch official site](https://www.justwatch.com/us)

**Lessons:**

- “Continue Watching,” “Haven't Started,” and “Caught Up” are useful derived
  views, even if the underlying stored status remains explicit.
- Automatically moving a series to Seen conflicts with Media Tracker's domain
  rule and should not be adopted.
- Provider data creates localization, freshness, commercial-ranking, and API
  dependency concerns. It should stay deferred unless availability becomes a
  primary user goal.

### Simkl

Simkl tracks movies, television, and anime and emphasizes automatic tracking,
notifications, recommendations, history, imports, and multiple client platforms.
Its paid-feature page describes imports from more than 20 services, JSON backup,
manual tracking, and scrobbling integrations with media players and servers.
[Simkl feature overview](https://simkl.com/vip/)

Its player integrations can mark items watched after a playback threshold and may
queue offline events for later synchronization. [Simkl player tracking](https://simkl.com/apps/windows/)

**Lessons:**

- Data portability is a durable advantage for a long-lived personal archive.
- Automatic thresholds are convenient but violate Media Tracker's current
  explicit-mutation principle.
- Supporting anime as a separate catalog concept would complicate media types,
  seasons, and metadata; TMDB-backed movie/TV scope is appropriate for V1.

## Cross-product findings

### 1. “Status” and “history” are different concepts

Most mature trackers eventually need both:

- **Current classification:** Watchlist, Watching, Watched, Dropped.
- **Event history:** watched movie on a date, watched episode on a date, rewatched,
  changed status, or added a note.

Media Tracker's current `watched_episodes` table captures one latest episode
completion but cannot represent multiple watches. Its movie model stores a
completion timestamp but not a diary of viewings.

**Finding:** V1 is internally coherent, but future history/rewatch work should add
append-only viewing events rather than stretch the current status fields.

### 2. The next episode is the highest-value TV shortcut

TV Time, JustWatch, Trakt, Serializd, and Simkl all organize part of the experience
around continuing a show. Users should not need to select a season and scan a
long list every time.

**Finding:** derive `nextUnwatchedEpisode` when reliable episode catalog data is
available. Present it as a shortcut, not an automatic mutation.

### 3. Bulk actions are expected but risky

Season-level watched actions are common because backfilling a long-running show
episode by episode is tedious. They can also create hundreds of records by
mistake.

**Finding:** defer bulk mutation until the single-episode flow is stable. When
added, show the exact season and number of affected episodes, require confirmation,
and make the server operation transactional and idempotent.

### 4. Data portability supports trust

Letterboxd exposes CSV export, Serializd supports TV Time/Trakt import, and Simkl
promotes broad imports and backup. A personal viewing archive becomes more
valuable—and harder to replace—over time.

**Finding:** a local SQLite database already improves ownership, but a documented
JSON or CSV export is still valuable for inspection, backup, and migration.

### 5. Discovery easily overwhelms tracking

Trending feeds, ratings, recommendations, availability, and social activity are
common growth features. They add substantial information density and push the
product toward engagement rather than utility.

**Finding:** keep the library as the default. Search should remain intentional and
catalog results should stay visually distinct from personal entries.

### 6. Reliability is part of the interaction design

A tracker is a memory aid. If a list loads slowly, a checked episode reappears, or
progress is inconsistent, users cannot trust the archive. Directional complaints
on TV Time's app-store listing demonstrate how quickly performance issues affect
the perceived value of the whole product.

**Finding:** prioritize fast local reads, mutation-scoped pending states,
idempotency, reload persistence, and truthful error feedback above animation or
additional discovery features.

### 7. Private-by-default is a genuine differentiator

Most competitors are account-based networks or commercially supported discovery
services. Letterboxd notes that profiles and most content are publicly visible by
default, with private controls applying to specific lists/watchlists. [Letterboxd
privacy visibility](https://letterboxd.com/about/faq/)

**Finding:** Media Tracker's loopback listener, Tailnet-only ingress, local SQLite
ownership, and absence of behavioral tracking should be communicated as product
benefits in onboarding and documentation.

## Recommendations for Media Tracker

### V1: preserve the current scope

The source specifications make good exclusions. Do not add recommendations,
ratings, reviews, social features, availability, notifications, public profiles,
or automatic tracking before the core private archive is dependable.

Within the existing V1 scope, refine these behaviors:

1. ✅ **Show the next unwatched episode.** Production repository ordering drives
   the shortcut, progress display, and watched mutation.
2. ✅ **Keep mutation feedback local.** Pending and recoverable error state is
   scoped to the affected row, episode, season, show, note, or status action.
3. ✅ **Make unknown totals explicit.** The UI shows “Total episode count
   unavailable” rather than a fabricated percentage.
4. ✅ **Keep search and library visually distinct.** TMDB results use a dedicated
   overlay and identify titles already present in the local library.
5. ✅ **Use canonical timestamps for recent activity.** Diary entries come from
   persisted activity events rather than browser-session state.
6. ✅ **Provide tested backup and restore.** The compiled CLI uses SQLite online
   backup, verifies integrity, requires explicit restore confirmation, and keeps
   a pre-restore recovery copy.

### Strong candidates for V1.1

| Status                    | Candidate                 | User value                  | Technical impact                        | Recommendation                    |
| ------------------------- | ------------------------- | --------------------------- | --------------------------------------- | --------------------------------- |
| ✅ Production implemented | Next-unwatched shortcut   | Very high for TV            | Repository ordering and mutation        | Verify with live library          |
| ✅ Production implemented | CSV import/export         | High trust and portability  | Transactional per-episode transfer      | Verify a production backup export |
| ✅ Production implemented | Bulk mark season watched  | High for migration/backfill | Transaction and confirmation            | Extend UI accessibility coverage  |
| ✅ Production implemented | Recent viewing activity   | Medium-high                 | Canonical activity events               | Consider rewatch events later     |
| ⬜ Deferred               | Import from TV Time/Trakt | High for existing archives  | Vendor identity mapping and conflict UI | Research formats first            |
| ✅ Production implemented | Upcoming/caught-up views  | Medium                      | Air-date freshness and derivation       | Verify live refreshed metadata    |

### Post-V1 opportunities

#### Viewing events and rewatches

Add an append-only model such as:

```text
viewing_events
  id
  media_item_id
  season_number?
  episode_number?
  watched_at
  source (ui | mcp | import)
  created_at
```

This would support movie diaries, multiple episode watches, recent activity,
imports, and richer statistics without changing the explicit library status.
This is a research recommendation, not a V1 schema change.

#### Import and conflict handling

An import should preview:

- matched and unmatched titles;
- duplicate or ambiguous TMDB identities;
- status conflicts;
- watched episodes that no longer exist in current catalog metadata; and
- the number of records to create or update.

The import must be reversible through a pre-import backup or transactional batch.

#### Derived smart views

Useful views can be computed without introducing more mutable status values:

- **Continue watching:** status is Watching and progress is incomplete.
- **Not started:** status is Watchlist and no viewing records exist.
- **Caught up:** all currently known aired episodes are recorded, but the show is
  not necessarily complete.
- **Recently watched:** ordered by canonical viewing timestamps.

“Caught up” must remain a derived label; it must not silently set status to
Watched.

### Features that should remain out of scope

- Public profiles, followers, comments, reactions, or activity feeds.
- Gamified streaks and badges.
- Provider availability until there is a clear primary use case and reliable
  regional data source.
- Automatic scrobbling or completion thresholds.
- Community ratings and trending feeds as default navigation.
- Multi-user state until ownership, authentication, and privacy requirements are
  redesigned deliberately.

## Proposed product-language refinements

Competitor research suggests that “Watchlist” and “Watching” are widely
understood, while “Watched” can mean either current classification or recorded
history. Media Tracker should use language consistently:

| Concept                | Recommended label        | Notes                                                                               |
| ---------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| Saved for later        | Watchlist                | Familiar across products                                                            |
| Actively progressing   | Watching                 | Explicit user-selected state                                                        |
| User-declared complete | Watched                  | Never inferred for series                                                           |
| Stopped intentionally  | Dropped                  | Keep available but visually quiet                                                   |
| Episode record         | Watched / Mark unwatched | Direct, reversible wording                                                          |
| Future history event   | Log viewing              | Distinguishes an event from status                                                  |
| Derived shortcut       | Next episode             | An action target, not a stored status                                               |
| Derived view           | Continue                 | Watching series with a known available unwatched episode; never persisted as status |
| Canonical status view  | Watchlist                | Starred and not started; maps to canonical `watchlist`                              |
| Derived state          | Caught up                | Still-airing Watching series with no available unwatched episode                    |
| Derived state          | Finished                 | Ended series with every known episode watched                                       |
| Activity view          | Upcoming                 | Announced future episodes for all currently Watching series                         |

## Research-informed acceptance additions

These can supplement the existing acceptance criteria without expanding V1:

- ✅ Production: a returning TV user can mark the next visible unwatched episode
  without searching the catalog again.
- ✅ Production: episode mutations persist while the current detail context
  remains stable.
- ✅ Production: a search result already in the library shows “In library” and
  cannot trigger another add action.
- ✅ Production: unknown episode totals are represented explicitly rather than
  as zero percent or “complete.”
- ✅ Production: failed loading and mutation paths preserve confirmed state and
  provide clear recovery feedback.
- ✅ Production: backup and restore are documented and tested against disposable
  WAL-backed databases; live Hermes verification remains a release step.

## Show-detail patterns

Current tracker products reinforce a few useful patterns for the show page:

- TV Time emphasizes direct episode check-offs, visible show progress, and
  season-level tracking; its show experience also exposes cast and ratings.
- Trakt is moving toward deeper season, episode, actor, and credit drilldowns,
  while retaining progress and effective episode dates.
- Serializd combines show, season, and episode tracking with extensive show
  information such as seasons, genres, and streaming platforms.
- Simkl supports marking earlier episodes in bulk when a later episode is
  checked, reducing setup friction for partially watched series.

The local `show-detail-concepts.html` prototype translates those patterns into
the selected Balanced detail direction for Compact Tracker. It deliberately
prioritizes cast, episode completion, season navigation, and next-episode action
over reviews or social activity.

## Sources

- [TV Time official site](https://www.tvtime.com/?lang=en)
- [TV Time on Google Play](https://play.google.com/store/apps/details?id=com.tozelabs.tvshowtime)
- [Letterboxd FAQ](https://letterboxd.com/about/faq/)
- [Letterboxd paid features](https://letterboxd.com/about/pro/)
- [Trakt product overview](https://widgets.trakt.tv/)
- [Trakt scrobble documentation](https://docs.trakt.tv/reference/about-scrobble)
- [Serializd official site](https://serializd.com/)
- [JustWatch TV tracking guide](https://support.justwatch.com/article/what-is-tv-show-tracking)
- [JustWatch official site](https://www.justwatch.com/us)
- [JustWatch company overview](https://www.justwatch.com/us/about)
- [Simkl feature overview](https://simkl.com/vip/)
- [Simkl player tracking](https://simkl.com/apps/windows/)
- [Simkl progress tracking](https://docs.simkl.org/how-to-use-simkl/core-features/content-tracking/tracking-content/progress-tracking)
- [Trakt product update: richer show, season, episode, and cast pages](https://forums.trakt.tv/t/trakt-product-update-may-2026/111812)
