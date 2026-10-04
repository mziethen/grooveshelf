import csv
import io
import httpx
from fastapi.testclient import TestClient
from app.main import create_app
from app.discogs import DiscogsProvider, CoverStore, pressing_details, release_year
from test_discogs import expire
from app.archive import restore_archive


def test_pressing_normalization():
    assert pressing_details({'year':True,'country':None,'labels':[None,{'catno':' none '},{'catno':' ABC '},{'catno':'ABC'},{'catno':4}]}) == {'pressing_year':None,'country':'','catalog_numbers':['ABC']}
    assert [release_year(v) for v in [0,1899,1900,2100,2101,True,'1995']] == [None,None,1900,2100,None,None,None]
    assert pressing_details({'year':2008,'country':' Germany ','labels':[{'catno':'x'*300}]})['catalog_numbers']==['x'*200]


def test_pressing_import_master_fallback_exports_and_expiry(tmp_path):
    state={'fail_master':False}
    def handle(request):
        if request.url.path=='/masters/42':
            if state['fail_master']:return httpx.Response(503)
            return httpx.Response(200,json={'id':42,'title':'Album','artists':[{'name':'Artist'}],'year':1995,'main_release':100})
        return httpx.Response(200,json={'id':100,'master_id':42,'title':'Album','artists':[{'name':'Artist'}],
            'year':2008,'country':'Germany','labels':[{'name':'Label','catno':'CAT <script>1</script>'}],
            'formats':[{'name':'Vinyl'}]})
    transport=httpx.MockTransport(handle);provider=DiscogsProvider(token='test',transport=transport)
    path=tmp_path/'collection.sqlite3'
    with TestClient(create_app(str(path),provider,CoverStore(tmp_path/'covers',transport=transport),start_worker=False)) as client:
        master=client.get('/api/metadata/discogs/masters/42').json()
        assert master['original_year']==1995 and master['pressing_year'] is None
        assert master['country']=='' and master['catalog_numbers']==[]
        preview=client.get('/api/metadata/discogs/releases/100').json()
        assert preview['original_year']==1995 and preview['pressing_year']==2008
        record=client.post('/api/records',json={'inventory_number':'LP-00042','artist':'Artist','title':'Album','year':2008,'discogs_release_id':100}).json()
        assert record['country']=='Germany' and record['catalog_numbers']==['CAT <script>1</script>']
        assert record['original_year_source_url']=='https://www.discogs.com/master/42'
        rid=record['id']
        edited=client.put('/api/records/'+rid,json={'inventory_number':'LP-00042','artist':'Artist','title':'Album','year':2009,'notes':'Correction'}).json()
        assert edited['year']==2009 and edited['pressing_year']==2008
        exported=client.get('/api/export/collection.json').json()['records'][0]
        assert exported['original_year']==1995 and exported['pressing_year']==2008
        csv_row=next(csv.DictReader(io.StringIO(client.get('/api/export/collection.csv').content.decode('utf-8-sig'))))
        assert csv_row['pressing_year']=='2008'
        html=client.get('/api/export/collection.html').text
        assert 'CAT &lt;script&gt;1&lt;/script&gt;' in html and 'Original release year' in html
        archive=tmp_path/'pressings.zip';archive.write_bytes(client.get('/api/export/collection.zip').content)
        restored=tmp_path/'restored';restore_archive(archive,restored)
        with TestClient(create_app(str(restored/'grooveshelf.sqlite3'),start_worker=False)) as other:
            restored_record=other.get('/api/export/collection.json').json()['records'][0]
            assert restored_record['original_year']==1995 and restored_record['pressing_year']==2008
            assert restored_record['year']==2009 and restored_record['catalog_numbers']==record['catalog_numbers']
        state['fail_master']=True
        fallback=provider.release(100,force=True)
        assert fallback['original_year'] is None and fallback['original_year_source_url'] is None
        assert fallback['pressing_year']==2008
        expire(path);provider.cache.clear()
        settings=client.get('/api/settings').json();settings['automatic_refresh']=False
        assert client.put('/api/settings',json=settings).status_code==200
        stale=client.get('/api/records/'+rid).json()
        assert stale['original_year'] is None and stale['pressing_year'] is None
        assert stale['country']=='' and stale['catalog_numbers']==[] and stale['year']==2009
