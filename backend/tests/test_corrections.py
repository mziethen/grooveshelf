import json
import sqlite3
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def corrected(client):
    record = client.post('/api/records', json=imported_payload()).json()
    edit = imported_payload(); edit.pop('discogs_master_id')
    edit.update(artist='My artist',title='My album',year=2001,tracks=[{'position':'A1','title':'My track','duration':'4:01'}],notes='My notes')
    record = client.put('/api/records/'+record['id'], json=edit).json()
    return record


def test_review_is_read_only_and_choices_isolate_shared_copies(setup):
    client, fixture, _, _, path = setup
    record = corrected(client)
    second = client.post('/api/records', json={'inventory_number':'LP-00043','artist':record['artist'], 'title':record['title'],'album_id':record['album_id']}).json()
    assert second['album_id'] == record['album_id']
    client.put('/api/tags/04112233445566', json={'copy_id':record['id']})
    client.post('/api/records/'+record['id']+'/plays', json={'played_at':'2026-10-01T10:00:00Z'})
    before = len(fixture.requests)
    preview = client.get('/api/records/'+record['id']+'/corrections').json()
    assert [item['field'] for item in preview['fields']] == ['artist','title','year','tracks']
    assert preview['fields'][1]['current'] == 'My album' and preview['fields'][1]['provider'] == 'Test Album'
    assert preview['metadata_checked_at'] and preview['source_url']
    assert client.get('/api/records/'+record['id']).json()['title'] == 'My album'
    result = client.put('/api/records/'+record['id']+'/corrections', json={'revision':preview['revision'], 'choices':{'artist':'keep','title':'provider','year':'keep','tracks':'provider'}})
    assert result.status_code == 200
    shown=result.json()
    assert shown['title']=='Test Album' and shown['tracks']==imported_payload()['tracks']
    assert shown['artist']=='My artist' and shown['year']==2001
    assert shown['protected_fields']==['artist','year']
    assert shown['notes']=='My notes' and shown['nfc_uid']=='04112233445566' and shown['play_count']==1
    assert shown['inventory_number']==record['inventory_number'] and shown['cover_url']==record['cover_url']
    untouched=client.get('/api/records/'+second['id']).json()
    assert untouched['title']=='My album' and untouched['protected_fields']==record['protected_fields']
    assert len(fixture.requests)==before
    with TestClient(create_app(path, start_worker=False)) as restarted:
        assert restarted.get('/api/records/'+record['id']).json()['protected_fields']==['artist','year']
    fixture.title='New Discogs title'
    updated=client.post('/api/records/'+record['id']+'/refresh').json()
    assert updated['title']=='New Discogs title' and updated['artist']=='My artist'
    assert client.get('/api/records/'+second['id']).json()['title']=='My album'


def test_keep_all_is_noop_and_concurrent_changes_are_rejected(setup):
    client, _, _, _, _ = setup
    record=corrected(client);url='/api/records/'+record['id']+'/corrections'
    preview=client.get(url).json();choices={item['field']:'keep' for item in preview['fields']}
    result=client.put(url,json={'revision':preview['revision'],'choices':choices}).json()
    assert result['album_id']==record['album_id'] and result['protected_fields']==record['protected_fields']
    client.put('/api/records/'+record['id']+'/personal',json={'notes':'Updated elsewhere','rating':5})
    assert client.put(url,json={'revision':preview['revision'],'choices':choices}).json()['notes']=='Updated elsewhere'
    client.post('/api/records/'+record['id']+'/refresh')
    assert client.put(url,json={'revision':preview['revision'],'choices':choices}).status_code==409
    new=client.get(url).json()
    assert client.put(url,json={'revision':new['revision'],'choices':{'title':'provider'}}).status_code==409
    assert client.put(url,json={'revision':new['revision'],'choices':{**choices,'notes':'provider'}}).status_code==422
    assert client.put(url,json={'revision':new['revision'],'choices':{**choices,'title':'overwrite'}}).status_code==422


def test_saved_expiry_policy_and_missing_provider_values(setup):
    client, fixture, _, _, path=setup
    record=corrected(client);url='/api/records/'+record['id']+'/corrections'
    expire(path);before=len(fixture.requests)
    assert client.get(url).status_code==503
    assert len(fixture.requests)==before
    client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':True,'show_expired_metadata':True})
    preview=client.get(url).json();assert preview['metadata_status']=='stale'
    with sqlite3.connect(path) as db:
        raw=db.execute('SELECT metadata FROM albums WHERE id=?',(record['album_id'],)).fetchone()[0]
        metadata=json.loads(raw);metadata.pop('title');db.execute('UPDATE albums SET metadata=? WHERE id=?',(json.dumps(metadata),record['album_id']))
    preview=client.get(url).json()
    title=next(item for item in preview['fields'] if item['field']=='title');assert not title['available']
    choices={item['field']:'keep' for item in preview['fields']};choices['title']='provider'
    assert client.put(url,json={'revision':preview['revision'],'choices':choices}).status_code==409
    choices['title']='keep';assert client.put(url,json={'revision':preview['revision'],'choices':choices}).status_code==200
    client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':True,'show_expired_metadata':False})
    assert client.put(url,json={'revision':preview['revision'],'choices':choices}).status_code==503
    manual=client.post('/api/records',json={'inventory_number':'LP-00099','artist':'Manual','title':'Manual'}).json()
    assert client.get('/api/records/'+manual['id']+'/corrections').status_code==409
    assert len(fixture.requests)==before
