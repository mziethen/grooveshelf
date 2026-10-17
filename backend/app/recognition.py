"""Local, optional cover-text recognition. Photos never reach a provider."""
import os
import shutil
import subprocess
import tempfile
from threading import Lock
from fastapi import HTTPException
from .photos import normalize

_busy = Lock()


def status():
    return {'available': shutil.which('tesseract') is not None, 'method': 'local_cover_text'}


def recognize(content):
    executable = shutil.which('tesseract')
    if not executable:
        raise HTTPException(503, 'Cover text recognition needs Tesseract on the server. See the cover recognition guide. Manual and barcode searches remain available.')
    if not _busy.acquire(blocking=False):
        raise HTTPException(429, 'Another cover is being read. Try again shortly.')
    try:
        image, _, _ = normalize(content)
        with tempfile.TemporaryFile() as output:
            try:
                subprocess.run([executable, 'stdin', 'stdout', '-l', 'eng', '--psm', '11'],
                               input=image, stdout=output, stderr=subprocess.DEVNULL,
                               timeout=20, check=True, env={**os.environ, 'OMP_THREAD_LIMIT':'1'})
            except subprocess.TimeoutExpired:
                raise HTTPException(504, 'Reading the cover took too long. Try a closer, clearer photo or search manually.')
            except (OSError, subprocess.CalledProcessError):
                raise HTTPException(503, 'Cover text recognition is unavailable. Check Tesseract and its English language data on the server.')
            output.seek(0)
            text = output.read(6000).decode('utf-8', errors='replace')
        text = ' '.join(''.join(c if c.isprintable() else ' ' for c in text).split())[:300]
        if not any(c.isalnum() for c in text):
            return {'text':'', 'method':'local_cover_text'}
        return {'text':text, 'method':'local_cover_text'}
    finally:
        _busy.release()
