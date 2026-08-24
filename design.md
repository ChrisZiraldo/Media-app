# Media Tracker Product and Interface Design

## 1. Product vision

Media Tracker is a calm, private home for one person's movie and television
library. It should make three recurring jobs effortless:

1. Find a title.
2. Decide where it belongs in the library.
3. Record viewing progress deliberately.

The product favors clarity and trust over automation. It never guesses what the
user watched, never hides a destructive action, and always distinguishes catalog
results from titles already in the personal library.

The technical architecture and delivery requirements are defined in
[technical.md](technical.md).

## 2. V1 audience and context

The primary user is Chris, accessing the application from a phone or desktop on
the private Tailnet. Hermes acts as a secondary interface through MCP, using the
same explicit product rules as the visual application.

This is a personal tool, not a multi-user entertainment platform. The design
should feel focused and useful at a glance rather than promotional or social.

## 3. Product principles

### Private by default

The interface should reinforce that this is a personal library. It must not
introduce public profiles, sharing, or accidental public-facing behavior.

### Explicit state changes

Adding, changing status, marking progress, and removing titles are intentional
actions. The UI gives immediate feedback and does not infer completion.

### Library first

The user's collection is the home experience. Discovery supports the library;
it does not overwhelm it.

### Clear recovery

Loading, empty, failure, and retry states are designed alongside successful
states. A failed mutation must not leave the interface looking successful.

### Useful density

Artwork and metadata should make titles recognizable, while status and progress
remain easy to scan. Avoid decorative elements that compete with the collection.

## 4. V1 scope

### Supported user outcomes

- Search TMDB for movies, TV series, or both.
- Add a catalog title with one of four canonical statuses: Watchlist, Watching,
  Stopped, or Watched. Continue, Caught up, and Finished remain derived views.
- Browse one unified personal library.
- Browse the derived Continue, Caught up, Watchlist, Finished, and All shows
  views, plus Diary and Upcoming activity.
- Filter and sort each library table from icon-only controls beside its column
  headings.
- View artwork, title metadata, synopsis, release or first-air date, runtime,
  genre, provider/network, status, note, cast, and TV progress when available.
- View region-specific streaming availability and access type without outbound
  Watch now links.
- Change a movie or series status and edit its note.
- Open a series from its linked title, view its dedicated full-cast page, select
  a season, toggle individual episodes, toggle a displayed season, and mark or
  unmark the entire show in one confirmed action.
- Import and export complete show metadata and per-episode watched state as CSV
  from Admin Settings.
- Remove a title only after explicit confirmation naming that title.
- Perform the equivalent supported actions through Hermes.

### Out of scope for V1

- Torrent, download-client, media-server, or piracy workflows.
- Playback or outbound streaming links.
- Recommendations, notifications, ratings, reviews, or social features.
- Multiple users, family profiles, or Sarah-specific library state.
- Public hosting or cloud persistence.
- Automatic inference of watched status.
- User-uploaded or manually managed artwork. TMDB artwork paths and a bundled
  fallback image are in scope.

## 5. Information architecture

The application has four primary surface groups.

```text
Media Tracker
|-- Library
|   |-- Continue (default)
|   |-- Caught up
|   |-- Watchlist
|   |-- Finished
|   `-- All shows
|-- Activity
|   |-- Diary
|   `-- Upcoming
|-- Admin
|   `-- Settings
|       |-- Import CSV
|       `-- Export CSV
`-- Show detail
    |-- Summary and progress
    |-- Featured cast
    |   `-- Full cast page
    |-- Season selector
    `-- Episode checklist
```

Global search remains available from the application shell and may filter the
active view or search TMDB. Local filtering and remote catalog results must
remain visually distinct. A catalog result is not a library item until the user
adds it.

The application shell includes an always-available circular chevron positioned
near the top of the divider between navigation and content. The page heading is
placed below its vertical footprint so the two never overlap. It points left to collapse the
Library, Activity, and Admin rail and right to restore it. When collapsed, the
content area uses the released horizontal space. The control exposes its state
and purpose to assistive technology.

At phone widths (720 px and below), navigation becomes an off-canvas drawer that
starts closed. It overlays rather than compresses the content, is no wider than
82% of the viewport, closes when the backdrop or a destination is selected, and
retains the Library, Activity, and Admin group labels. Tables may scroll
horizontally where their essential columns cannot fit without loss of meaning.

## 6. Core journeys

### 6.1 Find and add a title

1. The user focuses the search field.
2. Search begins after a short debounce once at least two non-whitespace
   characters are present.
3. The interface shows a local loading treatment without clearing useful prior
   context unnecessarily.
4. Results identify title, year/date, media type, artwork, and a brief synopsis.
5. The user chooses a starting status and adds the title.
6. The card changes to a clear "In library" state and the library view reflects
   the normalized entry without a duplicate.
7. If the request fails, the result remains actionable and offers retry feedback.

The HTML prototype includes Dexter (TMDB TV ID 1405) as a remote-result fixture.
Typing at least two matching characters, such as `dex`, reveals its real TMDB
poster and normalized metadata in a clearly separated TMDB result. Add to
watchlist and Start watching demonstrate the transition to an In library state.

### 6.2 Browse and filter the library

1. Continue loads as the default surface.
2. The user selects a derived library view from the persistent navigation.
3. The user may combine the global title query with relevant column filters.
4. The user may activate one column sort per view; progress sorts by completion
   percentage rather than raw episode count.
5. The result count and empty state reflect the active filters.
6. Selecting a linked show title opens the show detail view.
7. Returning to the library preserves reasonable in-session filter context.

### 6.3 Update a movie

1. The movie detail shows its current status, note, metadata, and artwork.
2. The user changes status or edits the note.
3. Only the relevant control enters a pending state.
4. Success updates the visible entry immediately from the server response.
5. Failure preserves the prior confirmed value and shows a recoverable message.
6. Choosing Watched records completion explicitly; the product does not infer it.

### 6.4 Track a TV series

1. The series detail shows current status and derived watched/total progress.
2. The user selects a season.
3. Episodes appear with episode number, title when known, and watched state.
4. The user marks one episode watched or unwatched.
5. Only that episode control is disabled while its mutation is pending.
6. The progress label updates from the normalized server response.
7. The user may mark all episodes in the displayed season watched or unwatched
   in one contextual action.
8. The user may mark the entire show watched or unwatched after confirmation.
9. View full cast opens a dedicated cast grid with a return path to show detail.
10. Checking the final known episode does not automatically set the series status
    to Watched.

### 6.5 Remove a title

1. Remove is visually separated from routine edits.
2. Activating it opens an accessible confirmation dialog.
3. The dialog names the title and describes that its status, note, and recorded
   episode progress will be removed.
4. Cancel is safe, obvious, and restores focus to the trigger.
5. Confirm performs the deletion once and shows pending state.
6. Failure leaves the entry intact and gives a retry path.
7. Success returns to the library with a brief confirmation.

## 7. Screen specifications

### 7.1 Application shell

Required elements:

- `MEDIA/TRACKER` as the persistent product identity.
- A global search field in the top bar.
- A persistent navigation rail grouped under Library, Activity, and Admin.
- A contextual series panel on wide library screens; it may collapse on smaller
  screens.
- A restrained content width on desktop and edge-conscious padding on mobile.
- A consistent region for non-blocking success and error feedback.

The first useful content should appear quickly. Avoid a decorative landing page
between the user and the library.

### 7.2 Search surface

Controls:

- Search input with a persistent visible label or an accessible label plus clear
  contextual heading.
- Type selector: All, Movies, TV.
- Clear-search action when a query is present.

Behavior:

- Trim input for validation and searching.
- Do not query for fewer than two non-whitespace characters.
- Debounce typing to avoid a request per keystroke.
- Prevent stale slower responses from replacing newer search results.
- Announce result count or errors appropriately to assistive technology.

Result cards show:

- poster or deliberate fallback;
- title;
- year or best available date;
- Movie or TV label;
- short overview when space permits;
- starting-status selection and Add action; and
- an unmistakable In library state when already tracked.

### 7.3 Library surface

The global search field filters the active local view by title. Table controls
sit directly beside their column labels with no dedicated control row. Direct
sorts use an A/Z-plus-arrow or arrow-only toggle; filter-only columns use the
universal funnel and open a compact menu. No control words appear in the resting
header. An active filter or sort receives a visible active treatment.

The Compact Tracker navigation uses these derived library views:

- **Continue:** currently Watching series with at least one known, available
  unwatched episode.
- **Caught up:** currently Watching series that are still airing but have no
  known, available unwatched episode.
- **Watchlist:** starred titles the user wants to watch and has not started.
- **Finished:** ended series for which every known episode is watched.
- **Stopped:** a series the user started but explicitly does not plan to
  continue; it remains available as a Library View filter in All shows rather
  than receiving a separate sidebar page.
- **All shows:** every tracked television series, shown once with its derived
  library view, progress, next episode when available, last-updated date, genre,
  and TV provider or network. It does not expand into an episode-by-episode
  list. A small data-appropriate control sits directly beside each applicable
  column title; no control text is visible in the resting table header. Direct
  sort buttons reverse direction on each click. Funnel buttons open filter-only
  menus. Choosing a new column sort clears the previous sort while preserving
  filters applied to other columns.

The prototype seeds ten shows across multiple views, progress levels, update
windows, genres, and providers so combined filtering and sorting can be
evaluated with a representative table rather than a two-row edge case. Every
seeded show also appears in its derived Continue, Caught up, Watchlist, or
Finished view; view badges and heading totals remain synchronized.

Every show row displays poster artwork. TMDB poster artwork is stored with the
show metadata and reused across library views. If a new title has no usable
poster URL or an image fails to load, render the branded local fallback poster
instead of leaving a blank image area.

Library-view table columns are tailored to the decision being made:

- Continue: title, progress, genre, provider, last watched, next episode, and an
  unlabeled quick-action column.
- Caught up: title, progress, genre, provider, last updated, next episode, and an
  unlabeled quick-action column.
- Watchlist: title, genre, provider, last updated, status, and an unlabeled
  quick-action column.
- Finished: title, genre, provider, last updated, status, and an unlabeled
  quick-action column; progress is omitted because completion is already
  guaranteed by the view definition.
- All shows: title, library view, progress, genre, provider, next episode, last
  updated, and an unlabeled quick-action column.

Every visible Progress cell places a bold `Season {number}` and the regular-
weight watched/known episode count on the same row (for example,
`Season 2 (37 / 37)`). A thin proportional progress bar appears beneath those
labels in Continue, Caught up, and All shows.

Continue, Caught up, Watchlist, and Finished use the same icon-only column-menu
pattern as All shows. Each existing column receives only the filter and sort
choices appropriate to its data type; these controls do not add, remove, or
reorder the view's columns. Filters can be combined within a view, while only
one sort is active per view at a time.

When a column offers alphabetical sorting and no filtering, use the universal
compact A/Z arrow button instead of a dropdown or funnel icon. Title columns use
`AZ⇅` before a sort is applied, `AZ↓` for ascending order, and `AZ↑` for
descending order. Each click reverses the direction. Columns that still require
multiple non-alphabetical choices may retain the compact dropdown menu.

The All shows Library View heading uses only a universal funnel button. It opens
the Continue, Caught up, Watchlist, Finished, and Stopped filters; Library View
does not provide alphabetical sorting.

Progress columns use the same direct-toggle behavior rather than a dropdown. The
compact `⇅` control becomes `↓` for least-to-most and `↑` for most-to-least;
each subsequent click reverses the direction.

Next Episode columns follow the same direct-toggle pattern: `⇅` before sorting,
then `↓` or `↑` as each click reverses the direction, with no dropdown menu.

Last Updated and Last Watched columns use the same direct-toggle control. They
start at `⇅`, show `↓` for recent-to-old, and `↑` for old-to-recent, without a
dropdown menu.

Genre columns use the universal funnel icon and provide filter choices only;
alphabetical genre sorting is not included.

Provider columns also use the universal funnel icon and provide provider filter
choices only, without alphabetical sorting.

### Show detail prototype

Television show titles are links to a dedicated detail experience. The concept
uses the selected **Balanced detail** direction: contextual backdrop and summary,
a single-row strip of four featured cast members with a View full cast action,
an episode checklist, and a persistent progress summary. The cast row scrolls
horizontally rather than wrapping at narrow widths. View full cast opens a
dedicated cast-only page with a responsive grid and a return link to the show. The
page supports marking one episode, toggling the full displayed season, toggling
the entire show after confirmation, reversing an episode check, and updating
progress without leaving the page.

### Quick watched-action prototype

`watch-action-concepts.html` compares three ways to record an episode without
leaving Continue or Watchlist:

1. **Direct trailing action:** an explicit Mark watched button in Continue and
   Start + mark watched in Watchlist.
2. **Inline checkbox:** compact and immediately reversible, with less descriptive
   action language.
3. **Quick-action menu (selected):** visually quiet and extensible, with
   context-specific watched, details, and status/removal actions.

From Watchlist, marking the first episode watched explicitly changes the
canonical status to Watching. The show then derives into Continue when another
episode is available, or Caught up when it is still airing without one.

The selected quick-action menu appears in a narrow unlabeled final column on all
five library views. Continue offers Mark next episode watched, details, and
status. Watchlist offers Start + mark S1 E1 watched, details, and removal.
Caught up and Finished offer Mark latest episode unwatched, details, and status.
All shows uses the menu appropriate to each row's derived view. Only one row
menu opens at a time.

Continue and Caught up menus also offer **Stop watching**. Activating it
removes the show from the active watching view, retains it in All shows with a
Stopped badge, and makes it available through the Stopped Library View filter.

Under Activity, **Upcoming** lists announced future episodes across every series
the user is currently Watching. Series without an announced episode date remain
visible with an explicit unavailable-date state.

An **Admin** sidebar group appears below Activity. Its **Settings** view provides
CSV import and export actions for complete library data. The file contains one
metadata record per show and one state record per known episode. Each episode
record carries its own watched value, so non-sequential histories such as
episodes 1, 3, and 5 remain intact after a round trip. Import remains a deliberate
file-selection action and reports success or validation failure; export downloads
the complete tracked-show collection and episode state.

Where the next unwatched episode has a known air date, show it directly beneath
the episode title. Use `Expected {date}` for a future air date and
`Released {date}` for a past air date. Omit the date line when it is unknown.

Library cards prioritize:

1. Artwork and title recognition.
2. Status badge.
3. Media type and date.
4. TV progress when known.
5. A short note preview only when it helps and space allows.

Cards must be operable by keyboard and have one clear primary navigation target.
Nested controls must not create conflicting click behavior.

### 7.4 Movie detail

Show:

- poster with fallback and optional backdrop treatment;
- title, original title when meaningfully different, release date, and runtime;
- full synopsis or an explicit "No synopsis available" state;
- current status control;
- note field with character guidance and 2,000-character limit;
- save feedback; and
- separated destructive removal action.

The status control should communicate its current value without relying on color
alone.

### 7.5 Series detail

Show all relevant movie-detail elements plus:

- a **Refresh from TMDB** action for explicitly updating show metadata, cast,
  providers, and episode availability while retaining personal progress,
  status, and notes;

- backdrop and poster artwork with fallbacks;
- first-air date;
- genre and provider/network;
- season and episode totals when known;
- progress label in the form `12 of 24 episodes watched` when a known total exists;
- a visible cast treatment with performer name, character, and portrait fallback;
- a non-interactive Where to watch panel showing region, provider, and access
  type, with required JustWatch attribution and no Watch now link;
- a season selector; and
- the episode list for the selected season;
- a direct Mark next watched action when an available next episode exists; and
- a contextual season action: Mark season watched when any episode is incomplete,
  and Mark season unwatched when every episode is watched;
- a confirmed show-level bulk action labeled Mark entire show as watched,
  which changes to Mark entire show as unwatched when the show is complete;

If totals or episode lists are unavailable, say so directly. Do not display a
misleading zero or fabricate episode records.

Balanced detail is the selected show-detail direction.

### 7.6 Episode list

Each row includes:

- episode number;
- episode title when available;
- air date and runtime when available;
- watched/unwatched control; and
- a row-scoped pending or error state.

Season 0 is valid for specials. Episode numbers begin at 1. Marking an already
watched episode watched again must not create visual duplication or inflate
progress. A season-level action must be explicit, idempotent, and must update the
same episode records as individual controls rather than maintaining a second
season-completion flag.

### 7.7 Confirmation dialog

The removal dialog must:

- use native `<dialog>` where practical, or implement correct modal semantics;
- move focus into the dialog when opened;
- trap focus while modal;
- close with Escape as a cancel action;
- restore focus to the triggering control;
- name the title being removed;
- label the destructive button clearly, such as `Remove The Matrix`; and
- prevent repeated submissions while deletion is pending.

## 8. Interface states

Every data-driven region must define the following states.

| State            | Design response                                                          |
| ---------------- | ------------------------------------------------------------------------ |
| Initial          | Explain the next useful action without showing a false empty result.     |
| Loading          | Preserve layout where possible; indicate what is loading.                |
| Empty            | Explain whether the library is empty or filters produced no matches.     |
| Success          | Show normalized current data and clear action feedback.                  |
| Error            | Use plain language, preserve user input, and provide retry where useful. |
| Partial metadata | Show available fields; use explicit, quiet fallbacks.                    |
| Mutation pending | Disable only the control responsible for that request.                   |

Suggested empty-state distinctions:

- New library: "Your library is empty. Search for a movie or series to add it."
- Filtered library: "No titles match these filters." with a Clear filters action.
- Search query: "No movies or series found for ‘…’."
- Missing episodes: "Episode information is not available for this season."

Do not show raw server errors. User-facing messages should explain the failed
action, such as "Couldn’t update the episode. Try again."

## 9. Visual direction

### Selected direction: Compact Tracker

The approved interface direction is **Compact Tracker**. Use a persistent,
information-dense navigation rail, a compact table/list as the primary library
surface, and a contextual detail panel on wide screens. Prioritize fast scanning,
keyboard-friendly controls, explicit counts, and direct next-episode actions over
large artwork-led grids. Poster art remains a recognition aid at thumbnail scale.

On small screens, convert the navigation rail to a closed-by-default off-canvas
drawer, hide the secondary library detail panel, and retain the table title plus
the most important view-specific metadata. Compact Tracker is the selected
library direction and Balanced detail is the selected show-detail direction.

### 9.1 Character

The visual system should feel cinematic but restrained: dark neutral surfaces,
high-contrast text, artwork-led cards, and a single warm accent for primary
actions. Avoid mimicking a streaming service's branding or making the library
feel like an advertising catalog.

### 9.2 Color roles

Define semantic tokens rather than hard-coded component colors:

```css
--color-canvas
--color-surface
--color-surface-raised
--color-text
--color-text-muted
--color-border
--color-accent
--color-accent-contrast
--color-success
--color-warning
--color-danger
--color-focus
```

Status badges may use distinct treatments, but each must include its text label.
Color cannot be the sole distinction.

### 9.3 Typography

- Use a highly readable system-oriented sans-serif stack.
- Reserve the strongest display weight for the product and title headings.
- Keep metadata compact but no smaller than a comfortably readable mobile size.
- Use line clamping only on cards; detail views should make the full synopsis
  available.

### 9.4 Layout and spacing

- Use an 8px-derived spacing scale.
- Library tables should preserve the title column, permit horizontal scrolling
  when necessary, and hide lower-priority metadata at narrow breakpoints.
- Keep the four featured show-detail cast cards in one horizontally scrollable
  row. Let the dedicated full-cast grid auto-fit on wide screens and reduce to
  two columns on phones.
- Maintain stable poster aspect ratios to prevent layout shift.
- Keep controls at least 44 by 44 CSS pixels where touch interaction is likely.
- Put the most frequent actions within easy reach on mobile.

### 9.5 Image fallback

When artwork is missing or fails to load:

- preserve the poster's aspect ratio;
- show a neutral branded placeholder rather than a broken-image icon;
- include the title or a media glyph where it remains legible; and
- ensure the title is still present as real text outside the image.

## 10. Responsive behavior

### Small screens

- Stack search and filter controls cleanly.
- Convert the sidebar into a closed-by-default off-canvas drawer with a chevron
  control, backdrop, selected-destination, and Escape-key dismissal.
- Keep the closed drawer out of sequential keyboard navigation and expose its
  expanded state through the menu button.
- Keep the title and library-view columns visible in All shows; allow the user
  to scroll for additional metadata when necessary.
- Keep primary status and episode actions reachable without horizontal scrolling.
- Present details as a single reading column.
- Avoid sticky UI that consumes excessive vertical space.

### Medium and large screens

- Use dense tables with recognizable poster thumbnails.
- Use two- or three-column show-detail layouts where the selected concept calls
  for summary, episodes, and cast to coexist.
- Keep synopsis line length readable.
- Filters may share one horizontal bar if labels and touch targets remain clear.

No primary workflow may depend on hover.

## 11. Accessibility requirements

- Use semantic headings and landmarks.
- Provide a visible focus indicator with sufficient contrast.
- Ensure all actions are keyboard operable in a logical order.
- Associate every input with a label and every error with its field or action.
- Announce asynchronous search results and important mutation outcomes without
  unexpectedly moving focus.
- Give images meaningful alternative text when informative and empty alternative
  text when decorative.
- Meet WCAG AA contrast for normal text, controls, focus indicators, and status
  communication.
- Respect reduced-motion preferences.
- Do not encode media type, status, progress, or errors by color alone.
- Keep confirmation behavior consistent between keyboard, pointer, and touch.

## 12. Content guidelines

Use direct, specific language:

| Context                  | Preferred wording                        |
| ------------------------ | ---------------------------------------- |
| Add action               | `Add to library`                         |
| Existing result          | `In library`                             |
| Episode action           | `Mark watched` / `Mark unwatched`        |
| Destructive trigger      | `Remove from library`                    |
| Destructive confirmation | `Remove {title}`                         |
| Retryable failure        | `Couldn’t save your changes. Try again.` |

Avoid language implying certainty the product does not have. For example, show
"Total episode count unavailable" instead of treating an unknown total as zero.

## 13. Hermes interaction design

Hermes should follow the same intent model as the visual application:

- Searching and listing are safe read operations.
- Adding requires the title identity and an explicit starting status.
- Updating status or note must name the targeted library entry.
- Episode progress requires a specific series, season, episode, and watched state.
- Removal requires explicit confirmation and must not be inferred from vague
  language such as "clean this up."
- Mutation responses should summarize the new normalized state so the user can
  verify what changed.

Hermes must never suggest that finishing all known episodes automatically marked
a series Watched unless the user explicitly performed that separate action.

## 14. Design acceptance criteria

### Search and library

- Movie, TV, and combined searches are understandable and distinguish media type.
- Queries shorter than two non-whitespace characters do not trigger searches.
- Search and library clearly distinguish loading, empty, error, and success.
- Adding the same title again does not produce a duplicate card.
- Filters can be combined and cleared without ambiguity.
- Icon-only column controls reveal full labels when opened, expose their active
  state, preserve filters when sorting, and allow one active sort per view.
- Missing artwork has a stable, intentional fallback.
- Continue, Caught up, Watchlist, Finished, and All shows contain the correct
  derived entries and synchronized counts.

### Detail and progress

- Movie and TV details present available metadata without fabricated values.
- Status and notes can be updated with scoped pending and recoverable errors.
- Linked show titles open a dedicated show-detail page with summary, cast,
  season navigation, and episodes.
- A season can be selected, an episode toggled, and the displayed season marked
  watched or unwatched by keyboard, pointer, or touch.
- The entire show can be marked watched or unwatched through a contextual,
  confirmed bulk action, with every progress surface updating together.
- View full cast opens a dedicated cast-only page whose return control restores
  the originating show detail.
- Where to watch identifies the selected region, provider, and access type,
  includes JustWatch attribution, and does not behave like a playback link.
- Progress accurately reflects stored watched episodes and known totals.
- Progress cells display bold season, regular-weight parenthesized episode count,
  and a proportional bar on every view containing Progress.
- Series completion never changes status implicitly.

### Destructive behavior

- Removal is visually separated from routine actions.
- The dialog names the title and defaults focus to a safe interaction.
- Cancel preserves the entry and restores focus.
- Failed removal keeps the entry visible and offers recovery.

### Accessibility and responsiveness

- Core flows work at phone and desktop widths; dense library tables may scroll
  horizontally while primary title/navigation controls remain reachable.
- At phone widths, grouped navigation opens as a closed-by-default drawer and
  can be dismissed by its backdrop, a selected destination, or Escape.
- Controls have visible labels, focus states, and suitable touch targets.
- Status, media type, progress, and error information do not rely on color alone.
- Reduced motion and assistive announcements are supported.

## 15. Deferred product decisions

- A separate Owned status.
- Ratings and reviews.
- NAS, media-server, or download automation.
- Shared or family profiles.
- Recommendations and notifications.
