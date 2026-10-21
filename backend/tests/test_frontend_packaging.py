import importlib.util
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shlex
import shutil
from threading import Thread
import pytest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('frontend_check',ROOT/'scripts/check_frontend_modules.py')
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)


def test_frontend_docker_copy_includes_complete_module_graph(tmp_path):
    # Reproduce the frontend COPY instructions, independently of the working tree.
    source=ROOT/'frontend'
    for line in (source/'Dockerfile').read_text().splitlines():
        if not line.startswith('COPY '):continue
        for name in shlex.split(line)[1:-1]:
            origin=source/name
            if origin.is_dir():shutil.copytree(origin,tmp_path/origin.name)
            else:shutil.copy2(origin,tmp_path/origin.name)
    handler=partial(SimpleHTTPRequestHandler,directory=str(tmp_path))
    server=ThreadingHTTPServer(('127.0.0.1',0),handler)
    worker=Thread(target=server.serve_forever,daemon=True);worker.start()
    try:checker.check(f'http://127.0.0.1:{server.server_port}')
    finally:server.shutdown();server.server_close();worker.join()


def test_module_checker_rejects_spa_fallback_html():
    class Fallback(SimpleHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<html>App</html>')
        def log_message(self,*args):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Fallback)
    worker=Thread(target=server.serve_forever,daemon=True);worker.start()
    try:
        with pytest.raises(RuntimeError,match='not JavaScript'):checker.check(f'http://127.0.0.1:{server.server_port}')
    finally:server.shutdown();server.server_close();worker.join()
