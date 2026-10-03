import csv
import io
import json
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def rows(response):
    return list(csv.DictReader(io.StringIO(response.content.decode('utf-8-sig'))))


def test_csv_fields_unicode_multiline_and_formula_safety(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'), start_worker=False)) as client:
        empty = client.get('/api/export/collection.csv')
        assert empty.status_code == 200 and rows(empty) == []
        assert 'attachment' in empty.headers['content-disposition']
        record = client.post('/api/records', json={'inventory_number':'LP-00001', 'artist':'Björk', 'title':'=SUM(1,2)', 'notes':'first, line\nsecond "line"', 'rating':5, 'tracks':[{'position':'A1','title':'Jóga'}]}).json()
        client.put(f"/api/records/{record['id']}/favorite", json={'favorite':True})
        row = rows(client.get('/api/export/collection.csv'))[0]
        assert row['artist'] == 'Björk' and row['title'] == "'=SUM(1,2)"
        assert row['notes'] == 'first, line\nsecond "line"'
        assert row['rating'] == '5' and row['favorite'] == 'true'
        assert json.loads(row['tracks']) == [{'position':'A1','title':'Jóga'}]
        assert row['inventory_number'] == 'LP-00001'


def test_csv_does_not_refresh_or_export_expired_provider_content(setup):
    client,fixture,_,_,path = setup
    client.post('/api/records', json=imported_payload())
    expire(path); before = len(fixture.requests)
    row = rows(client.get('/api/export/collection.csv'))[0]
    assert row['metadata_status'] == 'unavailable'
    assert row['title'] == 'Metadata temporarily unavailable'
    assert json.loads(row['tracks']) == []
    assert len(fixture.requests) == before
