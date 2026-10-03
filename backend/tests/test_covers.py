import httpx
from fastapi.testclient import TestClient
from app.main import create_app
from app.discogs import DiscogsProvider, CoverStore
from test_discogs import PNG, imported_payload, expire


def test_selected_cover_is_per_copy_and_survives_refresh_restart_and_missing_image(tmp_path):
    images = [{'type':'primary','uri':'https://i.discogs.com/signature/discogs-images/front.jpg'},
              {'type':'secondary','uri':'https://i.discogs.com/signature/discogs-images/back.jpg'}]
    image_requests = []
    def handler(request):
        if request.url.host == 'i.discogs.com':
            assert 'Authorization' not in request.headers
            image_requests.append(str(request.url))
            return httpx.Response(200, content=PNG)
        if request.url.path == '/masters/42':
            return httpx.Response(200, json={'title':'Test Album','artists':[{'name':'Test Artist'}], 'year':1995,'images':images,'tracklist':[{'position':'A1','title':'Opening track'}]})
        return httpx.Response(404)
    transport = httpx.MockTransport(handler)
    provider = DiscogsProvider(token='secret',transport=transport)
    covers = CoverStore(tmp_path/'covers',transport=transport)
    path = str(tmp_path/'collection.sqlite3')
    with TestClient(create_app(path, provider, covers)) as client:
        first = client.post('/api/records',json=imported_payload()).json()
        payload = imported_payload();payload['inventory_number']='LP-00043'
        second = client.post('/api/records',json=payload).json()
        options = client.get(f"/api/records/{first['id']}/cover-options").json()
        assert len(options['images']) == 2
        back = options['images'][1]['id']
        assert 'url' not in options['images'][1]
        assert client.get(options['images'][1]['preview_url']).headers['content-type'] == 'image/png'
        selected = client.put(f"/api/records/{first['id']}/cover",json={'image_id':back}).json()
        assert selected['cover_selection_status'] == 'selected'
        assert back in selected['cover_url']
        assert client.get(selected['cover_url']).content == PNG
        assert client.get(f"/api/records/{second['id']}").json()['cover_image_id'] is None
        images[1]['uri'] = 'https://i.discogs.com/new-signature/discogs-images/back.jpg'
        refreshed = client.post(f"/api/records/{first['id']}/refresh").json()
        assert refreshed['cover_image_id'] == back
        assert client.get(refreshed['cover_url']).status_code == 200
        images.pop()
        missing = client.post(f"/api/records/{first['id']}/refresh").json()
        assert missing['cover_selection_status'] == 'missing' and missing['cover_url'] is None
        assert missing['cover_image_id'] == back
        assert client.get(selected['cover_url']).status_code == 404
    with TestClient(create_app(path, provider, covers)) as client:
        assert client.get(f"/api/records/{first['id']}").json()['cover_image_id'] == back
        reset = client.put(f"/api/records/{first['id']}/cover",json={'image_id':None}).json()
        assert reset['cover_image_id'] is None and reset['cover_url'] == '/api/covers/discogs/42'
        client.delete(f"/api/records/{first['id']}");client.delete(f"/api/records/{second['id']}")
        assert not list(covers.directory.glob('*.img'))


def test_invalid_unavailable_or_failed_selection_does_not_change_preference(tmp_path):
    fail_images = False
    def handler(request):
        if request.url.host == 'i.discogs.com':
            return httpx.Response(503) if fail_images else httpx.Response(200,content=PNG)
        return httpx.Response(200,json={'title':'Album','images':[{'uri':'https://i.discogs.com/front.png'}, {'uri':'http://localhost/private'}]})
    transport=httpx.MockTransport(handler)
    with TestClient(create_app(str(tmp_path/'db.sqlite3'),DiscogsProvider(token='test',transport=transport),CoverStore(tmp_path/'covers',transport=transport))) as client:
        record=client.post('/api/records',json=imported_payload()).json()
        path=f"/api/records/{record['id']}/cover"
        assert client.put(path,json={'image_id':'../private'}).status_code==422
        assert client.put(path,json={'image_id':'a'*32}).status_code==409
        options=client.get(f"/api/records/{record['id']}/cover-options").json()
        assert len(options['images'])==1
        fail_images=True
        assert client.put(path,json={'image_id':options['images'][0]['id']}).status_code==502
        assert client.get(f"/api/records/{record['id']}").json()['cover_image_id'] is None


def test_import_choice_and_stale_cover_are_validated(tmp_path):
    fail = False
    def handler(request):
        if fail:return httpx.Response(503)
        if request.url.host=='i.discogs.com':return httpx.Response(200,content=PNG)
        return httpx.Response(200,json={'title':'Test Album','images':[{'uri':'https://i.discogs.com/a.png'}]})
    transport=httpx.MockTransport(handler);provider=DiscogsProvider(token='test',transport=transport)
    path=str(tmp_path/'db.sqlite3')
    with TestClient(create_app(path,provider,CoverStore(tmp_path/'covers',transport=transport))) as client:
        image=client.get('/api/metadata/discogs/masters/42').json()['images'][0]
        payload=imported_payload();payload['cover_image_id']='b'*32
        assert client.post('/api/records',json=payload).status_code==409
        assert client.get('/api/records').json()==[]
        payload['cover_image_id']=image['id']
        record=client.post('/api/records',json=payload).json()
        assert client.get(record['cover_url']).status_code==200
        expire(path);provider.cache.clear();fail=True
        assert client.get(record['cover_url']).status_code==404
        assert client.get(f"/api/records/{record['id']}/cover-options").status_code==503
