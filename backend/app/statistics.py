from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException

ZONE = ZoneInfo('Europe/Berlin')


def statistics(database, records, start=None, end=None):
    if start and end and start > end:
        raise HTTPException(422, 'The start date must be on or before the end date.')
    if end == date.max:
        raise HTTPException(422, 'The end date must be before 9999-12-31.')
    lower = datetime.combine(start, time.min, ZONE).timestamp() if start else None
    upper = datetime.combine(end + timedelta(days=1), time.min, ZONE).timestamp() if end else None
    with database.connect() as db:
        events = db.execute('SELECT copy_id, played_at FROM play_events').fetchall()
    lifetime = Counter(event['copy_id'] for event in events if event['copy_id'])
    counts = Counter(); months = Counter(); deleted = 0
    for event in events:
        if (lower is not None and event['played_at'] < lower) or (upper is not None and event['played_at'] >= upper):
            continue
        month = datetime.fromtimestamp(event['played_at'], timezone.utc).astimezone(ZONE).strftime('%Y-%m')
        months[month] += 1
        if event['copy_id']:
            counts[event['copy_id']] += 1
        else:
            deleted += 1
    def summary(record):
        return {key: record[key] for key in ['id', 'inventory_number', 'artist', 'title', 'metadata_expires_at']}
    top = [{**summary(record), 'plays': counts[record['id']]} for record in records if counts[record['id']]]
    top.sort(key=lambda record: (-record['plays'], record['inventory_number']))
    never = [summary(record) for record in records if not lifetime[record['id']]]
    return {'timezone': 'Europe/Berlin', 'aggregation': 'physical_copy',
            'total_plays': sum(months.values()), 'deleted_copy_plays': deleted,
            'months': [{'month': month, 'plays': count} for month, count in sorted(months.items())],
            'most_played': top, 'never_played': never,
            'start': start.isoformat() if start else None, 'end': end.isoformat() if end else None}
