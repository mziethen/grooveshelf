import pytest
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path / 'collection.sqlite3'))) as client:
        yield client


def payload(number='LP-00001', **changes):
    return dict(inventory_number=number, artist='Nina Simone', title='Little Girl Blue',
                tracks=[{'position': 'A1', 'title': 'Mood Indigo'}], **changes)


def test_create_duplicate_and_shared_album(client):
    first = client.post('/api/records', json=payload()).json()
    second = client.post('/api/records', json=payload('LP-00002')).json()
    assert first['id'] != second['id']
    assert first['album_id'] == second['album_id']
    duplicate = client.post('/api/records', json=payload())
    assert duplicate.status_code == 409
    assert len(client.get('/api/records').json()) == 2


@pytest.mark.parametrize('number', ['LP-00000', 'LP-100000', 'lp-00001', 'LP-123', 'XX-00001'])
def test_invalid_inventory(client, number):
    assert client.post('/api/records', json=payload(number)).status_code == 422


def test_update_keeps_identity_and_other_copies_unchanged(client):
    first = client.post('/api/records', json=payload()).json()
    second = client.post('/api/records', json=payload('LP-00002')).json()
    edited = payload('LP-00003')
    edited['title'] = 'A different album'
    response = client.put('/api/records/' + first['id'], json=edited)
    assert response.status_code == 200
    assert response.json()['id'] == first['id']
    assert response.json()['created_at'] == first['created_at']
    assert client.get('/api/records/' + second['id']).json()['title'] == second['title']
    edited['inventory_number'] = 'LP-00002'
    assert client.put('/api/records/' + first['id'], json=edited).status_code == 409
    assert client.get('/api/records/' + first['id']).json()['inventory_number'] == 'LP-00003'


def test_delete_and_reuse(client):
    first = client.post('/api/records', json=payload()).json()
    assert client.delete('/api/records/' + first['id']).status_code == 204
    assert client.get('/api/records/' + first['id']).status_code == 404
    assert client.delete('/api/records/' + first['id']).status_code == 404
    assert client.post('/api/records', json=payload()).status_code == 201


def test_search_artist_album_track_and_number(client):
    client.post('/api/records', json=payload())
    for query in ['nina', 'GIRL', 'indigo', 'LP-00001']:
        assert len(client.get('/api/records', params={'q': query}).json()) == 1
    assert client.get('/api/records', params={'q': 'not present'}).json() == []


def test_persistence_after_restart(tmp_path):
    path = str(tmp_path / 'collection.sqlite3')
    with TestClient(create_app(path)) as first:
        record = first.post('/api/records', json=payload()).json()
    with TestClient(create_app(path)) as restarted:
        assert restarted.get('/api/records/' + record['id']).json() == record
        assert restarted.get('/api/health').json() == {'status': 'ok'}


def test_explicit_album_link_and_missing_album(client):
    first = client.post('/api/records', json=payload()).json()
    second = client.post('/api/records', json=payload('LP-00002', album_id=first['album_id']))
    assert second.status_code == 201
    assert second.json()['album_id'] == first['album_id']
    assert client.post('/api/records', json=payload('LP-00003', album_id='missing')).status_code == 404


def test_blank_required_fields_and_invalid_tracks(client):
    data = payload()
    data['artist'] = '  '
    assert client.post('/api/records', json=data).status_code == 422
    data = payload()
    data['tracks'] = [{'title': '  '}]
    assert client.post('/api/records', json=data).status_code == 422
