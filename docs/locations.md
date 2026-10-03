# Storage locations

An optional **Storage location** belongs to each physical copy, not to the album. Use your own wording, for example `Living room · Shelf 2 · Section B`. Locations are free text, trimmed at the ends, with a limit of 200 characters. Empty means no location has been recorded.

Set the location when adding or editing a record, or use **Edit personal details** to move a copy without changing album metadata. Clearing the field removes the location. Details and both collection views show it, and normal collection search includes location text case-insensitively. CSV export includes a `storage_location` column. Wishes have no physical location.

Locations persist across restarts, Discogs refreshes and offline personal editing. Older clients that omit the location during either record or personal-field updates retain the existing value. Different copies of the same album can have different locations. Rapid capture clears the location for the next draft to avoid assuming that the next copy has the same place.

Schema version 9 adds a non-null text column to copies, with an empty default for existing records. Migration preserves record IDs and other fields. Hierarchical shelf management, physical shelf order, bulk moves and automatic location assignment are outside this feature.

Tests cover per-copy storage, validation, search, CSV export, clearing, legacy updates, restart, migration from version 8 and provider-independent editing. Browser coverage includes add/edit/cancel, escaped display, grid/table/search, reload, clearing, mobile layout and rapid-capture reset.
