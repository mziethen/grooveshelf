import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from test_discogs import setup, imported_payload, expire


def add_copy(client, number, **fields):
    return client.post('/api/records', json={
        'inventory_number': number, 'artist': 'Artist', 'title': 'Shared album',
        'notes': 'Keep my notes', 'rating': 2, 'media_condition': 'VG',
        'sleeve_condition': 'Generic', 'storage_location': 'Shelf A', **fields,
    }).json()


def test_patch_is_per_copy_preserves_omitted_fields_and_persists(tmp_path):
    path = str(tmp_path / 'collection.sqlite3')
    with TestClient(create_app(path, start_worker=False)) as client:
        copies = [add_copy(client, f'LP-{i:05}') for i in range(1, 4)]
        assert len({record['album_id'] for record in copies}) == 1
        assert client.put('/api/tags/04AABBCC', json={'copy_id': copies[0]['id']}).status_code == 200
        assert client.post(f"/api/records/{copies[0]['id']}/plays", json={'played_at': '2026-01-01T12:00:00Z'}).status_code == 201
        before = [client.get(f"/api/records/{record['id']}").json() for record in copies]
        result = client.patch('/api/records/bulk-personal', json={
            'record_ids': [record['id'] for record in copies[:2]],
            'changes': {'storage_location': '  Office <Shelf B>  ', 'rating': 5, 'favorite': True},
        })
        assert result.status_code == 200
        assert result.json()['updated_count'] == 2
        for i, original in enumerate(before):
            after = client.get(f"/api/records/{original['id']}").json()
            expected = {**original, 'storage_location': 'Office <Shelf B>', 'rating': 5, 'favorite': True} if i < 2 else original
            assert after == expected
    with TestClient(create_app(path, start_worker=False)) as client:
        assert client.get(f"/api/records/{copies[0]['id']}").json()['rating'] == 5
        changes = {'rating': None, 'media_condition': None, 'sleeve_condition': None, 'storage_location': '', 'favorite': False}
        request = {'record_ids': [record['id'] for record in copies[:2]], 'changes': changes}
        # Repeating a patch is safe after an uncertain network response.
        for _ in range(2):
            assert client.patch('/api/records/bulk-personal', json=request).status_code == 200
        record = client.get(f"/api/records/{copies[0]['id']}").json()
        assert all(record[key] == value for key, value in changes.items())
        assert record['notes'] == 'Keep my notes' and record['play_count'] == 1


@pytest.mark.parametrize('changes', [
    {}, {'rating': 0}, {'rating': 6}, {'rating': True}, {'rating': '5'},
    {'media_condition': 'Generic'}, {'sleeve_condition': 'EX'},
    {'storage_location': None}, {'storage_location': 'x' * 201},
    {'favorite': None}, {'favorite': 'true'}, {'favorite': 1},
    {'notes': 'Overwrite'}, {'artist': 'Changed'}, {'inventory_number': 'LP-00009'},
])
def test_invalid_changes_leave_every_record_unchanged(tmp_path, changes):
    with TestClient(create_app(str(tmp_path / 'db.sqlite3'), start_worker=False)) as client:
        record = add_copy(client, 'LP-00001')
        result = client.patch('/api/records/bulk-personal', json={'record_ids': [record['id']], 'changes': changes})
        assert result.status_code == 422
        assert client.get(f"/api/records/{record['id']}").json() == record


@pytest.mark.parametrize('ids', [[], [''], [None], ['x' * 101]])
def test_invalid_selection(tmp_path, ids):
    with TestClient(create_app(str(tmp_path / 'db.sqlite3'), start_worker=False)) as client:
        assert client.patch('/api/records/bulk-personal', json={'record_ids': ids, 'changes': {'rating': 5}}).status_code == 422


def test_duplicate_and_deleted_selection_do_not_partially_apply(tmp_path):
    with TestClient(create_app(str(tmp_path / 'db.sqlite3'), start_worker=False)) as client:
        first, second = [add_copy(client, number) for number in ['LP-00001', 'LP-00002']]
        duplicate = client.patch('/api/records/bulk-personal', json={'record_ids': [first['id']] * 2, 'changes': {'rating': 5}})
        assert duplicate.status_code == 422
        client.delete(f"/api/records/{second['id']}")
        missing = client.patch('/api/records/bulk-personal', json={'record_ids': [first['id'], second['id']], 'changes': {'rating': 5}})
        assert missing.status_code == 409
        assert client.get(f"/api/records/{first['id']}").json()['rating'] == 2


def test_database_failure_rolls_back_the_entire_batch(tmp_path):
    path = str(tmp_path / 'db.sqlite3')
    with TestClient(create_app(path, start_worker=False), raise_server_exceptions=False) as client:
        first, second = [add_copy(client, number) for number in ['LP-00001', 'LP-00002']]
        with sqlite3.connect(path) as db:
            db.execute(f"""CREATE TRIGGER abort_bulk BEFORE UPDATE OF rating ON copies
                WHEN NEW.id='{second['id']}' BEGIN SELECT RAISE(ABORT, 'test failure'); END""")
        result = client.patch('/api/records/bulk-personal', json={'record_ids': [first['id'], second['id']], 'changes': {'rating': 5}})
        assert result.status_code == 500
        assert [client.get(f"/api/records/{r['id']}").json()['rating'] for r in [first, second]] == [2, 2]


def test_batch_limit_and_complete_application(tmp_path):
    path = str(tmp_path / 'db.sqlite3')
    with TestClient(create_app(path, start_worker=False)) as client:
        original = add_copy(client, 'LP-00001')
        ids = [f'bulk-{i}' for i in range(500)]
        with sqlite3.connect(path) as db:
            db.executemany('INSERT INTO copies (id,album_id,inventory_number,format,created_at) VALUES (?,?,?,?,?)',
                           [(copy_id, original['album_id'], f'LP-{i+1000:05}', 'LP', original['created_at']) for i, copy_id in enumerate(ids)])
        assert client.patch('/api/records/bulk-personal', json={'record_ids': ids + [original['id']], 'changes': {'favorite': True}}).status_code == 422
        result = client.patch('/api/records/bulk-personal', json={'record_ids': ids, 'changes': {'favorite': True}})
        assert result.status_code == 200 and result.json()['updated_count'] == 500
        with sqlite3.connect(path) as db:
            assert db.execute('SELECT SUM(favorite) FROM copies').fetchone()[0] == 500
        assert not client.get(f"/api/records/{original['id']}").json()['favorite']


def test_bulk_edit_is_offline_and_preserves_provider_and_sync_state(setup):
    client, fixture, provider, _, path = setup
    record = client.post('/api/records', json=imported_payload()).json()
    expire(path); provider.cache.clear(); fixture.fail = True
    with sqlite3.connect(path) as db:
        db.execute('INSERT INTO discogs_links VALUES (?,?,?,?)', ('test-account', 99, 42, record['id']))
        db.execute('INSERT INTO discogs_exports VALUES (?,?,?,?,?,?,?)', ('pending-export', 'test-account', record['id'], 42, '[]', 'uncertain', '2026-01-01'))
        tables = ['albums', 'discogs_links', 'discogs_exports', 'discogs_sync_state', 'nfc_tags', 'play_events']
        snapshots = {table: db.execute(f'SELECT * FROM {table}').fetchall() for table in tables}
    before = len(fixture.requests)
    result = client.patch('/api/records/bulk-personal', json={'record_ids': [record['id']], 'changes': {'rating': 5}})
    assert result.status_code == 200 and len(fixture.requests) == before
    with sqlite3.connect(path) as db:
        assert all(db.execute(f'SELECT * FROM {table}').fetchall() == snapshots[table] for table in tables)
        assert db.execute('SELECT rating FROM copies WHERE id=?', (record['id'],)).fetchone()[0] == 5
