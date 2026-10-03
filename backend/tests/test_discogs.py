import base64
import json
import sqlite3
import pytest
import httpx
from fastapi.testclient import TestClient
from fastapi import HTTPException
from app.database import Database
from app.discogs import CoverStore, DiscogsProvider, MAX_AGE, timestamp
from app.main import create_app

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=')


class DiscogsFixture:
    def __init__(self):
        self.requests = []
        self.fail = False
        self.title = 'Test Album'
        self.track = 'Opening track'
        self.image = 'https://i.discogs.com/test.png'

    def handle(self, request):
        self.requests.append(request)
        if self.fail:
            return httpx.Response(503)
        if request.url.host == 'i.discogs.com':
            assert 'Authorization' not in request.headers
            return httpx.Response(200, content=PNG, headers={'Content-Type': 'image/png'})
        assert request.headers['Authorization'] == 'Discogs token=test-secret'
        if request.url.path == '/database/search':
            assert request.url.params['type'] == 'master'
            return httpx.Response(200, json={'results': [{'type':'master','id':42,'title':'Test Artist - Test Album','year':1995}, {'type':'release','id':100}], 'pagination':{'pages':2}})
        if request.url.path == '/masters/42':
            return httpx.Response(200, json={'id':42,'title':self.title,'artists':[{'name':'Test Artist'}],'year':1995,
                'genres':['Rock'],'styles':['Indie Rock'],'main_release':100,
                'images':[{'type':'primary','uri':self.image}],
                'tracklist':[{'type_':'heading','title':'Side A'}, {'type_':'track','position':'A1','title':self.track}]})
        if request.url.path == '/releases/100':
            return httpx.Response(200,json={'labels':[{'name':'Test Label'}],'notes':'Album notes'})
        return httpx.Response(404)


@pytest.fixture
def setup(tmp_path):
    fixture = DiscogsFixture()
    transport = httpx.MockTransport(fixture.handle)
    provider = DiscogsProvider(token='test-secret', transport=transport)
    covers = CoverStore(tmp_path / 'covers', transport=transport)
    path = str(tmp_path / 'collection.sqlite3')
    with TestClient(create_app(path, provider, covers)) as client:
        yield client, fixture, provider, covers, path


def imported_payload():
    return {'inventory_number':'LP-00042','artist':'Test Artist','title':'Test Album','year':1995,
            'tracks':[{'position':'A1','title':'Opening track'}], 'discogs_master_id':42}


def expire(path):
    with sqlite3.connect(path) as db:
        for album_id, raw in db.execute('SELECT id, metadata FROM albums').fetchall():
            metadata = json.loads(raw)
            metadata['checked_at'] = timestamp() - MAX_AGE - 1
            db.execute('UPDATE albums SET metadata=? WHERE id=?',(json.dumps(metadata),album_id))


def test_search_and_preview_do_not_import_or_download(setup):
    client, fixture, _, _, _ = setup
    result = client.get('/api/metadata/discogs/search',params={'artist':'Test Artist','title':'Test Album'})
    assert result.status_code == 200
    assert len(result.json()['results']) == 1
    assert result.json()['pages'] == 2
    preview = client.get('/api/metadata/discogs/masters/42').json()
    assert preview['tracks'] == [{'position':'A1','title':'Opening track'}]
    assert preview['genres'] == ['Rock']
    assert preview['labels'] == ['Test Label']
    assert 'image_url' not in preview
    assert client.get('/api/records').json() == []
    assert not any(r.url.host == 'i.discogs.com' for r in fixture.requests)
    assert 'test-secret' not in json.dumps(preview)


def test_import_cover_attribution_and_delete_cleanup(setup):
    client, _, _, covers, _ = setup
    response = client.post('/api/records',json=imported_payload())
    assert response.status_code == 201
    record = response.json()
    assert record['source_url'] == 'https://www.discogs.com/master/42'
    assert record['reference_release_url'] == 'https://www.discogs.com/release/100'
    assert record['genres'] == ['Rock'] and record['description'] == 'Album notes'
    assert '_metadata' not in record
    cover = client.get(record['cover_url'])
    assert cover.content == PNG and cover.headers['content-type'] == 'image/png'
    assert cover.headers['cache-control'] == 'no-store'
    client.delete('/api/records/' + record['id'])
    assert not covers.path(42).exists()
    assert client.get(record['cover_url']).status_code == 404


def test_manual_edits_survive_refresh_and_other_copies_are_isolated(setup):
    client, fixture, _, _, path = setup
    first = client.post('/api/records',json=imported_payload()).json()
    second_data = imported_payload(); second_data['inventory_number'] = 'LP-00043'
    second = client.post('/api/records',json=second_data).json()
    edit = imported_payload(); edit.pop('discogs_master_id'); edit['title']='My correction'
    edit['notes'] = 'My own note'
    updated = client.put('/api/records/'+first['id'],json=edit).json()
    assert updated['protected_fields'] == ['title']
    fixture.title = 'Updated provider title'; fixture.track = 'Updated track'
    refreshed = client.post('/api/records/'+first['id']+'/refresh').json()
    assert refreshed['title'] == 'My correction'
    assert refreshed['tracks'][0]['title'] == 'Updated track'
    assert refreshed['notes'] == 'My own note'
    # Updating one copy does not change another copy until it is refreshed.
    assert client.get('/api/records/'+second['id']).json()['title'] == 'Test Album'
    expire(path)
    result = client.get('/api/records/'+second['id']).json()
    assert result['title'] == 'Updated provider title'


def test_expired_source_is_hidden_on_failure_but_manual_fields_survive(setup):
    client, fixture, provider, _, path = setup
    first = client.post('/api/records',json=imported_payload()).json()
    edit=imported_payload(); edit.pop('discogs_master_id'); edit['title']='Keep my title'
    client.put('/api/records/'+first['id'],json=edit)
    expire(path); provider.cache.clear(); fixture.fail=True
    result=client.get('/api/records/'+first['id']).json()
    assert result['title']=='Keep my title'
    assert result['artist']=='Unknown artist'
    assert result['tracks']==[] and result['genres']==[] and result['cover_url'] is None
    assert result['metadata_status']=='unavailable'
    assert client.get('/api/covers/discogs/42').status_code==404
    assert client.put('/api/records/'+first['id'],json=edit).status_code==503
    # Local manual entries remain usable even when the provider is down.
    assert client.post('/api/records',json={'inventory_number':'LP-00099','artist':'Local','title':'Manual'}).status_code==201


def test_failed_cover_does_not_block_metadata_import(setup):
    client, fixture, _, covers, _=setup
    fixture.image='http://127.0.0.1/private'
    record=client.post('/api/records',json=imported_payload()).json()
    assert record['title']=='Test Album' and record['cover_url'] is None
    assert not covers.path(42).exists()
    assert not any(r.url.host=='127.0.0.1' for r in fixture.requests)


def test_missing_token_allows_manual_entry(tmp_path):
    with TestClient(create_app(str(tmp_path/'local.sqlite3'), DiscogsProvider(token=''))) as client:
        assert client.get('/api/metadata/discogs/status').json()=={'search_configured':False}
        assert client.get('/api/metadata/discogs/search',params={'artist':'Artist'}).status_code==503
        assert client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Manual','title':'Album'}).status_code==201


def test_rate_limit_respects_cooldown_without_extra_requests():
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(429,headers={'Retry-After':'30'})
    provider=DiscogsProvider(token='test',transport=httpx.MockTransport(handler))
    for _ in range(2):
        with pytest.raises(HTTPException) as error:
            provider.search('Artist','',1)
        assert error.value.status_code==429
    assert len(calls)==1


def test_migration_preserves_version_one_records(tmp_path):
    path=str(tmp_path/'legacy.sqlite3')
    with sqlite3.connect(path) as db:
        db.executescript("""CREATE TABLE albums(id TEXT PRIMARY KEY, artist TEXT, title TEXT, year INTEGER, tracks TEXT);
        CREATE TABLE copies(id TEXT PRIMARY KEY, album_id TEXT, inventory_number TEXT UNIQUE, format TEXT, notes TEXT, created_at TEXT);
        INSERT INTO albums VALUES ('album','Legacy Artist','Legacy Album',1990,'[]');
        INSERT INTO copies VALUES ('copy','album','LP-00001','LP','Keep this','2026-01-01');
        PRAGMA user_version=1;""")
    with TestClient(create_app(path)) as client:
        record=client.get('/api/records/copy').json()
        assert record['title']=='Legacy Album' and record['notes']=='Keep this'
        assert record['metadata_status']=='manual'
    with sqlite3.connect(path) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0]==6
    Database(path).initialize()  # Migration is repeatable.


def test_future_database_version_is_rejected(tmp_path):
    path=str(tmp_path/'future.sqlite3')
    with sqlite3.connect(path) as db: db.execute('PRAGMA user_version=999')
    with pytest.raises(RuntimeError): Database(path).initialize()


def test_import_failure_does_not_create_partial_record(setup):
    client,fixture,_,_,_=setup
    fixture.fail=True
    assert client.post('/api/records',json=imported_payload()).status_code==502
    assert client.get('/api/records').json()==[]


def test_provider_outage_uses_one_upstream_request_during_cooldown():
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(503)
    provider=DiscogsProvider(token='test',transport=httpx.MockTransport(handler))
    for master_id in [42,43,44]:
        with pytest.raises(HTTPException) as error:
            provider.master(master_id)
        assert error.value.status_code==502
    assert len(calls)==1
