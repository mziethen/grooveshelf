from .backups import BackupService
from .models import BackupPreferences, SyncFieldMapping
from contextlib import asynccontextmanager
from pathlib import Path
import os
import logging
import tempfile
import shutil
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from .archive import export_archive
from threading import Event, Thread
from fastapi import FastAPI, HTTPException, Query, Response, Request
from .database import Database
from .discogs import CoverStore, DiscogsProvider, fresh, public_images, MAX_AGE, source_key
from .metadata import MetadataService
from .models import Record, RecordInput, TagAssignment, ScanInput, PlayInput, FavoriteInput, ReaderStatusInput, CoverSelection, ReleaseLink, SyncAction, ExportRetry, PersonalFields, WishInput, Wish, CaptureQuery
from .listening import ListeningService
from .sync import DiscogsSync
from .wishlist import WishlistService
from .capture import CaptureService
from .export import collection_csv, collection_json, collection_html
from .discovery import suggest
from .statistics import statistics
from .settings import SettingsService
from .models import MetadataSettings, BulkPersonalInput
from datetime import date
from typing import Literal
from .repository import CollectionRepository
from .photos import PhotoService, MAX_UPLOAD
from .models import PersonalCoverSelection
from starlette.concurrency import run_in_threadpool
from .corrections import CorrectionsService
from .models import CorrectionChoices


def create_app(database_path=None, provider=None, covers=None, clock=None, start_worker=True):
    database = Database(database_path or os.getenv('GROOVESHELF_DATABASE', 'data/grooveshelf.sqlite3'))
    repository = CollectionRepository(database)
    provider = provider or DiscogsProvider()
    covers = covers or CoverStore(Path(database.path).parent / 'covers')
    metadata = MetadataService(repository, provider, covers)
    photos = PhotoService(database, repository)
    corrections = CorrectionsService(repository, metadata)
    settings = SettingsService(database)
    covers.retain_expired = lambda: settings.get()["show_expired_metadata"]
    capture = CaptureService(repository)
    wishlist = WishlistService(database, repository, metadata)
    sync = DiscogsSync(repository, provider, metadata)
    listening = ListeningService(database, clock) if clock else ListeningService(database)

    backups = BackupService(database, (metadata.lock, listening.lock, covers.lock))
    backup_wake = Event()

    @asynccontextmanager
    async def lifespan(app):
        database.initialize()
        listening.tick()
        stop = Event()
        def run_timer():
            while not stop.wait(1):
                try:
                    listening.tick()
                except Exception:
                    logging.getLogger(__name__).exception('Listening timer failed; retrying')
        worker = Thread(target=run_timer, daemon=True, name='grooveshelf-listening') if start_worker else None
        if worker:
            worker.start()
        def run_backups():
            while not stop.is_set():
                try: backups.tick()
                except Exception: logging.getLogger(__name__).exception('Backup scheduling failed')
                backup_wake.wait(60)
                backup_wake.clear()
        backup_worker = Thread(target=run_backups, daemon=True, name='grooveshelf-backups') if start_worker else None
        if backup_worker: backup_worker.start()
        try:
            yield
        finally:
            stop.set()
            backup_wake.set()
            if backup_worker: backup_worker.join(timeout=12)
            if worker:
                worker.join(timeout=12)

    app = FastAPI(title='GrooveShelf', version='0.2.0', lifespan=lifespan)

    @app.middleware('http')
    async def prevent_stale_api_cache(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    def public(record):
        return {key: value for key, value in photos.decorate(listening.decorate(metadata.cached(record))).items() if not key.startswith('_')}

    @app.get('/api/health')
    def health():
        with database.connect() as db:
            db.execute('SELECT 1')
        return {'status': 'ok'}

    @app.get('/api/settings', response_model=MetadataSettings)
    def get_settings():
        return settings.get()

    @app.put('/api/settings', response_model=MetadataSettings)
    def save_settings(data: MetadataSettings):
        return settings.save(data.model_dump(exclude_unset=True))

    @app.get('/api/backups')
    def backup_status():
        return backups.status()

    @app.put('/api/backups')
    def backup_settings(data: BackupPreferences):
        result = backups.configure(data.enabled)
        backup_wake.set()
        return result

    @app.post('/api/backups')
    def create_backup():
        try: return backups.create()
        except Exception as error:
            raise HTTPException(503, 'Backup failed. Existing backups are retained. Check disk space and server logs.') from error

    @app.post('/api/backups/{filename}/inspect')
    def inspect_backup(filename: str):
        try: return backups.inspect(filename)
        except FileNotFoundError: raise HTTPException(404, 'Backup not found.')
        except Exception: raise HTTPException(422, 'This backup could not be verified. Keep the original file and create another backup.')

    @app.get('/api/backups/{filename}')
    def download_backup(filename: str):
        try: path = backups.download(filename)
        except FileNotFoundError: raise HTTPException(404, 'Backup not found.')
        except Exception: raise HTTPException(422, 'This backup could not be verified. Keep the original file and create another backup.')
        return FileResponse(path, media_type='application/zip', filename=filename, headers={'X-Content-Type-Options':'nosniff'})

    @app.get('/api/metadata/discogs/status')
    def discogs_status():
        return {'search_configured': bool(provider.token)}

    @app.get('/api/metadata/discogs/search')
    def search_discogs(artist: str = Query(default='', max_length=300),
                       title: str = Query(default='', max_length=300),
                       page: int = Query(default=1, ge=1, le=50)):
        if not artist.strip() and not title.strip():
            raise HTTPException(422, 'Enter an artist or album title to search.')
        return provider.search(artist.strip(), title.strip(), page)

    @app.get('/api/metadata/discogs/identifier-search')
    def search_identifier(kind: Literal['barcode', 'catno'], value: str = Query(min_length=1, max_length=100),
                          page: int = Query(default=1, ge=1, le=50)):
        value = value.strip()
        if kind == 'barcode':
            value = value.replace(' ', '').replace('-', '')
            if not value.isascii() or not value.isdigit() or not 6 <= len(value) <= 32:
                raise HTTPException(422, 'Enter a barcode containing 6 to 32 digits.')
        elif not value:
            raise HTTPException(422, 'Enter a catalog number.')
        return provider.identifier_search(kind, value, page)

    @app.get('/api/metadata/discogs/masters/{master_id}')
    def preview_master(master_id: int):
        if master_id < 1:
            raise HTTPException(422, 'Invalid Discogs master ID.')
        snapshot = provider.master(master_id)
        result = {key: value for key, value in snapshot.items() if key not in ['image_url', 'checked_at', 'images']}
        result['images'] = public_images(snapshot)
        result['metadata_expires_at'] = snapshot['checked_at'] + MAX_AGE
        return result

    def image_response(content):
        signature = content[:12]
        content_type = 'image/png' if signature.startswith(b'\x89PNG') else 'image/webp' if signature.startswith(b'RIFF') else 'image/jpeg'
        return Response(content, media_type=content_type,
                        headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

    @app.get('/api/metadata/discogs/releases/{release_id}')
    def preview_release(release_id: int):
        if release_id < 1:
            raise HTTPException(422, 'Invalid Discogs release ID.')
        snapshot = provider.release(release_id)
        result = {key: value for key, value in snapshot.items() if key not in ['image_url', 'checked_at', 'images']}
        result['images'] = public_images(snapshot)
        result['metadata_expires_at'] = snapshot['checked_at'] + MAX_AGE
        return result

    @app.get('/api/metadata/discogs/releases/{release_id}/images/{image_id}')
    def preview_release_image(release_id: int, image_id: str):
        if release_id < 1:
            raise HTTPException(422, 'Invalid Discogs release ID.')
        snapshot = provider.release(release_id)
        image = next((i for i in snapshot.get('images', []) if i['id'] == image_id), None)
        if not image:
            raise HTTPException(404, 'Image not available.')
        return image_response(covers.image_content(f'r{release_id}-{image_id}', image['url'], snapshot['checked_at']))

    @app.get('/api/metadata/discogs/masters/{master_id}/images/{image_id}')
    def preview_image(master_id: int, image_id: str):
        if master_id < 1:
            raise HTTPException(422, 'Invalid Discogs master ID.')
        snapshot = provider.master(master_id)
        image = next((i for i in snapshot.get('images', []) if i['id'] == image_id), None)
        if not image:
            raise HTTPException(404, 'Image not available.')
        key = f'{master_id}-{image_id}'
        return image_response(covers.image_content(key, image['url'], snapshot['checked_at']))

    @app.get('/api/records/{record_id}/cover-options')
    def cover_options(record_id: str):
        record = metadata.present(repository.get(record_id))
        if not record['discogs_master_id'] and not record.get('discogs_release_id'):
            raise HTTPException(409, 'This record has no Discogs source.')
        if record['metadata_status'] == 'unavailable':
            raise HTTPException(503, 'Discogs is unavailable. Retry loading the images later.')
        if 'images' not in record['_metadata']:
            if not settings.get()['automatic_refresh']:
                raise HTTPException(503, 'Refresh this record manually before loading images.')
            record = metadata.refresh(record_id)
        images = public_images(record['_metadata'])
        for image in images:
            image['preview_url'] = f"/api/records/{record_id}/cover-images/{image['id']}"
        return {'images': images, 'source_url': record['source_url'],
                'metadata_expires_at': record['metadata_expires_at'], 'show_expired_metadata': settings.get()['show_expired_metadata'], 'selected_id': record['cover_image_id'], 'selection_status': record['cover_selection_status']}

    @app.get('/api/records/{record_id}/cover-images/{image_id}')
    def saved_cover_image(record_id: str, image_id: str):
        record = metadata.present(repository.get(record_id))
        if record['metadata_status'] == 'unavailable':
            raise HTTPException(404, 'Cover not available.')
        image = next((i for i in record['_metadata'].get('images', []) if i['id'] == image_id), None)
        if not image:
            raise HTTPException(404, 'Image not available.')
        key = f"{source_key(record['_metadata'])}-{image_id}"
        return image_response(covers.image_content(key, image['url'], record['_metadata']['checked_at'],
                                                   allow_expired=record.get('show_expired_metadata', False)))

    @app.put('/api/records/{record_id}/cover', response_model=Record)
    def select_cover(record_id: str, data: CoverSelection):
        metadata.select_cover(record_id, data.image_id)
        return public(photos.select(record_id, None))

    @app.get('/api/covers/discogs/{master_id}/{image_id}')
    def selected_cover(master_id: str, image_id: str):
        records = [metadata.present(r) for r in repository.list()
                   if (r['discogs_master_id'] or r.get('discogs_release_id')) and source_key(r['_metadata']) == master_id and r.get('cover_image_id') == image_id]
        record = next((r for r in records if r['cover_url'] and (fresh(r['_metadata']) or r.get('show_expired_metadata'))), None)
        if not record:
            raise HTTPException(404, 'Cover not available.')
        image = next((i for i in record['_metadata'].get('images', []) if i['id'] == image_id), None)
        key = f'{master_id}-{image_id}'
        if not image:
            raise HTTPException(404, 'Selected image is no longer available.')
        return image_response(covers.image_content(key, image['url'], record['_metadata']['checked_at'], allow_expired=record.get('show_expired_metadata', False)))

    @app.get('/api/covers/discogs/{master_id}')
    def get_cover(master_id: str):
        records = [r for r in repository.list() if (r['discogs_master_id'] or r.get('discogs_release_id')) and source_key(r['_metadata']) == master_id]
        records = [metadata.present(r) for r in records]
        if not any(r['cover_url'] and (fresh(r['_metadata']) or r.get('show_expired_metadata')) for r in records) or not covers.path(master_id).exists():
            raise HTTPException(404, 'Cover not available.')
        with covers.lock:
            try:
                content = covers.path(master_id).read_bytes()
            except FileNotFoundError:
                raise HTTPException(404, 'Cover not available.') from None
        return image_response(content)

    @app.get('/api/capture/next-inventory')
    def next_inventory(after: str | None = Query(default=None, pattern=r"^LP-[0-9]{5}$")):
        return capture.next_inventory(after)

    @app.post('/api/capture/duplicates')
    def possible_duplicates(data: CaptureQuery):
        return capture.duplicates(data)

    @app.get('/api/statistics')
    def listening_statistics(start: date | None = None, end: date | None = None):
        records = [metadata.cached(record) for record in repository.list()]
        return statistics(database, records, start, end)

    @app.get('/api/discovery')
    def discover(mode: Literal['all', 'never', 'least', 'recent'] = 'all',
                 previous: str | None = Query(default=None, max_length=100)):
        records = [public(record) for record in repository.list()]
        result = suggest(records, mode, previous)
        if result['record']:
            result['record'] = Record.model_validate(result['record']).model_dump()
        return result

    @app.get('/api/export/collection.zip')
    def export_portable_archive():
        directory = Path(tempfile.mkdtemp(prefix='grooveshelf-export-'))
        path = directory / 'grooveshelf-collection.zip'
        try:
            with metadata.lock, listening.lock, covers.lock:
                export_archive(database.path, path)
        except Exception as error:
            shutil.rmtree(directory, ignore_errors=True)
            logging.getLogger(__name__).exception('Portable archive export failed')
            raise HTTPException(503, 'The archive could not be created. Check server logs and available disk space.') from error
        return FileResponse(path, media_type='application/zip', filename='grooveshelf-collection.zip',
                            background=BackgroundTask(shutil.rmtree, directory),
                            headers={'X-Content-Type-Options': 'nosniff'})

    def export_records():
        records = [public(record) for record in repository.list()]
        return records

    @app.get('/api/export/collection.json')
    def export_json():
        return Response(collection_json(export_records()), media_type='application/json',
                        headers={'Content-Disposition': 'attachment; filename="grooveshelf-collection.json"',
                                 'X-Content-Type-Options': 'nosniff'})

    @app.get('/api/export/collection.html')
    def export_html():
        return Response(collection_html(export_records()), media_type='text/html; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="grooveshelf-collection.html"',
                                 'X-Content-Type-Options': 'nosniff',
                                 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"})

    @app.get('/api/export/collection.csv')
    def export_collection():
        return Response(collection_csv(export_records()), media_type='text/csv; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="grooveshelf-collection.csv"',
                                 'X-Content-Type-Options': 'nosniff'})

    @app.patch('/api/records/bulk-personal')
    def update_bulk_personal(data: BulkPersonalInput):
        return repository.save_bulk_personal(data)

    @app.get('/api/records', response_model=list[Record])
    def list_records(q: str = Query(default='', max_length=300)):
        listening.tick()
        records = [metadata.present(r) for r in repository.list()]
        query = q.strip().casefold()
        return [public(r) for r in records if not query or query in ' '.join(
            [r['artist'], r['title'], r['inventory_number'], r['storage_location']] + [t['title'] for t in r['tracks']]).casefold()]

    @app.get('/api/records/{record_id}', response_model=Record)
    def get_record(record_id: str):
        listening.tick()
        return public(metadata.present(repository.get(record_id)))

    @app.post('/api/records', response_model=Record, status_code=201)
    def create_record(data: RecordInput):
        return public(metadata.save(data))

    @app.put('/api/records/{record_id}', response_model=Record)
    def update_record(record_id: str, data: RecordInput):
        return public(metadata.save(data, record_id))

    @app.put('/api/records/{record_id}/personal', response_model=Record)
    def update_personal(record_id: str, data: PersonalFields):
        record = repository.save_personal(record_id, data)
        return public(record)

    @app.get('/api/records/{record_id}/photos')
    def list_photos(record_id: str):
        return photos.list(record_id)

    @app.post('/api/records/{record_id}/photos', status_code=201)
    async def upload_photo(record_id: str, request: Request,
                           kind: Literal['cover', 'back', 'label', 'matrix'] = 'cover',
                           caption: str = Query(default='', max_length=200)):
        repository.get(record_id)
        content = bytearray()
        async for chunk in request.stream():
            if len(content) + len(chunk) > MAX_UPLOAD:
                raise HTTPException(413, 'Choose an image up to 5 MiB.')
            content.extend(chunk)
        return await run_in_threadpool(photos.add, record_id, bytes(content), kind, caption.strip())

    @app.get('/api/photos/{photo_id}')
    def get_photo(photo_id: str):
        return Response(photos.content(photo_id), media_type='image/jpeg',
                        headers={'X-Content-Type-Options':'nosniff'})

    @app.put('/api/records/{record_id}/personal-cover', response_model=Record)
    def select_personal_cover(record_id: str, data: PersonalCoverSelection):
        return public(photos.select(record_id, data.photo_id))

    @app.delete('/api/records/{record_id}/photos/{photo_id}', status_code=204)
    def delete_photo(record_id: str, photo_id: str):
        photos.delete(record_id, photo_id)

    @app.get('/api/records/{record_id}/corrections')
    def review_corrections(record_id: str):
        return corrections.preview(record_id)

    @app.put('/api/records/{record_id}/corrections', response_model=Record)
    def resolve_corrections(record_id: str, data: CorrectionChoices):
        return public(corrections.apply(record_id, data))

    @app.post('/api/records/{record_id}/refresh', response_model=Record)
    def refresh_record(record_id: str):
        return public(metadata.refresh(record_id))

    @app.delete('/api/records/{record_id}', status_code=204)
    def delete_record(record_id: str):
        metadata.delete(record_id)
        return Response(status_code=204)

    def public_wish(wish):
        return {key:value for key,value in wish.items() if key not in ['acquired_copy_id', 'acquired_at']}

    @app.get('/api/wishlist', response_model=list[Wish])
    def list_wishlist(q: str = Query(default='', max_length=300)):
        return [public_wish(wish) for wish in wishlist.list(q)]

    @app.post('/api/wishlist', response_model=Wish, status_code=201)
    def create_wish(data: WishInput):
        return public_wish(wishlist.save(data))

    @app.put('/api/wishlist/{wish_id}', response_model=Wish)
    def update_wish(wish_id: str, data: WishInput):
        return public_wish(wishlist.update(wish_id, data))

    @app.delete('/api/wishlist/{wish_id}', status_code=204)
    def delete_wish(wish_id: str):
        wishlist.delete(wish_id)
        return Response(status_code=204)

    @app.post('/api/wishlist/{wish_id}/acquire', response_model=Record, status_code=201)
    def acquire_wish(wish_id: str, data: RecordInput):
        return public(wishlist.acquire(wish_id, data))

    @app.get('/api/discogs/sync/fields')
    def sync_fields():
        return sync.fields()

    @app.post('/api/discogs/sync/preview')
    def mapped_sync_preview(data: SyncFieldMapping):
        return sync.preview(data)

    @app.get('/api/discogs/sync/preview')
    def sync_preview():
        return sync.preview()

    @app.post('/api/discogs/sync/apply')
    def sync_apply(data: SyncAction):
        return sync.apply(data)

    @app.post('/api/records/{record_id}/discogs-export/retry')
    def allow_export_retry(record_id: str, data: ExportRetry):
        return sync.allow_export_retry(record_id)

    @app.put('/api/records/{record_id}/discogs-release', response_model=Record)
    def link_release(record_id: str, data: ReleaseLink):
        return public(sync.release_link(record_id, data.release_id))

    @app.get('/api/stations/{station_id}')
    def station_status(station_id: str):
        return listening.station(station_id)

    @app.post('/api/stations/{station_id}/reader')
    def reader_status(station_id: str, data: ReaderStatusInput):
        return listening.reader_status(station_id, data.status)

    @app.post('/api/stations/{station_id}/scans')
    def scan_tag(station_id: str, data: ScanInput):
        return listening.scan(station_id, data.uid)

    @app.post('/api/stations/{station_id}/end')
    def end_session(station_id: str):
        return listening.end_session(station_id)

    @app.put('/api/tags/{uid}')
    def assign_tag(uid: str, data: TagAssignment):
        return listening.assign(uid, data.copy_id, data.replace)

    @app.delete('/api/tags/{uid}', status_code=204)
    def remove_tag(uid: str):
        listening.remove_tag(uid)
        return Response(status_code=204)

    @app.get('/api/records/{record_id}/plays')
    def play_history(record_id: str):
        return listening.history(record_id)

    @app.post('/api/records/{record_id}/plays', status_code=201)
    def add_play(record_id: str, data: PlayInput):
        return listening.manual_play(record_id, data.played_at)

    @app.put('/api/plays/{event_id}')
    def edit_play(event_id: str, data: PlayInput):
        return listening.edit_play(event_id, data.played_at)

    @app.delete('/api/plays/{event_id}', status_code=204)
    def delete_play(event_id: str):
        listening.delete_play(event_id)
        return Response(status_code=204)

    @app.put('/api/records/{record_id}/favorite')
    def set_favorite(record_id: str, data: FavoriteInput):
        return listening.favorite(record_id, data.favorite)

    return app


app = create_app()
