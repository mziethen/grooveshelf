from io import BytesIO
import os
from PIL import Image, ImageDraw, ImageEnhance
from app.discogs import MAX_AGE, timestamp
from test_discogs import setup, imported_payload, expire
from app import cover_matching


def art(color='red',size=(500,500),brightness=1):
    image=Image.new('RGB',(500,500),'white');draw=ImageDraw.Draw(image)
    draw.rectangle((0,0,450,300),fill=color);draw.ellipse((140,180,490,490),fill='black')
    image=ImageEnhance.Brightness(image).enhance(brightness).resize(size)
    output=BytesIO();image.save(output,format='PNG');return output.getvalue()


def add_photo(client,number,image):
    record=client.post('/api/records',json={'inventory_number':number,'artist':'Local artist','title':number}).json()
    photo=client.post('/api/records/'+record['id']+'/photos',content=image).json()
    assert client.put('/api/records/'+record['id']+'/personal-cover',json={'photo_id':photo['id']}).status_code==200
    return record


def compare(client,image):return client.post('/api/capture/cover-matches',content=image)


def test_visual_matches_without_text_keep_copies_distinct_and_no_writes(setup):
    client,fixture,_,_,_=setup
    # Nontextual artwork with the same layout but different colors must not match.
    one=add_photo(client,'LP-00001',art());two=add_photo(client,'LP-00002',art());add_photo(client,'LP-00003',art('blue'))
    before=client.get('/api/records').json();fixture.requests.clear()
    result=compare(client,art(size=(700,700),brightness=.97))
    assert result.status_code==200
    data=result.json();assert {r['id'] for r in data['matches']}=={one['id'],two['id']}
    assert data['compared']==3 and not data['incomplete'] and data['total_matches']==2
    assert all('confidence' not in r and '_rank' not in r and 'cover_url' not in r for r in data['matches'])
    assert client.get('/api/records').json()==before and not fixture.requests
    assert compare(client,b'bad photo').status_code==422
    assert compare(client,b'x'*(5*1024*1024+1)).status_code==413


def test_cached_cover_policy_and_personal_precedence(setup):
    client,fixture,_,covers,path=setup
    record=client.post('/api/records',json=imported_payload()).json()
    covers.path('42').write_bytes(art())
    fixture.requests.clear()
    assert compare(client,art()).json()['matches'][0]['id']==record['id']
    expire(path)
    assert compare(client,art()).json()['matches']==[] and not fixture.requests
    settings=client.get('/api/settings').json();settings['show_expired_metadata']=True
    client.put('/api/settings',json=settings)
    assert compare(client,art()).json()['matches'][0]['id']==record['id']
    # A selected personal cover replaces the provider cover for visual comparison.
    photo=client.post('/api/records/'+record['id']+'/photos',content=art('blue')).json()
    client.put('/api/records/'+record['id']+'/personal-cover',json={'photo_id':photo['id']})
    assert compare(client,art()).json()['matches']==[]
    assert compare(client,art('blue')).json()['matches'][0]['id']==record['id']
    assert not fixture.requests


def test_unavailable_files_empty_collection_and_partial_comparison(setup,monkeypatch):
    client,fixture,_,covers,_=setup
    assert compare(client,art()).json()['compared']==0
    client.post('/api/records',json=imported_payload())
    covers.path('42').write_bytes(b'corrupt')
    assert compare(client,art()).json()['unavailable']==1
    covers.path('42').write_bytes(art());old=timestamp()-MAX_AGE-1
    os.utime(covers.path('42'),(old,old))
    fixture.requests.clear();assert compare(client,art()).json()['matches']==[]
    ticks=iter([0,11]);monkeypatch.setattr(cover_matching,'monotonic',lambda:next(ticks))
    result=compare(client,art()).json();assert result['incomplete'] and result['compared']==0 and not fixture.requests


def test_comparison_limit_keeps_results_and_low_detail_is_rejected(setup,monkeypatch):
    client,fixture,_,_,_=setup
    add_photo(client,'LP-00001',art());add_photo(client,'LP-00002',art())
    monkeypatch.setattr(cover_matching,'MAX_COMPARISONS',1)
    result=compare(client,art()).json()
    assert result['incomplete'] and result['compared']==1 and result['total_matches']==1
    assert result['matches'][0]['inventory_number']=='LP-00001'
    output=BytesIO();Image.new('RGB',(100,100),'white').save(output,format='PNG')
    assert compare(client,output.getvalue()).status_code==422
    assert compare(client,art()).status_code==200
