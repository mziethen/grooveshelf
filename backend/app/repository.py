from datetime import datetime, timezone
import json
import sqlite3
from uuid import uuid4
from fastapi import HTTPException
from .models import RecordInput
from .discogs import MAX_AGE, source_key


class CollectionRepository:
    def __init__(self, database):
        self.database = database

    @staticmethod
    def decode(row):
        result = dict(row)
        result['tracks'] = json.loads(result['tracks'])
        metadata = json.loads(result.pop('metadata'))
        result['_metadata'] = metadata
        for field in ['source_url', 'source_name', 'discogs_master_id', 'discogs_release_id', 'reference_release_url']:
            result[field] = metadata.get(field)
        for field in ['genres', 'styles', 'labels', 'protected_fields']:
            result[field] = metadata.get(field, [])
        result['description'] = metadata.get('description', '')
        mid = source_key(metadata) if metadata.get('discogs_master_id') or metadata.get('discogs_release_id') else None
        result['cover_url'] = f'/api/covers/discogs/{mid}' if metadata.get('cover_cached') else None
        selected = result.get('cover_image_id')
        result['cover_selection_status'] = 'default'
        if selected:
            available = any(image['id'] == selected for image in metadata.get('images', []))
            result['cover_selection_status'] = 'selected' if available else 'missing'
            result['cover_url'] = f'/api/covers/discogs/{mid}/{selected}?v={metadata.get("checked_at", 0)}' if available else None
        result['metadata_status'] = 'current' if mid else 'manual'
        result['metadata_expires_at'] = metadata.get('checked_at', 0) + MAX_AGE if mid else None
        return result

    @staticmethod
    def select():
        return '''SELECT c.*, a.artist, a.title, a.year, a.tracks, a.metadata
                  FROM copies c JOIN albums a ON a.id = c.album_id'''

    def list(self, query=''):
        with self.database.connect() as db:
            rows = db.execute(self.select() + ' ORDER BY c.inventory_number').fetchall()
        records = [self.decode(row) for row in rows]
        q = query.casefold().strip()
        return [r for r in records if not q or q in ' '.join(
            [r['artist'], r['title'], r['inventory_number'], r['storage_location']] +
            [t['title'] for t in r['tracks']]).casefold()]

    def get(self, copy_id):
        with self.database.connect() as db:
            row = db.execute(self.select() + ' WHERE c.id = ?', (copy_id,)).fetchone()
        if row is None:
            raise HTTPException(404, 'Record not found')
        return self.decode(row)

    def save(self, data: RecordInput, copy_id=None, imported=None, wish_id=None):
        existing = self.get(copy_id) if copy_id else None
        metadata = dict(imported or (existing['_metadata'] if existing else {}))
        if metadata:
            protected = set(metadata.get('protected_fields', []))
            for field in ['artist', 'title', 'year', 'tracks']:
                value = [t.model_dump() for t in data.tracks] if field == 'tracks' else getattr(data, field)
                baseline = imported.get(field) if imported else existing[field]
                if value != baseline:
                    protected.add(field)
            metadata['protected_fields'] = sorted(protected)
        record_id = copy_id or str(uuid4())
        now = existing['created_at'] if existing else datetime.now(timezone.utc).isoformat()
        try:
            with self.database.connect() as db:
                if wish_id:
                    db.execute('BEGIN IMMEDIATE')
                    wish = db.execute('SELECT acquired_at FROM wishlist WHERE id=?', (wish_id,)).fetchone()
                    if not wish or wish['acquired_at']:
                        raise HTTPException(409, 'This wish was already acquired or removed. Refresh the wishlist.')
                if data.album_id:
                    album = db.execute('SELECT * FROM albums WHERE id = ?', (data.album_id,)).fetchone()
                    if album is None:
                        raise HTTPException(404, 'Album not found')
                    album_id = data.album_id
                else:
                    tracks = json.dumps([t.model_dump() for t in data.tracks], ensure_ascii=False)
                    serialized = json.dumps(metadata, ensure_ascii=False, sort_keys=True)
                    album = db.execute('''SELECT id FROM albums WHERE artist = ? AND title = ?
                                         AND year IS ? AND tracks = ? AND metadata = ?''',
                                       (data.artist, data.title, data.year, tracks, serialized)).fetchone()
                    album_id = album['id'] if album else str(uuid4())
                    if not album:
                        db.execute('INSERT INTO albums (id, artist, title, year, tracks, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                                   (album_id, data.artist, data.title, data.year, tracks, serialized))
                if existing:
                    db.execute('''UPDATE copies SET album_id=?, inventory_number=?, format=?, notes=?
                                  WHERE id=?''', (album_id, data.inventory_number, data.format, data.notes, record_id))
                else:
                    db.execute('INSERT INTO copies (id, album_id, inventory_number, format, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                               (record_id, album_id, data.inventory_number, data.format, data.notes, now))
                if wish_id:
                    db.execute('UPDATE wishlist SET acquired_copy_id=?, acquired_at=?, updated_at=? WHERE id=?',
                               (record_id,now,now,wish_id))
                for field in ['rating', 'media_condition', 'sleeve_condition', 'storage_location']:
                    if not existing or field in data.model_fields_set:
                        db.execute(f'UPDATE copies SET {field}=? WHERE id=?', (getattr(data, field), record_id))
                if imported:
                    db.execute('UPDATE copies SET cover_image_id=? WHERE id=?', (data.cover_image_id, record_id))
                db.execute('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM copies)')
        except sqlite3.IntegrityError as error:
            if 'copies.inventory_number' in str(error):
                raise HTTPException(409, 'This inventory number is already in use') from error
            raise
        return self.get(record_id)

    def save_personal(self, copy_id, data):
        with self.database.connect() as db:
            result = db.execute('UPDATE copies SET rating=?,media_condition=?,sleeve_condition=?,notes=? WHERE id=?',
                                (data.rating,data.media_condition,data.sleeve_condition,data.notes,copy_id))
            if not result.rowcount:
                raise HTTPException(404, 'Record not found')
            if 'storage_location' in data.model_fields_set:
                db.execute('UPDATE copies SET storage_location=? WHERE id=?', (data.storage_location,copy_id))
        return self.get(copy_id)

    def save_bulk_personal(self, data):
        changes = data.changes.model_dump(exclude_unset=True)
        placeholders = ','.join('?' for _ in data.record_ids)
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            found = db.execute(f'SELECT id FROM copies WHERE id IN ({placeholders})', data.record_ids).fetchall()
            if len(found) != len(data.record_ids):
                raise HTTPException(409, 'Some selected records no longer exist. Reload the records and review your selection.')
            # Field names come only from the validated, extra-forbidden personal changes model.
            assignments = ','.join(f'{field}=?' for field in changes)
            db.execute(f'UPDATE copies SET {assignments} WHERE id IN ({placeholders})',
                       [*changes.values(), *data.record_ids])
        return {'updated_count': len(data.record_ids), 'record_ids': data.record_ids}

    def select_cover(self, copy_id, image_id):
        with self.database.connect() as db:
            if not db.execute('UPDATE copies SET cover_image_id=? WHERE id=?', (image_id, copy_id)).rowcount:
                raise HTTPException(404, 'Record not found')
        return self.get(copy_id)

    def refresh_album(self, album_id, imported):
        with self.database.connect() as db:
            album = db.execute('SELECT * FROM albums WHERE id = ?', (album_id,)).fetchone()
            if not album:
                return
            previous = json.loads(album['metadata'])
            protected = previous.get('protected_fields', [])
            metadata = dict(imported, protected_fields=protected)
            values = {field: album[field] if field in protected else imported[field]
                      for field in ['artist', 'title', 'year', 'tracks']}
            if 'tracks' not in protected:
                values['tracks'] = json.dumps(values['tracks'], ensure_ascii=False)
            db.execute('UPDATE albums SET artist=?, title=?, year=?, tracks=?, metadata=? WHERE id=?',
                       (values['artist'], values['title'], values['year'], values['tracks'],
                        json.dumps(metadata, ensure_ascii=False, sort_keys=True), album_id))

    def delete(self, copy_id):
        with self.database.connect() as db:
            result = db.execute('DELETE FROM copies WHERE id = ?', (copy_id,))
            if not result.rowcount:
                raise HTTPException(404, 'Record not found')
            db.execute('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM copies)')
