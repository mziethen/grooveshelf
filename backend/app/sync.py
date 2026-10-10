"""Explicit, per-copy collection synchronization with durable outbound intents."""
from datetime import datetime, timezone
import json
from threading import RLock
from time import monotonic
from urllib.parse import quote
from uuid import uuid4
from fastapi import HTTPException
from .models import RecordInput
from .sync_fields import FIELDS, field_definitions, note_values, value_for


def now():
    return datetime.now(timezone.utc).isoformat()


class DiscogsSync:
    def __init__(self, repository, provider, metadata):
        self.repository = repository
        self.database = repository.database
        self.provider = provider
        self.metadata = metadata
        self.lock = RLock()
        self.plans = {}

    def identity(self):
        if not self.provider.token:
            raise HTTPException(503, 'Set DISCOGS_TOKEN on the server to connect your Discogs account.')
        identity = self.provider.request('/oauth/identity')
        if not identity.get('username') or not isinstance(identity.get('id'), int):
            raise HTTPException(502, 'Discogs did not return a valid account identity.')
        return str(identity['id']), identity['username']

    def collection(self, username):
        entries = {}
        page = 1
        expected_pages = None
        while page <= 1000:
            data = self.provider.request(f'/users/{quote(username, safe="")}/collection/folders/0/releases',
                                         {'page': page, 'per_page': 100})
            releases = data.get('releases')
            if not isinstance(releases, list):
                raise HTTPException(502, 'The Discogs collection response is incomplete.')
            for item in releases:
                info = item.get('basic_information', {})
                iid, rid = item.get('instance_id'), info.get('id')
                if not isinstance(iid, int) or iid < 1 or not isinstance(rid, int) or rid < 1:
                    raise HTTPException(502, 'Discogs returned a collection entry without valid copy/release IDs.')
                if iid in entries:
                    raise HTTPException(502, 'The Discogs collection changed during pagination. Refresh the preview.')
                entries[iid] = {'instance_id': iid, 'release_id': rid,
                                'is_vinyl':any(item.get('name') == 'Vinyl' for item in info.get('formats', [])),
                                'title': str(info.get('title', 'Untitled'))[:300],
                                'artist': ', '.join(str(a.get('name', '')) for a in info.get('artists', []))[:300],
                                'source_url': f'https://www.discogs.com/release/{rid}'}
                entries[iid]['folder_id'] = item.get('folder_id') if type(item.get('folder_id')) is int else None
                entries[iid]['notes'] = note_values(item.get('notes'))
                # Omitted/malformed ratings are unknown, not an instruction to clear.
                rating = item.get('rating')
                if type(rating) is int and 0 <= rating <= 5:
                    entries[iid]['rating'] = rating or None
            pages = data.get('pagination', {}).get('pages')
            if not isinstance(pages, int) or pages < 0 or pages > 1000:
                raise HTTPException(502, 'The Discogs collection pagination could not be verified.')
            if expected_pages is not None and pages != expected_pages:
                raise HTTPException(502, 'The Discogs collection changed during pagination. Refresh the preview.')
            expected_pages = pages
            if pages == 0 and releases:
                raise HTTPException(502, 'The Discogs collection pagination could not be verified.')
            if page >= pages:
                return entries
            page += 1
        raise HTTPException(502, 'The Discogs collection exceeds the supported preview size.')

    def release_link(self, copy_id, release_id):
        with self.lock, self.metadata.lock:
            current = self.metadata.present(self.repository.get(copy_id))
            if current['metadata_status'] == 'unavailable':
                raise HTTPException(503, 'Refresh the current source before linking a different release.')
            with self.database.connect() as db:
                if db.execute('SELECT 1 FROM discogs_links WHERE copy_id=?', (copy_id,)).fetchone() or db.execute('SELECT 1 FROM discogs_exports WHERE copy_id=?', (copy_id,)).fetchone():
                    raise HTTPException(409, 'This copy is already synchronized or has an unresolved export. Resolve its collection link before changing the release.')
            snapshot = self.metadata.snapshot(release_id=release_id)
            if not snapshot.get('is_vinyl'):
                raise HTTPException(409, 'Select a Vinyl release from Discogs for this record.')
            # Linking a pressing must not rewrite any local artist/title/tracks/year.
            snapshot['protected_fields'] = sorted(set(current.get('protected_fields', [])) | {'artist', 'title', 'year', 'tracks'})
            with self.database.connect() as db:
                album_id = str(uuid4())
                db.execute('INSERT INTO albums(id,artist,title,year,tracks,metadata) VALUES(?,?,?,?,?,?)',
                           (album_id, current['artist'], current['title'], current['year'], json.dumps(current['tracks']), json.dumps(snapshot)))
                db.execute('UPDATE copies SET album_id=? WHERE id=?', (album_id, copy_id))
                db.execute('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM copies)')
            return self.repository.get(copy_id)

    def allow_export_retry(self, copy_id):
        with self.lock:
            account, username = self.identity()
            remote = self.collection(username)
            with self.database.connect() as db:
                intent = db.execute('SELECT * FROM discogs_exports WHERE copy_id=? AND status="uncertain"', (copy_id,)).fetchone()
                if not intent or intent['account'] != account:
                    raise HTTPException(409, 'There is no unresolved export for this copy and account.')
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(intent['created_at'])).total_seconds()
                if age < 60:
                    raise HTTPException(409, 'Wait at least one minute after the failed export, check Discogs, then retry this review.')
                before = set(json.loads(intent['before_ids']))
                candidates = [iid for iid, item in remote.items() if iid not in before and item['release_id'] == intent['release_id']]
                if candidates:
                    raise HTTPException(409, 'Discogs has a new copy of this release. Match it in the sync preview instead of exporting again.')
                db.execute('DELETE FROM discogs_exports WHERE id=?', (intent['id'],))
            return {'status':'retry_allowed'}

    def fields(self):
        with self.lock:
            account,username=self.identity()
            fields=field_definitions(self.provider.request(f'/users/{quote(username,safe="")}/collection/fields'))
            return {'account_id':account,'username':username,'fields':list(fields.values())}

    def folders(self, username):
        data = self.provider.request(f'/users/{quote(username,safe="")}/collection/folders')
        rows = data.get('folders')
        if not isinstance(rows, list):
            raise HTTPException(502, 'Discogs returned an invalid folder list.')
        folders = {}
        for row in rows:
            if not isinstance(row, dict) or type(row.get('id')) is not int or row['id'] < 0 or row['id'] in folders:
                raise HTTPException(502, 'Discogs returned an invalid folder list.')
            name = row.get('name')
            if not isinstance(name, str) or not name.strip() or len(name) > 200:
                raise HTTPException(502, 'Discogs returned an unsupported folder name; local locations are unchanged.')
            folders[row['id']] = {'id':row['id'], 'name':name}
        return folders

    def preview(self, mapping=None):
        with self.lock:
            account, username = self.identity()
            mapped={}
            folders={}
            if mapping:
                if mapping.account_id != account:
                    raise HTTPException(409,'The connected account changed. Review its field mapping again.')
                definitions=field_definitions(self.provider.request(f'/users/{quote(username,safe="")}/collection/fields')) if any(getattr(mapping, field) is not None for field in FIELDS) else {}
                if mapping.folder_locations:
                    folders=self.folders(username)
                for field in FIELDS:
                    id=getattr(mapping,field)
                    if id is not None:
                        if id not in definitions:raise HTTPException(409,'A mapped Discogs field is missing. Review the mapping again.')
                        mapped[field]=definitions[id]
            remote = self.collection(username)
            local = [self.metadata.present(record) for record in self.repository.list()]
            by_copy = {record['id']: record for record in local}
            with self.database.connect() as db:
                links = [dict(row) for row in db.execute('SELECT * FROM discogs_links')]
                exports = [dict(row) for row in db.execute('SELECT * FROM discogs_exports WHERE status="uncertain"')]
                state = db.execute('SELECT last_success_at FROM discogs_sync_state WHERE account=?', (account,)).fetchone()
            linked_copies = {link['copy_id'] for link in links if link['copy_id']}
            linked_instances = {link['instance_id'] for link in links if link['account'] == account}
            uncertain = {item['copy_id']: item for item in exports if item['copy_id']}
            actions, notices, resolutions = [], [], []
            for entry in remote.values():
                if not entry['is_vinyl'] or entry['instance_id'] in linked_instances:
                    continue
                matches = [record for record in local if record['id'] not in linked_copies and record.get('discogs_release_id') == entry['release_id']]
                actions.append({'id': str(uuid4()), 'kind': 'remote', **entry,
                                'matches': [{'id': r['id'], 'inventory_number': r['inventory_number'], 'title': r['title']} for r in matches]})
            for record in local:
                if record['id'] in linked_copies:
                    continue
                if record['id'] in uncertain:
                    notices.append({'kind': 'uncertain', 'copy_id':record['id'], 'message':f"{record['inventory_number']}: an earlier export may have reached Discogs. Match its remote entry to this copy; automatic retries are blocked."})
                    continue
                if not record.get('discogs_release_id'):
                    notices.append({'kind':'unlinked','copy_id':record['id'],'message':f"{record['inventory_number']}: select its exact Discogs release before exporting."})
                    continue
                actions.append({'id':str(uuid4()),'kind':'local','copy_id':record['id'], 'inventory_number':record['inventory_number'],
                                'title':record['title'],'release_id':record['discogs_release_id'],
                                'source_url':f"https://www.discogs.com/release/{record['discogs_release_id']}"})
            for link in links:
                if link['account'] != account:
                    if link['copy_id']:
                        resolution = {'id':str(uuid4()), **link, 'kind':'account_conflict'}
                        resolutions.append(resolution)
                        inventory = by_copy[link['copy_id']]['inventory_number']
                        notices.append({'kind':'account_conflict','copy_id':link['copy_id'],'action_id':resolution['id'],
                                        'inventory_number':inventory,'saved_account':link['account'],'connected_account':account,
                                        'release_id':link['release_id'],'instance_id':link['instance_id'],
                                        'message':f"{inventory}: collection instance {link['instance_id']} (release {link['release_id']}) belongs to saved account {link['account']}; connected account is {account}. Review this local association before syncing with the new account."})
                    continue
                if link['copy_id'] is None:
                    if link['instance_id'] not in remote:
                        continue
                    notices.append({'kind':'local_missing','message':f"Discogs instance {link['instance_id']}: no local copy is associated with this remembered instance. The remote copy is retained; it will not be reimported automatically."})
                elif link['instance_id'] not in remote:
                    resolution = {'id':str(uuid4()), 'kind':'missing', **link}
                    resolutions.append(resolution)
                    notices.append({'kind':'remote_missing','copy_id':link['copy_id'],'action_id':resolution['id'],
                                    'inventory_number':by_copy[link['copy_id']]['inventory_number'],
                                    'message':f"{by_copy[link['copy_id']]['inventory_number']}: linked Discogs copy is missing. GrooveShelf retains the record; no deletion or re-addition will happen automatically."})
                elif remote[link['instance_id']]['release_id'] != link['release_id']:
                    current = remote[link['instance_id']]
                    resolution = {'id':str(uuid4()), **link, 'kind':'release_conflict', 'remote_release_id':current['release_id']}
                    resolutions.append(resolution)
                    inventory = by_copy[link['copy_id']]['inventory_number']
                    notices.append({'kind':'release_conflict','copy_id':link['copy_id'],'action_id':resolution['id'],
                                    'inventory_number':inventory,'release_id':link['release_id'],'remote_release_id':current['release_id'],
                                    'instance_id':link['instance_id'],
                                    'message':f"{inventory}: saved release {link['release_id']} differs from Discogs release {current['release_id']} for collection instance {link['instance_id']}. Review the local association."})
                else:
                    entry = remote[link['instance_id']]
                    record = by_copy[link['copy_id']]
                    if 'rating' in entry and entry['rating'] != record['rating']:
                        actions.append({'id':str(uuid4()),'kind':'rating','copy_id':link['copy_id'],
                                        'inventory_number':record['inventory_number'],'title':record['title'],
                                        'instance_id':link['instance_id'],'release_id':link['release_id'],
                                        'local_rating':record['rating'],'remote_rating':entry['rating'],
                                        'source_url':entry['source_url']})
                    if mapping and mapping.folder_locations:
                        folder=folders.get(entry['folder_id'])
                        if folder and folder['id'] > 1:
                            if folder['name'] != record['storage_location']:
                                actions.append({'id':str(uuid4()),'kind':'personal','copy_id':record['id'],
                                                'inventory_number':record['inventory_number'],'title':record['title'],
                                                'instance_id':link['instance_id'],'release_id':link['release_id'],
                                                'field':'storage_location','definition':folder,'local_value':record['storage_location'],
                                                'remote_value':folder['name'],'source_url':entry['source_url']})
                        elif not folder:
                            notices.append({'kind':'personal_unavailable','copy_id':record['id'],
                                            'message':f"{record['inventory_number']}: the Discogs folder is unavailable; storage location is kept unchanged."})
                    for field,definition in mapped.items():
                        try: value=value_for(field,entry['notes'].get(definition['id']))
                        except ValueError:
                            notices.append({'kind':'personal_unavailable','copy_id':record['id'],
                                            'message':f"{record['inventory_number']}: {definition['name']} is missing or unsupported; {field.replace('_',' ')} is kept unchanged."})
                            continue
                        if value != record[field]:
                            actions.append({'id':str(uuid4()),'kind':'personal','copy_id':record['id'],
                                            'inventory_number':record['inventory_number'],'title':record['title'],
                                            'instance_id':link['instance_id'],'release_id':link['release_id'],
                                            'field':field,'definition':definition,'local_value':record[field],
                                            'remote_value':value,'source_url':entry['source_url']})
            self.plans = {key:value for key,value in self.plans.items() if value['expires'] > monotonic()}
            if len(self.plans) >= 16:
                self.plans.pop(next(iter(self.plans)))
            plan_id = str(uuid4())
            self.plans[plan_id] = {'account':account,'username':username,'actions':{action['id']:action for action in actions + resolutions},'expires':monotonic()+600}
            return {'plan_id':plan_id,'username':username,'remote_count':len(remote),'actions':actions,'notices':notices,
                    'last_success_at':state['last_success_at'] if state else None,'expires_in_seconds':600}

    def apply(self, request):
        with self.lock, self.metadata.lock:
            plan = self.plans.get(request.plan_id)
            if not plan or plan['expires'] <= monotonic():
                raise HTTPException(409, 'This sync preview has expired. Load a new preview.')
            action = plan['actions'].get(request.action_id)
            if not action:
                raise HTTPException(409, 'This action has already been applied or is no longer available. Refresh the preview.')
            account, username = self.identity()
            if account != plan['account']:
                raise HTTPException(409, 'The connected Discogs account changed. Load a new preview.')
            remote = self.collection(username)
            if action['kind'] == 'missing':
                if request.choice != 'detach' or request.confirmed is not True:
                    raise HTTPException(422, 'Confirm removal of the missing local link.')
                result = self.detach_missing(account, action, remote)
            elif action['kind'] == 'release_conflict':
                if request.choice != 'detach' or request.confirmed is not True:
                    raise HTTPException(422, 'Confirm removal of the conflicting local link.')
                result = self.detach_conflict(account, action, remote)
            elif action['kind'] == 'personal':
                if request.choice != 'personal_import' or request.confirmed is not True:
                    raise HTTPException(422,'Confirm importing the reviewed personal field.')
                result = self.import_personal(account,username,action,remote)
            elif action['kind'] == 'rating':
                if request.choice != 'rating_import' or request.confirmed is not True:
                    raise HTTPException(422, 'Confirm importing the reviewed Discogs rating.')
                result = self.import_rating(account, action, remote)
            elif action['kind'] == 'account_conflict':
                if request.choice != 'detach' or request.confirmed is not True:
                    raise HTTPException(422, 'Confirm removal of the previous-account local link.')
                if action['account'] == account:
                    raise HTTPException(409, 'The saved account is connected again. Refresh the preview.')
                result = self.detach_association(action['account'], action)
            elif action['kind'] == 'remote':
                entry = remote.get(action['instance_id'])
                if not entry or entry['release_id'] != action['release_id']:
                    raise HTTPException(409, 'This Discogs copy changed since the preview. Load a new preview.')
                if request.choice == 'link':
                    result = self.link(account, entry, request.copy_id)
                elif request.choice == 'import':
                    result = self.import_copy(account, entry)
                else:
                    raise HTTPException(422, 'Choose import or match for a remote copy.')
            else:
                if request.choice != 'export':
                    raise HTTPException(422, 'Choose export for a local copy.')
                result = self.export_copy(account, username, action, remote)
            with self.database.connect() as db:
                db.execute('INSERT INTO discogs_sync_state(account,last_success_at) VALUES(?,?) ON CONFLICT(account) DO UPDATE SET last_success_at=excluded.last_success_at', (account, now()))
            del plan['actions'][request.action_id]
            return result

    def import_personal(self,account,username,action,remote):
        field=action['field']
        if field not in (*FIELDS, 'storage_location'):raise HTTPException(409,'Unsupported local field. Refresh the preview.')
        definition=action['definition']
        entry=remote.get(action['instance_id'])
        if field == 'storage_location':
            folder=self.folders(username).get(definition['id'])
            if folder != definition or not entry or entry['folder_id'] != definition['id']:
                raise HTTPException(409,'The Discogs folder or assignment changed. Refresh the preview.')
            value=folder['name']
        else:
            definitions=field_definitions(self.provider.request(f'/users/{quote(username,safe="")}/collection/fields'))
            if definitions.get(definition['id']) != definition:
                raise HTTPException(409,'The mapped Discogs field changed. Review its mapping again.')
            try:value=value_for(field,entry['notes'].get(definition['id'])) if entry else None
            except ValueError:raise HTTPException(409,'The Discogs field is now unavailable. Refresh the preview.')
        if not entry or entry['release_id'] != action['release_id'] or value != action['remote_value']:
            raise HTTPException(409,'The Discogs copy or personal field changed. Refresh the preview.')
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            link=db.execute('SELECT copy_id,release_id FROM discogs_links WHERE account=? AND instance_id=?',(account,action['instance_id'])).fetchone()
            copy=db.execute(f'SELECT "{field}" FROM copies WHERE id=?',(action['copy_id'],)).fetchone()
            if not link or link['copy_id'] != action['copy_id'] or link['release_id'] != action['release_id'] or not copy or copy[field] != action['local_value']:
                raise HTTPException(409,'The local copy, association or personal field changed. Refresh the preview.')
            db.execute(f'UPDATE copies SET "{field}"=? WHERE id=?',(value,action['copy_id']))
        return {'status':'personal_imported','copy_id':action['copy_id'],'field':field}

    def import_rating(self, account, action, remote):
        entry = remote.get(action['instance_id'])
        if not entry or entry['release_id'] != action['release_id'] or 'rating' not in entry or entry['rating'] != action['remote_rating']:
            raise HTTPException(409, 'The Discogs copy or rating changed. Refresh the preview.')
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            link = db.execute('SELECT copy_id,release_id FROM discogs_links WHERE account=? AND instance_id=?',
                              (account, action['instance_id'])).fetchone()
            copy = db.execute('SELECT rating FROM copies WHERE id=?', (action['copy_id'],)).fetchone()
            if not link or link['copy_id'] != action['copy_id'] or link['release_id'] != action['release_id'] or not copy or copy['rating'] != action['local_rating']:
                raise HTTPException(409, 'The local copy, association or rating changed. Refresh the preview.')
            db.execute('UPDATE copies SET rating=? WHERE id=?', (action['remote_rating'],action['copy_id']))
        return {'status':'rating_imported','copy_id':action['copy_id'],'rating':action['remote_rating']}

    def detach_missing(self, account, action, remote):
        if action['instance_id'] in remote:
            raise HTTPException(409, 'The Discogs copy is present again. Refresh the preview.')
        return self.detach_association(account, action)

    def detach_conflict(self, account, action, remote):
        entry = remote.get(action['instance_id'])
        if not entry or entry['release_id'] != action['remote_release_id'] or entry['release_id'] == action['release_id']:
            raise HTTPException(409, 'The conflicting Discogs copy changed again. Refresh the preview.')
        return self.detach_association(account, action)

    def detach_association(self, account, action):
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            link = db.execute('SELECT * FROM discogs_links WHERE account=? AND instance_id=?',
                              (account, action['instance_id'])).fetchone()
            if not link or link['copy_id'] != action['copy_id'] or link['release_id'] != action['release_id']:
                raise HTTPException(409, 'The local association changed. Refresh the preview.')
            receipt = db.execute('SELECT * FROM discogs_exports WHERE copy_id=?', (action['copy_id'],)).fetchone()
            if receipt and (receipt['status'] != 'resolved' or receipt['account'] != account or receipt['release_id'] != action['release_id']):
                raise HTTPException(409, 'Reconnect the saved Discogs account and review its unresolved or inconsistent export before removing this link.' if action.get('kind') == 'account_conflict' else 'An export still needs review before this link can be removed.')
            # Retain the old instance as a tombstone; never recreate it automatically.
            db.execute('UPDATE discogs_links SET copy_id=NULL WHERE account=? AND instance_id=?',
                       (account, action['instance_id']))
            if receipt:
                db.execute('DELETE FROM discogs_exports WHERE id=?', (receipt['id'],))
        return {'status':'detached', 'copy_id':action['copy_id']}

    def link(self, account, entry, copy_id):
        if not copy_id:
            raise HTTPException(422, 'Choose a local copy to match.')
        record = self.repository.get(copy_id)
        if record.get('discogs_release_id') != entry['release_id']:
            raise HTTPException(409, 'The local copy must be linked to the same exact release before matching.')
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM discogs_links WHERE copy_id=? OR (account=? AND instance_id=?)', (copy_id, account, entry['instance_id'])).fetchone():
                raise HTTPException(409, 'This local or Discogs copy is already linked. Refresh the preview.')
            pending = db.execute('SELECT account,release_id FROM discogs_exports WHERE copy_id=?', (copy_id,)).fetchone()
            if pending and (pending['account'] != account or pending['release_id'] != entry['release_id']):
                raise HTTPException(409, 'The unresolved export belongs to another account or release.')
            db.execute('INSERT INTO discogs_links VALUES(?,?,?,?)', (account, entry['instance_id'], entry['release_id'], copy_id))
            db.execute('UPDATE discogs_exports SET status="resolved" WHERE copy_id=?', (copy_id,))
        return {'status':'linked','copy_id':copy_id}

    def import_copy(self, account, entry):
        snapshot = self.metadata.snapshot(release_id=entry['release_id'])
        if not snapshot.get('is_vinyl'):
            raise HTTPException(409, 'This Discogs entry is not a Vinyl release.')
        # Provider fields are validated before entering the transaction.
        data = RecordInput(inventory_number='LP-00001', **{field:snapshot[field] for field in ['artist','title','year','tracks']})
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM discogs_links WHERE account=? AND instance_id=?', (account, entry['instance_id'])).fetchone():
                raise HTTPException(409, 'This Discogs copy is already linked. Refresh the preview.')
            used = {row[0] for row in db.execute('SELECT inventory_number FROM copies')}
            inventory = next((f'LP-{number:05d}' for number in range(1,100000) if f'LP-{number:05d}' not in used), None)
            if not inventory:
                raise HTTPException(409, 'No free LP inventory number remains.')
            album_id, copy_id = str(uuid4()), str(uuid4())
            db.execute('INSERT INTO albums(id,artist,title,year,tracks,metadata) VALUES(?,?,?,?,?,?)',
                       (album_id,data.artist,data.title,data.year,json.dumps([t.model_dump() for t in data.tracks]),json.dumps(snapshot)))
            db.execute('INSERT INTO copies(id,album_id,inventory_number,format,notes,created_at) VALUES(?,?,?,?,?,?)',
                       (copy_id,album_id,inventory,snapshot.get('copy_format', 'Other'),'',now()))
            db.execute('INSERT INTO discogs_links VALUES(?,?,?,?)', (account,entry['instance_id'],entry['release_id'],copy_id))
        return {'status':'imported','copy_id':copy_id,'inventory_number':inventory}

    def export_copy(self, account, username, action, remote):
        copy_id = action['copy_id']
        record = self.repository.get(copy_id)
        if record.get('discogs_release_id') != action['release_id']:
            raise HTTPException(409, 'The local release changed. Load a new preview.')
        # Do not export if a new, unlinked remote copy appeared after preview.
        with self.database.connect() as db:
            linked = {row[0] for row in db.execute('SELECT instance_id FROM discogs_links WHERE account=?', (account,))}
        if any(item['release_id'] == action['release_id'] and iid not in linked for iid,item in remote.items()):
            raise HTTPException(409, 'Discogs already has an unlinked copy of this release. Match or import it before exporting an additional copy.')
        operation_id = str(uuid4())
        with self.database.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM discogs_links WHERE copy_id=?', (copy_id,)).fetchone():
                raise HTTPException(409, 'This copy is already linked.')
            if db.execute('SELECT 1 FROM discogs_exports WHERE copy_id=?', (copy_id,)).fetchone():
                raise HTTPException(409, 'An earlier export may have reached Discogs. Match its remote entry; retrying automatically could create a duplicate.')
            db.execute('INSERT INTO discogs_exports VALUES(?,?,?,?,?,?,?)',
                       (operation_id,account,copy_id,action['release_id'],json.dumps(list(remote)), 'uncertain',now()))
        # The durable uncertain intent precedes the POST, including process crashes.
        try:
            response = self.provider.request(f'/users/{quote(username, safe="")}/collection/folders/1/releases/{action["release_id"]}', method='POST', body={})
            instance_id = response.get('instance_id')
            if not isinstance(instance_id,int) or instance_id < 1 or instance_id in remote:
                raise HTTPException(502, 'Discogs did not confirm a new collection instance.')
            with self.database.connect() as db:
                if not db.execute('SELECT 1 FROM copies WHERE id=?', (copy_id,)).fetchone():
                    raise HTTPException(409, 'The local copy was removed during export. Review Discogs before retrying.')
                db.execute('INSERT INTO discogs_links VALUES(?,?,?,?)', (account,instance_id,action['release_id'],copy_id))
                db.execute('UPDATE discogs_exports SET status="resolved" WHERE id=?', (operation_id,))
        except HTTPException:
            raise HTTPException(502, 'Export could not be confirmed. It may have reached Discogs. Refresh the preview and match its remote copy; this copy will not be exported again automatically.') from None
        return {'status':'exported','copy_id':copy_id,'instance_id':instance_id}
