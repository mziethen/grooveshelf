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
                PRAGMA user_version = 1;
            """)
