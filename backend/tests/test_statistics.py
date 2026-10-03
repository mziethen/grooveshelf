from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def test_timezone_date_boundaries_lifetime_and_corrections(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'),start_worker=False)) as client:
        def copy(n):return client.post('/api/records',json={'inventory_number':f'LP-{n:05d}','artist':'Artist','title':'Same album'}).json()
        one,two,never=copy(1),copy(2),copy(3)
        def play(record,when):return client.post(f"/api/records/{record['id']}/plays",json={'played_at':when}).json()
        old=play(one,'2026-01-31T23:30:00+00:00') # February in Berlin
        play(two,'2026-02-28T23:30:00+00:00') # March in Berlin
        play(one,'2026-03-31T22:30:00+00:00') # April under DST
        data=client.get('/api/statistics').json()
        assert data['timezone']=='Europe/Berlin' and data['aggregation']=='physical_copy'
        assert data['months']==[{'month':'2026-02','plays':1},{'month':'2026-03','plays':1},{'month':'2026-04','plays':1}]
        assert data['most_played'][0]['id']==one['id'] and data['most_played'][0]['plays']==2
        filtered=client.get('/api/statistics?start=2026-02-01&end=2026-02-28').json()
        assert filtered['total_plays']==1 and [r['id'] for r in filtered['never_played']]==[never['id']]
        client.put(f"/api/plays/{old['id']}",json={'played_at':'2026-01-01T12:00:00+00:00'})
        assert client.get('/api/statistics?start=2026-02-01&end=2026-02-28').json()['total_plays']==0
        client.delete(f"/api/plays/{old['id']}")
        assert client.get('/api/statistics').json()['total_plays']==2
        client.delete(f"/api/records/{two['id']}")
        deleted=client.get('/api/statistics').json()
        assert deleted['total_plays']==2 and deleted['deleted_copy_plays']==1
        assert len(deleted['most_played'])==1
        assert client.get('/api/statistics?start=2026-02-01&end=2026-01-01').status_code==422
        assert client.get('/api/statistics?start=invalid').status_code==422
        assert client.get('/api/statistics?end=9999-12-31').status_code==422


def test_empty_and_stale_statistics_without_provider_calls(setup):
    client,fixture,_,_,path=setup
    assert client.get('/api/statistics').json()['total_plays']==0
    client.post('/api/records',json=imported_payload());expire(path);before=len(fixture.requests)
    data=client.get('/api/statistics').json()
    assert data['never_played'][0]['title']=='Metadata temporarily unavailable'
    assert len(fixture.requests)==before
