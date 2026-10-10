import sqlite3
import pytest
from test_sync_fields import mapped, payload
from test_sync import setup

@pytest.fixture
def folder_sync(mapped, monkeypatch, setup):
    client, fixture, path, _, copy_id = mapped
    provider=setup[3]
    folders=[{'id':0,'name':'All'},{'id':1,'name':'Uncategorised'},{'id':5,'name':'Jazz shelf'}]
    original=provider.request
    def request(endpoint,*args,**kwargs):
        if endpoint.endswith('/collection/folders'):return {'folders':folders}
        return original(endpoint,*args,**kwargs)
    monkeypatch.setattr(provider,'request',request)
    fixture.remote[0]['folder_id']=5
    client.put('/api/records/'+copy_id+'/personal',json={'storage_location':'Shelf B','notes':'Keep my note'})
    return client,fixture,path,folders,copy_id

def preview(client):
    return client.post('/api/discogs/sync/preview',json={'account_id':'123','folder_locations':True})

def test_folder_import_requires_opt_in_and_confirmation(folder_sync):
    client,fixture,_,_,copy_id=folder_sync
    before=client.get('/api/records/'+copy_id).json()
    assert not any(a.get('field')=='storage_location' for a in client.get('/api/discogs/sync/preview').json()['actions'])
    plan=preview(client).json();action=next(a for a in plan['actions'] if a.get('field')=='storage_location')
    assert (action['local_value'],action['remote_value'])==('Shelf B','Jazz shelf')
    assert client.get('/api/records/'+copy_id).json()==before
    writes=len([r for r in fixture.calls if r.method!='GET'])
    request=payload(plan,action);request['confirmed']=False
    assert client.post('/api/discogs/sync/apply',json=request).status_code==422
    request['confirmed']=True
    assert client.post('/api/discogs/sync/apply',json=request).status_code==200
    after=client.get('/api/records/'+copy_id).json()
    assert after['storage_location']=='Jazz shelf'
    assert {k:v for k,v in before.items() if k!='storage_location'}=={k:v for k,v in after.items() if k!='storage_location'}
    assert len([r for r in fixture.calls if r.method!='GET'])==writes
    assert not any(a.get('field')=='storage_location' for a in preview(client).json()['actions'])

@pytest.mark.parametrize('change',['name','assignment','missing','local','link','account'])
def test_folder_import_rechecks_both_sides(folder_sync,change):
    client,fixture,path,folders,copy_id=folder_sync
    plan=preview(client).json();action=next(a for a in plan['actions'] if a.get('field')=='storage_location')
    if change=='name':folders[2]['name']='New meaning'
    if change=='assignment':fixture.remote[0]['folder_id']=1
    if change=='missing':folders.pop()
    if change=='local':client.put('/api/records/'+copy_id+'/personal',json={'storage_location':'Changed locally'})
    if change=='account':fixture.account=456
    if change=='link':
        with sqlite3.connect(path) as db:db.execute('UPDATE discogs_links SET copy_id=NULL')
    before=client.get('/api/records/'+copy_id).json()
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert client.get('/api/records/'+copy_id).json()==before

@pytest.mark.parametrize('folder_id',[0,1,None,999,True,'5'])
def test_unknown_and_default_folders_never_clear_locations(folder_sync,folder_id):
    client,fixture,_,_,copy_id=folder_sync
    fixture.remote[0]['folder_id']=folder_id
    result=preview(client)
    assert result.status_code==200
    assert not any(a.get('field')=='storage_location' for a in result.json()['actions'])
    assert client.get('/api/records/'+copy_id).json()['storage_location']=='Shelf B'

@pytest.mark.parametrize('invalid',['', 'x'*201, None])
def test_invalid_folder_names_fail_without_local_changes(folder_sync,invalid):
    client,_,_,folders,copy_id=folder_sync
    folders[2]['name']=invalid
    assert preview(client).status_code==502
    assert client.get('/api/records/'+copy_id).json()['storage_location']=='Shelf B'
