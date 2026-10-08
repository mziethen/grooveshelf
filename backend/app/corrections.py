"""Explicit, copy-scoped decisions about protected provider fields."""
import hashlib
import json
from uuid import uuid4
from fastapi import HTTPException
from pydantic import ValidationError
from .models import RecordInput

FIELDS = ('artist', 'title', 'year', 'tracks')


def revision(record):
    values = {field: record[field] for field in FIELDS}
    values.update(album_id=record['album_id'], metadata=record['_metadata'])
    return hashlib.sha256(json.dumps(values, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def provider_values(record):
    metadata = record['_metadata']
    values = {field: metadata.get(field) for field in FIELDS}
    available = {}
    for field in FIELDS:
        try:
            RecordInput.model_validate({'inventory_number': record['inventory_number'],
                                       **{key: values[key] if key == field else record[key] for key in FIELDS}})
            available[field] = field in metadata
        except ValidationError:
            available[field] = False
    return values, available


class CorrectionsService:
    def __init__(self, repository, metadata):
        self.repository = repository
        self.metadata = metadata

    def check(self, record):
        shown = self.metadata.cached(record)
        if not record.get('source_url'):
            raise HTTPException(409, 'This record has no Discogs source.')
        if shown['metadata_status'] == 'unavailable':
            raise HTTPException(503, 'Refresh this record before reviewing saved Discogs values, or enable saved-data display in Settings.')
        return shown

    def preview(self, copy_id):
        record = self.repository.get(copy_id)
        shown = self.check(record)
        values, available = provider_values(record)
        return {'record_id': copy_id, 'inventory_number': record['inventory_number'],
                'revision': revision(record), 'source_url': record['source_url'],
                'metadata_status': shown['metadata_status'], 'metadata_checked_at': shown['metadata_checked_at'],
                'metadata_expires_at': shown['metadata_expires_at'], 'show_expired_metadata': shown['show_expired_metadata'],
                'fields': [{'field': field, 'current': record[field], 'provider': values[field],
                            'available': available[field]} for field in FIELDS if field in record['protected_fields']]}

    def apply(self, copy_id, data):
        with self.metadata.lock, self.repository.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute(self.repository.select()+' WHERE c.id=?', (copy_id,)).fetchone()
            if row is None:
                raise HTTPException(404, 'Record not found.')
            record = self.repository.decode(row)
            self.check(record)
            if revision(record) != data.revision:
                raise HTTPException(409, 'This metadata changed since your review. Close and reopen the review to compare the latest values.')
            protected = set(record['protected_fields'])
            if set(data.choices) != protected.intersection(FIELDS):
                raise HTTPException(409, 'Review every protected field before applying your choices.')
            values, available = provider_values(record)
            selected = [field for field, choice in data.choices.items() if choice == 'provider']
            if any(not available[field] for field in selected):
                raise HTTPException(409, 'A selected field has no usable saved Discogs value. Keep your correction or refresh first.')
            if selected:
                metadata = dict(record['_metadata'])
                metadata['protected_fields'] = sorted(protected.difference(selected))
                resolved = {field: values[field] if field in selected else record[field] for field in FIELDS}
                album_id = str(uuid4())
                db.execute('INSERT INTO albums (id,artist,title,year,tracks,metadata) VALUES (?,?,?,?,?,?)',
                           (album_id, resolved['artist'], resolved['title'], resolved['year'],
                            json.dumps(resolved['tracks'], ensure_ascii=False), json.dumps(metadata, ensure_ascii=False, sort_keys=True)))
                db.execute('UPDATE copies SET album_id=? WHERE id=?', (album_id, copy_id))
                db.execute('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM copies)')
        return self.repository.get(copy_id)
