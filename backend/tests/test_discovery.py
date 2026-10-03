from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import create_app
from app.discovery import candidates, suggest
from test_discogs import setup, imported_payload, expire


def test_candidate_rules_and_avoid_previous():
    now = datetime(2026, 10, 3, tzinfo=timezone.utc)
    records = [{'id':'never','play_count':0,'last_played_at':None},
               {'id':'old','play_count':2,'last_played_at':(now-timedelta(days=30)).isoformat()},
               {'id':'recent','play_count':4,'last_played_at':(now-timedelta(days=29)).isoformat()}]
    assert [r['id'] for r in candidates(records,'never',now)] == ['never']
    assert [r['id'] for r in candidates(records,'least',now)] == ['never']
    assert [r['id'] for r in candidates(records,'recent',now)] == ['never','old']
    assert suggest(records[:2],'all','never')['record']['id'] == 'old'
    assert suggest(records[:1],'all','never')['record']['id'] == 'never'
    assert suggest([],'least')['record'] is None
    assert len(candidates([dict(r,play_count=2) for r in records], 'least')) == 3


def test_suggestions_never_record_plays_and_reflect_corrections(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'),start_worker=False)) as client:
        assert client.get('/api/discovery').json()['collection_count'] == 0
        assert client.get('/api/discovery?mode=unknown').status_code == 422
        copy = client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album'}).json()
        assert client.get('/api/discovery?mode=never').json()['record']['id'] == copy['id']
        assert client.get('/api/records').json()[0]['play_count'] == 0
        play = client.post(f"/api/records/{copy['id']}/plays",json={'played_at':datetime.now(timezone.utc).isoformat()})
        assert play.status_code == 201
        assert client.get('/api/discovery?mode=never').json()['record'] is None
        assert client.get('/api/discovery?mode=recent').json()['record'] is None
        assert client.get('/api/discovery?mode=least').json()['record']['play_count'] == 1
        client.delete(f"/api/plays/{play.json()['id']}")
        assert client.get('/api/discovery?mode=never').json()['record']['id'] == copy['id']


def test_suggestion_hides_expired_content_without_provider_requests(setup):
    client,fixture,_,_,path = setup
    client.post('/api/records',json=imported_payload());expire(path)
    before=len(fixture.requests)
    record=client.get('/api/discovery').json()['record']
    assert record['title']=='Metadata temporarily unavailable' and record['cover_url'] is None
    assert len(fixture.requests)==before
    assert '_metadata' not in record
