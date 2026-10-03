from contextlib import contextmanager
from pathlib import Path
import sqlite3


class Database:
    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 5:
                raise RuntimeError("Database schema is newer than this application")
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS albums (
                    id TEXT PRIMARY KEY,
                    artist TEXT NOT NULL,
                    title TEXT NOT NULL,
                    year INTEGER,
                    tracks TEXT NOT NULL DEFAULT '[]'
                );
                CREATE TABLE IF NOT EXISTS copies (
                    id TEXT PRIMARY KEY,
                    album_id TEXT NOT NULL REFERENCES albums(id),
                    inventory_number TEXT NOT NULL UNIQUE,
                    format TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
            """)
            columns = {row[1] for row in db.execute("PRAGMA table_info(albums)")}
            if "metadata" not in columns:
                db.execute("ALTER TABLE albums ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")
            copy_columns = {row[1] for row in db.execute("PRAGMA table_info(copies)")}
            if "favorite" not in copy_columns:
                db.execute("ALTER TABLE copies ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
            if "cover_image_id" not in copy_columns:
                db.execute("ALTER TABLE copies ADD COLUMN cover_image_id TEXT")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS stations (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL,
                    last_uid TEXT, last_scan_at REAL, scan_sequence INTEGER NOT NULL DEFAULT 0
                );
                INSERT OR IGNORE INTO stations (id, name) VALUES ('pi-main', 'Raspberry Pi');
                CREATE TABLE IF NOT EXISTS nfc_tags (
                    uid TEXT PRIMARY KEY,
                    copy_id TEXT NOT NULL UNIQUE REFERENCES copies(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS listening_sessions (
                    id TEXT PRIMARY KEY,
                    station_id TEXT NOT NULL REFERENCES stations(id),
                    copy_id TEXT NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
                    started_at REAL NOT NULL, due_at REAL NOT NULL,
                    status TEXT NOT NULL,
                    ended_at REAL
                );
                CREATE INDEX IF NOT EXISTS sessions_station ON listening_sessions(station_id, started_at);
                CREATE TABLE IF NOT EXISTS play_events (
                    id TEXT PRIMARY KEY,
                    copy_id TEXT REFERENCES copies(id) ON DELETE SET NULL,
                    station_id TEXT REFERENCES stations(id),
                    session_id TEXT UNIQUE,
                    played_at REAL NOT NULL,
                    origin TEXT NOT NULL,
                    inventory_number TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS plays_copy ON play_events(copy_id, played_at);
            """)
            station_columns = {row[1] for row in db.execute("PRAGMA table_info(stations)")}
            for name, declaration in [("reader_status", "TEXT NOT NULL DEFAULT 'disconnected'"),
                                      ("reader_seen_at", "REAL")]:
                if name not in station_columns:
                    db.execute(f"ALTER TABLE stations ADD COLUMN {name} {declaration}")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS discogs_links (
                    account TEXT NOT NULL, instance_id INTEGER NOT NULL, release_id INTEGER NOT NULL,
                    copy_id TEXT UNIQUE REFERENCES copies(id) ON DELETE SET NULL,
                    PRIMARY KEY (account, instance_id)
                );
                CREATE TABLE IF NOT EXISTS discogs_exports (
                    id TEXT PRIMARY KEY, account TEXT NOT NULL,
                    copy_id TEXT UNIQUE REFERENCES copies(id) ON DELETE SET NULL,
                    release_id INTEGER NOT NULL, before_ids TEXT NOT NULL,
                    status TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS discogs_sync_state (
                    account TEXT PRIMARY KEY, last_success_at TEXT
                );
            """)
            db.execute("PRAGMA user_version = 5")
