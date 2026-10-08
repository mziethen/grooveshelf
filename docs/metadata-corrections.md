# Review metadata corrections

Open a Discogs-backed record, expand **Manage record**, and choose **Review metadata corrections**. The action appears when artist, title, saved year or track list has a protected manual correction.

The review compares your saved value with the last Discogs snapshot stored in the database. Its source and last check time are shown. Opening the review makes no Discogs request and changes nothing; use **Refresh from Discogs** first if you want a newer snapshot. This comparison concerns album metadata, rather than ratings, condition, storage, notes, tags or listening history.

Every field initially selects **Keep my correction**. **Use saved Discogs value** adopts that value and removes protection for that field, allowing later Discogs refreshes to update it. Missing or unusable provider values cannot be selected. An explicitly saved unknown year or empty track list can replace a manually entered value when the snapshot contains that field. **Cancel** leaves the record unchanged. **Apply choices** confirms all selected decisions together.

Only the selected physical copy changes. If copies share an album, GrooveShelf creates a separate album association for the resolved copy. Inventory number, personal details, cover selection, NFC association and history are preserved. Keeping every correction makes no album change. No schema migration is required; schema versions 9 and 10 and existing portable archives remain compatible.

Expired snapshots follow [metadata settings](settings.md). By default, refresh the record before reviewing expired values. With saved-data display enabled, older snapshots remain reviewable and are marked as potentially outdated. An open review hides provider values at its deadline unless that preference is enabled. Changes to metadata since opening the review reject the save and ask you to close and reopen it; independent personal edits do not invalidate the review. Failed saves retain choices and prevent overlapping submissions.

This implements the Discogs correction-resolution part of META-05 (#26). Additional metadata providers remain future work. Tests cover read-only previews, per-field decisions, shared-copy isolation, protected fields on subsequent refresh, persistence, missing values, expiry preferences, stale reviews, personal changes, retries, responsive themes and escaping.
