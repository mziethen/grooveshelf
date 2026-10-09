"""Verified local archives; daily scheduling persists through archive filenames."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
import logging
import re
from uuid import uuid4
from .archive import export_archive, verify_archive, inspect_archive

NAME = re.compile(r'^grooveshelf-([0-9]{8}T[0-9]{12}Z)\.zip$')

class BackupService:
    def __init__(self, database, locks, clock=None):
        self.database = database
        self.directory = Path(database.path).parent / 'backups'
        self.locks = locks
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.lock = RLock()
        self.last_error = None
        self.retry_at = None

    def enabled(self):
        with self.database.connect() as db:
            row = db.execute('SELECT value FROM settings WHERE key="automatic_backups"').fetchone()
        return bool(row and row[0])

    def configure(self, enabled):
        with self.database.connect() as db:
            db.execute('INSERT INTO settings(key,value) VALUES("automatic_backups",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (int(enabled),))
        return self.status()

    def files(self):
        found = []
        if self.directory.exists():
            for path in self.directory.iterdir():
                match = NAME.fullmatch(path.name)
                if match and path.is_file() and not path.is_symlink():
                    try: created = datetime.strptime(match[1], '%Y%m%dT%H%M%S%fZ').replace(tzinfo=timezone.utc)
                    except ValueError: continue
                    found.append((created, path))
        return sorted(found, reverse=True)

    def status(self):
        files = self.files()
        enabled = self.enabled()
        last = files[0][0] if files else None
        due = last + timedelta(days=1) if last else self.clock()
        return {'enabled':enabled,'backup_count':len(files),'last_created_at':last.isoformat() if last else None,
                'next_due_at':due.isoformat() if enabled else None,'error':self.last_error,
                'archives':[{'filename':p.name,'created_at':created.isoformat(),'size_bytes':p.stat().st_size} for created,p in files[:20]]}

    def create(self):
        with self.lock:
            stamp = self.clock().strftime('%Y%m%dT%H%M%S%fZ')
            final = self.directory / f'grooveshelf-{stamp}.zip'
            partial = self.directory / f'.backup-{uuid4()}.partial'
            try:
                self.directory.mkdir(parents=True, exist_ok=True)
                # Same lock order as live browser export.
                with self.locks[0], self.locks[1], self.locks[2]:
                    export_archive(self.database.path, partial)
                verify_archive(partial)
                if final.exists(): raise FileExistsError('A backup with this timestamp already exists.')
                partial.rename(final)
                self.last_error = None
                self.retry_at = None
                return self.status()
            except Exception:
                self.last_error = 'Backup failed. Check available disk space and server logs; existing backups are retained.'
                self.retry_at = self.clock() + timedelta(hours=1)
                logging.getLogger(__name__).exception('Local backup failed')
                raise
            finally:
                partial.unlink(missing_ok=True)

    def tick(self):
        with self.lock:
            if not self.enabled(): return
            if self.retry_at and self.clock() < self.retry_at: return
            files = self.files()
            if files and self.clock() < files[0][0] + timedelta(days=1): return
            try: self.create()
            except Exception: pass  # Status records failure; the worker retries in an hour.

    def path(self, filename):
        if not NAME.fullmatch(filename): raise ValueError('Unknown backup filename.')
        path = self.directory / filename
        if not path.is_file() or path.is_symlink(): raise FileNotFoundError('Backup not found.')
        return path

    def download(self, filename):
        path = self.path(filename)
        verify_archive(path)
        return path

    def inspect(self, filename):
        return {'filename': filename, **inspect_archive(self.path(filename))}
