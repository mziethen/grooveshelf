import csv
import io
import json

FIELDS = ['inventory_number', 'artist', 'title', 'format', 'year', 'rating',
          'media_condition', 'sleeve_condition', 'storage_location', 'notes', 'favorite', 'play_count',
          'last_played_at', 'nfc_uid', 'tracks', 'discogs_master_id',
          'discogs_release_id', 'source_url', 'metadata_status']


def collection_csv(records):
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=FIELDS)
    writer.writeheader()
    for record in records:
        row = {field: record.get(field) for field in FIELDS}
        row['tracks'] = json.dumps(record.get('tracks', []), ensure_ascii=False)
        row['favorite'] = 'true' if record.get('favorite') else 'false'
        # Quoting alone does not stop spreadsheet formula evaluation.
        for field, value in row.items():
            if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
                row[field] = "'" + value
        writer.writerow(row)
    return ('\ufeff' + output.getvalue()).encode('utf-8')
