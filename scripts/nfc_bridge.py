"""Station API bridge and reader-adapter boundary; hardware adapter is configured separately."""
import argparse
import importlib
import json
import time
from urllib.request import Request, urlopen


class ScanBridge:
    def __init__(self, post):
        self.post = post
        self.last_uid = None

    def observe(self, uid):
        if uid is None:
            self.last_uid = None
        else:
            if isinstance(uid, (bytes, bytearray)):
                uid = uid.hex().upper()
            if uid != self.last_uid:
                self.post('scans', {'uid': uid})
                self.last_uid = uid


def run_reader(reader, post, stop=lambda: False, clock=time.monotonic, sleep=time.sleep):
    bridge = ScanBridge(post)
    last_heartbeat = -float('inf')
    failed = False
    retry_delay = 1
    try:
        while not stop():
            if clock() - last_heartbeat >= 5:
                post('reader', {'status': 'connected'})
                last_heartbeat = clock()
            try:
                uid = reader.read_uid(timeout=0.5)
            except Exception:
                failed = True
                post('reader', {'status': 'error'})
                recover = getattr(reader, 'recover', None)
                if not callable(recover):
                    raise
                try:
                    recover()
                except Exception:
                    # Keep the bridge alive and retry recovery with a bounded delay.
                    sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 5)
                    continue
                sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 5)
                continue
            if failed:
                # The adapter recovered and returned a valid read cycle.
                post('reader', {'status': 'connected'})
                last_heartbeat = clock()
                failed = False
                retry_delay = 1
            bridge.observe(uid)
    finally:
        if not failed:
            post('reader', {'status': 'disconnected'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8080')
    parser.add_argument('--station', default='pi-main')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--uid', help='Send a single test UID; does not operate hardware')
    mode.add_argument('--reader', help='Installed adapter module:factory returning read_uid(timeout)')
    args = parser.parse_args()
    def post(endpoint, payload):
        request = Request(f'{args.url.rstrip("/")}/api/stations/{args.station}/{endpoint}',
                          data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'}, method='POST')
        with urlopen(request, timeout=10) as response:
            return json.load(response)
    if args.uid:
        post('reader', {'status':'simulation'})
        result = post('scans', {'uid':args.uid})
        print(json.dumps(result, indent=2))
    else:
        module, factory = args.reader.split(':',1)
        reader = getattr(importlib.import_module(module), factory)()
        run_reader(reader,post)


if __name__ == '__main__':
    main()
