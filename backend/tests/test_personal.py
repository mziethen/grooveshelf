import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def test_personal_fields_are_per_copy_persist_and_survive_legacy_updates(tmp_path):
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        payload={'inventory_number':'LP-00001','artist':'Artist','title':'Album','rating':5,'media_condition':'VG+','sleeve_condition':'Generic','notes':'Keep notes'}
        first=client.post('/api/records',json=payload).json()
        second=client.post('/api/records',json={**payload,'inventory_number':'LP-00002','rating':2}).json()
        assert first['album_id']==second['album_id']
        updated=client.put('/api/records/'+first['id']+'/personal',json={'rating':3,'media_condition':'NM','sleeve_condition':'No Cover','notes':'Changed notes'}).json()
        assert updated['rating']==3 and updated['media_condition']=='NM'
        assert updated['artist']=='Artist' and updated['title']=='Album'
        assert client.get('/api/records/'+second['id']).json()['rating']==2
        # Older clients omit new personal fields when changing album details.
        legacy={'inventory_number':'LP-00001','artist':'Artist','title':'Edited Album','notes':'Changed notes'}
        assert client.put('/api/records/'+first['id'],json=legacy).json()['rating']==3
    with TestClient(create_app(path,start_worker=False)) as client:
        record=client.get('/api/records/'+first['id']).json()
        assert record['rating']==3 and record['sleeve_condition']=='No Cover'
        cleared=client.put('/api/records/'+first['id']+'/personal',json={'rating':None,'media_condition':None,'sleeve_condition':None,'notes':''}).json()
        assert cleared['rating'] is None and cleared['media_condition'] is None and cleared['notes']==''


@pytest.mark.parametrize('changes',[{'rating':0},{'rating':6},{'rating':1.5},{'rating':True},{'media_condition':'Generic'},{'sleeve_condition':'EX'}])
def test_invalid_values_do_not_modify_the_copy(tmp_path,changes):
    with TestClient(create_app(str(tmp_path/'db.sqlite3'),start_worker=False)) as client:
        record=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album','rating':4}).json()
        assert client.put('/api/records/'+record['id']+'/personal',json=changes).status_code==422
        assert client.get('/api/records/'+record['id']).json()['rating']==4


def test_offline_personal_edit_does_not_call_provider_and_refresh_preserves_it(setup):
    client,fixture,provider,_,path=setup
    record=client.post('/api/records',json=imported_payload()).json()
    expire(path);provider.cache.clear();fixture.fail=True
    before=len(fixture.requests)
    changed=client.put('/api/records/'+record['id']+'/personal',json={'rating':5,'media_condition':'VG','sleeve_condition':'G+','notes':'Offline note'})
    assert changed.status_code==200 and changed.json()['metadata_status']=='unavailable'
    assert changed.json()['rating']==5 and changed.json()['notes']=='Offline note'
    assert len(fixture.requests)==before
    fixture.fail=False
    refreshed=client.post('/api/records/'+record['id']+'/refresh').json()
    assert refreshed['rating']==5 and refreshed['media_condition']=='VG' and refreshed['notes']=='Offline note'


def test_migration_keeps_version_five_data(tmp_path):
    path=str(tmp_path/'legacy.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        record=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album','notes':'Original notes'}).json()
    with sqlite3.connect(path) as db:
        for column in ['rating','media_condition','sleeve_condition']:db.execute(f'ALTER TABLE copies DROP COLUMN {column}')
        db.execute('PRAGMA user_version=5')
    with TestClient(create_app(path,start_worker=False)) as client:
        migrated=client.get('/api/records/'+record['id']).json()
        assert migrated['notes']=='Original notes' and migrated['rating'] is None
        assert migrated['media_condition'] is None
