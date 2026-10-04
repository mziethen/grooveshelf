# GrooveShelf — Requirements and development plan

Updated: October 4, 2026. Derived from the completed requirements questionnaire. The original German answers are retained locally as source material.

This document specifies desired behavior. Manual copy management, collection browsing and search have been merged. Discogs metadata import, covers, source attribution and protected manual edits have also been merged. Station sessions, tag associations, history corrections and favorites have also been merged. Cover selection and manual Discogs collection synchronization have been merged. Personal ratings, condition fields and a separate wishlist are implemented. Rapid capture, identifier lookup, labels, portable archives, storage locations, statistics, discovery, metadata settings, three appearance themes, and reviewed bulk editing of personal fields and QR record links are also implemented. Physical PN532 integration remains open. Stable IDs are used in GitHub issues; [the mapping](docs/requirement-issues.json) preserves traceability. GitHub issues are the source of current work status.

## Product goal

A private, self-hosted web application archives physical vinyl copies, retrieves album information and supports NFC listening history, with physical reader integration pending. Initial collection: approximately 300 records, growing by about three per month. Used by a household on Mac, phones and tablets. Design: minimal, modern, calm and mobile first. Capture primarily takes place at a desk.

Project name: **GrooveShelf**. Public repository: [mziethen/grooveshelf](https://github.com/mziethen/grooveshelf).

## Technical constraints

- Public GitHub project under the MIT license.
- Python and FastAPI backend, with a separate frontend.
- Extensible interfaces for metadata providers, imports and exports.
- Raspberry Pi 5 deployment through Docker Compose with ARM64 support.
- Persistent data and local covers survive container restarts and upgrades.
- Low maintenance and no mandatory recurring costs.
- Initial deployment is private on the home network without user accounts.
- Offline operation is not required. Devices access one shared server-side collection.
- The initial implementation uses browser-native JavaScript modules and SQLite; see docs/architecture.md. “Docker stack” currently means Compose deployment; Docker Swarm has not been requested explicitly.

## Domain model

Albums and physical copies are separate entities. Multiple copies may refer to one album. Exact releases and pressings are optional and can be added later. Double albums use one inventory number per complete set. The same approach is provisionally proposed for box sets.

Each copy has an immutable internal ID and a manually entered unique inventory number from `LP-00001` to `LP-99999`. Inventory numbers may change and may be reused after deletion. NFC associations should therefore reference the internal ID. Singles, EPs and other vinyl formats are supported; shellac records are not required.

## Milestones and acceptance criteria

M1 prioritizes adding records, viewing details and browsing the collection. Metadata retrieval is a fundamental product requirement, but field availability depends on providers. M2 and M3 ordering is provisional. Backup and restoration must be available before production use regardless of milestone assignment.

### M1 — First usable version

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| [CORE-01](https://github.com/mziethen/grooveshelf/issues/1) | Create and edit physical copies | Enter inventory numbers manually; validate format and uniqueness; capture artist, album title and format; allow multiple copies of the same album. |
| [CORE-02](https://github.com/mziethen/grooveshelf/issues/2) | Delete copies and change inventory numbers | Allow editing and deletion; allow reuse of released inventory numbers; leave other copies unchanged. |
| [CORE-03](https://github.com/mziethen/grooveshelf/issues/3) | Browse the collection | Switch between a cover grid and table; both open the same detail view; support phones, tablets and Mac browsers. |
| [CORE-04](https://github.com/mziethen/grooveshelf/issues/4) | View album details | Show cover, artist, album title and tracks immediately; handle missing information clearly; display side positions such as A1/B1 when available. |
| [META-01](https://github.com/mziethen/grooveshelf/issues/5) | Search Discogs and import metadata | Search by artist and album; initially favor master entries; require confirmation before importing a suggestion; allow manual entry when results are missing or incorrect. |
| [META-02](https://github.com/mziethen/grooveshelf/issues/6) | Store basic metadata and cover art | Import cover art, tracks, year, genre and other available basic fields; store covers locally where source terms permit; display source attribution and links. |
| [META-03](https://github.com/mziethen/grooveshelf/issues/7) | Protect manual corrections | Do not silently overwrite manually edited fields during subsequent imports or refreshes. |
| [OPS-01](https://github.com/mziethen/grooveshelf/issues/8) | Separate services and deploy with Docker Compose | Separate frontend and FastAPI backend; document startup on Raspberry Pi 5; persist data; configure deployment without source changes. |
| [OSS-01](https://github.com/mziethen/grooveshelf/issues/9) | Set up GitHub project tracking | Provide a repository, README, installation documentation and MIT license; connect requirements to issues and milestones. |

### M2 — NFC and listening history

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| [NFC-01](https://github.com/mziethen/grooveshelf/issues/10) | Integrate the PN532 reader | Read NTAG213 tags on Raspberry Pi through PN532; assign unknown tags to copies; select the hardware connection before implementation. |
| [NFC-02](https://github.com/mziethen/grooveshelf/issues/11) | Replace NFC tags | Assign a replacement tag to an existing copy; preserve collection data and history; remove the old tag association. |
| [NFC-03](https://github.com/mziethen/grooveshelf/issues/12) | Open details after an NFC scan | Show the associated copy on the screen attached to the Raspberry Pi; decide how to control browser navigation. A continuously open kiosk browser is a proposed approach. |
| [PLAY-01](https://github.com/mziethen/grooveshelf/issues/13) | Record a play after a ten-minute delay | Start a ten-minute process after a valid scan; create at most one play event per process; define repeated scans, cancellation and restart behavior before implementation. |
| [PLAY-02](https://github.com/mziethen/grooveshelf/issues/14) | Show listening history and play counts | Display play events, count and last played time; keep counters and history consistent. |
| [PLAY-03](https://github.com/mziethen/grooveshelf/issues/15) | Mark favorite records | Add, remove and display favorite markers. |

### M3 — Collection management and capture

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| [SEARCH-01](https://github.com/mziethen/grooveshelf/issues/16) | Search the collection | Find artists, album titles and track titles and open the corresponding copies. |
| [PERSONAL-01](https://github.com/mziethen/grooveshelf/issues/17) | Manage personal collection fields | Capture and edit record condition, sleeve condition, notes and ratings; select a rating scale. |
| [WISH-01](https://github.com/mziethen/grooveshelf/issues/18) | Manage a wishlist | Manage desired albums separately; do not require physical inventory numbers for wishlist entries. |
| [CAPTURE-01](https://github.com/mziethen/grooveshelf/issues/19) | Provide a rapid entry workflow | Add multiple records consecutively with minimal repeated input. |
| [CAPTURE-02](https://github.com/mziethen/grooveshelf/issues/20) | Warn about possible duplicates | Show matching albums already in the collection; still allow an additional physical copy. |
| [CAPTURE-03](https://github.com/mziethen/grooveshelf/issues/21) | Identify records by barcode or catalog number | Identify records using a barcode or catalog number; allow manual search when no match is found. |
| [CAPTURE-04](https://github.com/mziethen/grooveshelf/issues/22) | Identify records from cover photos | Produce suggestions that users can confirm; assess feasibility and a free data source before implementation. |
| [COVER-01](https://github.com/mziethen/grooveshelf/issues/56) | Select a Discogs cover | Preview available images, choose a per-copy cover, retain the preference across refreshes and report missing selections. |
| [SYNC-01](https://github.com/mziethen/grooveshelf/issues/55) | Synchronize with Discogs in both directions | Preview collection additions, import or match remote instances, explicitly export exact-release local copies, prevent duplicate retries and retain local identifiers and history. |
| [IMPORT-01](https://github.com/mziethen/grooveshelf/issues/23) | Import a Discogs collection | Import a collection with a preview; define repeat-import behavior and assignment of personal LP numbers; do not silently overwrite existing data. Choose API or CSV import. |
| [EXPORT-01](https://github.com/mziethen/grooveshelf/issues/24) | Export the collection as CSV | Export inventory numbers and agreed collection fields; provide an interface for additional export formats. |
| [META-04](https://github.com/mziethen/grooveshelf/issues/25) | Configure metadata refresh and confirmation | Allow automatic refresh to be enabled or disabled; allow manual refresh; make initial import confirmation configurable; protect manual corrections. |
| [META-05](https://github.com/mziethen/grooveshelf/issues/26) | Resolve conflicts and support additional sources | Expose conflicting information and request a decision; allow additional sources through defined interfaces. |
| [META-06](https://github.com/mziethen/grooveshelf/issues/27) | Retrieve album descriptions and additional information | Import descriptions, reviews, labels and credits where supported by the source and its terms; tolerate missing fields. |
| [OPS-02](https://github.com/mziethen/grooveshelf/issues/28) | Back up and restore application data | Back up and restore the database, covers and required configuration; select procedure and destination. Required before production use. |
| [UI-01](https://github.com/mziethen/grooveshelf/issues/29) | Support content languages | Support German and English content; clarify interface language and translation scope. |

### M4 — Optional future features

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| [LATER-01](https://github.com/mziethen/grooveshelf/issues/30) | Track exact pressings and distinguish original and pressing years | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-02](https://github.com/mziethen/grooveshelf/issues/31) | Add track durations, songwriters, producers and detailed credits | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-03](https://github.com/mziethen/grooveshelf/issues/32) | Upload personal cover, back cover, label and matrix photos | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-04](https://github.com/mziethen/grooveshelf/issues/33) | Track storage locations | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-05](https://github.com/mziethen/grooveshelf/issues/34) | Add QR codes as an alternative identifier | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-06](https://github.com/mziethen/grooveshelf/issues/35) | Display estimated market values | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-07](https://github.com/mziethen/grooveshelf/issues/36) | Support bulk editing | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-08](https://github.com/mziethen/grooveshelf/issues/37) | Link to streaming services | Implemented: explicit Spotify and YouTube album searches; see [streaming links](docs/streaming.md). |
| [LATER-09](https://github.com/mziethen/grooveshelf/issues/38) | Add authentication and multiple user accounts | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-10](https://github.com/mziethen/grooveshelf/issues/39) | Support optional paid metadata providers | Define scope and acceptance criteria before implementation; implement and document the feature. |
| [LATER-11](https://github.com/mziethen/grooveshelf/issues/40) | Add further export formats | Implemented: versioned JSON and printable standalone HTML catalog; see [export formats](docs/exports.md). |
| [LATER-12](https://github.com/mziethen/grooveshelf/issues/41) | Write NFC tags if required by the selected workflow | Define scope and acceptance criteria before implementation; implement and document the feature. |

## Accepted additions

The following additions were accepted after reviewing the initial plan. They extend existing requirements and share their implementations where noted in the linked issues. All remain unimplemented. Portable export and restore is required before production use.

| ID | Feature | Milestone | Acceptance criteria |
| --- | --- | --- | --- |
| [PLAY-04](https://github.com/mziethen/grooveshelf/issues/42) | Show and cancel pending listening sessions | M2 | Show the scanned record and a countdown until the ten-minute listening threshold is reached. Allow cancellation before a play is recorded; a canceled session must not increase the play count. Show completion or cancellation clearly and keep the display consistent with server state. Define behavior for repeated scans, another record being scanned, and reconnecting or restarting before implementation. |
| [PLAY-05](https://github.com/mziethen/grooveshelf/issues/43) | Correct listening history manually | M2 | Add a missed play with a selected physical copy and listening timestamp. Edit an incorrect listening timestamp and remove an erroneous play with confirmation. Recalculate play counts and last-played values consistently after corrections. Distinguish manually entered plays from NFC-generated plays. |
| [NFC-04](https://github.com/mziethen/grooveshelf/issues/44) | Provide guided tag assignment and reader feedback | M2 | When an unknown tag is scanned, offer a record selector and confirm the selected association. Show clear visual feedback for successful reads, unknown tags, assignment success, reader disconnection and detectable read errors. Prevent silently assigning a tag already linked to another copy; explicitly resolve reassignment. Allow retrying a failed assignment without creating duplicate associations. |
| [EXPORT-02](https://github.com/mziethen/grooveshelf/issues/45) | Export and restore a complete portable collection archive | M3 | Export records, albums, metadata, locally stored covers, NFC associations, listening history, notes, ratings, favorites and wishlist entries when supported. Include an archive format version and preserve internal IDs and relationships. Restore the archive to a fresh compatible installation on another Raspberry Pi and verify that collection data and covers remain usable. Validate the archive and report incompatible or corrupt input before modifying the collection. Exclude access tokens and secrets; document archive contents and supported restore behavior. |
| [CAPTURE-05](https://github.com/mziethen/grooveshelf/issues/46) | Find incomplete collection entries | M3 | Filter records missing cover art, track lists or NFC associations. Combine missing-field filters and display matching counts. Open an entry directly for editing or tag assignment. Distinguish missing information from fields deliberately marked as unavailable when supported. |
| [DISCOVER-01](https://github.com/mziethen/grooveshelf/issues/47) | Suggest what to listen to next | M3 | Offer a randomly selected record from the owned collection with cover, artist and album title. Allow choosing among the full collection, never-played records, least-played records and records not played recently. Offer another suggestion and open its details without recording a play. Handle an empty collection or empty candidate set clearly. Use local collection and listening data without requiring paid services; define recency and frequency rules before implementation. |
| [STATS-01](https://github.com/mziethen/grooveshelf/issues/48) | Display simple listening statistics | M3 | Display most-played albums, play totals by month and records never played. Apply a selectable date range to time-based statistics and define the local timezone used for month boundaries. Reflect manual history corrections in statistics. Define album-versus-copy aggregation and show the chosen interpretation in the interface. Provide useful empty states when listening history is unavailable. |
| [LABEL-01](https://github.com/mziethen/grooveshelf/issues/49) | Print inventory labels | M4 | Select records and generate a printable document containing their inventory numbers. Allow configuring label dimensions and page layout for the chosen label stock. Provide a preview and instructions for printing at actual size. Allow an optional QR code once LATER-05 is available; plain inventory labels work independently. |
| [ARCH-01](https://github.com/mziethen/grooveshelf/issues/50) | Prepare the data model for multiple listening stations | M2 | Represent the current Raspberry Pi reader as one station with a stable identifier. Associate scan events and pending listening sessions with their source station. Keep inventory numbers and physical-copy identities independent of stations. Define repeated-scan and deduplication boundaries with PLAY-01 so future stations do not share timers accidentally. Document extension points for additional stations; initially implement and operate only one Raspberry Pi station. |

## Out of current scope

Loan management, mirroring physical shelf order, public collection sharing and a sales list are not currently requested. A wishlist is requested. No personal fields need special hiding for a future sharing feature, but the initial collection remains private.

## Open decisions

1. GitHub repository created: `mziethen/grooveshelf`. Project name and MIT license are confirmed.
2. Select PN532 connection (I²C, SPI or UART), browser navigation on the Pi screen and tag UID versus written payload. Tags are attached to the back of protective sleeves, alongside readable inventory labels.
3. Define repeat-scan behavior, switching records within ten minutes, restart recovery and manual corrections. Decide whether ratings and play counts belong to albums, copies or both.
4. Select frontend and database for ARM64 operation, simplicity and extensibility.
5. Verify Discogs access, terms, cover usage and actual field availability. Discogs is the preferred initial provider; paid providers are optional future work.
6. Initial Discogs import uses the authenticated API, allocates the first unused LP number and offers explicit instance matching. Personal-field sync and advanced conflict resolutions remain open.
7. Choose backup destination, frequency and restore procedure.
8. Clarify default interface language, rating scale and the box-set model. English project documentation does not automatically change the requested German/English application content.
9. Prioritize M2 and M3. Do not deploy real collection data without a backup procedure.

## GitHub workflow

Create one issue per stable requirement ID, for example `[CORE-01] Create and edit physical copies`. Include the goal, requirement reference, acceptance criteria, dependencies and open decisions.

Suggested labels: `feature`, `bug`, `backend`, `frontend`, `nfc`, `metadata`, `import-export`, `operations`, `needs-decision`.

Workflow: Backlog → Ready → In progress → Review → Done. Complete an issue only once its acceptance criteria are verified. Pull requests reference their issues. All 50 requirements have corresponding GitHub issues, assigned to four milestones. See [issues](https://github.com/mziethen/grooveshelf/issues) and [milestones](https://github.com/mziethen/grooveshelf/milestones). The proposed status workflow is guidance; no GitHub Projects board has been created.

## Discogs implementation decisions

The initial source adapter uses master entries and, when available, label names and notes from their main release. Provider content is refreshed on access after six hours; if unavailable, expired provider fields are hidden while manual corrections remain visible. This does not yet implement user-configurable refresh settings. See [integration details](docs/discogs.md).

## Listening implementation decisions

The user confirmed a ten-minute session, suppression of repeated scans of the current record, and cancellation when a different record is scanned. Hardware is not connected yet; its interface and exact module remain unknown. The initial station is `pi-main`; the Pi browser follows scans in station mode. End a completed session before replaying the same record. Unknown tags do not cancel an existing session. See [listening and hardware status](docs/listening.md).

## Discogs collection sync decisions

The user requested bidirectional collection synchronization. The initial implementation previews per-copy imports, explicit matches and local additions to Discogs using exact release IDs. Local identifiers, metadata corrections, NFC tags and history are retained. Missing copies are reported without automatic deletion; uncertain exports block retries until explicitly reconciled. See [scope and usage](docs/discogs-sync.md).

## Personal collection field decisions

Personal ratings use whole stars from 1 to 5; null means not rated. Record and sleeve condition use M, NM, VG+, VG, G+, G, F and P; sleeves also support Generic and No Cover. Null means not graded. The [Discogs grading guide](https://support.discogs.com/hc/en-us/articles/360001566193-How-To-Grade-Items) is linked from the editor. Ratings, conditions and notes belong to the physical copy and remain local during collection sync. A separate editor remains usable during metadata outages.

## Wishlist implementation decisions

Wishes contain personal artist/title/notes and optional Discogs master references, without physical inventory numbers. Reference selection retains the user's wording. Purchasing a wish opens the normal record editor; a successful save atomically creates the copy and marks the wish acquired. Failed or canceled saves retain the wish, and repeated acquisition cannot create duplicate copies. See [wishlist usage](docs/wishlist.md).

### Rapid capture decisions

CAPTURE-01 and CAPTURE-02 use consecutive saving with free, unreserved LP-number suggestions. Each new draft retains format and optionally artist; all album and personal-copy fields reset. Duplicate warnings compare local Discogs references or normalized artist/title, show existing LP numbers and require confirmation when adding another matching physical copy. Existing-copy edits remain available, and an unavailable advisory check does not prevent saving. See [rapid entry usage](docs/capture.md).

### Collection tools decisions

EXPORT-01 exports one row per physical copy with personal fields, listening totals, NFC UID, JSON tracks and Discogs references. CSV uses UTF-8 and spreadsheet formula protection; it is not a portable archive. CAPTURE-05 combines missing-cover, missing-tracks and missing-NFC filters with AND semantics within the current search, displaying matching counts. Unavailable provider data counts as missing; no deliberate-unavailability markers are currently supported. See [collection tools](docs/collection-tools.md).

### Listening suggestion decisions

DISCOVER-01 selects physical copies uniformly within the selected group. Least-played means the lowest lifetime recorded play count; not-recently-played means at least 30 elapsed days since the latest play and includes never-played copies. Another suggestion avoids the preceding copy when alternatives exist. Suggestions and details navigation do not create plays. See [listening suggestions](docs/discovery.md).

### Listening statistics decisions

STATS-01 ranks physical copies separately. Date filters are inclusive Europe/Berlin calendar dates and month grouping follows that timezone including DST. Never-played uses lifetime history. Removed-copy events remain in monthly totals with an explicit count but not in current-copy rankings. Statistics reflect current persisted event corrections. See [listening statistics](docs/statistics.md).

### Identifier lookup decisions

CAPTURE-03 searches Discogs releases by typed barcode or catalog number. Barcode normalization preserves leading zeros; USB keyboard scanners may trigger lookup with Enter. Users confirm release details before saving; manual and artist/title lookup remain available. Camera scanning and persisting identifier text are outside this feature. See [identifier lookup](docs/identifier-search.md).

### Inventory label decisions

LABEL-01 generates standalone printable HTML using browser printing, with A4 and Letter page sizes, configurable millimeter dimensions, columns, symmetric margins, gaps and skipped first-sheet positions. Plain labels contain LP numbers; optional QR labels add links based on stable copy IDs. Defaults are editable starting dimensions; users should test alignment at actual size on plain paper. LATER-05 supplies optional QR links with configurable collection addresses and print-size checks. See [inventory labels](docs/labels.md).

### Metadata settings decisions

META-04 provides persistent installation settings for automatic refresh of existing records and confirmation before importing details into a draft. Both default to enabled. Disabled refresh hides expired provider content and leaves explicit manual refresh available. Disabled confirmation fills a selected result into the draft without saving it. Manual corrections remain protected; provider expiry remains six hours. See [metadata settings](docs/settings.md).

### Storage location decisions

LATER-04 stores an optional free-text location of up to 200 characters on each physical copy. Locations are displayed, searchable and included in CSV. Personal editing works independently of metadata availability; legacy updates that omit location preserve it. Rapid capture clears the next draft location. No hierarchy, shelf ordering or automatic assignment is introduced. See [storage locations](docs/locations.md).

### Portable archive and backup decisions

EXPORT-02 and OPS-02 use a versioned ZIP containing a SQLite snapshot and local cover files with checksums. Live browser export and offline export/verification are available. Restore validates input and publishes only a new data directory; it never replaces or merges an existing collection. Pending sessions are canceled and readers reset on transfer. Environment files and secrets are excluded; credentials and hardware setup must be configured separately. Backup destination is a user-chosen file, copied off the Pi; frequency is manual after significant changes and before upgrades. See [portable archives](docs/archives.md).

LATER-05 provides locally generated QR links in copy details and optional printable labels. Links use stable copy IDs and retain their identity after renumbering. Opening a code does not start listening or change NFC assignments. See [QR record links](docs/qr-codes.md).
