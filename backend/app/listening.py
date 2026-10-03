"""Persistent, station-scoped NFC sessions and an event-derived listening history."""
from datetime import datetime, timezone
from math import ceil
import re
from threading import RLock
import time
from uuid import uuid4
from fastapi import HTTPException


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat() if value is not None else None


def normalize_uid(value):
    uid = re.sub(r'[\s:-]', '', value).upper()
    if len(uid) not in (8, 14, 20) or not re.fullmatch(r'[0-9A-F]+', uid):
        raise HTTPException(422, 'Use a 4, 7 or 10-byte hexadecimal NFC UID.')
    return uid


class ListeningService:
    def __init__(self, database, clock=time.time):
        self.database = database
        self.clock = clock
        self.lock = RLock()

    def _tick(self, db):
        now = self.clock()
        pending = db.execute("SELECT * FROM listening_sessions WHERE status='pending' AND due_at<=?", (now,)).fetchall()
        for session in pending:
            copy = db.execute('SELECT inventory_number FROM copies WHERE id=?', (session['copy_id'],)).fetchone()
            if copy:
                db.execute('''INSERT OR IGNORE INTO play_events
                              (id, copy_id, station_id, session_id, played_at, origin, inventory_number)
                              VALUES (?, ?, ?, ?, ?, 'nfc', ?)''',
                           (str(uuid4()), session['copy_id'], session['station_id'], session['id'], session['due_at'], copy['inventory_number']))
                db.execute("UPDATE listening_sessions SET status='completed', ended_at=? WHERE id=?", (session['due_at'], session['id']))

    def tick(self):
        with self.lock, self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self._tick(db)

    def station(self, station_id):
        self.tick()
        with self.database.connect() as db:
            station = db.execute('SELECT * FROM stations WHERE id=?', (station_id,)).fetchone()
            if not station:
                raise HTTPException(404, 'Listening station not found.')
            station = dict(station)
            station['last_scan_at'] = iso(station['last_scan_at'])
            seen = station['reader_seen_at']
            if station['reader_status'] == 'connected' and (seen is None or self.clock() - seen > 15):
                station['reader_status'] = 'disconnected'
            station['reader_seen_at'] = iso(seen)
            session = db.execute('SELECT * FROM listening_sessions WHERE station_id=? ORDER BY rowid DESC LIMIT 1', (station_id,)).fetchone()
            if session:
                session = dict(session)
                session['remaining_seconds'] = max(0, ceil(session['due_at'] - self.clock())) if session['status'] == 'pending' else 0
                for key in ['started_at', 'due_at', 'ended_at']:
                    session[key] = iso(session[key])
            station['session'] = session
            known = db.execute('SELECT copy_id FROM nfc_tags WHERE uid=?', (station['last_uid'],)).fetchone() if station['last_uid'] else None
            station['unknown_uid'] = station['last_uid'] if station['last_uid'] and not known else None
            return station

    def reader_status(self, station_id, status):
        with self.database.connect() as db:
            if not db.execute('UPDATE stations SET reader_status=?, reader_seen_at=? WHERE id=?',
                              (status, self.clock(), station_id)).rowcount:
                raise HTTPException(404, 'Listening station not found.')
        return self.station(station_id)

    def scan(self, station_id, uid):
        uid = normalize_uid(uid)
        with self.lock, self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self._tick(db)
            if not db.execute('SELECT id FROM stations WHERE id=?', (station_id,)).fetchone():
                raise HTTPException(404, 'Listening station not found.')
            db.execute('UPDATE stations SET last_uid=?, last_scan_at=?, scan_sequence=scan_sequence+1 WHERE id=?', (uid, self.clock(), station_id))
            tag = db.execute('SELECT copy_id FROM nfc_tags WHERE uid=?', (uid,)).fetchone()
            if tag:
                current = db.execute('SELECT * FROM listening_sessions WHERE station_id=? ORDER BY rowid DESC LIMIT 1', (station_id,)).fetchone()
                duplicate = current and current['copy_id'] == tag['copy_id'] and current['status'] in ('pending','completed')
                if not duplicate:
                    db.execute("UPDATE listening_sessions SET status='canceled', ended_at=? WHERE station_id=? AND status='pending'", (self.clock(), station_id))
                    now = self.clock()
                    db.execute('INSERT INTO listening_sessions VALUES (?, ?, ?, ?, ?, ?, ?)',
                               (str(uuid4()), station_id, tag['copy_id'], now, now + 600, 'pending', None))
        return self.station(station_id)

    def end_session(self, station_id):
        with self.lock, self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self._tick(db)
            if not db.execute('SELECT id FROM stations WHERE id=?',(station_id,)).fetchone():
                raise HTTPException(404, 'Listening station not found.')
            current = db.execute('SELECT * FROM listening_sessions WHERE station_id=? ORDER BY rowid DESC LIMIT 1',(station_id,)).fetchone()
            if current and current['status'] in ('pending','completed'):
                status = 'canceled' if current['status'] == 'pending' else 'ended'
                db.execute('UPDATE listening_sessions SET status=?, ended_at=? WHERE id=?', (status, self.clock(), current['id']))
            db.execute('UPDATE stations SET last_uid=NULL WHERE id=?', (station_id,))
        return self.station(station_id)

    def assign(self, uid, copy_id, replace=False):
        uid = normalize_uid(uid)
        with self.lock, self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT id FROM copies WHERE id=?', (copy_id,)).fetchone():
                raise HTTPException(404, 'Record not found.')
            assigned = db.execute('SELECT copy_id FROM nfc_tags WHERE uid=?', (uid,)).fetchone()
            if assigned and assigned['copy_id'] != copy_id:
                raise HTTPException(409, 'This tag belongs to another record. Remove its existing association first.')
            current = db.execute('SELECT uid FROM nfc_tags WHERE copy_id=?', (copy_id,)).fetchone()
            if current and current['uid'] != uid and not replace:
                raise HTTPException(409, 'This record already has a tag. Confirm replacement to remove its old association.')
            db.execute('DELETE FROM nfc_tags WHERE copy_id=?', (copy_id,))
            db.execute('INSERT INTO nfc_tags VALUES (?, ?)', (uid, copy_id))
        return {'uid': uid, 'copy_id': copy_id}

    def remove_tag(self, uid):
        uid = normalize_uid(uid)
        with self.lock, self.database.connect() as db:
            if not db.execute('DELETE FROM nfc_tags WHERE uid=?', (uid,)).rowcount:
                raise HTTPException(404, 'Tag association not found.')

    def decorate(self, record):
        with self.database.connect() as db:
            counts = db.execute('SELECT COUNT(*) AS count, MAX(played_at) AS latest FROM play_events WHERE copy_id=?', (record['id'],)).fetchone()
            tag = db.execute('SELECT uid FROM nfc_tags WHERE copy_id=?', (record['id'],)).fetchone()
        return dict(record, play_count=counts['count'], last_played_at=iso(counts['latest']), nfc_uid=tag['uid'] if tag else None)

    def history(self, copy_id):
        self.tick()
        with self.database.connect() as db:
            if not db.execute('SELECT id FROM copies WHERE id=?',(copy_id,)).fetchone():
                raise HTTPException(404, 'Record not found.')
            rows = db.execute('SELECT * FROM play_events WHERE copy_id=? ORDER BY played_at DESC, rowid DESC',(copy_id,)).fetchall()
        return [dict(row, played_at=iso(row['played_at'])) for row in rows]

    def manual_play(self, copy_id, played_at):
        value = played_at.timestamp()
        if value < 0 or value > self.clock() + 60:
            raise HTTPException(422, 'The play timestamp must be in the past or present.')
        with self.lock, self.database.connect() as db:
            copy = db.execute('SELECT inventory_number FROM copies WHERE id=?',(copy_id,)).fetchone()
            if not copy:
                raise HTTPException(404, 'Record not found.')
            event_id = str(uuid4())
            db.execute('INSERT INTO play_events VALUES (?, ?, NULL, NULL, ?, ?, ?)',
                       (event_id, copy_id, value, 'manual', copy['inventory_number']))
        return {'id': event_id, 'played_at': iso(value)}

    def edit_play(self, event_id, played_at):
        value = played_at.timestamp()
        if value < 0 or value > self.clock() + 60:
            raise HTTPException(422, 'The play timestamp must be in the past or present.')
        with self.lock, self.database.connect() as db:
            if not db.execute('UPDATE play_events SET played_at=? WHERE id=?',(value, event_id)).rowcount:
                raise HTTPException(404, 'Listening event not found.')
        return {'id': event_id, 'played_at': iso(value)}

    def delete_play(self, event_id):
        with self.lock, self.database.connect() as db:
            if not db.execute('DELETE FROM play_events WHERE id=?',(event_id,)).rowcount:
                raise HTTPException(404, 'Listening event not found.')

    def favorite(self, copy_id, value):
        with self.database.connect() as db:
            if not db.execute('UPDATE copies SET favorite=? WHERE id=?', (int(value), copy_id)).rowcount:
                raise HTTPException(404, 'Record not found.')
        return {'favorite': value}
