# Running GrooveShelf

## Raspberry Pi / Docker Compose

Install Docker Engine with the Compose plugin on a 64-bit operating system, then:

```sh
git clone https://github.com/mziethen/grooveshelf.git
cd grooveshelf
docker compose up --build -d
```

Open `http://<pi-address>:8080`. To change the port, set `GROOVESHELF_PORT`, for example `GROOVESHELF_PORT=8090 docker compose up --build -d`.

```sh
docker compose logs -f
docker compose down
```

`docker compose down` keeps the collection volume. `docker compose down -v` deletes it and your collection. Upgrades should be preceded by a backup; startup migrates supported older database schemas automatically and preserves existing records. A database from a newer application version is rejected; downgrades are not supported.

## Local development without Docker

Python 3.12 is supported. In the repository root:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
.venv/bin/python scripts/dev_server.py
```

Open `http://127.0.0.1:8080`. The local proxy only binds to loopback. The backend uses `data/grooveshelf.sqlite3`; override with `GROOVESHELF_DATABASE` to use a different file. API documentation: `http://127.0.0.1:8000/docs`.

## Tests

```sh
.venv/bin/pytest -q
```

Browser integration requires Node 24 and Chromium. Tests create, edit, and delete records and change installation settings, so always use a disposable database. They run sequentially against one isolated installation.

```sh
npm ci --prefix frontend
cd frontend
npx playwright install chromium
cd ..
```

Start a disposable backend in a separate terminal, using a new temporary directory and no real Discogs credentials:

```sh
TEST_DATA_DIR=$(mktemp -d)
DISCOGS_TOKEN= GROOVESHELF_DATABASE="$TEST_DATA_DIR/grooveshelf.sqlite3" PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Start its proxy in another terminal:

```sh
.venv/bin/python scripts/dev_server.py --port 8081 --backend-url http://127.0.0.1:8010
```

Then run the suite from the repository root:

```sh
GROOVESHELF_TEST_URL=http://127.0.0.1:8081 npm test --prefix frontend
```

Stop both disposable servers afterward. `GROOVESHELF_TEST_URL` defaults to `http://127.0.0.1:8080`; always set it explicitly when your own collection is running there. CI uses a fresh database, runs backend and browser tests, builds ARM64/AMD64 containers, and checks Compose persistence.

## Backups and updates

Use **Export archive** in the navigation to download a complete portable backup. Store it outside the Pi, verify it, and export before upgrades. See [archive export, verification, and restore](archives.md). Automatic scheduled backups are not implemented.

To update a Docker installation after exporting:

```sh
git pull --ff-only
docker compose up --build -d
```

Do not use `docker compose down -v` when updating: it deletes the collection volume. Downgrading a migrated database is unsupported.

## Connecting Discogs

Copy `.env.example` to `.env` and set `DISCOGS_TOKEN` to a personal access token generated in your Discogs account at https://www.discogs.com/settings/developers. `.env` is ignored by Git. Do not paste tokens into issues or commit them.

```sh
cp .env.example .env
# Edit .env locally, then recreate the backend with the updated configuration:
docker compose up -d --force-recreate backend
```

For local development, Uvicorn does not load `.env` automatically. Export `DISCOGS_TOKEN` in the backend terminal before starting it. Stop and restart that backend process after changing its environment. Restarting the frontend alone does not update the token. The application never returns the token to the browser or forwards it to image hosts. Search requires authentication; public master previews may be available without it, depending on Discogs access policies.

When adding a record, enter an artist or title, select **Search Discogs**, choose an album, review the preview and select **Use these details**. You can correct the suggested fields before saving. Saving is the point at which data and the cover are stored. Existing records can be refreshed from their detail view; edited artist/title/year/track fields stay protected.

See [Discogs integration and data handling](discogs.md) for source attribution, cache freshness and unavailable-provider behavior.

## Listening and NFC

See [station mode, test scans and hardware status](listening.md). Physical PN532 setup is still pending. To open the Pi station view use `http://<pi-address>:8080/?station=pi-main`.

## Appearance

Choose **Gallery**, **Studio**, or **Listening Room** in the top-right appearance menu. The selection is stored per browser and restored before paint. Switching themes keeps collection view, search, and unsaved inputs intact. Small screens use a navigation drawer with keyboard focus and Escape support; reduced-motion preferences are respected.

## Troubleshooting

- **Address already in use:** stop the previous server with Ctrl+C in its terminal. Identify a listener with `lsof -iTCP:8000 -sTCP:LISTEN` (backend) or port `8080` (frontend) before terminating that specific process.
- **Discogs token changed:** recreate the Compose backend with `docker compose up -d --force-recreate backend`, or restart the local backend with its updated environment.
- **Frontend cannot reach the API:** check `docker compose logs backend frontend`, or confirm that the local proxy's `--backend-url` points to the running backend.
- **Archive restore:** restore into a new destination, then select that database path. Restore does not merge into an existing collection; follow the [archive guide](archives.md).

The development proxy allows 60 seconds for provider-backed requests. Production Nginx uses its default proxy timeout.
