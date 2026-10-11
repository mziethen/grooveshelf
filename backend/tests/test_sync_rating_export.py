import json
import sqlite3
import httpx
import pytest
from test_sync import setup,apply

@pytest.fixture
def ratings(setup):
    client,fixture,path,provider,covers=setup
    fixture.remote=[{**fixture.item(11),'folder_id':5,'rating':5},{**fixture.item(12),'folder_id':1,'rating':4}]
    plan=client.get('/api/discogs/sync/preview').json()
    copies={}
    for action in plan['actions']:
        copies[action['instance_id']]=apply(client,plan,action,'import').json()['copy_id']
    client.put('/api/records/'+copies[11]+'/personal',json={'rating':2,'storage_location':'Shelf B','notes':'Keep my note'})
    original=fixture.handle
    fixture.outcome='success'
    fixture.rating_posts=[]
    def handle(request):
        if request.method=='POST' and '/instances/' in request.url.path:
            fixture.calls.append(request);fixture.rating_posts.append(request)
            assert request.headers['Authorization']=='Discogs token=secret'
            data=json.loads(request.content)
            assert set(data)=={'rating'} and type(data['rating']) is int
            iid=int(request.url.path.split('/')[-1]);entry=next(r for r in fixture.remote if r['instance_id']==iid)
            assert request.url.path==f'/users/owner/collection/folders/{entry["folder_id"]}/releases/100/instances/{iid}'
            if fixture.outcome in ('success','lost_response','readback_failure','invalid_body'):entry['rating']=data['rating']
            if fixture.outcome=='lost_response':raise httpx.ReadTimeout('response lost')
            if fixture.outcome=='denied':return httpx.Response(403)
            if fixture.outcome=='invalid_body':return httpx.Response(200,text='not JSON')
            if fixture.outcome=='readback_failure':fixture.pages=[None]
            return httpx.Response(204)
        if fixture.outcome=='readback_failure' and fixture.rating_posts and request.url.path.endswith('/collection/folders/0/releases'):
            return httpx.Response(200,json={'pagination':{'pages':1},'releases':None})
        return original(request)
    provider.transport=httpx.MockTransport(handle)
    return client,fixture,path,provider,copies

def selected(client):
    plan=client.get('/api/discogs/sync/preview').json()
    return plan,next(a for a in plan['actions'] if a['kind']=='rating' and a['instance_id']==11)

def payload(plan,action,confirmed=True):
    return {'plan_id':plan['plan_id'],'action_id':action['id'],'choice':'rating_export','confirmed':confirmed}

@pytest.mark.parametrize('rating',[None,1,5])
def test_rating_export_is_confirmed_per_instance_and_retains_local_data(ratings,rating):
    client,fixture,_,_,copies=ratings
    fixture.remote[0]['rating']=4
    client.put('/api/records/'+copies[11]+'/personal',json={'rating':rating})
    before=client.get('/api/records/'+copies[11]).json()
    plan,action=selected(client)
    assert action['can_export_rating'] and action['folder_id']==5
    assert not fixture.rating_posts
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action,False)).status_code==422
    result=client.post('/api/discogs/sync/apply',json=payload(plan,action))
    assert result.status_code==200 and result.json()['status']=='rating_exported'
    assert fixture.remote[0]['rating']==(rating or 0) and fixture.remote[1]['rating']==4
    assert client.get('/api/records/'+copies[11]).json()==before
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.rating_posts)==1
    assert not any(a['kind']=='rating' and a['instance_id']==11 for a in client.get('/api/discogs/sync/preview').json()['actions'])

@pytest.mark.parametrize('change',['account','remote','missing_rating','folder','local','link','release','missing_copy'])
def test_changed_rating_export_never_sends_a_write(ratings,change):
    client,fixture,path,_,copies=ratings
    plan,action=selected(client)
    if change=='account':fixture.account=456
    if change=='remote':fixture.remote[0]['rating']=3
    if change=='missing_rating':fixture.remote[0].pop('rating')
    if change=='folder':fixture.remote[0]['folder_id']=1
    if change=='local':client.put('/api/records/'+copies[11]+'/personal',json={'rating':3})
    if change=='link':
        with sqlite3.connect(path) as db:db.execute('UPDATE discogs_links SET copy_id=NULL WHERE instance_id=11')
    if change=='release':fixture.remote[0]['basic_information']['id']=200
    if change=='missing_copy':fixture.remote.pop(0)
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert not fixture.rating_posts

@pytest.mark.parametrize('outcome',['lost_response','denied','invalid_body','unchanged','readback_failure'])
def test_unconfirmed_outcome_consumes_action_and_never_retries(ratings,outcome):
    client,fixture,_,provider,copies=ratings
    before=client.get('/api/records/'+copies[11]).json()
    plan,action=selected(client);fixture.outcome=outcome
    response=client.post('/api/discogs/sync/apply',json=payload(plan,action))
    assert response.status_code in (502,503) and 'unconfirmed' in response.json()['detail']
    provider.retry_after=0
    fixture.outcome='success';fixture.pages=None
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.rating_posts)==1
    assert client.get('/api/records/'+copies[11]).json()==before
    fresh=client.get('/api/discogs/sync/preview').json()
    expected=outcome in ('denied','unchanged')
    assert any(a['kind']=='rating' and a['instance_id']==11 for a in fresh['actions'])==expected
    assert len(fixture.rating_posts)==1

@pytest.mark.parametrize('folder',[None,0,True,'5',-1])
def test_unknown_folders_offer_import_only(ratings,folder):
    client,fixture,*_=ratings
    fixture.remote[0]['folder_id']=folder
    plan,action=selected(client)
    assert not action['can_export_rating']
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert not fixture.rating_posts
