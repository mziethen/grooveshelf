# GrooveShelf

A calm, mobile-first vinyl collection archive, self-hosted on a Raspberry Pi 5.

## Project status

GrooveShelf is in the requirements and planning phase. There is no runnable application yet.

## Planned features

- Manage physical vinyl copies with inventory numbers from `LP-00001` to `LP-99999`.
- Browse cover grids and tables and open album details.
- Retrieve metadata and covers from Discogs while preserving manual corrections.
- Read NTAG213 tags using PN532 and show details on the Raspberry Pi screen.
- Add listening history, ratings, a wishlist and Discogs collection imports.
- Cancel pending plays, correct history and receive clear NFC feedback.
- Export a portable collection archive, find incomplete entries, discover listening suggestions and view statistics.
- Add printable inventory labels later; prepare the model for future listening stations.

## Technical direction

Python and FastAPI backend, separate frontend and Docker Compose deployment on ARM64. The frontend framework and database remain undecided. Initial deployment targets a private home network.

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
