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


def release_year(value):
    return value if type(value) is int and 1900 <= value <= 2100 else None


def pressing_details(data):
    labels = data.get('labels') or []
    numbers = []
    for label in labels[:100]:
        if not isinstance(label, dict):
            continue
        number = label.get('catno')
        if isinstance(number, str) and number.strip() and number.strip().lower() not in {'none', 'no cat#', 'n/a'}:
            number = number.strip()[:200]
            if number not in numbers:
                numbers.append(number)
    country = data.get('country')
    return {'pressing_year': release_year(data.get('year')),
            'country': country.strip()[:100] if isinstance(country, str) else '',
            'catalog_numbers': numbers[:30]}


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


def credit_entries(data):
    """Keep provider scopes as text; do not infer track-range associations."""
    result = []
    seen = set()
    def add(entries, scope=''):
        if not isinstance(entries, list):
            return
        for entry in entries[:300]:
            if len(result) >= 300:
                return
            if not isinstance(entry, dict):
                continue
            variant = entry.get('anv')
            name = variant if isinstance(variant, str) and variant.strip() else entry.get('name')
            role = entry.get('role')
            if not isinstance(name, str) or not isinstance(role, str):
                continue
            name, role = name.strip()[:300], role.strip()[:500]
            if not name or not role:
                continue
            tracks = entry.get('tracks')
            tracks = tracks.strip()[:1000] if isinstance(tracks, str) and tracks.strip() else scope
            key = (name, role, tracks)
            if key not in seen:
                seen.add(key); result.append({'name': name, 'role': role, 'tracks': tracks})
    add(data.get('extraartists'))
    def walk(items):
        if not isinstance(items, list):
            return
        for item in items:
            if len(result) >= 300:
                return
            if not isinstance(item, dict) or item.get('type_') == 'heading':
                continue
            position, title = item.get('position'), item.get('title')
            scope = position if isinstance(position, str) and position.strip() else title
            scope = scope.strip()[:1000] if isinstance(scope, str) else ''
            add(item.get('extraartists'), scope)
            walk(item.get('sub_tracks'))
    walk(data.get('tracklist'))
    return result


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
            result.update(original_year=release_year(year) if kind == 'masters' else None,
                          original_year_source_url=result['source_url'] if kind == 'masters' and release_year(year) else None,
                          pressing_year=None, country='', catalog_numbers=[])
            if kind == 'releases':
                result.update(pressing_details(data))
                mid = data.get('master_id')
                if type(mid) is int and mid > 0:
                    try:
                        original = self.request(f'/masters/{mid}')
                        result['original_year'] = release_year(original.get('year'))
                        if result['original_year']:
                            result['original_year_source_url'] = f'https://www.discogs.com/master/{mid}'
                    except HTTPException:
                        pass  # Optional original-year lookup must not block a pressing import.
            result['credits'] = credit_entries(data)
            result['credits_source_url'] = result['source_url'] if result['credits'] else None
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
                    reference_credits = credit_entries(release)
                    if reference_credits:
                        result['credits'] = reference_credits
                        result['credits_source_url'] = result['reference_release_url']
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
        self.retain_expired = lambda: False

    def path(self, master_id):
        return self.directory / f"discogs-master-{master_id}.img"

    def store(self, master_id, url, *, retain_expired=False):
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
            retain_expired = retain_expired or self.retain_expired()
            with self.lock:
                self.directory.mkdir(parents=True, exist_ok=True)
                for old in self.directory.glob('discogs-master-*.img'):
                    if not retain_expired and timestamp() - old.stat().st_mtime >= MAX_AGE:
                        old.unlink(missing_ok=True)
                path = self.path(master_id)
                temporary = path.with_suffix(".tmp")
                temporary.write_bytes(content)
                temporary.replace(path)
            return True
        except (httpx.HTTPError, OSError, ValueError):
            self.retry_after = monotonic() + 30
            return False

    def image_content(self, key, url, checked_at, *, allow_expired=False):
        # Expired bytes require an explicit installation-level display preference.
        with self.lock:
            path = self.path(key)
            if path.exists() and (allow_expired or (checked_at <= path.stat().st_mtime and timestamp() - path.stat().st_mtime < MAX_AGE)):
                return path.read_bytes()
        if allow_expired and timestamp() - checked_at >= MAX_AGE:
            raise HTTPException(404, "This saved image is not cached. Refresh the record to download it.")
        if not self.store(key, url, retain_expired=allow_expired):
            raise HTTPException(502, 'Image could not be downloaded. Choose another image or retry later.')
        with self.lock:
            try:
                return self.path(key).read_bytes()
            except FileNotFoundError:
                raise HTTPException(404, 'Image not available.') from None

    def clear(self, master_id):
        with self.lock:
            self.path(master_id).unlink(missing_ok=True)
