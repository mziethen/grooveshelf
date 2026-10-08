import csv
import io
import json
import sqlite3
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.archive import restore_archive
from app.discogs import DiscogsProvider, CoverStore
from test_discogs import expire


@pytest.mark.parametrize('duration', ['3:45', '00:00', '123:59', '1:02:03', '99:59:59'])
def test_duration_persistence_and_exports(tmp_path, duration):
    path = tmp_path/'collection.sqlite3'
    with TestClient(create_app(str(path), start_worker=False)) as client:
        record = client.post('/api/records', json={'inventory_number':'LP-00001','artist':'Artist','title':'Album',
            'tracks':[{'position':'A1','title':'Track','duration':duration}]}).json()
        assert record['tracks'][0]['duration'] == duration
        assert client.get('/api/records/'+record['id']).json()['tracks'][0]['duration'] == duration
        assert client.get('/api/export/collection.json').json()['records'][0]['tracks'][0]['duration'] == duration
        row = next(csv.DictReader(io.StringIO(client.get('/api/export/collection.csv').content.decode('utf-8-sig'))))
        assert json.loads(row['tracks'])[0]['duration'] == duration
        assert 'Track · '+duration in client.get('/api/export/collection.html').text
        archive = client.get('/api/export/collection.zip')
        assert archive.status_code == 200
        archive_path=tmp_path/'collection.zip'; archive_path.write_bytes(archive.content)
    with TestClient(create_app(str(path), start_worker=False)) as client:
        assert client.get('/api/records').json()[0]['tracks'][0]['duration'] == duration
    restored=tmp_path/'restored'; restore_archive(archive_path,restored)
    with TestClient(create_app(str(restored/'grooveshelf.sqlite3'),start_worker=False)) as client:
        assert client.get('/api/records').json()[0]['tracks'][0]['duration'] == duration
    with sqlite3.connect(path) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 10


@pytest.mark.parametrize('duration', ['3:5','3:60','-1:00','1:60:00','1234:00','3 minutes',None,123])
def test_invalid_durations_are_rejected(tmp_path, duration):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'), start_worker=False)) as client:
        assert client.post('/api/records', json={'inventory_number':'LP-00001','artist':'Artist','title':'Album',
            'tracks':[{'position':'A1','title':'Track','duration':duration}]}).status_code == 422
        assert client.get('/api/records').json() == []


def test_old_track_payload_remains_compatible(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'), start_worker=False)) as client:
        tracks=[{'position':'A1','title':'Track'}]
        result=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album','tracks':tracks}).json()
        assert result['tracks'] == tracks
        assert client.get('/api/records/'+result['id']).json()['tracks'] == tracks


@pytest.fixture
def duration_provider(tmp_path):
    fixture={'duration':'3:45','fail':False}
    def handle(request):
        if fixture['fail']: return httpx.Response(503)
        return httpx.Response(200,json={'id':900,'title':'Timed album','artists':[{'name':'Timed artist'}],
            'formats':[{'name':'Vinyl','descriptions':['LP']}], 'tracklist':[
                {'type_':'heading','title':'Side A','duration':'9:00'},
                {'position':'A1','title':'Track one','duration':fixture['duration']},
                {'position':'A2','title':'Suite','sub_tracks':[
                    {'position':'A2a','title':'Part one','duration':'1:02:03'},
                    {'position':'A2b','title':'Part two','duration':'bad'}]},
                {'position':'B1','title':'Unknown length','duration':None}]})
    transport=httpx.MockTransport(handle)
    path=tmp_path/'collection.sqlite3'
    provider=DiscogsProvider(token='test',transport=transport)
    fixture['provider']=provider
    with TestClient(create_app(str(path),provider=provider,
                               covers=CoverStore(tmp_path/'covers',transport=transport),start_worker=False)) as client:
        yield client,fixture,path


def imported(client):
    preview=client.get('/api/metadata/discogs/releases/900').json()
    assert preview['tracks'] == [{'position':'A1','title':'Track one','duration':'3:45'},
        {'position':'A2a','title':'Part one','duration':'1:02:03'},
        {'position':'A2b','title':'Part two'}, {'position':'B1','title':'Unknown length'}]
    return client.post('/api/records',json={'inventory_number':'LP-00900','artist':preview['artist'],
        'title':preview['title'],'tracks':preview['tracks'],'discogs_release_id':900}).json()


def test_provider_duration_refresh_and_protected_corrections(duration_provider):
    client,fixture,_=duration_provider
    record=imported(client)
    assert 'tracks' not in record['protected_fields']
    fixture['duration']='4:01'
    result=client.post('/api/records/'+record['id']+'/refresh').json()
    assert result['tracks'][0]['duration'] == '4:01'
    tracks=result['tracks']; tracks[0]['duration']='4:02'
    edited=client.put('/api/records/'+record['id'],json={'inventory_number':'LP-00900','artist':result['artist'],
        'title':result['title'],'tracks':tracks}).json()
    assert 'tracks' in edited['protected_fields']
    fixture['duration']='5:00'
    assert client.post('/api/records/'+record['id']+'/refresh').json()['tracks'][0]['duration'] == '4:02'


def test_expired_provider_tracks_and_durations_are_hidden(duration_provider):
    client,fixture,path=duration_provider
    record=imported(client)
    expire(path); fixture['provider'].cache.clear(); fixture['fail']=True
    assert client.get('/api/records/'+record['id']).json()['tracks'] == []
    assert client.get('/api/export/collection.json').json()['records'][0]['tracks'] == []
