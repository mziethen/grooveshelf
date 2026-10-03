# Running GrooveShelf

## Raspberry Pi / Docker Compose

Install Docker Engine with the Compose plugin on a 64-bit operating system, then:

```sh
git clone https://github.com/mziethen/grooveshelf.git
cd grooveshelf
# Until the initial implementation is merged:
git switch codex/initial-collection-app
docker compose up --build -d
```

Open `http://<pi-address>:8080`. To change the port, set `GROOVESHELF_PORT`, for example `GROOVESHELF_PORT=8090 docker compose up --build -d`.

```sh
docker compose logs -f
docker compose down
```

`docker compose down` keeps the collection volume. `docker compose down -v` deletes it and your collection. Upgrades should be preceded by a backup; database migration support is not implemented yet.

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
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
```

Browser integration requires Node 24 and a running frontend/backend using a disposable database. The browser test creates and removes its own LP-99881 entry; use a fresh test database to avoid colliding with real records.

```sh
npm install --prefix frontend
cd frontend
npx playwright install chromium
npm test
```

`GROOVESHELF_TEST_URL` overrides the default `http://127.0.0.1:8080`. CI runs API tests, the browser workflow, ARM64/AMD64 container builds and a Compose persistence smoke test.

## Temporary backup procedure

Until the backup features are implemented, stop the backend and copy its data directory to another device. For Compose:

```sh
mkdir -p backups
docker compose stop backend
docker compose cp backend:/data/. ./backups/
docker compose start backend
```

This is a stopped-database snapshot, not the complete portable archive requested in EXPORT-02. Backups may contain multiple SQLite files; keep the complete directory. To restore, stop the backend, retain a copy of the current data, copy the snapshot directory contents back to `/data` and ensure ownership remains UID 10001 before restarting. Automated restore validation remains open.
