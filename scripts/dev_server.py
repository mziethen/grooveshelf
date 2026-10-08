"""Local static frontend and API proxy; run the backend separately."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import argparse


class Handler(SimpleHTTPRequestHandler):
    backend_url = 'http://127.0.0.1:8000'
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parents[1] / 'frontend'), **kwargs)

    def proxy(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            self.send_error(400, 'Invalid content length')
            return
        if not 0 <= length <= 6 * 1024 * 1024:
            self.send_error(413, 'Request body exceeds the 6 MiB proxy limit')
            return
        content = self.rfile.read(length)
        request = Request(self.backend_url + self.path, data=content if content else None,
                          method=self.command, headers={'Content-Type': self.headers.get('Content-Type', 'application/json')})
        try:
            result = urlopen(request, timeout=60)
        except HTTPError as error:
            result = error
        except URLError:
            self.send_error(502, 'Backend is unavailable')
            return
        with result:
            self.send_response(result.status)
            self.send_header('Content-Type', result.headers.get('Content-Type', 'application/json'))
            for name in ['Content-Disposition', 'Cache-Control', 'X-Content-Type-Options']:
                if result.headers.get(name):
                    self.send_header(name, result.headers[name])
            self.end_headers()
            self.wfile.write(result.read())

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy()
        else:
            super().do_GET()

    do_POST = proxy
    do_PUT = proxy
    do_PATCH = proxy
    do_DELETE = proxy


class DevelopmentServer(ThreadingHTTPServer):
    # Browsers open many connections together when loading ES module imports.
    request_queue_size = 64


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--backend-url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    Handler.backend_url = args.backend_url.rstrip('/')
    print(f'GrooveShelf frontend: http://127.0.0.1:{args.port}', flush=True)
    DevelopmentServer(('127.0.0.1', args.port), Handler).serve_forever()
