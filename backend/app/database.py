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
            if version > 2:
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
            db.execute("PRAGMA user_version = 2")
