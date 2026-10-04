import csv
import io
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.discogs import DiscogsProvider, CoverStore, credit_entries
from app.archive import restore_archive
from test_discogs import expire


def test_credit_normalization_scopes_deduplication_and_bounds():
    entries=credit_entries({'extraartists':[
        {'name':' Alice ','role':' Producer ','tracks':'A1 to B1'},
        {'name':'Alice','role':'Producer','tracks':'A1 to B1'},
        {'name':'Original','anv':'Credited name','role':'Written-By'},
        {'name':'Valid','anv':'  ','role':'Arranged By'},
        {'name':None,'role':'Producer'}, {'name':'No role'}, 'invalid'],
        'tracklist':[{'type_':'heading','title':'Side A','extraartists':[{'name':'Skip','role':'Heading'}]},
            {'position':'A2','title':'Suite','extraartists':[{'name':'Parent','role':'Producer'}],
             'sub_tracks':[{'position':'A2a','title':'Part','extraartists':[{'name':'Child','role':'Guitar'}]}]}]})
    assert entries==[{'name':'Alice','role':'Producer','tracks':'A1 to B1'},
        {'name':'Credited name','role':'Written-By','tracks':''},
        {'name':'Valid','role':'Arranged By','tracks':''},
        {'name':'Parent','role':'Producer','tracks':'A2'},
        {'name':'Child','role':'Guitar','tracks':'A2a'}]
    bounded=credit_entries({'extraartists':[{'name':'x'*400+str(i),'role':'r'*700,'tracks':'t'*1200+str(i)} for i in range(400)]})
    assert all(len(c['name'])<=300 and len(c['role'])<=500 and len(c['tracks'])<=1000 for c in bounded)
    assert len(credit_entries({'extraartists':[{'name':str(i),'role':'Producer'} for i in range(400)]}))==300
    assert credit_entries({'extraartists':None,'tracklist':[None]})==[]
    assert credit_entries({'tracklist':[{'position':{'invalid':True},'title':None,
        'extraartists':[{'name':'Valid','role':'Producer'}]}]})==[{'name':'Valid','role':'Producer','tracks':''}]


@pytest.fixture
def credits_provider(tmp_path):
    state={'name':'Alice <script>alert(1)</script>','fail':False,'reference_missing':False,'requests':[]}
    def handle(request):
        state['requests'].append(request.url.path)
        if state['fail'] or (state['reference_missing'] and request.url.path=='/releases/100'):
            return httpx.Response(503)
        data={'id':42,'title':'Credits Album','artists':[{'name':'Credits Artist'}],'year':2001,
              'tracklist':[{'position':'A1','title':'Opening','duration':'3:45'}]}
        if request.url.path=='/masters/42':
            data.update(main_release=100,extraartists=[{'name':'Master artist','role':'Written-By'}])
        else:
            data.update(extraartists=[{'name':state['name'],'role':'Producer','tracks':''},
                {'name':'Songwriter','role':'Written-By','tracks':'A1 to B1'}],
                tracklist=[{'position':'A1','title':'Opening','duration':'3:45',
                    'extraartists':[{'name':'Performer','role':'Guitar'}]}])
        return httpx.Response(200,json=data)
    transport=httpx.MockTransport(handle)
    provider=DiscogsProvider(token='test-secret',transport=transport)
    path=tmp_path/'collection.sqlite3'
    with TestClient(create_app(str(path),provider,CoverStore(tmp_path/'covers',transport=transport),start_worker=False)) as client:
        yield client,state,provider,path


def import_record(client,kind='masters',entry_id=42):
    preview=client.get(f'/api/metadata/discogs/{kind}/{entry_id}').json()
    payload={'inventory_number':'LP-00042','artist':preview['artist'],'title':preview['title'],
             'year':preview['year'],'tracks':preview['tracks'],
             'discogs_master_id' if kind=='masters' else 'discogs_release_id':entry_id}
    result=client.post('/api/records',json=payload)
    assert result.status_code==201
    return result.json()


def test_reference_credits_persist_edit_refresh_and_exports(credits_provider,tmp_path):
    client,state,_,path=credits_provider
    record=import_record(client)
    assert record['credits_source_url']=='https://www.discogs.com/release/100'
    assert record['credits'][2]=={'name':'Performer','role':'Guitar','tracks':'A1'}
    assert record['credits'][1]['role']=='Written-By'
    tracks=record['tracks'];tracks[0]['duration']='4:01'
    edited=client.put('/api/records/'+record['id'],json={'inventory_number':'LP-00042','artist':record['artist'],
        'title':record['title'],'year':record['year'],'tracks':tracks,'notes':'Local note'}).json()
    assert edited['credits']==record['credits']
    state['name']='Updated producer'
    refreshed=client.post('/api/records/'+record['id']+'/refresh').json()
    assert refreshed['credits'][0]['name']=='Updated producer'
    assert refreshed['tracks'][0]['duration']=='4:01'
    before=len(state['requests'])
    exported=client.get('/api/export/collection.json').json()['records'][0]
    assert exported['credits']==refreshed['credits'] and exported['credits_source_url']==refreshed['credits_source_url']
    row=next(csv.DictReader(io.StringIO(client.get('/api/export/collection.csv').content.decode('utf-8-sig'))))
    assert json.loads(row['credits'])==refreshed['credits']
    html=client.get('/api/export/collection.html').text
    assert 'Updated producer — Producer' in html and 'Scope: A1 to B1' in html
    assert len(state['requests'])==before
    archive=tmp_path/'collection.zip';archive.write_bytes(client.get('/api/export/collection.zip').content)
    restored=tmp_path/'restored';restore_archive(archive,restored)
    with TestClient(create_app(str(restored/'grooveshelf.sqlite3'),start_worker=False)) as other:
        assert other.get('/api/export/collection.json').json()['records'][0]['credits']==refreshed['credits']


def test_expiry_hides_credits_even_with_protected_track_duration(credits_provider):
    client,state,provider,path=credits_provider
    record=import_record(client);tracks=record['tracks'];tracks[0]['duration']='4:01'
    client.put('/api/records/'+record['id'],json={'inventory_number':'LP-00042','artist':record['artist'],
        'title':record['title'],'year':record['year'],'tracks':tracks})
    expire(path);provider.cache.clear();state['fail']=True
    result=client.get('/api/records/'+record['id']).json()
    assert result['credits']==[] and result['credits_source_url'] is None
    assert result['tracks'][0]['duration']=='4:01'
    before=len(state['requests'])
    assert client.get('/api/export/collection.json').json()['records'][0]['credits']==[]
    row=next(csv.DictReader(io.StringIO(client.get('/api/export/collection.csv').content.decode('utf-8-sig'))))
    assert json.loads(row['credits'])==[]
    assert 'Album &amp; track credits' not in client.get('/api/export/collection.html').text
    assert len(state['requests'])==before


def test_selected_release_and_master_fallback_attribution(credits_provider):
    client,state,provider,_=credits_provider
    release=client.get('/api/metadata/discogs/releases/100').json()
    assert release['credits_source_url']==release['source_url']=='https://www.discogs.com/release/100'
    state['reference_missing']=True;provider.cache.clear()
    master=client.get('/api/metadata/discogs/masters/42').json()
    assert master['credits']==[{'name':'Master artist','role':'Written-By','tracks':''}]
    assert master['credits_source_url']=='https://www.discogs.com/master/42'


def test_credit_html_escaping_and_old_manual_records(credits_provider):
    client,state,_,_=credits_provider
    record=import_record(client)
    html=client.get('/api/export/collection.html').text
    assert '&lt;script&gt;alert(1)&lt;/script&gt;' in html and '<script>' not in html
    assert 'test-secret' not in json.dumps(record)
    manual=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Manual','title':'Manual'}).json()
    assert manual['credits']==[] and manual['credits_source_url'] is None
