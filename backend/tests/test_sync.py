import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.discogs import DiscogsProvider, CoverStore
from test_discogs import PNG


class Fixture:
    def __init__(self):
        self.remote = []
        self.account = 123
        self.next_instance = 1000
        self.fail_post = False
        self.calls = []
        self.pages = None

    def item(self, iid, rid=100):
        return {'instance_id':iid,'basic_information':{'id':rid,'title':'Remote Album','artists':[{'name':'Remote Artist'}],'formats':[{'name':'Vinyl'}]}}

    def handle(self, request):
        self.calls.append(request)
        if request.url.host == 'i.discogs.com':
            assert 'Authorization' not in request.headers
            return httpx.Response(200,content=PNG)
        assert request.headers['Authorization']=='Discogs token=secret'
        if request.url.path == '/oauth/identity':return httpx.Response(200,json={'id':self.account,'username':'owner'})
        if request.method == 'POST':
            self.next_instance += 1
            self.remote.append(self.item(self.next_instance,int(request.url.path.split('/')[-1])))
            return httpx.Response(503) if self.fail_post else httpx.Response(201,json={'instance_id':self.next_instance})
        if request.url.path.endswith('/collection/folders/0/releases'):
            if self.pages:
                page=int(request.url.params['page']);return httpx.Response(200,json={'pagination':{'pages':len(self.pages)},'releases':self.pages[page-1]})
            return httpx.Response(200,json={'pagination':{'pages':1},'releases':self.remote})
        if request.url.path.startswith('/releases/'):
            rid=int(request.url.path.split('/')[-1])
            return httpx.Response(200,json={'id':rid,'master_id':42,'title':'Remote Album','artists':[{'name':'Remote Artist'}], 'year':2000,
                'formats':[{'name':'Vinyl','descriptions':['LP']}],'tracklist':[{'position':'A1','title':'Remote Track'}],
                'images':[{'type':'primary','uri':'https://i.discogs.com/discogs-images/front.png'},{'type':'secondary','uri':'https://i.discogs.com/discogs-images/back.png'}]})
        return httpx.Response(404)


@pytest.fixture
def setup(tmp_path):
    fixture=Fixture();transport=httpx.MockTransport(fixture.handle)
    provider=DiscogsProvider(token='secret',transport=transport)
    covers=CoverStore(tmp_path/'covers',transport=transport)
    path=str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path,provider,covers,start_worker=False)) as client:
        yield client,fixture,path,provider,covers


def local(client, number='LP-00001'):
    return client.post('/api/records',json={'inventory_number':number,'artist':'My Artist','title':'My Title','notes':'Personal notes','year':1990,'tracks':[{'position':'B1','title':'My Track'}]}).json()


def apply(client,plan,action,choice,copy_id=None):
    return client.post('/api/discogs/sync/apply',json={'plan_id':plan['plan_id'],'action_id':action['id'],'choice':choice,'copy_id':copy_id})


def test_import_number_allocation_multiple_copies_and_repeat_sync(setup):
    client,fixture,*_=setup
    local(client)
    fixture.remote=[fixture.item(11),fixture.item(12)]
    plan=client.get('/api/discogs/sync/preview').json()
    assert len(plan['actions'])==2 and any(n['kind']=='unlinked' for n in plan['notices'])
    one=apply(client,plan,plan['actions'][0],'import').json()
    two=apply(client,plan,plan['actions'][1],'import').json()
    assert one['inventory_number']=='LP-00002' and two['inventory_number']=='LP-00003'
    assert one['copy_id']!=two['copy_id']
    record=client.get('/api/records/'+one['copy_id']).json()
    assert record['discogs_release_id']==100 and record['format']=='LP'
    assert record['cover_url']=='/api/covers/discogs/r100'
    assert client.get(record['cover_url']).status_code==200
    options=client.get('/api/records/'+one['copy_id']+'/cover-options').json()
    assert f"/records/{one['copy_id']}/cover-images/" in options['images'][1]['preview_url']
    assert client.get(options['images'][1]['preview_url']).status_code == 200
    assert client.get(options['images'][1]['preview_url']).status_code==200
    cover=client.put('/api/records/'+one['copy_id']+'/cover',json={'image_id':options['images'][1]['id']}).json()
    assert client.get(cover['cover_url']).status_code==200
    assert apply(client,plan,plan['actions'][0],'import').status_code==409
    repeat=client.get('/api/discogs/sync/preview').json()
    assert repeat['actions']==[] and repeat['last_success_at']
    assert not any(request.method=='POST' for request in fixture.calls)


def test_release_link_preserves_local_data_then_export_is_idempotent(setup):
    client,fixture,*_=setup
    record=local(client);rid=record['id']
    client.put('/api/tags/04AABBCCDDEE11',json={'copy_id':rid})
    client.put('/api/records/'+rid+'/favorite',json={'favorite':True})
    client.post('/api/records/'+rid+'/plays',json={'played_at':'2026-01-01T12:00:00+00:00'})
    linked=client.put('/api/records/'+rid+'/discogs-release',json={'release_id':100}).json()
    for field in ['artist','title','year','tracks','notes','inventory_number']:assert linked[field]==record[field]
    assert linked['nfc_uid']=='04AABBCCDDEE11' and linked['favorite'] and linked['play_count']==1
    plan=client.get('/api/discogs/sync/preview').json();action=plan['actions'][0]
    result=apply(client,plan,action,'export')
    assert result.status_code==200 and result.json()['status']=='exported'
    assert len(fixture.remote)==1
    assert client.get('/api/discogs/sync/preview').json()['actions']==[]
    assert apply(client,plan,action,'export').status_code==409
    assert len([r for r in fixture.calls if r.method=='POST'])==1
    assert client.put('/api/records/'+rid+'/discogs-release',json={'release_id':101}).status_code==409


def test_explicit_matching_and_duplicate_export_protection(setup):
    client,fixture,*_=setup
    record=local(client);client.put('/api/records/'+record['id']+'/discogs-release',json={'release_id':100})
    fixture.remote=[fixture.item(11)]
    plan=client.get('/api/discogs/sync/preview').json()
    remote=next(a for a in plan['actions'] if a['kind']=='remote');outbound=next(a for a in plan['actions'] if a['kind']=='local')
    assert remote['matches'][0]['id']==record['id']
    assert apply(client,plan,outbound,'export').status_code==409
    assert apply(client,plan,remote,'link',record['id']).status_code==200
    assert client.get('/api/discogs/sync/preview').json()['actions']==[]
    assert len(client.get('/api/records').json())==1


def test_uncertain_export_survives_restart_and_requires_explicit_matching(setup):
    client,fixture,path,provider,covers=setup
    record=local(client);client.put('/api/records/'+record['id']+'/discogs-release',json={'release_id':100})
    plan=client.get('/api/discogs/sync/preview').json();fixture.fail_post=True
    assert apply(client,plan,plan['actions'][0],'export').status_code==502
    provider.retry_after=0
    with TestClient(create_app(path,provider,covers,start_worker=False)) as restarted:
        preview=restarted.get('/api/discogs/sync/preview').json()
        assert any(n['kind']=='uncertain' for n in preview['notices'])
        assert all(a['kind']=='remote' for a in preview['actions'])
        assert apply(restarted,preview,preview['actions'][0],'link',record['id']).status_code==200
        assert restarted.get('/api/discogs/sync/preview').json()['actions']==[]
    assert len([r for r in fixture.calls if r.method=='POST'])==1


def test_missing_entries_never_delete_or_recreate_records(setup):
    client,fixture,*_=setup
    fixture.remote=[fixture.item(11)]
    plan=client.get('/api/discogs/sync/preview').json();record=apply(client,plan,plan['actions'][0],'import').json()
    fixture.remote=[]
    missing=client.get('/api/discogs/sync/preview').json()
    assert missing['actions']==[] and missing['notices'][0]['kind']=='remote_missing'
    assert client.get('/api/records/'+record['copy_id']).status_code==200
    fixture.remote=[fixture.item(11)];client.delete('/api/records/'+record['copy_id'])
    missing=client.get('/api/discogs/sync/preview').json()
    assert missing['actions']==[] and missing['notices'][0]['kind']=='local_missing'
    assert len(fixture.remote)==1


def test_account_change_stale_remote_and_invalid_matches_are_rejected(setup):
    client,fixture,*_=setup
    fixture.remote=[fixture.item(11)]
    plan=client.get('/api/discogs/sync/preview').json()
    manual=local(client)
    assert apply(client,plan,plan['actions'][0],'link',manual['id']).status_code==409
    fixture.account=456
    assert apply(client,plan,plan['actions'][0],'import').status_code==409
    fixture.account=123;fixture.remote=[]
    assert apply(client,plan,plan['actions'][0],'import').status_code==409
    assert len(client.get('/api/records').json())==1


def test_pagination_and_non_vinyl_collection_entries(setup):
    client,fixture,*_=setup
    cd=fixture.item(12);cd['basic_information']['formats']=[{'name':'CD'}]
    fixture.pages=[[fixture.item(11)],[cd,fixture.item(13)]]
    result=client.get('/api/discogs/sync/preview').json()
    assert result['remote_count']==3
    assert len(result['actions'])==2
    assert [a['instance_id'] for a in result['actions']]==[11,13]
    pages=[r.url.params['page'] for r in fixture.calls if r.url.path.endswith('/folders/0/releases')]
    assert pages==['1','2']


def test_missing_token_does_not_affect_manual_records(tmp_path):
    with TestClient(create_app(str(tmp_path/'db.sqlite3'),DiscogsProvider(token=''),start_worker=False)) as client:
        assert client.get('/api/discogs/sync/preview').status_code==503
        assert local(client)['title']=='My Title'


def test_retry_requires_review_delay_and_no_new_remote_copy(setup):
    from datetime import datetime, timedelta, timezone
    import sqlite3
    client,fixture,path,provider,_=setup
    record=local(client);client.put('/api/records/'+record['id']+'/discogs-release',json={'release_id':100})
    plan=client.get('/api/discogs/sync/preview').json();fixture.fail_post=True
    assert apply(client,plan,plan['actions'][0],'export').status_code==502
    provider.retry_after=0
    retry='/api/records/'+record['id']+'/discogs-export/retry'
    assert client.post(retry,json={'checked_discogs':False}).status_code==422
    assert client.post(retry,json={'checked_discogs':True}).status_code==409
    with sqlite3.connect(path) as db:
        db.execute('UPDATE discogs_exports SET created_at=?', ((datetime.now(timezone.utc)-timedelta(minutes=2)).isoformat(),))
    assert client.post(retry,json={'checked_discogs':True}).status_code==409
    fixture.remote=[]  # User verified that the uncertain addition is absent.
    assert client.post(retry,json={'checked_discogs':True}).status_code==200
    assert any(a['kind']=='local' for a in client.get('/api/discogs/sync/preview').json()['actions'])


def test_missing_link_resolution_preserves_copy_and_requires_fresh_export(setup):
    import sqlite3
    client,fixture,path,*_=setup
    record=local(client);copy_id=record['id']
    client.put('/api/records/'+copy_id+'/discogs-release',json={'release_id':100})
    client.put('/api/tags/04AABBCCDDEE11',json={'copy_id':copy_id})
    client.post('/api/records/'+copy_id+'/plays',json={'played_at':'2026-01-01T12:00:00+00:00'})
    plan=client.get('/api/discogs/sync/preview').json()
    exported=apply(client,plan,plan['actions'][0],'export').json()
    photo=client.post('/api/records/'+copy_id+'/photos',content=PNG,headers={'Content-Type':'image/png'})
    assert photo.status_code==201
    photo_id=photo.json()['id']
    client.put('/api/records/'+copy_id+'/personal-cover',json={'photo_id':photo_id})
    before=client.get('/api/records/'+copy_id).json()
    fixture.remote=[]
    plan=client.get('/api/discogs/sync/preview').json()
    notice=next(n for n in plan['notices'] if n['kind']=='remote_missing')
    payload={'plan_id':plan['plan_id'],'action_id':notice['action_id'],'choice':'detach'}
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==422
    payload['confirmed']=True
    writes=len([r for r in fixture.calls if r.method=='POST'])
    assert client.post('/api/discogs/sync/apply',json=payload).json()['status']=='detached'
    assert client.get('/api/records/'+copy_id).json()==before
    assert client.get('/api/photos/'+photo_id).status_code==200
    assert len([r for r in fixture.calls if r.method=='POST'])==writes
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==409
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT copy_id FROM discogs_links').fetchone()==(None,)
        assert db.execute('SELECT count(*) FROM discogs_exports').fetchone()[0]==0
    fresh=client.get('/api/discogs/sync/preview').json()
    assert not fresh['notices'] and fresh['actions'][0]['kind']=='local'
    fixture.remote=[fixture.item(exported['instance_id'])]
    fresh=client.get('/api/discogs/sync/preview').json()
    assert any(n['kind']=='local_missing' for n in fresh['notices'])
    assert all(a['kind']!='remote' for a in fresh['actions'])


def test_missing_link_resolution_rechecks_account_remote_and_local_state(setup, monkeypatch):
    import sqlite3
    client,fixture,path,*_=setup
    fixture.remote=[fixture.item(11)]
    plan=client.get('/api/discogs/sync/preview').json()
    copy_id=apply(client,plan,plan['actions'][0],'import').json()['copy_id']
    fixture.remote=[]
    plan=client.get('/api/discogs/sync/preview').json()
    payload={'plan_id':plan['plan_id'],'action_id':plan['notices'][0]['action_id'],'choice':'detach','confirmed':True}
    fixture.account=456
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==409
    fixture.account=123;fixture.remote=[fixture.item(11)]
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==409
    fixture.remote=[]
    with sqlite3.connect(path) as db:
        db.execute('INSERT INTO discogs_exports VALUES(?,?,?,?,?,?,?)',('intent','123',copy_id,100,'[]','uncertain','2026-01-01T00:00:00+00:00'))
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==409
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT copy_id FROM discogs_links').fetchone()[0]==copy_id
        db.execute('DELETE FROM discogs_exports')
        db.execute('UPDATE discogs_links SET release_id=101')
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==409
    assert client.get('/api/records/'+copy_id).status_code==200
    import app.sync as sync_module
    monkeypatch.setattr(sync_module, 'monotonic', lambda: float('inf'))
    calls=len(fixture.calls)
    response=client.post('/api/discogs/sync/apply',json=payload)
    assert response.status_code==409 and 'expired' in response.json()['detail']
    assert len(fixture.calls)==calls


def test_missing_link_resolution_rejects_incomplete_collection(setup, monkeypatch):
    client,fixture,path,provider,_=setup
    fixture.remote=[fixture.item(11)]
    plan=client.get('/api/discogs/sync/preview').json()
    copy_id=apply(client,plan,plan['actions'][0],'import').json()['copy_id']
    fixture.remote=[]
    plan=client.get('/api/discogs/sync/preview').json()
    payload={'plan_id':plan['plan_id'],'action_id':plan['notices'][0]['action_id'],'choice':'detach','confirmed':True}
    original=provider.request
    def incomplete(endpoint, *args, **kwargs):
        if endpoint.endswith('/collection/folders/0/releases'):
            return {'pagination':{'pages':1}}
        return original(endpoint, *args, **kwargs)
    monkeypatch.setattr(provider, 'request', incomplete)
    assert client.post('/api/discogs/sync/apply',json=payload).status_code==502
    import sqlite3
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT copy_id FROM discogs_links').fetchone()[0]==copy_id
