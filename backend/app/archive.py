"""Versioned, secret-free offline archives and restore to a new directory only."""
from contextlib import contextmanager, closing
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import tempfile
from datetime import datetime, timezone
import zipfile
from .database import Database
from .repository import CollectionRepository
from .models import Record

FORMAT_VERSION = 1
SCHEMA_VERSION = 10
MAX_DATABASE = 256 * 1024 * 1024
MAX_COVER = 5 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
COVER_NAME = re.compile(r'discogs-master-r?[0-9]+(?:-[a-f0-9]{32})?\.img')


def digest(content):
    return hashlib.sha256(content).hexdigest()


@contextmanager
def connect(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA trusted_schema=OFF')
    try:
        yield db
    finally:
        db.close()


def validate_database(path):
    with connect(path) as source, tempfile.TemporaryDirectory() as work:
        version = source.execute('PRAGMA user_version').fetchone()[0]
        if version not in (9, SCHEMA_VERSION):
            raise ValueError('Archive database schema is incompatible with this application.')
        if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or source.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Archive database integrity or relationships are invalid.')
        template = Database(str(Path(work)/'template.sqlite3')); template.initialize()
        with template.connect() as reference:
            expected = {row[0] for row in reference.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            if version == 9:
                expected.discard('photos')
            actual = {row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            if actual != expected or source.execute("SELECT 1 FROM sqlite_master WHERE type IN ('view','trigger')").fetchone():
                raise ValueError('Archive database contains unsupported tables, views or triggers.')
            for table in sorted(expected):
                columns = [tuple(row)[1:4] + (row[5],) for row in reference.execute(f'PRAGMA table_info("{table}")')]
                existing = [tuple(row)[1:4] + (row[5],) for row in source.execute(f'PRAGMA table_info("{table}")')]
                if [tuple(row) for row in source.execute(f'PRAGMA foreign_key_list("{table}")')] != [tuple(row) for row in reference.execute(f'PRAGMA foreign_key_list("{table}")')]:
                    raise ValueError('Archive database relationships are incompatible.')
                if existing != columns or any(row[6] for row in source.execute(f'PRAGMA table_xinfo("{table}")')):
                    raise ValueError('Archive database columns are incompatible.')
        if version == 10:
            from .photos import validate_photos
            validate_photos(source)
        for row in source.execute('SELECT played_at FROM play_events'):
            if not isinstance(row[0], (int,float)) or not math.isfinite(row[0]) or not 0 <= row[0] < 253402300800:
                raise ValueError('Archive contains an invalid listening timestamp.')
    for record in CollectionRepository(Database(str(path))).list():
        Record.model_validate({key:value for key,value in record.items() if not key.startswith('_')})
    return expected


def export_archive(database_path, output):
    database_path = Path(database_path); output = Path(output)
    if not database_path.is_file():
        raise ValueError('The source database does not exist.')
    if output.exists():
        raise ValueError('The output archive already exists.')
    with tempfile.TemporaryDirectory(dir=output.parent) as work:
        snapshot = Path(work)/'collection.sqlite3'
        with connect(database_path) as source, closing(sqlite3.connect(snapshot)) as target:
            source.backup(target)
        validate_database(snapshot)
        with connect(snapshot) as database:
            schema_version = database.execute('PRAGMA user_version').fetchone()[0]
        content = {'collection.sqlite3': snapshot.read_bytes()}
        covers = database_path.parent/'covers'
        if covers.exists():
            for path in sorted(covers.iterdir()):
                if COVER_NAME.fullmatch(path.name):
                    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_COVER:
                        raise ValueError('A cover file is invalid or too large.')
                    content['covers/'+path.name] = path.read_bytes()
        if len(content['collection.sqlite3']) > MAX_DATABASE or sum(map(len,content.values())) > MAX_TOTAL or len(content)>20000:
            raise ValueError('The collection exceeds archive size limits.')
        manifest = {'format':'grooveshelf-archive','version':FORMAT_VERSION,'schema_version':schema_version,
                    'created_at':datetime.now(timezone.utc).isoformat(),
                    'files':{name:{'size':len(data),'sha256':digest(data)} for name,data in content.items()}}
        archive = Path(work)/'archive.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as target:
            target.writestr('manifest.json',json.dumps(manifest,sort_keys=True))
            for name,data in content.items():target.writestr(name,data)
        verify_archive(archive)
        os.link(archive,output) # Atomic creation; an existing output is never overwritten.
    return manifest


def verified_files(archive):
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist(); names = [entry.filename for entry in entries]
        if len(entries)>20001 or len(set(names))!=len(names) or sum(entry.file_size for entry in entries)>MAX_TOTAL+1024*1024:
            raise ValueError('Archive has duplicate entries or exceeds size limits.')
        if 'manifest.json' not in names or source.getinfo('manifest.json').file_size>1024*1024:
            raise ValueError('Archive manifest is missing or too large.')
        manifest = json.loads(source.read('manifest.json'))
        if manifest.get('format')!='grooveshelf-archive' or manifest.get('version')!=FORMAT_VERSION or manifest.get('schema_version') not in (9, SCHEMA_VERSION):
            raise ValueError('Archive version is incompatible.')
        listed = manifest.get('files')
        if not isinstance(listed,dict) or 'collection.sqlite3' not in listed or set(names)!=set(listed)|{'manifest.json'}:
            raise ValueError('Archive file list is invalid.')
        content={}
        for name,details in listed.items():
            cover = name.startswith('covers/') and COVER_NAME.fullmatch(name.removeprefix('covers/'))
            if name!='collection.sqlite3' and not cover:
                raise ValueError('Archive contains an unsupported file path.')
            limit=MAX_COVER if cover else MAX_DATABASE
            info=source.getinfo(name)
            if info.file_size>limit or not isinstance(details,dict) or details.get('size')!=info.file_size:
                raise ValueError('Archive file size is invalid.')
            data=source.read(name)
            if digest(data)!=details.get('sha256'):
                raise ValueError('Archive checksum validation failed.')
            if cover and not (data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith(b'\xff\xd8\xff') or (data.startswith(b'RIFF') and data[8:12]==b'WEBP')):
                raise ValueError('Archive cover format is invalid.')
            content[name]=data
    return manifest,content


@contextmanager
def verified_database(archive):
    manifest,content=verified_files(archive)
    with tempfile.TemporaryDirectory() as work:
        path=Path(work)/'collection.sqlite3';path.write_bytes(content['collection.sqlite3'])
        tables=validate_database(path)
        with connect(path) as database:
            if database.execute('PRAGMA user_version').fetchone()[0] != manifest['schema_version']:
                raise ValueError('Archive manifest and database schema disagree.')
            yield manifest,database,tables


def verify_archive(archive):
    with verified_database(archive) as (manifest,_,__):
        return manifest


def inspect_archive(archive):
    """Report validated archive contents without opening the live database."""
    with verified_database(archive) as (manifest,database,tables):
        counts={label:database.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] if table in tables else 0
                for label,table in [('records','copies'),('albums','albums'),('photos','photos'),('nfc_tags','nfc_tags'),('plays','play_events')]}
        counts['wishlist']=database.execute('SELECT COUNT(*) FROM wishlist WHERE acquired_at IS NULL').fetchone()[0]
        counts['cached_covers']=sum(name.startswith('covers/') for name in manifest['files'])
        return {'verified':True,'created_at':manifest.get('created_at'),'schema_version':manifest['schema_version'],
                'archive_version':manifest['version'],'counts':counts}


def restore_archive(archive, destination):
    destination=Path(destination)
    if destination.exists():
        raise ValueError('Restore requires a new destination directory; existing data is never replaced.')
    manifest,content=verified_files(archive)
    with tempfile.TemporaryDirectory(dir=destination.parent) as work:
        root=Path(work);source_path=root/'source.sqlite3';source_path.write_bytes(content['collection.sqlite3'])
        tables=validate_database(source_path)
        with connect(source_path) as source:
            if source.execute('PRAGMA user_version').fetchone()[0] != manifest['schema_version']:
                raise ValueError('Archive manifest and database schema disagree.')
        staged=root/'restored';staged.mkdir();database=Database(str(staged/'grooveshelf.sqlite3'));database.initialize()
        # Copy data into application-owned schema instead of trusting uploaded SQL definitions.
        with connect(source_path) as source, database.connect() as target:
            target.execute('BEGIN')
            target.execute('PRAGMA defer_foreign_keys=ON')
            for table in sorted(tables):target.execute(f'DELETE FROM "{table}"')
            for table in sorted(tables):
                columns=[row[1] for row in source.execute(f'PRAGMA table_info("{table}")')]
                names=','.join(f'"{column}"' for column in columns)
                marks=','.join('?' for _ in columns)
                target.executemany(f'INSERT INTO "{table}" ({names}) VALUES ({marks})', source.execute(f'SELECT {names} FROM "{table}"'))
            # A transferred pending session must not turn into an unattended play.
            target.execute("UPDATE listening_sessions SET status='canceled',ended_at=? WHERE status='pending'",(datetime.now(timezone.utc).timestamp(),))
            target.execute("UPDATE listening_sessions SET status='ended',ended_at=COALESCE(ended_at,?) WHERE status='completed'",(datetime.now(timezone.utc).timestamp(),))
            target.execute("UPDATE stations SET last_uid=NULL,reader_status='disconnected',reader_seen_at=NULL")
        for name,data in content.items():
            if name.startswith('covers/'):
                path=staged/name;path.parent.mkdir(exist_ok=True);path.write_bytes(data)
        validate_database(staged/'grooveshelf.sqlite3')
        if destination.exists():
            raise ValueError('The destination was created during restore; existing data was retained.')
        os.rename(staged,destination)
    return manifest
