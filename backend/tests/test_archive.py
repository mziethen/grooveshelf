from contextlib import closing
import json
import sqlite3
import zipfile
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.archive import export_archive, verify_archive, restore_archive, digest
from test_discogs import setup, imported_payload, PNG


def rewrite(source, destination, transform):
    with zipfile.ZipFile(source) as archive:
        entries={name:archive.read(name) for name in archive.namelist()}
    transform(entries)
    with zipfile.ZipFile(destination,'w') as archive:
        for name,value in entries.items():archive.writestr(name,value)


def test_roundtrip_preserves_collection_covers_settings_and_relationships(setup,tmp_path):
    client,_,_,covers,path=setup
    record=client.post('/api/records',json={**imported_payload(),'rating':5,'storage_location':'Shelf B','notes':'Personal notes'}).json()
    client.put('/api/records/'+record['id']+'/favorite',json={'favorite':True})
    client.put('/api/tags/01020304',json={'copy_id':record['id']})
    play=client.post('/api/records/'+record['id']+'/plays',json={'played_at':'2026-01-01T12:00:00Z'}).json()
    wish=client.post('/api/wishlist',json={'artist':'Wish Artist','title':'Wish Album'}).json()
    client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':False})
    client.post('/api/stations/pi-main/scans',json={'uid':'01020304'})
    with closing(sqlite3.connect(path)) as db:
        db.execute('INSERT INTO discogs_links VALUES(?,?,?,?)',('collector',1,100,record['id']))
        db.execute('INSERT INTO discogs_exports VALUES(?,?,?,?,?,?,?)',('intent-id','collector',record['id'],100,'[]','uncertain','2026-01-01T00:00:00Z'))
        db.commit()
    (tmp_path/'.env').write_text('DISCOGS_TOKEN=never-export-this')
    response=client.get('/api/export/collection.zip');assert response.status_code==200
    output=tmp_path/'collection.zip';output.write_bytes(response.content);verify_archive(output)
    with zipfile.ZipFile(output) as archive:
        assert all(not name.endswith('.env') for name in archive.namelist())
        assert b'never-export-this' not in b''.join(archive.read(name) for name in archive.namelist())
    destination=tmp_path/'restored';restore_archive(output,destination)
    assert (destination/'covers'/covers.path(42).name).read_bytes()==PNG
    with closing(sqlite3.connect(destination/'grooveshelf.sqlite3')) as db:
        assert db.execute('SELECT copy_id FROM discogs_links').fetchone()[0]==record['id']
        assert db.execute('SELECT id,status FROM discogs_exports').fetchone()==('intent-id','uncertain')
    with TestClient(create_app(str(destination/'grooveshelf.sqlite3'),start_worker=False)) as restored:
        item=restored.get('/api/records/'+record['id']).json()
        for key in ['id','album_id','inventory_number','rating','notes','storage_location','tracks']:
            assert item[key]==record[key]
        assert item['favorite'] and item['nfc_uid']=='01020304' and item['play_count']==1
        assert restored.get('/api/records/'+record['id']+'/plays').json()[0]['id']==play['id']
        assert restored.get('/api/wishlist').json()[0]['id']==wish['id']
        assert not restored.get('/api/settings').json()['automatic_refresh']
        assert restored.get('/api/covers/discogs/42').content==PNG
        station=restored.get('/api/stations/pi-main').json()
        assert station['session']['status']=='canceled' and station['reader_status']=='disconnected'
    with pytest.raises(ValueError,match='new destination'):restore_archive(output,destination)
    with pytest.raises(ValueError,match='already exists'):export_archive(path,output)


@pytest.mark.parametrize('fault',['checksum','version','path','schema','trigger','relationship','oversize'])
def test_corrupt_archives_do_not_create_destination(tmp_path,fault):
    database=tmp_path/'data'/'grooveshelf.sqlite3'
    with TestClient(create_app(str(database),start_worker=False)) as client:
        client.post('/api/records',json={'inventory_number':'LP-00001','artist':'Artist','title':'Album'})
    original=tmp_path/'good.zip';export_archive(database,original)
    def corrupt(entries):
        manifest=json.loads(entries['manifest.json'])
        if fault=='checksum':entries['collection.sqlite3']+=b'broken'
        elif fault=='version':manifest['version']=999
        elif fault=='path':
            entries['../outside.txt']=b'bad';manifest['files']['../outside.txt']={'size':3,'sha256':digest(b'bad')}
        elif fault=='oversize':manifest['files']['collection.sqlite3']['size']=999999999
        else:
            path=tmp_path/'mutated.sqlite3';path.write_bytes(entries['collection.sqlite3'])
            with closing(sqlite3.connect(path)) as db:
                if fault=='schema':db.execute('PRAGMA user_version=999')
                elif fault=='trigger':db.execute('CREATE TRIGGER unwanted AFTER UPDATE ON copies BEGIN DELETE FROM copies; END')
                else:db.execute("UPDATE copies SET album_id='missing'")
                db.commit()
            data=path.read_bytes();entries['collection.sqlite3']=data
            manifest['files']['collection.sqlite3']={'size':len(data),'sha256':digest(data)}
        entries['manifest.json']=json.dumps(manifest).encode()
    bad=tmp_path/'bad.zip';rewrite(original,bad,corrupt)
    destination=tmp_path/'untouched'
    with pytest.raises((ValueError,sqlite3.DatabaseError)):restore_archive(bad,destination)
    assert not destination.exists()
    assert not (tmp_path/'outside.txt').exists()


def test_cli_export_verify_restore(tmp_path):
    import subprocess,sys
    from pathlib import Path
    script=Path(__file__).resolve().parents[2]/'scripts'/'collection_archive.py'
    path=tmp_path/'grooveshelf.sqlite3'
    with TestClient(create_app(str(path),start_worker=False)):pass
    output=tmp_path/'archive.zip'
    for arguments in [['export','--database',str(path),'--output',str(output)],['verify',str(output)],['restore',str(output),'--destination',str(tmp_path/'restored')]]:
        result=subprocess.run([sys.executable,str(script),*arguments],capture_output=True,text=True)
        assert result.returncode==0,result.stderr
        assert json.loads(result.stdout)['status']=='ok'
