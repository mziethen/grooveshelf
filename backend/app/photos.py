"""Copy-owned, decoded personal photos kept inside the portable database."""
from datetime import datetime, timezone
from io import BytesIO
from threading import RLock
from uuid import uuid4
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException

MAX_UPLOAD = 5 * 1024 * 1024
MAX_STORED = 2 * 1024 * 1024
MAX_STORAGE = 128 * 1024 * 1024
MAX_PHOTOS = 12
KINDS = ('cover', 'back', 'label', 'matrix')


def normalize(content):
    if not content or len(content) > MAX_UPLOAD:
        raise HTTPException(413, 'Choose an image up to 5 MiB.')
    try:
        with Image.open(BytesIO(content), formats=['JPEG', 'PNG', 'WEBP']) as original:
            if original.width * original.height > 24_000_000 or max(original.size) > 8192:
                raise HTTPException(413, 'Choose an image with at most 24 megapixels and sides no larger than 8192 pixels.')
            if getattr(original, 'n_frames', 1) != 1:
                raise HTTPException(422, 'Animated images are not supported. Choose a still photo.')
            original.load()
            image = ImageOps.exif_transpose(original)
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            rgba = image.convert('RGBA')
            result = Image.new('RGB', image.size, 'white')
            result.paste(rgba, mask=rgba.getchannel('A'))
            output = BytesIO(); result.save(output, format='JPEG', quality=88, optimize=True)
            data = output.getvalue()
            if len(data) > MAX_STORED:
                raise HTTPException(413, 'This image remains too large after resizing. Choose a smaller photo.')
            return data, result.width, result.height
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise HTTPException(422, 'The image could not be read. Choose a complete JPEG, PNG or WebP photo.') from error


def descriptor(row):
    return {key: row[key] for key in ['id', 'kind', 'caption', 'width', 'height', 'created_at']} | {
        'is_cover': bool(row['is_cover']), 'url': f"/api/photos/{row['id']}"}


class PhotoService:
    def __init__(self, database, repository):
        self.database, self.repository = database, repository
        self.lock = RLock()

    def list(self, copy_id):
        self.repository.get(copy_id)
        with self.database.connect() as db:
            rows = db.execute('SELECT id,kind,caption,width,height,created_at,is_cover FROM photos WHERE copy_id=? ORDER BY created_at,id', (copy_id,)).fetchall()
        return [descriptor(row) for row in rows]

    def add(self, copy_id, content, kind, caption):
        with self.lock:
            data, width, height = normalize(content)
            photo_id = str(uuid4()); created = datetime.now(timezone.utc).isoformat()
            with self.database.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if not db.execute('SELECT id FROM copies WHERE id=?', (copy_id,)).fetchone():
                    raise HTTPException(404, 'Record not found.')
                if db.execute('SELECT COUNT(*) FROM photos WHERE copy_id=?', (copy_id,)).fetchone()[0] >= MAX_PHOTOS:
                    raise HTTPException(409, 'This record already has 12 photos. Remove a photo before adding another.')
                used = db.execute('SELECT COALESCE(SUM(length(content)),0) FROM photos').fetchone()[0]
                if used + len(data) > MAX_STORAGE:
                    raise HTTPException(409, 'Personal photos have reached the 128 MiB storage limit. Remove unused photos before adding more.')
                db.execute('INSERT INTO photos(id,copy_id,kind,caption,content,width,height,created_at,is_cover) VALUES (?,?,?,?,?,?,?,?,0)',
                           (photo_id, copy_id, kind, caption, data, width, height, created))
            return {'id':photo_id,'kind':kind,'caption':caption,'width':width,'height':height,'created_at':created,'is_cover':False,'url':f'/api/photos/{photo_id}'}

    def content(self, photo_id):
        with self.database.connect() as db:
            row = db.execute('SELECT content FROM photos WHERE id=?', (photo_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Photo not found.')
        return row['content']

    def select(self, copy_id, photo_id):
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT id FROM copies WHERE id=?', (copy_id,)).fetchone():
                raise HTTPException(404, 'Record not found.')
            if photo_id and not db.execute('SELECT id FROM photos WHERE id=? AND copy_id=?', (photo_id, copy_id)).fetchone():
                raise HTTPException(404, 'This photo does not belong to this record.')
            db.execute('UPDATE photos SET is_cover=0 WHERE copy_id=?', (copy_id,))
            if photo_id:
                db.execute('UPDATE photos SET is_cover=1 WHERE id=?', (photo_id,))
        return self.repository.get(copy_id)

    def delete(self, copy_id, photo_id):
        self.repository.get(copy_id)
        with self.database.connect() as db:
            if not db.execute('DELETE FROM photos WHERE id=? AND copy_id=?', (photo_id, copy_id)).rowcount:
                raise HTTPException(404, 'This photo does not belong to this record.')

    def decorate(self, record):
        with self.database.connect() as db:
            count = db.execute('SELECT COUNT(*) FROM photos WHERE copy_id=?', (record['id'],)).fetchone()[0]
            cover = db.execute('SELECT id FROM photos WHERE copy_id=? AND is_cover=1', (record['id'],)).fetchone()
        result = dict(record, photo_count=count, personal_cover_url=f"/api/photos/{cover['id']}" if cover else None)
        if cover:
            result['cover_url'] = result['personal_cover_url']
        return result


def validate_photos(db):
    """Validate imported photo rows before restoring into our own schema."""
    from uuid import UUID
    rows = db.execute('SELECT * FROM photos')
    counts, covers, total = {}, set(), 0
    for row in rows:
        try:
            if str(UUID(row['id'])) != row['id'] or row['kind'] not in KINDS:
                raise ValueError('Invalid photo identity or type.')
            if not isinstance(row['caption'], str) or len(row['caption']) > 200 or row['is_cover'] not in (0, 1):
                raise ValueError('Invalid photo description or cover choice.')
            datetime.fromisoformat(row['created_at'])
            data = row['content']
            if not isinstance(data, bytes) or not 0 < len(data) <= MAX_STORED:
                raise ValueError('Invalid photo size.')
            total += len(data)
            counts[row['copy_id']] = counts.get(row['copy_id'], 0) + 1
            if row['is_cover']:
                if row['copy_id'] in covers:
                    raise ValueError('A copy has multiple personal covers.')
                covers.add(row['copy_id'])
            with Image.open(BytesIO(data), formats=['JPEG']) as image:
                if image.size != (row['width'], row['height']) or not 0 < min(image.size) <= max(image.size) <= 2048:
                    raise ValueError('Invalid stored photo dimensions.')
                if image.getexif():
                    raise ValueError('Stored photos must not contain EXIF metadata.')
                image.load()
            if counts[row['copy_id']] > MAX_PHOTOS or total > MAX_STORAGE:
                raise ValueError('Personal photo storage limits exceeded.')
        except (OSError, TypeError, UnidentifiedImageError, Image.DecompressionBombError) as error:
            raise ValueError('Archive contains an invalid personal photo.') from error
