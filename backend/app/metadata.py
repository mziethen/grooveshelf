from threading import RLock
from fastapi import HTTPException
from .discogs import fresh


class MetadataService:
    def __init__(self, repository, provider, covers):
        self.repository = repository
        self.provider = provider
        self.covers = covers
        self.lock = RLock()

    def snapshot(self, master_id, force=False):
        metadata = self.provider.master(master_id, force=force)
        # Do not download until an import is saved or saved content needs refresh.
        metadata['cover_cached'] = self.covers.store(master_id, metadata.get('image_url'))
        if not metadata['cover_cached']:
            self.covers.clear(master_id)
        return metadata

    @staticmethod
    def hide_stale(record):
        result = dict(record)
        protected = record.get('protected_fields', [])
        for field, fallback in [('artist', 'Unknown artist'), ('title', 'Metadata temporarily unavailable'),
                                ('year', None), ('tracks', [])]:
            if field not in protected:
                result[field] = fallback
        for field in ['genres', 'styles', 'labels']:
            result[field] = []
        result['description'] = ''
        result['cover_url'] = None
        result['metadata_status'] = 'unavailable'
        return result

    def present(self, record):
        metadata = record['_metadata']
        if not metadata.get('discogs_master_id') or fresh(metadata):
            return record
        with self.lock:
            # Another request may already have refreshed this album.
            record = self.repository.get(record['id'])
            if fresh(record['_metadata']):
                return record
            try:
                snapshot = self.snapshot(metadata['discogs_master_id'])
                self.repository.refresh_album(record['album_id'], snapshot)
                return self.repository.get(record['id'])
            except HTTPException:
                return self.hide_stale(record)

    def save(self, data, copy_id=None):
        if data.discogs_master_id and (copy_id or data.album_id):
            raise HTTPException(409, 'Discogs import is only available when adding a new record. Existing manual corrections are preserved.')
        with self.lock:
            if copy_id:
                current = self.present(self.repository.get(copy_id))
                if current['metadata_status'] == 'unavailable':
                    raise HTTPException(503, 'Discogs metadata could not be refreshed. Please retry before editing this record.')
            imported = self.snapshot(data.discogs_master_id) if data.discogs_master_id else None
            try:
                return self.repository.save(data, copy_id, imported)
            finally:
                self.prune_covers()

    def refresh(self, copy_id):
        with self.lock:
            record = self.repository.get(copy_id)
            mid = record['discogs_master_id']
            if not mid:
                raise HTTPException(409, 'This record has no Discogs source.')
            snapshot = self.snapshot(mid, force=True)
            self.repository.refresh_album(record['album_id'], snapshot)
            return self.repository.get(copy_id)

    def prune_covers(self):
        referenced = {r['discogs_master_id'] for r in self.repository.list() if r['discogs_master_id']}
        if self.covers.directory.exists():
            for path in self.covers.directory.glob('discogs-master-*.img'):
                try:
                    mid = int(path.stem.removeprefix('discogs-master-'))
                except ValueError:
                    continue
                if mid not in referenced:
                    self.covers.clear(mid)

    def delete(self, copy_id):
        with self.lock:
            self.repository.delete(copy_id)
            self.prune_covers()
