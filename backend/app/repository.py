from datetime import datetime, timezone
import json
import sqlite3
from uuid import uuid4
from fastapi import HTTPException
from .models import RecordInput


class CollectionRepository:
    def __init__(self, database):
        self.database = database

    @staticmethod
    def decode(row):
        result = dict(row)
        result["tracks"] = json.loads(result["tracks"])
        result["cover_url"] = None
        return result

    @staticmethod
    def select():
        return """SELECT c.*, a.artist, a.title, a.year, a.tracks
                  FROM copies c JOIN albums a ON a.id = c.album_id"""

    def list(self, query=""):
        with self.database.connect() as db:
            rows = db.execute(self.select() + " ORDER BY c.inventory_number").fetchall()
        records = [self.decode(row) for row in rows]
        q = query.casefold().strip()
        return [r for r in records if not q or q in " ".join(
            [r["artist"], r["title"], r["inventory_number"]] +
            [t["title"] for t in r["tracks"]]).casefold()]

    def get(self, copy_id):
        with self.database.connect() as db:
            row = db.execute(self.select() + " WHERE c.id = ?", (copy_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Record not found")
        return self.decode(row)

    def save(self, data: RecordInput, copy_id=None):
        existing = self.get(copy_id) if copy_id else None
        record_id = copy_id or str(uuid4())
        now = existing["created_at"] if existing else datetime.now(timezone.utc).isoformat()
        try:
            with self.database.connect() as db:
                if data.album_id:
                    album = db.execute("SELECT * FROM albums WHERE id = ?", (data.album_id,)).fetchone()
                    if album is None:
                        raise HTTPException(404, "Album not found")
                    # Linking another physical copy does not mutate a shared album.
                    album_id = data.album_id
                else:
                    # Reuse an unchanged album. Edits otherwise create a new album
                    # association so other copies are never modified silently.
                    tracks = json.dumps([t.model_dump() for t in data.tracks], ensure_ascii=False)
                    album = db.execute("""SELECT id FROM albums WHERE artist = ? AND title = ?
                                         AND year IS ? AND tracks = ?""",
                                       (data.artist, data.title, data.year, tracks)).fetchone()
                    album_id = album["id"] if album else str(uuid4())
                    if not album:
                        db.execute("INSERT INTO albums VALUES (?, ?, ?, ?, ?)",
                                   (album_id, data.artist, data.title, data.year, tracks))
                if existing:
                    db.execute("""UPDATE copies SET album_id=?, inventory_number=?, format=?, notes=?
                                  WHERE id=?""", (album_id, data.inventory_number, data.format, data.notes, record_id))
                else:
                    db.execute("INSERT INTO copies VALUES (?, ?, ?, ?, ?, ?)",
                               (record_id, album_id, data.inventory_number, data.format, data.notes, now))
                db.execute("DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM copies)")
        except sqlite3.IntegrityError as error:
            if "copies.inventory_number" in str(error):
                raise HTTPException(409, "This inventory number is already in use") from error
            raise
        return self.get(record_id)

    def delete(self, copy_id):
        with self.database.connect() as db:
            result = db.execute("DELETE FROM copies WHERE id = ?", (copy_id,))
            if not result.rowcount:
                raise HTTPException(404, "Record not found")
            db.execute("DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM copies)")
