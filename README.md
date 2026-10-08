# GrooveShelf

[![Application checks](https://github.com/mziethen/grooveshelf/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mziethen/grooveshelf/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A self-hosted vinyl collection archive for Raspberry Pi and your home network. Keep each physical copy under an `LP-XXXXX` inventory number, browse your covers, enrich albums with Discogs, and connect your collection to NFC listening sessions.

## Features

- **Collection:** cover grid and table, album details and track lists, search, favorites, ratings, media/sleeve condition, notes, and storage locations.
- **Capture:** suggested inventory numbers, consecutive entry, duplicate warnings, and Discogs lookup by artist, album, barcode, or catalog number.
- **Discogs:** reviewed metadata imports, protected manual corrections with per-field review and resolution, locally cached covers with image selection, an opt-in setting to display older saved snapshots, optional track durations and source-attributed album/track credits, and manually confirmed collection import, matching, and export.
- **Listening:** NFC tag associations, station scans, ten-minute listening sessions, editable play history, statistics, and record suggestions.
- **Wishlist:** desired albums, search, editing, and acquisition into the collection.
- **Album discovery:** Spotify, YouTube and Qobuz search links in record details.
- **Tools:** reviewed bulk editing of personal copy fields, printable inventory labels with optional QR links, missing-data filters, CSV and JSON exports, a printable offline catalog, and validated portable archives with cached covers and listening history.
- **Appearance:** Gallery, Studio, and Listening Room themes, saved per browser, with responsive navigation and keyboard controls.

The NFC workflow is implemented in software. The physical PN532 driver and wiring are still pending. Discogs synchronization is manually initiated; automatic synchronization and advanced conflict handling remain on the roadmap. See [open issues](https://github.com/mziethen/grooveshelf/issues).

## Quick start

You need Docker Engine with Docker Compose on a 64-bit system. Raspberry Pi 5 is the primary deployment target; CI checks Linux ARM64 and AMD64 images.

```sh
git clone https://github.com/mziethen/grooveshelf.git
cd grooveshelf
cp .env.example .env
# Optional: add your Discogs personal access token to .env.
docker compose up --build -d
```

Open **http://localhost:8080**, or **http://<pi-address>:8080** from another device. To use another port, set `GROOVESHELF_PORT` in `.env`. Open `http://<pi-address>:8080/?station=pi-main` for the listening station screen.

Collection data lives in a persistent Docker volume. `docker compose down` keeps it; `docker compose down -v` deletes it. Export a portable archive before upgrading and keep a copy outside the Pi. This version has no user authentication and is intended for a trusted home network.

For Discogs configuration, token updates, local development, and troubleshooting, see the [setup guide](docs/development.md).

## Documentation

| Topic | Guide |
| --- | --- |
| Installation, updates, development, tests | [Running GrooveShelf](docs/development.md) |
| Spotify, YouTube and Qobuz searches | [Streaming links](docs/streaming.md) |
| Collection download formats | [CSV, JSON and printable catalog](docs/exports.md) |
| Portable export, verification, restore | [Archives and backups](docs/archives.md) |
| Original year, pressing year, country and catalog numbers | [Pressing details](docs/pressings.md) |
| Usability review and interface decisions | [UI review](docs/ui-review.md) |
| Songwriter, producer and other credits | [Album and track credits](docs/credits.md) |
| Track lists and optional durations | [Track durations](docs/tracks.md) |
| Metadata, cover handling, freshness | [Discogs integration](docs/discogs.md) |
| Collection import, matching, export | [Discogs synchronization](docs/discogs-sync.md) |
| NFC stations and listening sessions | [Listening and NFC](docs/listening.md) |
| Consecutive entry and identifiers | [Rapid capture](docs/capture.md), [barcode and catalog lookup](docs/identifier-search.md) |
| Wishlist and storage locations | [Wishlist](docs/wishlist.md), [locations](docs/locations.md) |
| QR identifiers and printable record links | [QR codes](docs/qr-codes.md) |
| Editing several copies at once | [Bulk edit](docs/bulk-edit.md) |
| Labels, CSV, incomplete records | [Inventory labels](docs/labels.md), [collection tools](docs/collection-tools.md) |
| Suggestions and play history analysis | [Discovery](docs/discovery.md), [statistics](docs/statistics.md) |
| Correction review | [Review metadata corrections](docs/metadata-corrections.md) |
| Metadata preferences | [Settings](docs/settings.md) |
| Design and implementation boundaries | [Architecture](docs/architecture.md) |
| Planned behavior and issue traceability | [Requirements](REQUIREMENTS.md), [requirement-to-issue mapping](docs/requirement-issues.json) |

## Repository layout

```text
backend/       FastAPI API, SQLite persistence, services, and backend tests
frontend/      HTML, CSS, JavaScript modules, and browser tests
scripts/       Local frontend proxy, NFC bridge, and archive CLI entry point
docs/          Setup, architecture, and feature guides
.github/       CI workflow, issue templates, and pull request template
compose.yaml   Persistent two-container deployment
```

The frontend has no production Node dependency or build step. Nginx serves it and proxies `/api` to FastAPI. SQLite separates albums from physical copies and migrates existing data on startup.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation, and issue-linked pull requests. Project documentation, issues, and code-facing text are maintained in English. Track planned work in [GitHub issues](https://github.com/mziethen/grooveshelf/issues) and [milestones](https://github.com/mziethen/grooveshelf/milestones).

## License

[MIT](LICENSE). Bundled component licenses are listed in [third-party notices](THIRD_PARTY_NOTICES.md).
