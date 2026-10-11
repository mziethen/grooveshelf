import json
import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.archive import export_archive,restore_archive,verify_archive
from app.database import Database
from test_sync import setup
from test_sync_fields import mapped

MAPPING={'account_id':'123','media_condition':7,'sleeve_condition':8,'notes':9,'folder_locations':True}


def test_saved_choices_survive_restart_and_archive_without_importing(mapped,setup,tmp_path):
    client,fixture,path,definitions,copy_id=mapped
    before=client.get('/api/records/'+copy_id).json()
    writes=len([r for r in fixture.calls if r.method!='GET'])
    assert client.put('/api/discogs/sync/mapping',json=MAPPING).status_code==200
    assert client.get('/api/discogs/sync/fields').json()['saved_mapping']==MAPPING
    assert client.get('/api/records/'+copy_id).json()==before
    assert not any(a['kind']=='personal' for a in client.get('/api/discogs/sync/preview').json()['actions'])
    with TestClient(create_app(path,setup[3],setup[4],start_worker=False)) as restarted:
        assert restarted.get('/api/discogs/sync/fields').json()['saved_mapping']==MAPPING
    archive=tmp_path/'saved.zip';export_archive(path,archive)
    restored=tmp_path/'restored';restore_archive(archive,restored)
    with TestClient(create_app(str(restored/'grooveshelf.sqlite3'),setup[3],setup[4],start_worker=False)) as restored_client:
        assert restored_client.get('/api/discogs/sync/fields').json()['saved_mapping']==MAPPING
    assert len([r for r in fixture.calls if r.method!='GET'])==writes


@pytest.mark.parametrize('change',['name','type','options','missing'])
def test_changed_saved_definitions_require_new_mapping(mapped,change):
    client,_,_,definitions,_=mapped
    client.put('/api/discogs/sync/mapping',json=MAPPING).raise_for_status()
    if change=='missing':definitions.pop()
    else:definitions[0][change]=['Changed'] if change=='options' else 'Changed'
    fields=client.get('/api/discogs/sync/fields').json()
    assert fields['saved_mapping'] is None and fields['saved_mapping_invalid'] is True
    assert client.request('DELETE','/api/discogs/sync/mapping',json={'account_id':'123'}).status_code==200
    fields=client.get('/api/discogs/sync/fields').json()
    assert fields['saved_mapping'] is None and fields['saved_mapping_invalid'] is False


def test_mapping_accounts_are_isolated_and_wrong_account_cannot_change_saved_choices(mapped):
    client,fixture,_,_,_=mapped
    client.put('/api/discogs/sync/mapping',json=MAPPING).raise_for_status()
    fixture.account=456
    assert client.get('/api/discogs/sync/fields').json()['saved_mapping'] is None
    assert client.put('/api/discogs/sync/mapping',json=MAPPING).status_code==409
    assert client.request('DELETE','/api/discogs/sync/mapping',json={'account_id':'123'}).status_code==409
    other={**MAPPING,'account_id':'456','notes':None}
    client.put('/api/discogs/sync/mapping',json=other).raise_for_status()
    assert client.get('/api/discogs/sync/fields').json()['saved_mapping']==other
    fixture.account=123
    assert client.get('/api/discogs/sync/fields').json()['saved_mapping']==MAPPING


def test_invalid_mapping_does_not_replace_saved_choices(mapped):
    client,_,_,_,_=mapped
    client.put('/api/discogs/sync/mapping',json=MAPPING).raise_for_status()
    for invalid,status in [({**MAPPING,'notes':7},422),({**MAPPING,'notes':999},409),({**MAPPING,'folder_locations':'yes'},422)]:
        assert client.put('/api/discogs/sync/mapping',json=invalid).status_code==status
        assert client.get('/api/discogs/sync/fields').json()['saved_mapping']==MAPPING


@pytest.mark.parametrize('version',[9,10])
def test_old_archives_restore_into_new_schema(tmp_path,version):
    db=Database(str(tmp_path/'old.sqlite3'));db.initialize()
    with db.connect() as source:
        source.execute('DROP TABLE discogs_field_mappings')
        if version==9:source.execute('DROP TABLE photos')
        source.execute(f'PRAGMA user_version={version}')
    archive=tmp_path/'old.zip';export_archive(db.path,archive)
    assert verify_archive(archive)['schema_version']==version
    restored=tmp_path/'restored';restore_archive(archive,restored)
    with sqlite3.connect(restored/'grooveshelf.sqlite3') as target:
        assert target.execute('PRAGMA user_version').fetchone()[0]==11
        assert target.execute('SELECT COUNT(*) FROM discogs_field_mappings').fetchone()[0]==0


def test_invalid_saved_mapping_is_not_loaded_or_exported(mapped,tmp_path):
    client,_,path,_,_=mapped
    with sqlite3.connect(path) as db:db.execute('INSERT INTO discogs_field_mappings VALUES(?,?)',('123',json.dumps({'mapping':MAPPING,'definitions':{}})))
    assert client.get('/api/discogs/sync/fields').json()['saved_mapping_invalid'] is True
    with pytest.raises(ValueError):export_archive(path,tmp_path/'invalid.zip')
