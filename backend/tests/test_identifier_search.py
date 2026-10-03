import httpx
from fastapi.testclient import TestClient
from app.main import create_app
from app.discogs import DiscogsProvider


def test_identifier_search_validation_pagination_and_release_import(tmp_path):
    requests=[]
    def handle(request):
        requests.append(request)
        if request.url.path=='/database/search':
            assert request.url.params['type']=='release'
            if 'barcode' in request.url.params: assert request.url.params['barcode']=='001234567890'
            else: assert request.url.params['catno']=='ABC 001'
            return httpx.Response(200,json={'results':[{'id':100,'type':'release','title':'Artist - Album','catno':'ABC 001','country':'Germany'},{'id':42,'type':'master'}],'pagination':{'pages':2}})
        return httpx.Response(200,json={'id':100,'master_id':42,'title':'Album','artists':[{'name':'Artist'}],'formats':[{'name':'Vinyl','descriptions':['LP']}],'tracklist':[{'type_':'track','position':'A1','title':'Track'}]})
    provider=DiscogsProvider(token='test-only',transport=httpx.MockTransport(handle))
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'),provider=provider,start_worker=False)) as client:
        result=client.get('/api/metadata/discogs/identifier-search',params={'kind':'barcode','value':'00 1234-567890','page':2})
        assert result.status_code==200 and len(result.json()['results'])==1
        assert result.json()['results'][0]['source_url']=='https://www.discogs.com/release/100'
        assert requests[-1].url.params['page']=='2'
        assert client.get('/api/metadata/discogs/identifier-search',params={'kind':'catno','value':' ABC 001 '}).status_code==200
        for kind,value in [('barcode','abc'),('barcode','１２３４５６'),('catno',' '),('unknown','123456')]:
            assert client.get('/api/metadata/discogs/identifier-search',params={'kind':kind,'value':value}).status_code==422
        record=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album','discogs_release_id':100,'discogs_master_id':42,'tracks':[{'position':'A1','title':'Track'}]}).json()
        assert record['discogs_release_id']==100 and record['discogs_master_id']==42
        assert record['tracks'][0]['title']=='Track'
