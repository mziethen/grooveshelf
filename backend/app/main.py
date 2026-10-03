from contextlib import asynccontextmanager
from pathlib import Path
import os
import logging
from threading import Event, Thread
from fastapi import FastAPI, HTTPException, Query, Response
from .database import Database
from .discogs import CoverStore, DiscogsProvider, fresh, public_images, MAX_AGE, source_key
from .metadata import MetadataService
from .models import Record, RecordInput, TagAssignment, ScanInput, PlayInput, FavoriteInput, ReaderStatusInput, CoverSelection, ReleaseLink, SyncAction, ExportRetry, PersonalFields, WishInput, Wish, CaptureQuery
from .listening import ListeningService
from .sync import DiscogsSync
from .wishlist import WishlistService
from .capture import CaptureService
from .export import collection_csv
from .discovery import suggest
from .statistics import statistics
from datetime import date
from typing import Literal
from .repository import CollectionRepository


def create_app(database_path=None, provider=None, covers=None, clock=None, start_worker=True):
    database = Database(database_path or os.getenv('GROOVESHELF_DATABASE', 'data/grooveshelf.sqlite3'))
    repository = CollectionRepository(database)
    provider = provider or DiscogsProvider()
    covers = covers or CoverStore(Path(database.path).parent / 'covers')
    metadata = MetadataService(repository, provider, covers)
    capture = CaptureService(repository)
    wishlist = WishlistService(database, repository, metadata)
    sync = DiscogsSync(repository, provider, metadata)
    listening = ListeningService(database, clock) if clock else ListeningService(database)

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
        try:
            yield
        finally:
            stop.set()
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
        return {key: value for key, value in listening.decorate(record).items() if not key.startswith('_')}

    @app.get('/api/health')
    def health():
        with database.connect() as db:
            db.execute('SELECT 1')
        return {'status': 'ok'}

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
            record = metadata.refresh(record_id)
        return {'images': public_images(record['_metadata']), 'source_url': record['source_url'],
                'metadata_expires_at': record['metadata_expires_at'], 'selected_id': record['cover_image_id'], 'selection_status': record['cover_selection_status']}

    @app.put('/api/records/{record_id}/cover', response_model=Record)
    def select_cover(record_id: str, data: CoverSelection):
        return public(metadata.select_cover(record_id, data.image_id))

    @app.get('/api/covers/discogs/{master_id}/{image_id}')
    def selected_cover(master_id: str, image_id: str):
        records = [metadata.present(r) for r in repository.list()
                   if (r['discogs_master_id'] or r.get('discogs_release_id')) and source_key(r['_metadata']) == master_id and r.get('cover_image_id') == image_id]
        record = next((r for r in records if fresh(r['_metadata']) and r['cover_url']), None)
        if not record:
            raise HTTPException(404, 'Cover not available.')
        image = next((i for i in record['_metadata'].get('images', []) if i['id'] == image_id), None)
        key = f'{master_id}-{image_id}'
        if not image:
            raise HTTPException(404, 'Selected image is no longer available.')
        return image_response(covers.image_content(key, image['url'], record['_metadata']['checked_at']))

    @app.get('/api/covers/discogs/{master_id}')
    def get_cover(master_id: str):
        records = [r for r in repository.list() if (r['discogs_master_id'] or r.get('discogs_release_id')) and source_key(r['_metadata']) == master_id]
        records = [metadata.present(r) for r in records]
        if not any(r['cover_url'] and fresh(r['_metadata']) for r in records) or not covers.path(master_id).exists():
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
        records = []
        for record in repository.list():
            if record['metadata_expires_at'] and not fresh(record['_metadata']):
                record = metadata.hide_stale(record)
            records.append(record)
        return statistics(database, records, start, end)

    @app.get('/api/discovery')
    def discover(mode: Literal['all', 'never', 'least', 'recent'] = 'all',
                 previous: str | None = Query(default=None, max_length=100)):
        records = []
        for record in repository.list():
            if record['metadata_expires_at'] and not fresh(record['_metadata']):
                record = metadata.hide_stale(record)
            records.append(public(record))
        result = suggest(records, mode, previous)
        if result['record']:
            result['record'] = Record.model_validate(result['record']).model_dump()
        return result

    @app.get('/api/export/collection.csv')
    def export_collection():
        records = []
        for record in repository.list():
            if record['metadata_expires_at'] and not fresh(record['_metadata']):
                record = metadata.hide_stale(record)
            records.append(public(record))
        return Response(collection_csv(records), media_type='text/csv; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="grooveshelf-collection.csv"',
                                 'X-Content-Type-Options': 'nosniff'})

    @app.get('/api/records', response_model=list[Record])
    def list_records(q: str = Query(default='', max_length=300)):
        listening.tick()
        records = [metadata.present(r) for r in repository.list()]
        query = q.strip().casefold()
        return [public(r) for r in records if not query or query in ' '.join(
            [r['artist'], r['title'], r['inventory_number']] + [t['title'] for t in r['tracks']]).casefold()]

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
        if record['metadata_expires_at'] and not fresh(record['_metadata']):
            record = metadata.hide_stale(record)
        return public(record)

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
