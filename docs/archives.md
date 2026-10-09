# Portable collection archives and backups

**Export archive** downloads `grooveshelf-collection.zip`. It contains a SQLite snapshot of albums, copies, metadata and personal corrections, ratings, conditions, notes, favorites, locations, NFC associations, recorded history, stations/sessions, Discogs sync links and uncertain export receipts, wishlist entries and metadata settings. Locally cached Discogs cover files are included. Internal IDs and relationships are preserved. Export does not contact providers or change collection data.

The ZIP format is `grooveshelf-archive`, version 1, supporting schema versions 9 and 10. `manifest.json` declares the version, creation time and each file's size and SHA-256 checksum. The manifest, database and `covers/discogs-master-*.img` files are the only supported entries. Limits are 256 MiB for the database, 5 MiB per cover, 512 MiB total content, 20,000 data files and 1 MiB for the manifest. Schema-10 personal photos are stored inside the database and included automatically. Schema-9 archives restore into schema 10 with an empty photo collection. Archives must pass integrity, relationship, schema, record, personal-photo and checksum validation. Unexpected paths, duplicate entries, unsupported versions, views and triggers are rejected. Checksums detect corruption; they do not authenticate an archive's origin.

Environment files, Discogs access tokens, application code and arbitrary files are excluded. Application settings and station identities are in the database. Configure credentials again from `.env.example` and configure the physical reader adapter for the destination Pi. Cached metadata retains its original expiry; restoring does not extend permission to display provider data.

## Backup procedure

Use the browser export for a live snapshot on a single-backend installation. During export, metadata/cover changes and the listening worker are briefly serialized while SQLite produces a consistent snapshot. Other committed copy updates are captured according to the snapshot point. Keep the downloaded archive outside the Pi as well, with a dated filename. Export after significant collection/history changes and before upgrades; optional daily local backups are also available below.

The offline CLI can export and verify archives too. Stop the backend and NFC bridge before an offline export, so cover files cannot change during the snapshot. From the project directory with dependencies installed:

```sh
.venv/bin/python scripts/collection_archive.py export --database data/grooveshelf.sqlite3 --output backups/collection-2026-10-03.zip
.venv/bin/python scripts/collection_archive.py verify backups/collection-2026-10-03.zip
```

Create the `backups` directory first. Existing output archives are never overwritten. Choose the database path from your installation; the CLI does not load `.env` automatically. Verification is also available as `PYTHONPATH=backend python -m app.archive_cli verify ARCHIVE.zip`.

## Restore to a fresh installation

Install the same compatible GrooveShelf release and its dependencies on the destination machine. Stop its backend and NFC bridge. Keep the original archive and existing installation data. Restore requires a **new, nonexistent directory** whose parent exists; it does not replace or merge a collection:

```sh
.venv/bin/python scripts/collection_archive.py verify backups/collection-2026-10-03.zip
.venv/bin/python scripts/collection_archive.py restore backups/collection-2026-10-03.zip --destination data-restored
GROOVESHELF_DATABASE=data-restored/grooveshelf.sqlite3 PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Restore validates before publishing the destination directory and copies data into application-owned schema. It never executes archive-provided schema definitions. Pending listening sessions are canceled, completed sessions are ended, and readers start disconnected with their last tag cleared, so transferring a collection cannot manufacture a completed play. Recorded history and all existing IDs are retained. Confirm collection counts, personal fields, covers and history before reconnecting the NFC bridge.

The backend Docker image includes the CLI. On a fresh destination Docker installation, with the downloaded archive in a host `backups` directory:

```sh
docker compose stop backend
docker compose run --rm --no-deps -v "$(pwd)/backups:/archives:ro" backend python -m app.archive_cli verify /archives/collection-2026-10-03.zip
docker compose run --rm --no-deps -v "$(pwd)/backups:/archives:ro" backend python -m app.archive_cli restore /archives/collection-2026-10-03.zip --destination /data/restored
```

Before starting the backend, set its `GROOVESHELF_DATABASE` environment entry in `compose.yaml` to `/data/restored/grooveshelf.sqlite3`, restore your token in `.env`, and run `docker compose up -d --force-recreate backend`. The named data volume retains the restored folder; the process uses the image's data ownership. Keep the original data until verification succeeds. Restore from newer application schemas requires a compatible release rather than downgrading.

## Validation

Tests restore an imported collection with local covers, ratings, notes, favorites, locations, tags, play history, wishlist and settings into a fresh installation, verify preserved identities, and read the cover through the restored API. Corrupt checksums, paths, sizes, schema, triggers and foreign keys fail without creating the destination. CLI export/verify/restore and browser ZIP download are also tested. Physical transfer to another Raspberry Pi has not been tested here; the archive is independent of CPU architecture.

## Daily local backups

Open **Backups** in the navigation. **Create backup** writes and verifies a complete archive before it appears in the download list. Enable **Create a local backup every day** and save to opt in; scheduling is off by default. The running backend checks once per minute and creates an archive when the newest saved backup is at least 24 hours old (or immediately if none exists). Manual backups restart this interval. The preference is stored in the collection database; saved archive timestamps preserve the schedule after a restart. Failed attempts keep existing archives, show an error and retry after one hour.

Archives are stored in `backups/` beside the configured database (`/data/backups` in Docker's persistent volume). The dialog shows the latest 20 downloads and the total archive count. Every download is verified again. All archives are retained; disabling scheduling keeps existing files. Remove unneeded files manually on the server after saving copies elsewhere. Local backups on the same disk do not protect against disk loss: download copies to another device. The backend must be running for scheduled backups; overdue backups are created after startup. Restore remains the verified command-line procedure above, into a separate destination.
