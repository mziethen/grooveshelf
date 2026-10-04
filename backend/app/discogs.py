"""Discogs adapter: fixed API endpoints, server-side credentials and bounded cover cache."""
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import monotonic
from urllib.parse import urlsplit
import os
import re
import hashlib
import httpx
from fastapi import HTTPException

MAX_AGE = 6 * 60 * 60
USER_AGENT = "GrooveShelf/0.2.0 +https://github.com/mziethen/grooveshelf"


def timestamp():
    return datetime.now(timezone.utc).timestamp()


def fresh(metadata):
    age = timestamp() - metadata.get("checked_at", 0)
    return 0 <= age < MAX_AGE


def image_choices(images):
    choices = []
    seen = set()
    for image in images[:60]:
        url = image.get('uri')
        if not isinstance(url, str):
            continue
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.netloc != 'i.discogs.com':
            continue
        # Signed/size-specific URLs change; the original image filename is stable.
        identity = parsed.path.split('/discogs-images/')[-1] if '/discogs-images/' in parsed.path else parsed.path
        key = hashlib.sha256(identity.encode()).hexdigest()[:32]
        if key not in seen:
            choices.append({'id': key, 'type': 'primary' if image.get('type') == 'primary' else 'secondary', 'url': url})
            seen.add(key)
    return choices


def source_key(metadata):
    return f"r{metadata['discogs_release_id']}" if metadata.get('discogs_release_id') else str(metadata['discogs_master_id'])


def public_images(metadata):
    sid = metadata.get('discogs_release_id') or metadata['discogs_master_id']
    kind = 'releases' if metadata.get('discogs_release_id') else 'masters'
    return [{'id': image['id'], 'type': image['type'],
             'preview_url': f"/api/metadata/discogs/{kind}/{sid}/images/{image['id']}"}
            for image in metadata.get('images', [])]


class DiscogsProvider:
    def __init__(self, token=None, transport=None):
        self.token = os.getenv("DISCOGS_TOKEN", "").strip() if token is None else token
        self.transport = transport
        self.cache = {}
        self.lock = Lock()
        self.retry_after = 0
        self.retry_error = (429, "Discogs is rate-limited. Please try again shortly.")

    def request(self, path, params=None, method="GET", body=None):
        if monotonic() < self.retry_after:
            raise HTTPException(*self.retry_error)
        headers = {"User-Agent": USER_AGENT}
        if self.token:
            headers["Authorization"] = f"Discogs token={self.token}"
        try:
            with httpx.Client(transport=self.transport, timeout=15, follow_redirects=False) as client:
                response = client.request(method, "https://api.discogs.com" + path, params=params, headers=headers, json=body)
            if response.status_code == 429:
                try:
                    delay = min(300, max(1, int(response.headers.get("Retry-After", "60"))))
                except ValueError:
                    delay = 60
                self.retry_after = monotonic() + delay
                self.retry_error = (429, "Discogs is rate-limited. Please try again shortly.")
                raise HTTPException(429, "Discogs is rate-limited. Please try again shortly.")
            if response.status_code in (401, 403):
                self.retry_after = monotonic() + 30
                self.retry_error = (503, "Discogs access was denied. Check DISCOGS_TOKEN on the server.")
                raise HTTPException(*self.retry_error)
            if response.status_code == 404:
                raise HTTPException(404, "This Discogs entry was not found.")
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError("Invalid response")
            return data
        except (httpx.HTTPError, ValueError):
            self.retry_after = monotonic() + 30
            self.retry_error = (502, "Discogs is currently unavailable. Manual entry still works.")
            raise HTTPException(*self.retry_error) from None

    def search(self, artist, title, page):
        if not self.token:
            raise HTTPException(503, "Discogs search needs a server-side DISCOGS_TOKEN. You can still enter records manually.")
        data = self.request("/database/search", {"artist": artist, "release_title": title,
                                               "type": "master", "per_page": 20, "page": page})
        results = []
        for item in data.get("results", []):
            mid = item.get("id")
            if item.get("type") != "master" or not isinstance(mid, int) or mid < 1:
                continue
            results.append({"id": mid, "title": str(item.get("title", "Untitled"))[:600],
                            "year": item.get("year"), "source_url": f"https://www.discogs.com/master/{mid}"})
        pagination = data.get("pagination", {})
        return {"results": results, "page": page, "pages": min(50, pagination.get("pages", 1))}

    def identifier_search(self, kind, value, page):
        if not self.token:
            raise HTTPException(503, 'Discogs search needs a server-side DISCOGS_TOKEN. You can still enter records manually.')
        data = self.request('/database/search', {kind: value, 'type': 'release', 'per_page': 20, 'page': page})
        results = []
        for item in data.get('results', []):
            rid = item.get('id')
            if item.get('type') != 'release' or not isinstance(rid, int) or rid < 1:
                continue
            results.append({'id': rid, 'title': str(item.get('title', 'Untitled'))[:600],
                            'year': item.get('year'), 'country': str(item.get('country', ''))[:100],
                            'catno': str(item.get('catno', ''))[:300],
                            'source_url': f'https://www.discogs.com/release/{rid}'})
        return {'results': results, 'page': page, 'pages': min(50, data.get('pagination', {}).get('pages', 1))}

    def master(self, master_id, force=False):
        return self.entry(master_id, 'masters', force)

    def release(self, release_id, force=False):
        return self.entry(release_id, 'releases', force)

    def entry(self, master_id, kind, force=False):
        cache_key = master_id if kind == 'masters' else f'release:{master_id}'
        with self.lock:
            cached = self.cache.get(cache_key)
            if cached and not force and timestamp() - cached["checked_at"] < 300:
                return dict(cached)
            data = self.request(f"/{kind}/{master_id}")
            formats = data.get('formats', [])
            descriptions = {value for item in formats for value in item.get('descriptions', [])}
            copy_format = next((value for value in ['LP', 'EP', 'Single'] if value in descriptions), 'Other')
            tracks = []
            def flatten(items):
                for item in items:
                    if item.get("sub_tracks"):
                        flatten(item["sub_tracks"])
                    elif item.get("type_") != "heading" and str(item.get("title", "")).strip():
                        track = {"position": str(item.get("position", ""))[:20],
                                 "title": str(item["title"]).strip()[:300]}
                        duration = item.get('duration')
                        if isinstance(duration, str):
                            duration = duration.strip()
                            if re.fullmatch(r'[0-9]{1,3}:[0-5][0-9]|[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]', duration):
                                track['duration'] = duration
                        tracks.append(track)
            flatten(data.get("tracklist", []))
            artists = data.get("artists", [])
            artist = " ".join((str(a.get("anv") or a.get("name", "")) + " " + str(a.get("join", ""))).strip() for a in artists).strip()
            year = data.get("year")
            images = data.get("images", [])
            image = next((i for i in images if i.get("type") == "primary"), images[0] if images else {})
            result = {"discogs_master_id": master_id if kind == 'masters' else data.get('master_id') or None,
                      "discogs_release_id": master_id if kind == 'releases' else None,
                      "copy_format": copy_format, "is_vinyl": any(item.get('name') == 'Vinyl' for item in formats), "artist": artist[:300] or "Unknown artist",
                      "title": str(data.get("title", "Untitled")).strip()[:300] or "Untitled",
                      "year": year if isinstance(year, int) and 1900 <= year <= 2100 else None,
                      "tracks": tracks[:300], "genres": [str(g)[:100] for g in data.get("genres", [])[:30]],
                      "styles": [str(g)[:100] for g in data.get("styles", [])[:30]],
                      "labels": [], "description": "", "reference_release_url": None, "image_url": image.get("uri"),
                      "source_url": f"https://www.discogs.com/{'master' if kind == 'masters' else 'release'}/{master_id}", "source_name": "Discogs",
                      "checked_at": timestamp(), "images": image_choices(images)}
            if kind == 'releases':
                result['labels'] = list(dict.fromkeys(str(l.get('name', ''))[:200] for l in data.get('labels', []) if l.get('name')))[:30]
                result['description'] = str(data.get('notes', ''))[:10000]
            release_id = data.get("main_release") if kind == 'masters' else None
            if isinstance(release_id, int) and release_id > 0:
                try:
                    release = self.request(f"/releases/{release_id}")
                    result["reference_release_url"] = f"https://www.discogs.com/release/{release_id}"
                    result["labels"] = list(dict.fromkeys(str(l.get("name", ""))[:200] for l in release.get("labels", []) if l.get("name")))[:30]
                    result["description"] = str(release.get("notes", ""))[:10000]
                except HTTPException:
                    pass  # A missing main release must not prevent master import.
            if len(self.cache) >= 64:
                self.cache.pop(next(iter(self.cache)))
            self.cache[cache_key] = result
            return dict(result)


class CoverStore:
    def __init__(self, directory, transport=None):
        self.directory = Path(directory)
        self.transport = transport
        self.lock = Lock()
        self.retry_after = 0

    def path(self, master_id):
        return self.directory / f"discogs-master-{master_id}.img"

    def store(self, master_id, url):
        if monotonic() < self.retry_after:
            return False
        if not isinstance(url, str):
            return False
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname != "i.discogs.com" or parsed.username or parsed.password or parsed.netloc != "i.discogs.com":
            return False
        try:
            # Credentials are deliberately never sent to image hosts.
            with httpx.Client(transport=self.transport, timeout=15, follow_redirects=False) as client:
                with client.stream("GET", url, headers={"User-Agent": USER_AGENT}) as response:
                    response.raise_for_status()
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > 5 * 1024 * 1024:
                            return False
            if not (content.startswith(b"\xff\xd8\xff") or content.startswith(b"\x89PNG\r\n\x1a\n") or (content.startswith(b"RIFF") and content[8:12] == b"WEBP")):
                return False
            with self.lock:
                self.directory.mkdir(parents=True, exist_ok=True)
                for old in self.directory.glob('discogs-master-*.img'):
                    if timestamp() - old.stat().st_mtime >= MAX_AGE:
                        old.unlink(missing_ok=True)
                path = self.path(master_id)
                temporary = path.with_suffix(".tmp")
                temporary.write_bytes(content)
                temporary.replace(path)
            return True
        except (httpx.HTTPError, OSError, ValueError):
            self.retry_after = monotonic() + 30
            return False

    def image_content(self, key, url, checked_at):
        # Reuse bytes only within the validated provider snapshot's lifetime.
        with self.lock:
            path = self.path(key)
            if path.exists() and checked_at <= path.stat().st_mtime and timestamp() - path.stat().st_mtime < MAX_AGE:
                return path.read_bytes()
        if not self.store(key, url):
            raise HTTPException(502, 'Image could not be downloaded. Choose another image or retry later.')
        with self.lock:
            try:
                return self.path(key).read_bytes()
            except FileNotFoundError:
                raise HTTPException(404, 'Image not available.') from None

    def clear(self, master_id):
        with self.lock:
            self.path(master_id).unlink(missing_ok=True)
