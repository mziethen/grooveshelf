from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException


class WishlistService:
    def __init__(self, database, repository, metadata):
        self.database = database
        self.repository = repository
        self.metadata = metadata

    @staticmethod
    def decode(row):
        result = dict(row)
        mid = result['discogs_master_id']
        result['source_url'] = f'https://www.discogs.com/master/{mid}' if mid else None
        return result

    def get(self, wish_id):
        with self.database.connect() as db:
            row = db.execute('SELECT * FROM wishlist WHERE id=?', (wish_id,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Wishlist entry not found.')
        return self.decode(row)

    def list(self, query=''):
        with self.database.connect() as db:
            rows = db.execute('SELECT * FROM wishlist WHERE acquired_at IS NULL ORDER BY created_at DESC, id').fetchall()
        wishes = [self.decode(row) for row in rows]
        query = query.casefold().strip()
        return [wish for wish in wishes if not query or query in f"{wish['artist']} {wish['title']} {wish['notes']}".casefold()]

    def save(self, data, wish_id=None):
        now = datetime.now(timezone.utc).isoformat()
        updating = wish_id is not None
        wish_id = wish_id or str(uuid4())
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT acquired_at FROM wishlist WHERE id=?', (wish_id,)).fetchone()
            if updating and not current:
                raise HTTPException(404, 'Wishlist entry not found.')
            if current and current['acquired_at']:
                raise HTTPException(409, 'This wish has already been acquired.')
            if current:
                db.execute('UPDATE wishlist SET artist=?,title=?,notes=?,discogs_master_id=?,updated_at=? WHERE id=?',
                           (data.artist,data.title,data.notes,data.discogs_master_id,now,wish_id))
            else:
                db.execute('INSERT INTO wishlist(id,artist,title,notes,discogs_master_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                           (wish_id,data.artist,data.title,data.notes,data.discogs_master_id,now,now))
        return self.get(wish_id)

    def update(self, wish_id, data):
        return self.save(data, wish_id)

    def delete(self, wish_id):
        with self.database.connect() as db:
            result = db.execute('DELETE FROM wishlist WHERE id=? AND acquired_at IS NULL', (wish_id,))
            if not result.rowcount:
                raise HTTPException(404, 'Active wishlist entry not found.')

    def acquire(self, wish_id, data):
        with self.metadata.lock:
            wish = self.get(wish_id)
            if wish['acquired_at']:
                if wish['acquired_copy_id']:
                    record = self.repository.get(wish['acquired_copy_id'])
                    if record['inventory_number'] != data.inventory_number:
                        raise HTTPException(409, f"This wish was already acquired as {record['inventory_number']}. Open the existing record.")
                    return self.metadata.present(record)
                raise HTTPException(409, 'This wish was already acquired and its copy has since been removed.')
            return self.metadata.save(data, wish_id=wish_id)
