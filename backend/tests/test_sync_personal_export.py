import json
import sqlite3
import httpx
import pytest
from test_sync import setup
from test_sync_fields import mapped,preview

@pytest.fixture
def exports(mapped,setup):
    client,fixture,path,definitions,copy_id=mapped
    provider=setup[3]
    fixture.remote[0]['folder_id']=5
    definitions[0]['options'].append('Good (G)')
    definitions[1]['options']=['Generic','Very Good (VG)']
    definitions[2]['public']=True
    client.put('/api/records/'+copy_id+'/personal',json={'media_condition':'G','sleeve_condition':'VG','notes':'My <local> note\nSecond line','storage_location':'Keep shelf'})
    fixture.field_posts=[];fixture.outcome='success'
    original=fixture.handle
    def handle(request):
        if request.method=='POST' and '/fields/' in request.url.path:
            fixture.field_posts.append(request);fixture.calls.append(request)
            assert request.headers['Authorization']=='Discogs token=secret'
            field_id=int(request.url.path.split('/')[-1])
            assert request.url.path==f'/users/owner/collection/folders/5/releases/100/instances/11/fields/{field_id}'
            data=json.loads(request.content);assert set(data)=={'value'}
            if fixture.outcome in ('success','lost','invalid','readback','omit_empty','malformed_empty'):
                next(n for n in fixture.remote[0]['notes'] if n['field_id']==field_id)['value']=data['value']
            if fixture.outcome=='omit_empty':fixture.remote[0]['notes']=[n for n in fixture.remote[0]['notes'] if n['field_id']!=field_id]
            if fixture.outcome=='malformed_empty':next(n for n in fixture.remote[0]['notes'] if n['field_id']==field_id)['value']=None
            if fixture.outcome=='lost':raise httpx.ReadTimeout('Lost response')
            if fixture.outcome=='denied':return httpx.Response(403)
            if fixture.outcome=='invalid':return httpx.Response(200,text='Invalid JSON')
            return httpx.Response(204)
        if fixture.outcome=='readback' and fixture.field_posts and request.url.path.endswith('/collection/folders/0/releases'):
            return httpx.Response(200,json={'pagination':{'pages':1},'releases':None})
        return original(request)
    provider.transport=httpx.MockTransport(handle)
    return client,fixture,path,definitions,copy_id,provider

def chosen(client,field='notes'):
    plan=preview(client).json()
    return plan,next(a for a in plan['actions'] if a.get('field')==field)

def payload(plan,action,confirmed=True):
    return {'plan_id':plan['plan_id'],'action_id':action['id'],'choice':'personal_export','confirmed':confirmed}

@pytest.mark.parametrize('field,expected',[('media_condition','Good (G)'),('sleeve_condition','Very Good (VG)'),('notes','My <local> note\nSecond line')])
def test_export_targets_exact_field_and_preserves_local_copy(exports,field,expected):
    client,fixture,_,_,copy_id,_=exports
    before=client.get('/api/records/'+copy_id).json()
    remote_before={n['field_id']:n['value'] for n in fixture.remote[0]['notes']}
    plan,action=chosen(client,field)
    assert action['export_value']==expected
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action,False)).status_code==422
    assert not fixture.field_posts
    result=client.post('/api/discogs/sync/apply',json=payload(plan,action))
    assert result.status_code==200 and result.json()['status']=='personal_exported'
    after={n['field_id']:n['value'] for n in fixture.remote[0]['notes']}
    assert after=={**remote_before,action['definition']['id']:expected}
    assert client.get('/api/records/'+copy_id).json()==before
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.field_posts)==1
    assert not any(a.get('field')==field for a in preview(client).json()['actions'])

@pytest.mark.parametrize('change',['account','definition','visibility','raw_remote','missing','duplicate','folder','local','link','release'])
def test_stale_exports_do_not_send_writes(exports,change):
    client,fixture,path,definitions,copy_id,_=exports
    plan,action=chosen(client)
    if change=='account':fixture.account=456
    if change=='definition':definitions[2]['name']='Different meaning'
    if change=='visibility':definitions[2]['public']=False
    if change=='raw_remote':fixture.remote[0]['notes'][2]['value']='Changed remotely'
    if change=='missing':fixture.remote[0]['notes'].pop()
    if change=='duplicate':fixture.remote[0]['notes'].append({'field_id':9,'value':'Another value'})
    if change=='folder':fixture.remote[0]['folder_id']=1
    if change=='local':client.put('/api/records/'+copy_id+'/personal',json={'notes':'Changed locally'})
    if change=='link':
        with sqlite3.connect(path) as db:db.execute('UPDATE discogs_links SET copy_id=NULL')
    if change=='release':fixture.remote[0]['basic_information']['id']=200
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert not fixture.field_posts

@pytest.mark.parametrize('outcome',['lost','denied','invalid','unchanged','readback'])
def test_unconfirmed_exports_are_consumed_without_retry(exports,outcome):
    client,fixture,_,_,copy_id,provider=exports
    before=client.get('/api/records/'+copy_id).json()
    plan,action=chosen(client);fixture.outcome=outcome
    result=client.post('/api/discogs/sync/apply',json=payload(plan,action))
    assert result.status_code in (502,503) and 'unconfirmed' in result.json()['detail']
    provider.retry_after=0;fixture.outcome='success'
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.field_posts)==1
    assert client.get('/api/records/'+copy_id).json()==before
    assert any(a.get('field')=='notes' for a in preview(client).json()['actions'])==(outcome in ('denied','unchanged'))


def test_clear_notes_is_explicit_and_unsupported_dropdown_values_are_not_exported(exports):
    client,fixture,_,definitions,copy_id,_=exports
    client.put('/api/records/'+copy_id+'/personal',json={'notes':''})
    plan,action=chosen(client);assert action['export_value']==''
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==200
    assert fixture.remote[0]['notes'][2]['value']==''
    definitions[0]['options']=['Mint (M)']
    plan,action=chosen(client,'media_condition');assert action['export_value'] is None
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert len(fixture.field_posts)==1


@pytest.mark.parametrize('outcome,status',[('omit_empty',200),('malformed_empty',502)])
def test_clear_readback_accepts_omitted_empty_fields_but_not_malformed_values(exports,outcome,status):
    client,fixture,_,_,copy_id,_=exports
    client.put('/api/records/'+copy_id+'/personal',json={'notes':''})
    plan,action=chosen(client);fixture.outcome=outcome
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==status
    assert len(fixture.field_posts)==1
