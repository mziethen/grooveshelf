import random
from datetime import datetime, timezone, timedelta


def candidates(records, mode, now=None):
    now = now or datetime.now(timezone.utc)
    if mode == 'never':
        return [record for record in records if record['play_count'] == 0]
    if mode == 'least':
        minimum = min((record['play_count'] for record in records), default=0)
        return [record for record in records if record['play_count'] == minimum]
    if mode == 'recent':
        cutoff = now - timedelta(days=30)
        return [record for record in records if not record['last_played_at'] or
                datetime.fromisoformat(record['last_played_at'].replace('Z', '+00:00')) <= cutoff]
    return records


def suggest(records, mode, previous=None):
    pool = candidates(records, mode)
    alternatives = [record for record in pool if record['id'] != previous]
    return {'record': random.choice(alternatives or pool) if pool else None,
            'candidate_count': len(pool), 'collection_count': len(records)}
