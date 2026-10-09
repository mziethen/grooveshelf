from datetime import datetime,timedelta,timezone
from threading import RLock
from fastapi.testclient import TestClient
from app.main import create_app
from app.database import Database
from app.backups import BackupService
from app.archive import verify_archive,restore_archive


def test_manual_backup_api_download_and_restore(tmp_path):
    path=tmp_path/'grooveshelf.sqlite3'
    with TestClient(create_app(str(path),start_worker=False)) as client:
        copy=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Keep me'}).json()
        assert client.get('/api/backups').json()['enabled'] is False
        assert client.put('/api/backups',json={'enabled':'true'}).status_code==422
        assert client.put('/api/backups',json={'enabled':True}).json()['enabled']
        status=client.post('/api/backups').json()
        assert status['backup_count']==1 and status['last_created_at'] and status['next_due_at']
        name=status['archives'][0]['filename']
        response=client.get('/api/backups/'+name)
        assert response.status_code==200 and response.content.startswith(b'PK')
        assert client.get('/api/backups/not-a-backup.zip').status_code==422
        archive=tmp_path/'download.zip';archive.write_bytes(response.content)
        verify_archive(archive);restore_archive(archive,tmp_path/'restored')
        with TestClient(create_app(str(tmp_path/'restored'/'grooveshelf.sqlite3'),start_worker=False)) as restored:
            assert restored.get('/api/records').json()[0]['id']==copy['id']
            assert restored.get('/api/backups').json()['enabled']
        client.put('/api/backups',json={'enabled':False})
        assert client.get('/api/backups').json()['backup_count']==1


def test_daily_schedule_restart_failure_and_atomic_publication(tmp_path,monkeypatch):
    db=Database(str(tmp_path/'grooveshelf.sqlite3'));db.initialize()
    current=datetime(2026,1,1,tzinfo=timezone.utc)
    service=BackupService(db,(RLock(),RLock(),RLock()),lambda:current)
    service.tick();assert not service.directory.exists()
    service.configure(True);service.tick();assert service.status()['backup_count']==1
    first=service.files()[0][1];before=first.read_bytes()
    service.tick();assert service.status()['backup_count']==1
    current+=timedelta(hours=23)
    restarted=BackupService(db,(RLock(),RLock(),RLock()),lambda:current)
    restarted.tick();assert restarted.status()['backup_count']==1
    current+=timedelta(hours=1)
    import app.backups as module
    original=module.verify_archive
    def fail(path):raise ValueError('Corrupt archive')
    monkeypatch.setattr(module,'verify_archive',fail)
    restarted.tick();assert restarted.status()['error'] and restarted.status()['backup_count']==1
    assert first.read_bytes()==before and not list(service.directory.glob('*.partial'))
    monkeypatch.setattr(module,'verify_archive',original)
    restarted.tick();assert restarted.status()['backup_count']==1
    current+=timedelta(hours=1)
    restarted.tick();assert restarted.status()['backup_count']==2 and restarted.status()['error'] is None
    restarted.configure(False);current+=timedelta(days=2);restarted.tick();assert restarted.status()['backup_count']==2


def test_corrupt_backup_not_downloaded(tmp_path):
    with TestClient(create_app(str(tmp_path/'grooveshelf.sqlite3'),start_worker=False)) as client:
        status=client.post('/api/backups').json();name=status['archives'][0]['filename']
        (tmp_path/'backups'/name).write_bytes(b'broken')
        assert client.get('/api/backups/'+name).status_code==422
        assert (tmp_path/'backups'/name).read_bytes()==b'broken'


def test_running_worker_wakes_when_schedule_enabled(tmp_path):
    import time
    with TestClient(create_app(str(tmp_path/'grooveshelf.sqlite3'),start_worker=True)) as client:
        assert client.get('/api/backups').json()['backup_count']==0
        client.put('/api/backups',json={'enabled':True})
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if client.get('/api/backups').json()['backup_count']==1:break
            time.sleep(.02)
        assert client.get('/api/backups').json()['backup_count']==1
        client.put('/api/backups',json={'enabled':False})


def test_inspection_counts_archived_data_and_preserves_live_collection(tmp_path):
    from test_photos import picture
    path=tmp_path/'grooveshelf.sqlite3'
    with TestClient(create_app(str(path),start_worker=False)) as client:
        record=client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Archive artist','title':'Saved album'}).json()
        client.put('/api/tags/01020304',json={'copy_id':record['id']})
        client.post('/api/records/'+record['id']+'/plays',json={'played_at':'2026-01-01T12:00:00Z'})
        client.post('/api/records/'+record['id']+'/photos',params={'kind':'back'},content=picture(),headers={'Content-Type':'image/png'})
        client.post('/api/wishlist',json={'artist':'Wish artist','title':'Wish album'})
        name=client.post('/api/backups').json()['archives'][0]['filename']
        archive=tmp_path/'backups'/name;original=archive.read_bytes()
        client.post('/api/records',json={'inventory_number':'LP-00002','artist':'Later artist','title':'Added later'})
        before=client.get('/api/records').json()
        response=client.post('/api/backups/'+name+'/inspect')
        assert response.status_code==200
        data=response.json()
        assert data['verified'] and data['filename']==name and data['schema_version']==10
        assert data['counts']=={'records':1,'albums':1,'photos':1,'nfc_tags':1,'plays':1,'wishlist':1,'cached_covers':0}
        assert data['created_at'] and archive.read_bytes()==original
        assert client.get('/api/records').json()==before
        assert client.post('/api/backups/not-a-backup.zip/inspect').status_code==422
        assert client.post('/api/backups/grooveshelf-20260101T000000000000Z.zip/inspect').status_code==404
        archive.write_bytes(b'broken')
        assert client.post('/api/backups/'+name+'/inspect').status_code==422
        assert archive.read_bytes()==b'broken' and client.get('/api/records').json()==before


def test_inspection_supports_schema9_without_photos(tmp_path):
    from app.archive import export_archive,inspect_archive
    db=Database(str(tmp_path/'legacy.sqlite3'));db.initialize()
    with db.connect() as source:
        source.execute('DROP TABLE photos');source.execute('PRAGMA user_version=9')
    output=tmp_path/'legacy.zip';export_archive(db.path,output)
    report=inspect_archive(output)
    assert report['verified'] and report['schema_version']==9
    assert report['counts']['photos']==0 and report['counts']['records']==0
