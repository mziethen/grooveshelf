from io import BytesIO
import json
import sqlite3
import zipfile
from PIL import Image
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.archive import export_archive, restore_archive, verify_archive
from test_discogs import setup, imported_payload, expire


def picture(size=(32,24), format='PNG', **kwargs):
    output=BytesIO();Image.new('RGB',size,'red').save(output,format=format,**kwargs);return output.getvalue()


def upload(client, record, **kwargs):
    return client.post('/api/records/'+record['id']+'/photos', params={'kind':kwargs.pop('kind','cover'),'caption':kwargs.pop('caption','A personal photo')}, content=kwargs.pop('content',picture()), headers={'Content-Type':'image/png'})


def test_photo_normalization_selection_expiry_refresh_and_isolation(setup):
    client, fixture, _, _, path=setup
    record=client.post('/api/records',json=imported_payload()).json()
    second=client.post('/api/records',json={**imported_payload(),'inventory_number':'LP-00043'}).json()
    exif=Image.Exif();exif[274]=6;exif[270]='Private camera metadata'
    response=upload(client,record,content=picture((3000,1000),'JPEG',exif=exif),kind='back',caption='<script>My sleeve</script>')
    assert response.status_code==201;photo=response.json()
    assert (photo['width'],photo['height'])==(683,2048) and not photo['is_cover']
    image=client.get(photo['url']);assert image.headers['content-type']=='image/jpeg' and image.headers['x-content-type-options']=='nosniff'
    with Image.open(BytesIO(image.content)) as decoded:assert not decoded.getexif() and decoded.size==(683,2048)
    assert client.get('/api/records/'+record['id']).json()['cover_url']==record['cover_url']
    selected=client.put('/api/records/'+record['id']+'/personal-cover',json={'photo_id':photo['id']}).json()
    assert selected['cover_url']==photo['url'] and selected['photo_count']==1
    assert client.put('/api/records/'+second['id']+'/personal-cover',json={'photo_id':photo['id']}).status_code==404
    assert client.delete('/api/records/'+second['id']+'/photos/'+photo['id']).status_code==404
    assert client.get('/api/records/'+second['id']).json()['personal_cover_url'] is None
    client.put('/api/settings',json={'automatic_refresh':False,'confirm_import':True})
    expire(path);before=len(fixture.requests)
    shown=client.get('/api/records/'+record['id']).json()
    assert shown['metadata_status']=='unavailable' and shown['cover_url']==photo['url']
    assert client.get(photo['url']).status_code==200 and len(fixture.requests)==before
    refreshed=client.post('/api/records/'+record['id']+'/refresh').json();assert refreshed['personal_cover_url']==photo['url']
    images=client.get('/api/records/'+record['id']+'/cover-options').json()['images']
    changed=client.put('/api/records/'+record['id']+'/cover',json={'image_id':images[0]['id']}).json()
    assert changed['personal_cover_url'] is None and changed['photo_count']==1
    assert client.put('/api/records/'+record['id']+'/personal-cover',json={}).status_code==422
    client.put('/api/records/'+record['id']+'/personal-cover',json={'photo_id':photo['id']})
    assert client.delete('/api/records/'+record['id']+'/photos/'+photo['id']).status_code==204
    assert client.get('/api/records/'+record['id']).json()['personal_cover_url'] is None
    assert client.get(photo['url']).status_code==404


def test_reject_bad_photos_and_limits_without_partial_writes(setup,monkeypatch):
    client, _, _, _, _=setup;record=client.post('/api/records',json=imported_payload()).json()
    for content in [b'<svg><script>bad</script></svg>', b'not an image', picture()[:20], picture((1,1),'GIF')]:
        assert upload(client,record,content=content).status_code==422
    assert upload(client,record,content=b'x'*(5*1024*1024+1)).status_code==413
    assert upload(client,record,content=picture((8200,1))).status_code==413
    assert upload(client,record,kind='unknown').status_code==422
    assert upload(client,record,caption='x'*201).status_code==422
    assert client.get('/api/records/'+record['id']+'/photos').json()==[]
    import app.photos as module
    monkeypatch.setattr(module,'MAX_STORAGE',1)
    assert upload(client,record).status_code==409
    monkeypatch.setattr(module,'MAX_STORAGE',128*1024*1024)
    for _ in range(12):assert upload(client,record).status_code==201
    assert upload(client,record).status_code==409
    assert client.get('/api/records/'+record['id']).json()['photo_count']==12
    urls=[item['url'] for item in client.get('/api/records/'+record['id']+'/photos').json()]
    client.delete('/api/records/'+record['id'])
    assert all(client.get(url).status_code==404 for url in urls)


def test_photos_persist_and_archive_restore_includes_images_and_choice(setup,tmp_path):
    client, _, _, _, path=setup;record=client.post('/api/records',json=imported_payload()).json()
    photo=upload(client,record,kind='matrix').json()
    client.put('/api/records/'+record['id']+'/personal-cover',json={'photo_id':photo['id']})
    content=client.get(photo['url']).content
    archive=tmp_path/'photos.zip';archive.write_bytes(client.get('/api/export/collection.zip').content)
    assert verify_archive(archive)['schema_version']==10
    restored=tmp_path/'restored';restore_archive(archive,restored)
    for database in [path,str(restored/'grooveshelf.sqlite3')]:
        with TestClient(create_app(database,start_worker=False)) as other:
            shown=other.get('/api/records/'+record['id']).json()
            assert shown['personal_cover_url']==photo['url'] and shown['photo_count']==1
            assert other.get(photo['url']).content==content
            assert other.get('/api/records/'+record['id']+'/photos').json()[0]['kind']=='matrix'


def test_legacy_schema_nine_archives_restore_and_migrate(setup,tmp_path):
    client, _, _, _, path=setup;record=client.post('/api/records',json=imported_payload()).json()
    legacy=tmp_path/'legacy.sqlite3'
    with sqlite3.connect(path) as source,sqlite3.connect(legacy) as target:source.backup(target)
    with sqlite3.connect(legacy) as db:db.execute('DROP TABLE photos');db.execute('PRAGMA user_version=9')
    archive=tmp_path/'legacy.zip';assert export_archive(legacy,archive)['schema_version']==9
    assert verify_archive(archive)['schema_version']==9
    restored=tmp_path/'restored';restore_archive(archive,restored)
    with TestClient(create_app(str(restored/'grooveshelf.sqlite3'),start_worker=False)) as other:
        shown=other.get('/api/records/'+record['id']).json()
        assert shown['title']==record['title'] and shown['photo_count']==0
        assert upload(other,shown).status_code==201
    with sqlite3.connect(restored/'grooveshelf.sqlite3') as db:assert db.execute('PRAGMA user_version').fetchone()[0]==10
    # Existing collections migrate in place as well, retaining their IDs.
    with TestClient(create_app(str(legacy),start_worker=False)) as migrated:
        assert migrated.get('/api/records/'+record['id']).json()['id']==record['id']
        assert upload(migrated,record).status_code==201


def test_archive_rejects_corrupted_personal_photo(setup,tmp_path):
    from app.archive import validate_database
    client, _, _, _, path=setup;record=client.post('/api/records',json=imported_payload()).json();upload(client,record)
    with sqlite3.connect(path) as db:db.execute("UPDATE photos SET content=?",(b'not a JPEG',))
    with pytest.raises(ValueError):validate_database(path)
