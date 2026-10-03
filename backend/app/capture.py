import unicodedata
from fastapi import HTTPException
from .discogs import fresh
from .metadata import MetadataService


def normalized(value):
    value = unicodedata.normalize('NFKC', value).casefold()
    return ' '.join(''.join(char if char.isalnum() else ' ' for char in value).split())


class CaptureService:
    def __init__(self, repository):
        self.repository = repository

    def next_inventory(self, after=None):
        with self.repository.database.connect() as db:
            used = {row[0] for row in db.execute('SELECT inventory_number FROM copies')}
        if after=='LP-00000':
            raise HTTPException(422, 'Inventory numbers start at LP-00001.')
        start = int(after[3:])+1 if after else 1
        for numbers in [range(start,100000), range(1,min(start,100000))]:
            for number in numbers:
                inventory = f'LP-{number:05d}'
                if inventory not in used:
                    return {'inventory_number':inventory,'reserved':False}
        raise HTTPException(409, 'All LP inventory numbers are in use.')

    def duplicates(self, data):
        matches=[]
        artist,title=normalized(data.artist),normalized(data.title)
        for record in self.repository.list():
            if record['id']==data.exclude_id:
                continue
            same_source=(data.discogs_release_id and record.get('discogs_release_id')==data.discogs_release_id) or (data.discogs_master_id and record.get('discogs_master_id')==data.discogs_master_id)
            same_name=artist and title and normalized(record['artist'])==artist and normalized(record['title'])==title
            if not same_source and not same_name:
                continue
            if record['metadata_expires_at'] and not fresh(record['_metadata']):
                record=MetadataService.hide_stale(record)
            matches.append({'id':record['id'],'inventory_number':record['inventory_number'], 'artist':record['artist'],'title':record['title'],
                            'reason':'Same Discogs album; pressings may differ' if same_source else 'Same artist and album title'})
        return {'matches':matches[:50],'total':len(matches)}
