from threading import RLock
from fastapi import HTTPException
from .discogs import fresh, source_key
from .settings import SettingsService


class MetadataService:
    def __init__(self, repository, provider, covers):
        self.repository = repository
        self.provider = provider
        self.covers = covers
        self.lock = RLock()
        self.settings = SettingsService(repository.database)

    def snapshot(self, master_id=None, force=False, release_id=None):
        metadata = self.provider.release(release_id, force=force) if release_id else self.provider.master(master_id, force=force)
        # Do not download until an import is saved or saved content needs refresh.
        metadata['cover_cached'] = self.covers.store(source_key(metadata), metadata.get('image_url'))
        if not metadata['cover_cached']:
            self.covers.clear(source_key(metadata))
        return metadata

    @staticmethod
    def hide_stale(record):
        result = dict(record)
        protected = record.get('protected_fields', [])
        for field, fallback in [('artist', 'Unknown artist'), ('title', 'Metadata temporarily unavailable'),
                                ('year', None), ('tracks', [])]:
            if field not in protected:
                result[field] = fallback
        for field in ['genres', 'styles', 'labels', 'credits']:
            result[field] = []
        result['credits_source_url'] = None
        result['description'] = ''
        result['cover_url'] = None
        result['metadata_status'] = 'unavailable'
        return result

    def present(self, record):
        metadata = record['_metadata']
        if not (metadata.get('discogs_master_id') or metadata.get('discogs_release_id')) or fresh(metadata):
            return record
        with self.lock:
            # Another request may already have refreshed this album.
            record = self.repository.get(record['id'])
            if fresh(record['_metadata']):
                return record
            if not self.settings.get()['automatic_refresh']:
                return self.hide_stale(record)
            try:
                snapshot = self.snapshot(metadata.get('discogs_master_id'), release_id=metadata.get('discogs_release_id'))
                self.repository.refresh_album(record['album_id'], snapshot)
                return self.repository.get(record['id'])
            except HTTPException:
                return self.hide_stale(record)

    def save(self, data, copy_id=None, wish_id=None):
        if (data.discogs_master_id or data.discogs_release_id) and (copy_id or data.album_id):
            raise HTTPException(409, 'Discogs import is only available when adding a new record. Existing manual corrections are preserved.')
        with self.lock:
            if copy_id:
                current = self.present(self.repository.get(copy_id))
                if current['metadata_status'] == 'unavailable':
                    raise HTTPException(503, 'Discogs metadata could not be refreshed. Please retry before editing this record.')
            imported = self.snapshot(data.discogs_master_id, release_id=data.discogs_release_id) if data.discogs_master_id or data.discogs_release_id else None
            if data.cover_image_id and not copy_id:
                if not imported or not any(i['id'] == data.cover_image_id for i in imported.get('images', [])):
                    raise HTTPException(409, 'The selected image is no longer available. Choose another cover.')
            try:
                return self.repository.save(data, copy_id, imported, wish_id=wish_id)
            finally:
                self.prune_covers()

    def refresh(self, copy_id):
        with self.lock:
            record = self.repository.get(copy_id)
            mid = record['discogs_master_id']
            if not mid and not record.get('discogs_release_id'):
                raise HTTPException(409, 'This record has no Discogs source.')
            snapshot = self.snapshot(mid, force=True, release_id=record.get('discogs_release_id'))
            self.repository.refresh_album(record['album_id'], snapshot)
            return self.repository.get(copy_id)

    def select_cover(self, copy_id, image_id):
        with self.lock:
            record = self.present(self.repository.get(copy_id))
            if not record['discogs_master_id'] and not record.get('discogs_release_id'):
                raise HTTPException(409, 'This record has no Discogs source.')
            if image_id:
                if record['metadata_status'] == 'unavailable':
                    raise HTTPException(503, 'Discogs is unavailable. Retry before choosing a cover.')
                image = next((i for i in record['_metadata'].get('images', []) if i['id'] == image_id), None)
                if not image:
                    raise HTTPException(409, 'The selected image is no longer available. Choose another cover.')
                self.covers.image_content(f"{source_key(record['_metadata'])}-{image_id}", image['url'], record['_metadata']['checked_at'])
            return self.repository.select_cover(copy_id, image_id)

    def prune_covers(self):
        referenced = {source_key(r['_metadata']) for r in self.repository.list() if r['discogs_master_id'] or r.get('discogs_release_id')}
        if self.covers.directory.exists():
            for path in self.covers.directory.glob('discogs-master-*.img'):
                mid = path.stem.removeprefix('discogs-master-').split('-')[0]
                if mid not in referenced:
                    path.unlink(missing_ok=True)

    def delete(self, copy_id):
        with self.lock:
            self.repository.delete(copy_id)
            self.prune_covers()
