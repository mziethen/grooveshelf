import json
import sqlite3
import httpx
import pytest
from test_sync_folders import folder_sync, preview
from test_sync_fields import mapped
from test_sync import setup

@pytest.fixture
def moves(folder_sync, setup):
    client,fixture,path,folders,copy_id=folder_sync
    provider=setup[3]
    folders.append({'id':6,'name':'Shelf B'})
    fixture.remote[0]['rating']=3
    original=fixture.handle
    fixture.outcome='success';fixture.moves=[]
    def handle(request):
        if request.method=='POST' and '/instances/' in request.url.path:
            fixture.calls.append(request);fixture.moves.append(request)
            data=json.loads(request.content)
            assert set(data)=={'folder_id'} and type(data['folder_id']) is int
            iid=int(request.url.path.split('/')[-1]);entry=next(r for r in fixture.remote if r['instance_id']==iid)
            assert request.url.path==f'/users/owner/collection/folders/{entry["folder_id"]}/releases/100/instances/{iid}'
            if fixture.outcome in ('success','lost_response','readback_failure','invalid_body'):entry['folder_id']=data['folder_id']
            if fixture.outcome=='lost_response':raise httpx.ReadTimeout('response lost')
            if fixture.outcome=='denied':return httpx.Response(403)
            if fixture.outcome=='invalid_body':return httpx.Response(200,text='not JSON')
            if fixture.outcome=='rating_changed':entry['folder_id']=data['folder_id'];entry['rating']=0
            return httpx.Response(204)
        if fixture.outcome=='readback_failure' and fixture.moves and request.url.path.endswith('/collection/folders/0/releases'):
            return httpx.Response(200,json={'pagination':{'pages':1},'releases':None})
        return original(request)
    provider.transport=httpx.MockTransport(handle)
    return client,fixture,path,folders,copy_id,provider

def selected(client):
    plan=preview(client).json()
    return plan,next(a for a in plan['actions'] if a.get('field')=='storage_location')

def payload(plan,action,choice='folder_export',confirmed=True):
    return {'plan_id':plan['plan_id'],'action_id':action['id'],'choice':choice,'confirmed':confirmed}

def test_folder_export_moves_only_the_reviewed_instance(moves):
    client,fixture,_,_,copy_id,_=moves
    fixture.remote.append({**fixture.item(12),'folder_id':5})
    before=client.get('/api/records/'+copy_id).json()
    plan,action=selected(client)
    assert action['export_folder']=={'id':6,'name':'Shelf B'} and action['can_import'] and action['folder_id']==5
    assert not fixture.moves
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action,confirmed=False)).status_code==422
    result=client.post('/api/discogs/sync/apply',json=payload(plan,action))
    assert result.status_code==200 and result.json()=={'status':'folder_exported','copy_id':copy_id,'folder_id':6}
    assert [r['folder_id'] for r in fixture.remote]==[6,5] and fixture.remote[0]['rating']==3
    assert client.get('/api/records/'+copy_id).json()==before
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.moves)==1
    assert not any(a.get('field')=='storage_location' for a in preview(client).json()['actions'])

def test_uncategorised_copies_offer_export_but_never_import(moves):
    client,fixture,_,_,copy_id,_=moves
    fixture.remote[0]['folder_id']=1
    plan,action=selected(client)
    assert not action['can_import'] and action['export_folder']['id']==6
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action,'personal_import')).status_code==409
    assert client.get('/api/records/'+copy_id).json()['storage_location']=='Shelf B'
    plan,action=selected(client)
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==200
    assert fixture.remote[0]['folder_id']==6

@pytest.mark.parametrize('case',['no_folder','duplicate','empty','different_case'])
def test_folders_are_never_created_or_guessed(moves,case):
    client,fixture,_,folders,copy_id,_=moves
    fixture.remote[0]['folder_id']=1
    if case=='no_folder':folders.pop()
    if case=='duplicate':folders.append({'id':7,'name':'Shelf B'})
    if case=='empty':client.put('/api/records/'+copy_id+'/personal',json={'storage_location':''})
    if case=='different_case':folders[-1]['name']='shelf b'
    assert not any(a.get('field')=='storage_location' for a in preview(client).json()['actions'])
    fixture.remote[0]['folder_id']=5
    action=next(a for a in preview(client).json()['actions'] if a.get('field')=='storage_location')
    assert action['can_import'] and action['export_folder'] is None
    assert client.post('/api/discogs/sync/apply',json=payload(*selected(client))).status_code==409
    assert not fixture.moves

@pytest.mark.parametrize('change',['target_renamed','target_removed','target_duplicated','current_renamed','assignment','local','link','account','release','missing_copy'])
def test_changed_folder_export_never_sends_a_write(moves,change):
    client,fixture,path,folders,copy_id,_=moves
    plan,action=selected(client)
    if change=='target_renamed':folders[3]['name']='Shelf C'
    if change=='target_removed':folders.pop()
    if change=='target_duplicated':folders.append({'id':7,'name':'Shelf B'})
    if change=='current_renamed':folders[2]['name']='Jazz box'
    if change=='assignment':fixture.remote[0]['folder_id']=1
    if change=='local':client.put('/api/records/'+copy_id+'/personal',json={'storage_location':'Jazz shelf'})
    if change=='link':
        with sqlite3.connect(path) as db:db.execute('UPDATE discogs_links SET copy_id=NULL')
    if change=='account':fixture.account=456
    if change=='release':fixture.remote[0]['basic_information']['id']=200
    if change=='missing_copy':fixture.remote.pop(0)
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert not fixture.moves

@pytest.mark.parametrize('outcome',['lost_response','denied','invalid_body','unchanged','readback_failure','rating_changed'])
def test_unconfirmed_move_consumes_action_and_never_retries(moves,outcome):
    client,fixture,_,_,copy_id,provider=moves
    before=client.get('/api/records/'+copy_id).json()
    plan,action=selected(client);fixture.outcome=outcome
    response=client.post('/api/discogs/sync/apply',json=payload(plan,action))
    assert response.status_code in (502,503) and 'unconfirmed' in response.json()['detail']
    provider.retry_after=0;fixture.outcome='success'
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.moves)==1
    assert client.get('/api/records/'+copy_id).json()==before

def test_folder_move_is_ordered_after_same_copy_field_exports(moves):
    client,*_=moves
    plan=client.post('/api/discogs/sync/preview',json={'account_id':'123','media_condition':7,'sleeve_condition':8,'notes':9,'folder_locations':True}).json()
    fields=[a['field'] for a in plan['actions'] if a['kind']=='personal']
    assert 'notes' in fields and fields[-1]=='storage_location'
