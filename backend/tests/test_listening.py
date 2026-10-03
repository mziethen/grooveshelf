from datetime import datetime, timezone
import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app


class Clock:
    def __init__(self): self.now = 1791000000.0
    def __call__(self): return self.now
    def advance(self, seconds): self.now += seconds


@pytest.fixture
def setup(tmp_path):
    clock=Clock(); path=str(tmp_path/'listening.sqlite3')
    with TestClient(create_app(path,clock=clock,start_worker=False)) as client:
        a=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album A'}).json()
        b=client.post('/api/records',json={'inventory_number':'LP-00002','artist':'Artist','title':'Album B'}).json()
        client.put('/api/tags/04:11:22:33:44:55:66',json={'copy_id':a['id']})
        client.put('/api/tags/04778899AABBCC',json={'copy_id':b['id']})
        yield client,clock,path,a,b


def scan(client,uid='04112233445566',station='pi-main'):
    return client.post(f'/api/stations/{station}/scans',json={'uid':uid})


def count(client,record):
    return client.get('/api/records/'+record['id']).json()['play_count']


def test_scan_counts_once_at_ten_minutes_and_survives_repeats(setup):
    client,clock,_,a,_=setup
    first=scan(client).json()['session']
    assert first['remaining_seconds']==600
    clock.advance(100)
    assert scan(client).json()['session']['id']==first['id']
    clock.advance(499)
    assert count(client,a)==0
    clock.advance(1)
    assert count(client,a)==1
    assert scan(client).json()['session']['id']==first['id']
    clock.advance(1000)
    assert count(client,a)==1
    events=client.get('/api/records/'+a['id']+'/plays').json()
    assert len(events)==1 and events[0]['origin']=='nfc'


def test_switch_cancels_previous_pending_session(setup):
    client,clock,_,a,b=setup
    scan(client);clock.advance(599)
    result=scan(client,'04778899AABBCC').json()
    assert result['session']['copy_id']==b['id']
    clock.advance(600)
    assert count(client,a)==0 and count(client,b)==1


def test_cancel_before_threshold_and_restart_same_record(setup):
    client,clock,_,a,_=setup
    first=scan(client).json()['session']['id'];clock.advance(20)
    assert client.post('/api/stations/pi-main/end').json()['session']['status']=='canceled'
    clock.advance(1000)
    assert count(client,a)==0
    second=scan(client).json()['session']['id']
    assert second!=first
    clock.advance(600)
    assert count(client,a)==1
    assert client.post('/api/stations/pi-main/end').json()['session']['status']=='ended'
    scan(client);clock.advance(600)
    assert count(client,a)==2


def test_unknown_uid_does_not_cancel_valid_session(setup):
    client,clock,_,a,_=setup
    scan(client)
    result=scan(client,'04000000000000').json()
    assert result['unknown_uid']=='04000000000000'
    assert result['session']['copy_id']==a['id']
    clock.advance(600)
    assert count(client,a)==1
    assert scan(client,'invalid').status_code==422


def test_tag_replacement_keeps_record_and_history(setup):
    client,clock,_,a,b=setup
    scan(client);clock.advance(600);assert count(client,a)==1
    assert client.put('/api/tags/04000000000000',json={'copy_id':a['id']}).status_code==409
    assert client.put('/api/tags/04000000000000',json={'copy_id':a['id'],'replace':True}).status_code==200
    assert client.get('/api/records/'+a['id']).json()['nfc_uid']=='04000000000000'
    assert scan(client).json()['unknown_uid']=='04112233445566'
    assert count(client,a)==1
    assert client.put('/api/tags/04778899AABBCC',json={'copy_id':a['id'],'replace':True}).status_code==409
    assert client.get('/api/records/'+b['id']).json()['nfc_uid']=='04778899AABBCC'


def test_pending_session_resumes_after_restart_without_double_count(setup):
    client,clock,path,a,_=setup
    scan(client);clock.advance(601)
    with TestClient(create_app(path,clock=clock,start_worker=False)) as restarted:
        assert count(restarted,a)==1
    with TestClient(create_app(path,clock=clock,start_worker=False)) as restarted:
        assert count(restarted,a)==1


def test_manual_history_edit_and_delete_recalculate_counts(setup):
    client,clock,_,a,_=setup
    at=datetime.fromtimestamp(clock()-1000,timezone.utc).isoformat()
    event=client.post('/api/records/'+a['id']+'/plays',json={'played_at':at}).json()
    assert count(client,a)==1
    assert client.get('/api/records/'+a['id']+'/plays').json()[0]['origin']=='manual'
    changed=datetime.fromtimestamp(clock()-100,timezone.utc).isoformat()
    assert client.put('/api/plays/'+event['id'],json={'played_at':changed}).status_code==200
    assert client.get('/api/records/'+a['id']).json()['last_played_at']==changed
    assert client.delete('/api/plays/'+event['id']).status_code==204
    assert count(client,a)==0
    assert client.get('/api/records/'+a['id']).json()['last_played_at'] is None


def test_future_or_naive_manual_timestamps_are_rejected(setup):
    client,clock,_,a,_=setup
    future=datetime.fromtimestamp(clock()+120,timezone.utc).isoformat()
    assert client.post('/api/records/'+a['id']+'/plays',json={'played_at':future}).status_code==422
    assert client.post('/api/records/'+a['id']+'/plays',json={'played_at':'2026-01-01T10:00:00'}).status_code==422


def test_stations_have_independent_sessions(setup):
    client,clock,path,a,b=setup
    with sqlite3.connect(path) as db: db.execute("INSERT INTO stations (id,name) VALUES ('second','Second')")
    first=scan(client).json()['session']
    second=scan(client,'04778899AABBCC','second').json()['session']
    assert first['station_id']!=second['station_id']
    clock.advance(600)
    assert count(client,a)==1 and count(client,b)==1


def test_favorites_survive_edits_and_restart(setup):
    client,clock,path,a,_=setup
    assert client.put('/api/records/'+a['id']+'/favorite',json={'favorite':True}).status_code==200
    client.put('/api/records/'+a['id'],json={'inventory_number':'LP-00003','artist':'Artist','title':'Edited'})
    with TestClient(create_app(path,clock=clock,start_worker=False)) as restarted:
        assert restarted.get('/api/records/'+a['id']).json()['favorite'] is True


def test_deleted_copy_history_never_moves_to_reused_inventory_number(setup):
    client,clock,path,a,_=setup
    scan(client);clock.advance(600);assert count(client,a)==1
    client.delete('/api/records/'+a['id'])
    replacement=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'New','title':'New'}).json()
    assert count(client,replacement)==0 and replacement['nfc_uid'] is None
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT copy_id FROM play_events').fetchone()[0] is None


def test_reader_heartbeat_timeout_and_error_feedback(setup):
    client,clock,_,_,_=setup
    assert client.post('/api/stations/pi-main/reader',json={'status':'connected'}).json()['reader_status']=='connected'
    clock.advance(16)
    assert client.get('/api/stations/pi-main').json()['reader_status']=='disconnected'
    assert client.post('/api/stations/pi-main/reader',json={'status':'error'}).json()['reader_status']=='error'


def test_remove_tag_does_not_delete_record_or_history(setup):
    client,clock,_,a,_=setup
    scan(client);clock.advance(600);assert count(client,a)==1
    assert client.delete('/api/tags/04112233445566').status_code==204
    record=client.get('/api/records/'+a['id']).json()
    assert record['nfc_uid'] is None and record['play_count']==1


def test_version_two_metadata_survives_listening_migration(tmp_path):
    import json
    import time
    path=str(tmp_path/'version-two.sqlite3')
    metadata={'discogs_master_id':42,'checked_at':time.time(),'genres':['Rock'],'protected_fields':['title'],'source_url':'https://www.discogs.com/master/42'}
    with sqlite3.connect(path) as db:
        db.executescript("""CREATE TABLE albums(id TEXT PRIMARY KEY,artist TEXT,title TEXT,year INTEGER,tracks TEXT,metadata TEXT);
        CREATE TABLE copies(id TEXT PRIMARY KEY,album_id TEXT,inventory_number TEXT UNIQUE,format TEXT,notes TEXT,created_at TEXT);
        PRAGMA user_version=2;""")
        db.execute('INSERT INTO albums VALUES (?,?,?,?,?,?)',('album','Artist','My title',1995,'[]',json.dumps(metadata)))
        db.execute('INSERT INTO copies VALUES (?,?,?,?,?,?)',('copy','album','LP-00001','LP','My note','2026-01-01'))
    with TestClient(create_app(path,start_worker=False)) as client:
        record=client.get('/api/records/copy').json()
        assert record['title']=='My title' and record['genres']==['Rock']
        assert record['notes']=='My note' and record['protected_fields']==['title']
        assert record['play_count']==0 and record['nfc_uid'] is None
        assert client.get('/api/stations/pi-main').status_code==200


def test_background_worker_records_due_play_without_browser_requests(tmp_path):
    import time
    clock=Clock();path=str(tmp_path/'background.sqlite3')
    with TestClient(create_app(path,clock=clock,start_worker=True)) as client:
        record=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Background'}).json()
        client.put('/api/tags/04112233445566',json={'copy_id':record['id']})
        scan(client);clock.advance(601)
        deadline=time.monotonic()+4
        count=0
        while time.monotonic()<deadline:
            with sqlite3.connect(path) as db:
                count=db.execute('SELECT COUNT(*) FROM play_events').fetchone()[0]
            if count:break
            time.sleep(0.05)
        assert count==1
