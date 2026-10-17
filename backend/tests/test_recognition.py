from io import BytesIO
import shutil
import subprocess
import httpx
import pytest
from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import recognition
from app.main import create_app
from app.discogs import DiscogsProvider


def cover():
    image=Image.new('RGB',(1100,300),'white')
    ImageDraw.Draw(image).text((40,60),'GROOVESHELF\nEVENING SESSIONS',font=ImageFont.load_default(size=52),fill='black',spacing=20)
    output=BytesIO();image.save(output,format='PNG');return output.getvalue()


def test_read_cover_is_local_validated_bounded_and_does_not_save(tmp_path,monkeypatch):
    requests=[]
    provider=DiscogsProvider(token='test',transport=httpx.MockTransport(lambda request: requests.append(request) or httpx.Response(500)))
    monkeypatch.setattr(recognition.shutil,'which',lambda name:'/test/tesseract')
    calls=[]
    def run(args,**kwargs):
        calls.append(args)
        assert kwargs['input'].startswith(b'\xff\xd8') and kwargs['timeout']==20
        assert kwargs['env']['OMP_THREAD_LIMIT']=='1' and kwargs['check'] is True
        kwargs['stdout'].write(b'Artist\n Album\x00 <text>')
    monkeypatch.setattr(recognition.subprocess,'run',run)
    with TestClient(create_app(str(tmp_path/'test.sqlite3'),provider=provider,start_worker=False)) as client:
        assert client.get('/api/capture/cover-text/status').json()['available']
        response=client.post('/api/capture/cover-text',content=cover())
        assert response.status_code==200 and response.json()['text']=='Artist Album <text>'
        assert client.get('/api/records').json()==[] and not requests
        assert client.post('/api/capture/cover-text',content=b'not a photo').status_code==422
        assert client.post('/api/capture/cover-text',content=b'x'*(5*1024*1024+1)).status_code==413
        assert len(calls)==1
        recognition._busy.acquire()
        try: assert client.post('/api/capture/cover-text',content=cover()).status_code==429
        finally: recognition._busy.release()


@pytest.mark.parametrize('failure,status',[(subprocess.TimeoutExpired('tesseract',20),504),(subprocess.CalledProcessError(1,'tesseract'),503),(OSError('private server path'),503)])
def test_ocr_failure_is_actionable_and_releases_lock(monkeypatch,failure,status):
    monkeypatch.setattr(recognition.shutil,'which',lambda name:'/test/tesseract')
    def fail(*args,**kwargs):raise failure
    monkeypatch.setattr(recognition.subprocess,'run',fail)
    with pytest.raises(HTTPException) as result:recognition.recognize(cover())
    assert result.value.status_code==status and 'private server path' not in result.value.detail
    assert not recognition._busy.locked()


def test_missing_dependency_and_empty_text(monkeypatch):
    monkeypatch.setattr(recognition.shutil,'which',lambda name:None)
    assert not recognition.status()['available']
    with pytest.raises(HTTPException) as result:recognition.recognize(cover())
    assert result.value.status_code==503 and 'Tesseract' in result.value.detail
    monkeypatch.setattr(recognition.shutil,'which',lambda name:'/test/tesseract')
    monkeypatch.setattr(recognition.subprocess,'run',lambda *args,**kwargs:kwargs['stdout'].write(b'\n ... '))
    assert recognition.recognize(cover())['text']==''


def test_reviewed_text_uses_discogs_search_not_photo(tmp_path):
    requests=[]
    def handle(request):
        requests.append(request)
        assert request.method=='GET' and request.url.params['q']=='Artist Album'
        assert request.url.params['type']=='master' and request.url.params['page']=='2'
        return httpx.Response(200,json={'results':[{'id':42,'type':'master','title':'Artist Album'}],'pagination':{'pages':3}})
    provider=DiscogsProvider(token='test',transport=httpx.MockTransport(handle))
    with TestClient(create_app(str(tmp_path/'test.sqlite3'),provider=provider,start_worker=False)) as client:
        result=client.get('/api/metadata/discogs/text-search',params={'q':' Artist Album ','page':2})
        assert result.status_code==200 and result.json()['results'][0]['id']==42
        assert len(requests)==1
        for q in ('',' ','x'*301): assert client.get('/api/metadata/discogs/text-search',params={'q':q}).status_code==422
        assert len(requests)==1


@pytest.mark.skipif(not shutil.which('tesseract'),reason='Optional Tesseract executable not installed locally; installed in CI and Docker')
def test_real_tesseract_reads_printed_cover():
    result=recognition.recognize(cover())
    assert 'EVENING' in result['text'].upper() and 'SESSIONS' in result['text'].upper()
