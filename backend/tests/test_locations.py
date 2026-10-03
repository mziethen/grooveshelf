import csv
import io
import sqlite3
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def test_per_copy_location_search_export_clear_legacy_and_restart(tmp_path):
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        payload={'inventory_number':'LP-00001','artist':'Artist','title':'Album','storage_location':'  Living room · Shelf B  '}
        first=client.post('/api/records',json=payload).json()
        second=client.post('/api/records',json={**payload,'inventory_number':'LP-00002','storage_location':'Office'}).json()
        assert first['album_id']==second['album_id']
        assert first['storage_location']=='Living room · Shelf B'
        assert [r['id'] for r in client.get('/api/records?q=SHELF B').json()]==[first['id']]
        assert client.put('/api/records/'+first['id']+'/personal',json={'storage_location':'Garage'}).json()['storage_location']=='Garage'
        assert client.get('/api/records/'+second['id']).json()['storage_location']=='Office'
        legacy={key:value for key,value in payload.items() if key!='storage_location'}
        assert client.put('/api/records/'+first['id'],json=legacy).json()['storage_location']=='Garage'
        assert client.put('/api/records/'+first['id']+'/personal',json={'notes':'Older client'}).json()['storage_location']=='Garage'
        exported=list(csv.DictReader(io.StringIO(client.get('/api/export/collection.csv').content.decode('utf-8-sig'))))
        assert exported[0]['storage_location']=='Garage'
        assert client.put('/api/records/'+first['id']+'/personal',json={'storage_location':'x'*201}).status_code==422
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/records/'+first['id']).json()['storage_location']=='Garage'
        assert client.put('/api/records/'+first['id']+'/personal',json={'storage_location':''}).json()['storage_location']==''
    with sqlite3.connect(path) as db:
        db.execute('ALTER TABLE copies DROP COLUMN storage_location');db.execute('PRAGMA user_version=8')
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/records/'+second['id']).json()['storage_location']==''
        assert client.get('/api/records/'+second['id']).json()['inventory_number']=='LP-00002'


def test_location_offline_and_metadata_refresh(setup):
    client,fixture,provider,_,path=setup
    record=client.post('/api/records',json={**imported_payload(),'storage_location':'Shelf A'}).json()
    expire(path);fixture.fail=True;provider.cache.clear();before=len(fixture.requests)
    changed=client.put('/api/records/'+record['id']+'/personal',json={'storage_location':'Shelf C'}).json()
    assert changed['storage_location']=='Shelf C' and len(fixture.requests)==before
    fixture.fail=False
    assert client.post('/api/records/'+record['id']+'/refresh').json()['storage_location']=='Shelf C'
