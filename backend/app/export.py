import csv
import io
import json

FIELDS = ['inventory_number', 'artist', 'title', 'format', 'year', 'rating',
          'media_condition', 'sleeve_condition', 'storage_location', 'notes', 'favorite', 'play_count',
          'last_played_at', 'nfc_uid', 'tracks', 'discogs_master_id',
          'discogs_release_id', 'source_url', 'metadata_status', 'credits', 'credits_source_url', 'original_year', 'original_year_source_url', 'pressing_year', 'country', 'catalog_numbers']


def collection_csv(records):
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=FIELDS)
    writer.writeheader()
    for record in records:
        row = {field: record.get(field) for field in FIELDS}
        row['tracks'] = json.dumps(record.get('tracks', []), ensure_ascii=False)
        row['credits'] = json.dumps(record.get('credits', []), ensure_ascii=False)
        row['catalog_numbers'] = json.dumps(record.get('catalog_numbers', []), ensure_ascii=False)
        row['favorite'] = 'true' if record.get('favorite') else 'false'
        # Quoting alone does not stop spreadsheet formula evaluation.
        for field, value in row.items():
            if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
                row[field] = "'" + value
        writer.writerow(row)
    return ('\ufeff' + output.getvalue()).encode('utf-8')


def collection_json(records):
    from datetime import datetime, timezone
    from .models import Record
    # Explicit public schema prevents cache internals from entering the download.
    allowed = Record.model_fields
    payload = {
        'format': 'grooveshelf-collection', 'format_version': 1,
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'record_count': len(records),
        'records': [Record.model_validate({key: value for key, value in record.items()
                                            if key in allowed}).model_dump(mode='json')
                    for record in records],
    }
    return (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def collection_html(records):
    from datetime import datetime, timezone
    from html import escape
    def text(value):
        return escape(str(value)) if value is not None else '—'
    articles = []
    for record in records:
        tracks = ''.join(f'<li>{text(track.get("position", ""))} — {text(track["title"])}{(" · " + text(track["duration"])) if track.get("duration") else ""}</li>'
                         for track in record.get('tracks', []))
        facts = [('Format', record.get('format')), ('Saved year', record.get('year')),
                 ('Original release year', record.get('original_year')), ('Pressing year', record.get('pressing_year')),
                 ('Country', record.get('country') or None),
                 ('Catalog numbers', ' · '.join(record.get('catalog_numbers', [])) or None),
                 ('Original year source', record.get('original_year_source_url')),
                 ('Location', record.get('storage_location') or None), ('Rating', record.get('rating')),
                 ('Media condition', record.get('media_condition')), ('Sleeve condition', record.get('sleeve_condition')),
                 ('Favorite', 'Yes' if record.get('favorite') else 'No'), ('Plays', record.get('play_count', 0)),
                 ('Last played', record.get('last_played_at')), ('NFC tag', record.get('nfc_uid')),
                 ('Metadata', record.get('metadata_status'))]
        details = ''.join(f'<dt>{text(label)}</dt><dd>{text(value)}</dd>' for label, value in facts)
        credits = ''.join(f'<li>{text(credit["name"])} — {text(credit["role"])}'
                          f'{(" · Scope: " + text(credit["tracks"])) if credit.get("tracks") else ""}</li>'
                          for credit in record.get('credits', []))
        credit_section = f'<h3>Album &amp; track credits</h3><ul>{credits}</ul>' if credits else ''
        if credits and record.get('credits_source_url'):
            credit_section += f'<p>Credits source: {text(record["credits_source_url"])}</p>'
        articles.append(f'<article><p class="inventory">{text(record["inventory_number"])}</p>'
                        f'<h2>{text(record["title"])}</h2><p>{text(record["artist"])}</p><dl>{details}</dl>'
                        f'<h3>Tracks</h3><ol>{tracks}</ol><h3>Personal notes</h3>'
                        f'<p class="notes">{text(record.get("notes", ""))}</p>{credit_section}</article>')
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    document = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>GrooveShelf collection catalog</title><style>
*{box-sizing:border-box}body{margin:0 auto;padding:32px;max-width:900px;color:#242420;background:#fff;font:16px/1.5 system-ui,sans-serif}
h1,h2{font-family:Georgia,serif}h1{font-size:36px}h2{margin:0;font-size:26px}h3{font-size:16px}
article{border-top:1px solid #aaa;padding:24px 0;overflow-wrap:anywhere}.inventory{font-weight:700;letter-spacing:.08em}
dl{display:grid;grid-template-columns:140px 1fr;gap:4px 16px}dt{font-weight:600}dd{margin:0}.notes{white-space:pre-wrap}
@media(max-width:480px){body{padding:16px}dl{grid-template-columns:110px 1fr}}
@media print{body{max-width:none;padding:0;font-size:11pt}h2,h3{break-after:avoid}li,dt,dd{break-inside:avoid}article{padding:16px 0}}
</style></head><body><h1>GrooveShelf</h1>'''
    document += f'<p>Collection catalog · {len(records)} records · Exported {timestamp}</p>'
    document += ''.join(articles) or '<p>Your collection is empty.</p>'
    return (document + '</body></html>\n').encode('utf-8')
