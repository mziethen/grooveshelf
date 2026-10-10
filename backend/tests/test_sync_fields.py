import sqlite3
import pytest
from test_sync import setup,apply,PNG


@pytest.fixture
def mapped(setup,monkeypatch):
    client,fixture,path,provider,*_=setup
    definitions=[{'id':7,'name':'My media grade','type':'dropdown','options':['Mint (M)','Very Good Plus (VG+)']},
                 {'id':8,'name':'My sleeve grade','type':'dropdown'}, {'id':9,'name':'Private notes','type':'textarea'}]
    original=provider.request
    def request(endpoint,*args,**kwargs):
        if endpoint.endswith('/collection/fields'):return {'fields':definitions}
        return original(endpoint,*args,**kwargs)
    monkeypatch.setattr(provider,'request',request)
    fixture.remote=[{**fixture.item(11),'notes':[{'field_id':7,'value':'Very Good Plus (VG+)'},{'field_id':8,'value':'Generic'},{'field_id':9,'value':'Personal <notes>\nkeep lines'}]}]
    plan=client.get('/api/discogs/sync/preview').json()
    id=apply(client,plan,plan['actions'][0],'import').json()['copy_id']
    return client,fixture,path,definitions,id


def preview(client,**kwargs):
    return client.post('/api/discogs/sync/preview',json={'account_id':'123','media_condition':7,'sleeve_condition':8,'notes':9,**kwargs})


def payload(plan,action):
    return {'plan_id':plan['plan_id'],'action_id':action['id'],'choice':'personal_import','confirmed':True}


def test_mapping_is_explicit_and_import_updates_only_selected_fields(mapped):
    client,fixture,path,definitions,id=mapped
    fields=client.get('/api/discogs/sync/fields').json()
    assert fields['account_id']=='123' and fields['fields'][0]['id']==7
    assert not any(a['kind']=='personal' for a in client.get('/api/discogs/sync/preview').json()['actions'])
    client.put('/api/records/'+id+'/personal',json={'rating':3,'media_condition':'G','sleeve_condition':'VG','notes':'My local note','storage_location':'Shelf B'})
    client.put('/api/tags/01020304',json={'copy_id':id})
    client.post('/api/records/'+id+'/plays',json={'played_at':'2026-01-01T12:00:00Z'})
    photo=client.post('/api/records/'+id+'/photos?kind=back',content=PNG,headers={'Content-Type':'image/png'}).json()
    before=client.get('/api/records/'+id).json();writes=len([r for r in fixture.calls if r.method!='GET'])
    plan=preview(client).json();actions=[a for a in plan['actions'] if a['kind']=='personal']
    assert {a['field'] for a in actions}=={'media_condition','sleeve_condition','notes'}
    assert client.get('/api/records/'+id).json()==before
    for action in actions:
        request=payload(plan,action);request['confirmed']=False
        assert client.post('/api/discogs/sync/apply',json=request).status_code==422
        request['confirmed']=True
        assert client.post('/api/discogs/sync/apply',json=request).json()['status']=='personal_imported'
        assert client.post('/api/discogs/sync/apply',json=request).status_code==409
    after=client.get('/api/records/'+id).json()
    assert (after['media_condition'],after['sleeve_condition'],after['notes'])==('VG+','Generic','Personal <notes>\nkeep lines')
    changed={'media_condition','sleeve_condition','notes'}
    assert {k:v for k,v in before.items() if k not in changed}=={k:v for k,v in after.items() if k not in changed}
    assert client.get('/api/photos/'+photo['id']).status_code==200
    assert len([r for r in fixture.calls if r.method!='GET'])==writes
    assert not any(a['kind']=='personal' for a in preview(client).json()['actions'])


@pytest.mark.parametrize('value,expected',[('',None),('Mint (M)','M'),('Near Mint (NM or M-)','NM'),('VG+','VG+'),('Generic','unknown'),('damaged','unknown'),(None,'unknown'),(123,'unknown')])
def test_condition_normalization_never_erases_unknown_values(mapped,value,expected):
    client,fixture,_,_,id=mapped
    client.put('/api/records/'+id+'/personal',json={'media_condition':'G'})
    fixture.remote[0]['notes']=[{'field_id':7,'value':value}]
    plan=preview(client,sleeve_condition=None,notes=None).json();actions=[a for a in plan['actions'] if a['kind']=='personal']
    if expected=='unknown':
        assert not actions and any(n['kind']=='personal_unavailable' for n in plan['notices'])
        assert client.get('/api/records/'+id).json()['media_condition']=='G'
    else:
        assert actions[0]['remote_value']==expected
        assert client.post('/api/discogs/sync/apply',json=payload(plan,actions[0])).status_code==200
        assert client.get('/api/records/'+id).json()['media_condition']==expected


@pytest.mark.parametrize('change',['account','definition','remote','missing','duplicate','local','link','release','long_notes'])
def test_personal_import_revalidates_definition_and_both_values(mapped,change):
    client,fixture,path,definitions,id=mapped
    plan=preview(client).json();action=next(a for a in plan['actions'] if a.get('field')=='notes')
    if change=='account':fixture.account=456
    if change=='definition':definitions[2]['name']='A different meaning'
    if change=='remote':fixture.remote[0]['notes'][2]['value']='Changed'
    if change=='missing':fixture.remote[0]['notes']=[]
    if change=='duplicate':fixture.remote[0]['notes'].append({'field_id':9,'value':'Another value'})
    if change=='long_notes':fixture.remote[0]['notes'][2]['value']='x'*10001
    if change=='local':client.put('/api/records/'+id+'/personal',json={'notes':'Changed locally'})
    if change=='link':
        with sqlite3.connect(path) as db:db.execute('UPDATE discogs_links SET copy_id=NULL')
    if change=='release':fixture.remote[0]['basic_information']['id']=200
    before=client.get('/api/records/'+id).json()
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==409
    assert client.get('/api/records/'+id).json()==before


def test_mapping_validation_and_blank_notes(mapped):
    client,fixture,_,definitions,id=mapped
    assert preview(client,account_id='456').status_code==409
    assert preview(client,notes=7).status_code==422
    assert preview(client,notes=True).status_code==422
    assert preview(client,notes=999).status_code==409
    client.put('/api/records/'+id+'/personal',json={'notes':'Keep unless confirmed'})
    fixture.remote[0]['notes']=[{'field_id':9,'value':''}]
    plan=preview(client,media_condition=None,sleeve_condition=None).json();action=plan['actions'][0]
    assert action['remote_value']==''
    assert client.get('/api/records/'+id).json()['notes']=='Keep unless confirmed'
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==200
    assert client.get('/api/records/'+id).json()['notes']==''
    definitions.append(definitions[0])
    assert client.get('/api/discogs/sync/fields').status_code==502


def test_personal_fields_keep_duplicate_instances_separate(mapped):
    client,fixture,_,_,first=mapped
    fixture.remote.append({**fixture.item(12),'notes':[{'field_id':7,'value':'Mint (M)'}]})
    plan=client.get('/api/discogs/sync/preview').json();remote=next(a for a in plan['actions'] if a['kind']=='remote')
    second=apply(client,plan,remote,'import').json()['copy_id']
    plan=preview(client,sleeve_condition=None,notes=None).json()
    actions=[a for a in plan['actions'] if a['kind']=='personal']
    assert {a['copy_id'] for a in actions}=={first,second}
    action=next(a for a in actions if a['copy_id']==second)
    assert client.post('/api/discogs/sync/apply',json=payload(plan,action)).status_code==200
    assert client.get('/api/records/'+second).json()['media_condition']=='M'
    assert client.get('/api/records/'+first).json()['media_condition'] is None
