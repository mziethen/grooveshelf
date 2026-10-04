import sqlite3
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def test_settings_defaults_validation_persistence_and_migration(tmp_path):
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,start_worker=False)) as client:
        assert client.get('/api/settings').json()=={'automatic_refresh':True,'confirm_import':True,'show_expired_metadata':False}
        assert client.put('/api/settings',json={'automatic_refresh':'false','confirm_import':True}).status_code==422
        assert client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':False}).json()=={'automatic_refresh':False,'confirm_import':False,'show_expired_metadata':False}
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
    client.put('/api/settings',json={'automatic_refresh':True,'confirm_import':True,'show_expired_metadata':False})
    before=len(fixture.requests);assert client.get(f"/api/records/{record['id']}").json()['tracks']
    assert len(fixture.requests)>before


def test_saved_expired_data_is_opt_in_persistent_and_reversible(setup):
    from test_discogs import PNG
    client, fixture, _, covers, path = setup
    record = client.post('/api/records', json=imported_payload()).json()
    assert record['show_expired_metadata'] is False
    image_id = client.get(f"/api/records/{record['id']}/cover-options").json()['images'][0]['id']
    selected = client.put(f"/api/records/{record['id']}/cover", json={'image_id': image_id}).json()
    settings = {'automatic_refresh': False, 'confirm_import': True, 'show_expired_metadata': True}
    assert client.put('/api/settings', json=settings).json() == settings
    # Old clients must not reset an existing opt-in.
    client.put('/api/settings', json={'automatic_refresh': False, 'confirm_import': True})
    with TestClient(create_app(path, start_worker=False)) as restarted:
        assert restarted.get('/api/settings').json()['show_expired_metadata']
    expire(path)
    before = len(fixture.requests)
    shown = client.get(f"/api/records/{record['id']}").json()
    assert shown['metadata_status'] == 'stale' and shown['show_expired_metadata']
    assert shown['tracks'] == record['tracks'] and shown['description'] == record['description']
    assert shown['metadata_checked_at'] < shown['metadata_expires_at']
    assert client.get(selected['cover_url']).content == PNG
    assert client.get('/api/covers/discogs/42').content == PNG
    options = client.get(f"/api/records/{record['id']}/cover-options").json()
    assert options['show_expired_metadata']
    assert client.get(options['images'][0]['preview_url']).content == PNG
    assert client.get('/api/records').json()[0]['metadata_status'] == 'stale'
    assert 'Opening track' in client.get('/api/export/collection.json').text
    assert 'Opening track' in client.get('/api/export/collection.html').text
    assert 'Test Album' in client.get('/api/export/collection.csv').text
    assert client.get('/api/discovery').json()['record']['title'] == 'Test Album'
    assert client.get('/api/statistics').status_code == 200
    edit = imported_payload(); edit.pop('discogs_master_id'); edit['notes'] = 'Keep this local note'
    edited = client.put(f"/api/records/{record['id']}", json=edit)
    assert edited.status_code == 200 and edited.json()['metadata_status'] == 'stale'
    assert edited.json()['notes'] == 'Keep this local note'
    assert len(fixture.requests) == before
    # Unrelated explicit image previews must not prune opted-in cached covers.
    import os
    from app.discogs import timestamp, MAX_AGE
    os.utime(covers.path(42), (timestamp()-MAX_AGE-10,)*2)
    assert covers.store('unrelated', fixture.image)
    assert covers.path(42).exists()
    covers.path(f'42-{image_id}').unlink()
    before = len(fixture.requests)
    assert client.get(selected['cover_url']).status_code == 404
    assert len(fixture.requests) == before
    client.put('/api/settings', json={**settings, 'show_expired_metadata': False})
    hidden = client.get(f"/api/records/{record['id']}").json()
    assert hidden['metadata_status'] == 'unavailable' and hidden['tracks'] == []
    assert client.get('/api/covers/discogs/42').status_code == 404


def test_saved_data_fallback_and_failed_manual_refresh_preserve_snapshot(setup):
    client, fixture, provider, covers, path = setup
    record = client.post('/api/records', json=imported_payload()).json()
    client.put('/api/settings', json={'automatic_refresh': True, 'confirm_import': True, 'show_expired_metadata': True})
    expire(path); provider.cache.clear(); fixture.fail = True
    shown = client.get(f"/api/records/{record['id']}").json()
    assert shown['metadata_status'] == 'stale' and shown['tracks']
    original = covers.path(42).read_bytes()
    assert client.post(f"/api/records/{record['id']}/refresh").status_code == 502
    assert covers.path(42).read_bytes() == original
    assert client.get(f"/api/records/{record['id']}").json()['tracks'] == record['tracks']
    assert client.put('/api/settings', json={'automatic_refresh': True, 'confirm_import': True, 'show_expired_metadata': 'true'}).status_code == 422
