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


def test_additional_exports_typed_data_safe_html_and_unchanged_collection(tmp_path):
    with TestClient(create_app(str(tmp_path/'collection.sqlite3'), start_worker=False)) as client:
        assert client.get('/api/export/collection.json').json()['records'] == []
        assert 'Your collection is empty.' in client.get('/api/export/collection.html').text
        record = client.post('/api/records', json={'inventory_number':'LP-00001', 'artist':'Björk',
            'title':'<script>alert(1)</script>', 'notes':'first\n<b>note</b>', 'rating':5,
            'tracks':[{'position':'A1','title':'Jóga'}]}).json()
        before = client.get('/api/records').json()
        response = client.get('/api/export/collection.json')
        payload = response.json()
        assert payload['format'] == 'grooveshelf-collection' and payload['format_version'] == 1
        assert payload['record_count'] == 1
        exported = payload['records'][0]
        assert exported['id'] == record['id'] and exported['rating'] == 5
        assert exported['favorite'] is False and exported['year'] is None
        assert exported['tracks'] == [{'position':'A1', 'title':'Jóga'}]
        assert not any(key.startswith('_') for key in exported)
        assert 'Björk' in response.text and 'attachment' in response.headers['content-disposition']
        html = client.get('/api/export/collection.html')
        assert '&lt;script&gt;alert(1)&lt;/script&gt;' in html.text
        assert 'first\n&lt;b&gt;note&lt;/b&gt;' in html.text
        assert '<script' not in html.text and '<img' not in html.text
        assert 'default-src' in html.headers['content-security-policy']
        assert client.get('/api/records').json() == before


def test_additional_exports_hide_expired_content_without_provider_requests(setup):
    client, fixture, _, _, path = setup
    client.post('/api/records', json=imported_payload())
    expire(path)
    before = len(fixture.requests)
    record = client.get('/api/export/collection.json').json()['records'][0]
    assert record['metadata_status'] == 'unavailable' and record['tracks'] == []
    assert record['cover_url'] is None
    assert 'Metadata temporarily unavailable' in client.get('/api/export/collection.html').text
    assert len(fixture.requests) == before
