import sqlite3
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup


def wish():
    return {'artist':'Wish Artist','title':'Wish Album','notes':'Look for a clean copy'}


def record(number='LP-00001'):
    return {'inventory_number':number,'artist':'Wish Artist','title':'Wish Album','notes':'Bought locally'}


def test_wishlist_crud_search_and_persistence_do_not_create_physical_copies(tmp_path):
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        created=client.post('/api/wishlist',json=wish());assert created.status_code==201
        item=created.json();assert 'inventory_number' not in item
        assert client.get('/api/records').json()==[]
        assert len(client.get('/api/wishlist',params={'q':'clean'}).json())==1
        assert client.get('/api/wishlist',params={'q':'missing'}).json()==[]
        updated=client.put('/api/wishlist/'+item['id'],json={**wish(),'notes':'Changed note','discogs_master_id':42}).json()
        assert updated['source_url']=='https://www.discogs.com/master/42'
        assert client.post('/api/wishlist',json={**wish(),'inventory_number':'LP-00001'}).status_code==422
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/wishlist').json()[0]['notes']=='Changed note'
        assert client.delete('/api/wishlist/'+item['id']).status_code==204
        assert client.get('/api/wishlist').json()==[]


def test_acquisition_is_atomic_retry_safe_and_keeps_wish_on_conflict(tmp_path):
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        item=client.post('/api/wishlist',json=wish()).json();url='/api/wishlist/'+item['id']+'/acquire'
        client.post('/api/records',json=record())
        assert client.post(url,json=record()).status_code==409
        assert len(client.get('/api/wishlist').json())==1
        acquired=client.post(url,json=record('LP-00002'));assert acquired.status_code==201
        copy=acquired.json();assert copy['notes']=='Bought locally'
        assert client.get('/api/wishlist').json()==[]
        assert client.post(url,json=record('LP-00002')).json()['id']==copy['id']
        assert len(client.get('/api/records').json())==2
        assert client.post(url,json=record('LP-00003')).status_code==409
        client.delete('/api/records/'+copy['id'])
        assert client.post(url,json=record('LP-00002')).status_code==409
        assert client.get('/api/wishlist').json()==[]
        assert client.put('/api/wishlist/'+item['id'],json=wish()).status_code==409


def test_provider_failure_does_not_acquire_wish_and_manual_fallback_works(setup):
    client,fixture,*_=setup
    item=client.post('/api/wishlist',json={**wish(),'discogs_master_id':42}).json()
    fixture.fail=True
    url='/api/wishlist/'+item['id']+'/acquire'
    assert client.post(url,json={**record(),'discogs_master_id':42}).status_code==502
    assert client.get('/api/records').json()==[] and len(client.get('/api/wishlist').json())==1
    assert client.post(url,json=record()).status_code==201
    assert client.get('/api/wishlist').json()==[]


def test_version_six_migration_preserves_collection(tmp_path):
    path=str(tmp_path/'legacy.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        copy=client.post('/api/records',json={**record(),'rating':5}).json()
    with sqlite3.connect(path) as db:
        db.execute('DROP TABLE wishlist');db.execute('PRAGMA user_version=6')
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/records/'+copy['id']).json()['rating']==5
        assert client.get('/api/wishlist').json()==[]
