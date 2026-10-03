# GrooveShelf

A calm, mobile-first vinyl collection archive, self-hosted on a Raspberry Pi 5.

## Project status

The application supports manual record management, collection browsing, search and opt-in Discogs lookup with confirmed metadata import and local cover storage, per-record Discogs cover selection and manual collection synchronization. Software NFC associations, station sessions, listening history and favorites are available; the physical PN532 driver and wiring remain pending. See [running and development](docs/development.md).

## Features and roadmap

- Manage physical vinyl copies with inventory numbers from `LP-00001` to `LP-99999`.
- Browse cover grids and tables and open album details.
- Import or match Discogs collection copies and explicitly add local copies to Discogs. See [manual collection sync](docs/discogs-sync.md).
- Retrieve metadata and covers from Discogs while preserving manual corrections. See [connecting Discogs](docs/development.md#connecting-discogs).
- Associate NFC UIDs and follow station scans on the Raspberry Pi screen; physical PN532 reading remains pending. See [listening and NFC](docs/listening.md).
- View [listening statistics](docs/statistics.md) with per-copy rankings, monthly play totals, date filters and lifetime never-played records.
- Get [listening suggestions](docs/discovery.md) from all, never-played, least-played or not-recently-played owned records.
- Download the owned collection as CSV and [find incomplete records](docs/collection-tools.md) with combined missing-cover, missing-track and missing-NFC filters.
- Use [rapid entry](docs/capture.md) to add records consecutively with free LP-number suggestions and possible-duplicate warnings.
- View and correct listening history, track play counts and mark favorites. Personal ratings, record and sleeve condition, and notes can be edited per copy. A separate [wishlist](docs/wishlist.md) tracks desired albums and supports acquiring them into the collection.
- Cancel pending plays and receive tag-assignment, timer and reader-status feedback.
- Export a portable collection archive, find incomplete entries, discover listening suggestions and view statistics.
- Add printable inventory labels later; prepare the model for future listening stations.

## Getting started

```sh
docker compose up --build -d
```

Open `http://<host>:8080`. See [setup, tests and backup notes](docs/development.md) and [architecture](docs/architecture.md).

## Technical direction

Python and FastAPI backend, separate frontend and Docker Compose deployment on ARM64. The initial implementation uses SQLite and browser-native JavaScript modules. Initial deployment targets a private home network.

## Requirements and progress

- [Requirements and milestones](REQUIREMENTS.md)
- [GitHub issues](https://github.com/mziethen/grooveshelf/issues)
- [Milestones](https://github.com/mziethen/grooveshelf/milestones)
- [Requirement-to-issue mapping](planning/github-issue-links.json)

Stable requirement IDs connect the plan to GitHub issues. Project documentation, issues and templates are maintained in English.

## Contributing

Check the corresponding issue before implementing a feature. Completion requires meeting its acceptance criteria. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GrooveShelf is available under the [MIT license](LICENSE).
