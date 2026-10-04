# Collection exports

Choose a download in the sidebar's **Export** group. Downloads include the entire owned collection, regardless of the current search or filter, and do not change records or contact Discogs.

| Format | Purpose |
| --- | --- |
| Export archive | Portable ZIP with database and cached covers; use for backup and restore. |
| Export CSV | Spreadsheet-friendly inventory with formula protection. |
| Export JSON | Structured collection data for your own scripts and tools. |
| Printable catalog | Standalone HTML for browsing offline or printing from your browser. |

## JSON

`grooveshelf-collection.json` is UTF-8 with a versioned envelope: `format` (`grooveshelf-collection`), `format_version` (`1`), `exported_at` (UTC), `record_count`, and `records`.

Each record contains the public record fields, including its stable copy and album IDs, inventory number, personal fields, NFC UID, play count, last played timestamp, metadata status, and track array. Booleans, numbers and nulls retain their JSON types. Cover URLs are references to the running GrooveShelf server; image files are included in ZIP archives instead.

JSON is a data export, not a restore format. It does not include the wishlist, individual listening events, sync receipts, settings, credentials or private provider cache objects. Use the ZIP archive to restore an installation.

## Printable catalog

Save `grooveshelf-collection.html`, open it in a browser, and use the browser's Print action to print or save a PDF. It includes inventory numbers, artists, titles, track lists, personal notes, conditions, locations, ratings and listening totals. Long text wraps and notes preserve line breaks. It contains inline print styles and requires no scripts, cover downloads or external fonts.

## Provider metadata

Like CSV, these exports retain personal data but hide expired provider content until it has been refreshed in GrooveShelf. An affected record is marked `unavailable`; unprotected artist, title, year and tracks use the existing unavailable-content values. Exporting itself never refreshes provider data.

Exports contain personal collection information, including notes and assigned NFC UIDs. Share the downloaded file only with people who should receive those details.
