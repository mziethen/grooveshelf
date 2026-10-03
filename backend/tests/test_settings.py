import sqlite3
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def test_settings_defaults_validation_persistence_and_migration(tmp_path):
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/settings').json()=={'automatic_refresh':True,'confirm_import':True}
        assert client.put('/api/settings',json={'automatic_refresh':'false','confirm_import':True}).status_code==422
        assert client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':False}).json()=={'automatic_refresh':False,'confirm_import':False}
    with TestClient(create_app(path,start_worker=False)) as client:
        assert not client.get('/api/settings').json()['automatic_refresh']
    with sqlite3.connect(path) as db:
        db.execute('DROP TABLE settings');db.execute('PRAGMA user_version=7')
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/settings').json()['automatic_refresh']


def test_disabled_refresh_hides_expired_metadata_preserves_corrections_and_manual_refresh(setup):
    client,fixture,_,_,path=setup
    data=imported_payload();data['title']='Personal title'
    record=client.post('/api/records',json=data).json()
    client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':True})
    expire(path);before=len(fixture.requests)
    shown=client.get(f"/api/records/{record['id']}").json()
    assert shown['title']=='Personal title' and shown['tracks']==[] and shown['cover_url'] is None
    assert len(fixture.requests)==before
    assert client.get(f"/api/records/{record['id']}/cover-options").status_code==503
    assert len(fixture.requests)==before
    refreshed=client.post(f"/api/records/{record['id']}/refresh").json()
    assert refreshed['title']=='Personal title' and refreshed['tracks']
    assert len(fixture.requests)>before
    expire(path)
    client.put('/api/settings',json={'automatic_refresh':True,'confirm_import':True})
    before=len(fixture.requests);assert client.get(f"/api/records/{record['id']}").json()['tracks']
    assert len(fixture.requests)>before
