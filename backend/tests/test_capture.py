from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def test_inventory_suggestion_skips_used_numbers_wraps_and_does_not_reserve(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'),start_worker=False)) as client:
        assert client.get('/api/capture/next-inventory').json()=={'inventory_number':'LP-00001','reserved':False}
        assert client.get('/api/records').json()==[]
        for number in ['LP-00001','LP-00003']:
            client.post('/api/records',json={'inventory_number':number,'artist':'Artist','title':'Album'})
        assert client.get('/api/capture/next-inventory').json()['inventory_number']=='LP-00002'
        assert client.get('/api/capture/next-inventory',params={'after':'LP-00003'}).json()['inventory_number']=='LP-00004'
        assert client.get('/api/capture/next-inventory',params={'after':'LP-99999'}).json()['inventory_number']=='LP-00002'
        assert client.get('/api/capture/next-inventory',params={'after':'LP-00000'}).status_code==422
        assert client.get('/api/capture/next-inventory',params={'after':'invalid'}).status_code==422


def test_normalized_duplicates_exclude_self_and_allow_additional_copies(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'),start_worker=False)) as client:
        one=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'AC/DC','title':'Back in Black'}).json()
        query={'artist':' ac dc ','title':'BACK IN BLACK!'}
        matches=client.post('/api/capture/duplicates',json=query).json()
        assert matches['total']==1 and matches['matches'][0]['inventory_number']=='LP-00001'
        assert client.post('/api/capture/duplicates',json={**query,'exclude_id':one['id']}).json()['total']==0
        assert client.post('/api/capture/duplicates',json={'artist':'Different','title':'Back in Black'}).json()['total']==0
        assert client.post('/api/capture/duplicates',json={'artist':'AC/DC','title':''}).json()['total']==0
        assert client.post('/api/records',json={'inventory_number':'LP-00002','artist':'AC/DC','title':'Back in Black'}).status_code==201
        assert client.post('/api/capture/duplicates',json=query).json()['total']==2


def test_source_duplicates_work_without_upstream_and_hide_expired_provider_fields(setup):
    client,fixture,_,_,path=setup
    one=client.post('/api/records',json=imported_payload()).json()
    expire(path);fixture.fail=True;before=len(fixture.requests)
    matches=client.post('/api/capture/duplicates',json={'artist':'Correction','title':'Different wording','discogs_master_id':42}).json()
    assert matches['total']==1 and matches['matches'][0]['id']==one['id']
    assert matches['matches'][0]['title']=='Metadata temporarily unavailable'
    assert len(fixture.requests)==before
