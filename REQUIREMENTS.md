# GrooveShelf — Requirements and development plan

Updated: October 3, 2026. Derived from the completed requirements questionnaire. The original German answers are retained locally as source material.

This document specifies desired behavior, not completed implementation. All requirements are open. Stable IDs are used in GitHub issues.

## Product goal

A private, self-hosted web application archives physical vinyl copies, retrieves album information and later supports NFC listening history. Initial collection: approximately 300 records, growing by about three per month. Used by a household on Mac, phones and tablets. Design: minimal, modern, calm and mobile first. Capture primarily takes place at a desk.

Project name: **GrooveShelf**. Intended repository name: `grooveshelf`; availability has not yet been checked.

## Technical constraints

- Public GitHub project under the MIT license.
- Python and FastAPI backend, with a separate frontend.
- Extensible interfaces for metadata providers, imports and exports.
- Raspberry Pi 5 deployment through Docker Compose with ARM64 support.
- Persistent data and local covers survive container restarts and upgrades.
- Low maintenance and no mandatory recurring costs.
- Initial deployment is private on the home network without user accounts.
- Offline operation is not required. Devices access one shared server-side collection.
- Frontend framework and database remain undecided. “Docker stack” currently means Compose deployment; Docker Swarm has not been requested explicitly.

## Domain model

Albums and physical copies are separate entities. Multiple copies may refer to one album. Exact releases and pressings are optional and can be added later. Double albums use one inventory number per complete set. The same approach is provisionally proposed for box sets.

Each copy has an immutable internal ID and a manually entered unique inventory number from `LP-00001` to `LP-99999`. Inventory numbers may change and may be reused after deletion. NFC associations should therefore reference the internal ID. Singles, EPs and other vinyl formats are supported; shellac records are not required.

## Milestones and acceptance criteria

M1 prioritizes adding records, viewing details and browsing the collection. Metadata retrieval is a fundamental product requirement, but field availability depends on providers. M2 and M3 ordering is provisional. Backup and restoration must be available before production use regardless of milestone assignment.

### M1 — First usable version

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| CORE-01 | Create and edit physical copies | Enter inventory numbers manually; validate format and uniqueness; capture artist, album title and format; allow multiple copies of the same album. |
| CORE-02 | Delete copies and change inventory numbers | Allow editing and deletion; allow reuse of released inventory numbers; leave other copies unchanged. |
| CORE-03 | Browse the collection | Switch between a cover grid and table; both open the same detail view; support phones, tablets and Mac browsers. |
| CORE-04 | View album details | Show cover, artist, album title and tracks immediately; handle missing information clearly; display side positions such as A1/B1 when available. |
| META-01 | Search Discogs and import metadata | Search by artist and album; initially favor master entries; require confirmation before importing a suggestion; allow manual entry when results are missing or incorrect. |
| META-02 | Store basic metadata and cover art | Import cover art, tracks, year, genre and other available basic fields; store covers locally where source terms permit; display source attribution and links. |
| META-03 | Protect manual corrections | Do not silently overwrite manually edited fields during subsequent imports or refreshes. |
| OPS-01 | Separate services and deploy with Docker Compose | Separate frontend and FastAPI backend; document startup on Raspberry Pi 5; persist data; configure deployment without source changes. |
| OSS-01 | Set up GitHub project tracking | Provide a repository, README, installation documentation and MIT license; connect requirements to issues and milestones. |

### M2 — NFC and listening history

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| NFC-01 | Integrate the PN532 reader | Read NTAG213 tags on Raspberry Pi through PN532; assign unknown tags to copies; select the hardware connection before implementation. |
| NFC-02 | Replace NFC tags | Assign a replacement tag to an existing copy; preserve collection data and history; remove the old tag association. |
| NFC-03 | Open details after an NFC scan | Show the associated copy on the screen attached to the Raspberry Pi; decide how to control browser navigation. A continuously open kiosk browser is a proposed approach. |
| PLAY-01 | Record a play after a ten-minute delay | Start a ten-minute process after a valid scan; create at most one play event per process; define repeated scans, cancellation and restart behavior before implementation. |
| PLAY-02 | Show listening history and play counts | Display play events, count and last played time; keep counters and history consistent. |
| PLAY-03 | Mark favorite records | Add, remove and display favorite markers. |

### M3 — Collection management and capture

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| SEARCH-01 | Search the collection | Find artists, album titles and track titles and open the corresponding copies. |
| PERSONAL-01 | Manage personal collection fields | Capture and edit record condition, sleeve condition, notes and ratings; select a rating scale. |
| WISH-01 | Manage a wishlist | Manage desired albums separately; do not require physical inventory numbers for wishlist entries. |
| CAPTURE-01 | Provide a rapid entry workflow | Add multiple records consecutively with minimal repeated input. |
| CAPTURE-02 | Warn about possible duplicates | Show matching albums already in the collection; still allow an additional physical copy. |
| CAPTURE-03 | Identify records by barcode or catalog number | Identify records using a barcode or catalog number; allow manual search when no match is found. |
| CAPTURE-04 | Identify records from cover photos | Produce suggestions that users can confirm; assess feasibility and a free data source before implementation. |
| IMPORT-01 | Import a Discogs collection | Import a collection with a preview; define repeat-import behavior and assignment of personal LP numbers; do not silently overwrite existing data. Choose API or CSV import. |
| EXPORT-01 | Export the collection as CSV | Export inventory numbers and agreed collection fields; provide an interface for additional export formats. |
| META-04 | Configure metadata refresh and confirmation | Allow automatic refresh to be enabled or disabled; allow manual refresh; make initial import confirmation configurable; protect manual corrections. |
| META-05 | Resolve conflicts and support additional sources | Expose conflicting information and request a decision; allow additional sources through defined interfaces. |
| META-06 | Retrieve album descriptions and additional information | Import descriptions, reviews, labels and credits where supported by the source and its terms; tolerate missing fields. |
| OPS-02 | Back up and restore application data | Back up and restore the database, covers and required configuration; select procedure and destination. Required before production use. |
| UI-01 | Support content languages | Support German and English content; clarify interface language and translation scope. |

### M4 — Optional future features

| ID | Feature / issue | Acceptance criteria |
| --- | --- | --- |
| LATER-01 | Track exact pressings and distinguish original and pressing years | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-02 | Add track durations, songwriters, producers and detailed credits | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-03 | Upload personal cover, back cover, label and matrix photos | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-04 | Track storage locations | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-05 | Add QR codes as an alternative identifier | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-06 | Display estimated market values | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-07 | Support bulk editing | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-08 | Link to streaming services | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-09 | Add authentication and multiple user accounts | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-10 | Support optional paid metadata providers | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-11 | Add further export formats | Define scope and acceptance criteria before implementation; implement and document the feature. |
| LATER-12 | Write NFC tags if required by the selected workflow | Define scope and acceptance criteria before implementation; implement and document the feature. |

## Out of current scope

Loan management, mirroring physical shelf order, public collection sharing and a sales list are not currently requested. A wishlist is requested. No personal fields need special hiding for a future sharing feature, but the initial collection remains private.

## Open decisions

1. Create the `grooveshelf` GitHub repository. Project name and MIT license are confirmed.
2. Select PN532 connection (I²C, SPI or UART), browser navigation on the Pi screen and tag UID versus written payload. Tags are attached to the back of protective sleeves, alongside readable inventory labels.
3. Define repeat-scan behavior, switching records within ten minutes, restart recovery and manual corrections. Decide whether ratings and play counts belong to albums, copies or both.
4. Select frontend and database for ARM64 operation, simplicity and extensibility.
5. Verify Discogs access, terms, cover usage and actual field availability. Discogs is the preferred initial provider; paid providers are optional future work.
6. Define Discogs import method, inventory-number assignment and matching existing copies.
7. Choose backup destination, frequency and restore procedure.
8. Clarify default interface language, rating scale and the box-set model. English project documentation does not automatically change the requested German/English application content.
9. Prioritize M2 and M3. Do not deploy real collection data without a backup procedure.

## GitHub workflow

Create one issue per stable requirement ID, for example `[CORE-01] Create and edit physical copies`. Include the goal, requirement reference, acceptance criteria, dependencies and open decisions.

Suggested labels: `feature`, `bug`, `backend`, `frontend`, `nfc`, `metadata`, `import-export`, `operations`, `needs-decision`.

Workflow: Backlog → Ready → In progress → Review → Done. Complete an issue only once its acceptance criteria are verified. Pull requests reference their issues. GitHub issues have not yet been created.
