# Collection filters and CSV export

**Find incomplete records** filters the current collection search by missing cover, tracks and NFC tag. All selected filters must match. The count shows matching copies out of the search results. Filters work in grid and table views, and records open normally for editing or tag assignment. Data unavailable after provider expiry also counts as missing; these filters describe currently available data, not whether a cover exists online. The application currently has no deliberate-unavailability markers.

**Export CSV** downloads the entire owned collection, independent of search or filters, with one row per physical copy. It includes inventory number, artist, title, format, year, rating, record and sleeve condition, notes, favorite status, play count, last-played timestamp, NFC UID, track list and Discogs references. Wishes and individual play history are not included. This is a spreadsheet export, not a complete backup or supported restore format.

The format uses UTF-8 with a BOM, comma separators and standard CSV quoting. Tracks are a JSON array in one cell; timestamps retain their stored timezone representation. Empty optional values are blank, and favorite values are `true` or `false`. Potential spreadsheet formulas are prefixed with an apostrophe. The fixed field list is defined in `backend/app/export.py` and the download endpoint is `/api/export/collection.csv`.

Export performs no upstream metadata requests and excludes expired provider fields while preserving personal corrections. Exported data reflects currently available local information. Access tokens and configuration are excluded.

Validation covers empty exports, Unicode, commas, quotes, multiline notes, formula protection, personal fields, track serialization and expired metadata without provider requests. Browser coverage checks combined filters, search, counts, editing, both collection views, mobile layout and the actual download.
