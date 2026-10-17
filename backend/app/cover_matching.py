"""Ephemeral local image comparisons; never fetch or index provider images."""
from io import BytesIO
from threading import Lock
from time import monotonic
from fastapi import HTTPException
from PIL import Image
from .photos import normalize, MAX_UPLOAD
from .discogs import source_key, timestamp, MAX_AGE

MAX_COMPARISONS = 500


def fingerprint(content):
    data, _, _ = normalize(content)
    with Image.open(BytesIO(data)) as image:
        gray=image.convert('L').resize((9,8),Image.Resampling.LANCZOS).tobytes()
        if max(gray)-min(gray)<20:
            raise HTTPException(422,'This image has too little visual detail to compare. Try a clearer photo or read the cover text.')
        bits=sum((gray[y*9+x]>gray[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8))
        colors=tuple(image.convert('RGB').resize((8,8),Image.Resampling.LANCZOS).tobytes())
    return bits,colors


class LocalCoverMatcher:
    def __init__(self,repository,metadata,covers):
        self.repository,self.metadata,self.covers=repository,metadata,covers
        self.lock=Lock()

    def match(self,content):
        if not self.lock.acquire(blocking=False):
            raise HTTPException(429,'Another cover comparison is running. Try again shortly.')
        try:
            target=fingerprint(content)
            deadline=monotonic()+10
            matches=[];compared=0;unavailable=0;incomplete=False
            records=self.repository.list()
            with self.repository.database.connect() as db:
                for record in records:
                    if compared>=MAX_COMPARISONS or monotonic()>=deadline:
                        incomplete=True;break
                    personal=db.execute('SELECT id,content FROM photos WHERE copy_id=? AND is_cover=1',(record['id'],)).fetchone()
                    shown=self.metadata.cached(record)
                    if personal:
                        image=personal['content']
                    elif shown.get('cover_url'):
                        key=source_key(record['_metadata'])
                        if record.get('cover_image_id'):key+=f"-{record['cover_image_id']}"
                        try:
                            path=self.covers.path(key)
                            modified=path.stat().st_mtime
                            if not shown.get('show_expired_metadata') and (timestamp()-modified>=MAX_AGE or modified<record['_metadata'].get('checked_at',0)):
                                unavailable+=1;continue
                            with path.open('rb') as saved:image=saved.read(MAX_UPLOAD+1)
                        except OSError:
                            unavailable+=1;continue
                    else:
                        unavailable+=1;continue
                    try:
                        candidate=fingerprint(image)
                    except HTTPException:
                        unavailable+=1;continue
                    compared+=1
                    distance=(target[0]^candidate[0]).bit_count()
                    color_distance=sum(abs(a-b) for a,b in zip(target[1],candidate[1]))/len(target[1])
                    if distance<=10 and color_distance<=25:
                        matches.append({'id':record['id'],'inventory_number':record['inventory_number'],
                                        'title':shown['title'],'artist':shown['artist'],
                                        '_rank':distance/64+color_distance/255})
            matches.sort(key=lambda row:(row['_rank'],row['inventory_number']))
            return {'matches':[{k:v for k,v in row.items() if k!='_rank'} for row in matches[:10]],
                    'compared':compared,'unavailable':unavailable,'incomplete':incomplete,'total_matches':len(matches),
                    'scope':'saved_collection_covers'}
        finally:
            self.lock.release()
