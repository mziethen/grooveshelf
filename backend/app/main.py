from contextlib import asynccontextmanager
from pathlib import Path
import os
import logging
from threading import Event, Thread
from fastapi import FastAPI, HTTPException, Query, Response
from .database import Database
from .discogs import CoverStore, DiscogsProvider, fresh
from .metadata import MetadataService
from .models import Record, RecordInput, TagAssignment, ScanInput, PlayInput, FavoriteInput, ReaderStatusInput
from .listening import ListeningService
from .repository import CollectionRepository


def create_app(database_path=None, provider=None, covers=None, clock=None, start_worker=True):
    database = Database(database_path or os.getenv('GROOVESHELF_DATABASE', 'data/grooveshelf.sqlite3'))
    repository = CollectionRepository(database)
    provider = provider or DiscogsProvider()
    covers = covers or CoverStore(Path(database.path).parent / 'covers')
    metadata = MetadataService(repository, provider, covers)
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

    @app.get('/api/metadata/discogs/masters/{master_id}')
    def preview_master(master_id: int):
        if master_id < 1:
            raise HTTPException(422, 'Invalid Discogs master ID.')
        result = provider.master(master_id)
        return {key: value for key, value in result.items() if key not in ['image_url', 'checked_at']}

    @app.get('/api/covers/discogs/{master_id}')
    def get_cover(master_id: int):
        records = [r for r in repository.list() if r['discogs_master_id'] == master_id]
        records = [metadata.present(r) for r in records]
        if not any(r['cover_url'] and fresh(r['_metadata']) for r in records) or not covers.path(master_id).exists():
            raise HTTPException(404, 'Cover not available.')
        with covers.lock:
            try:
                content = covers.path(master_id).read_bytes()
            except FileNotFoundError:
                raise HTTPException(404, 'Cover not available.') from None
        signature = content[:12]
        content_type = 'image/png' if signature.startswith(b'\x89PNG') else 'image/webp' if signature.startswith(b'RIFF') else 'image/jpeg'
        return Response(content, media_type=content_type,
                            headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

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

    @app.post('/api/records/{record_id}/refresh', response_model=Record)
    def refresh_record(record_id: str):
        return public(metadata.refresh(record_id))

    @app.delete('/api/records/{record_id}', status_code=204)
    def delete_record(record_id: str):
        metadata.delete(record_id)
        return Response(status_code=204)

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
