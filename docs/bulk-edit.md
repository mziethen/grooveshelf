# Bulk editing personal copy fields

Open **Bulk edit** under **Organize** in the navigation. Select individual copies, or search by artist, album, inventory number, or storage location and use **Select matching**. Selection is retained when the filter changes, including copies outside the current results. **Clear selection** removes all selected copies.

Choose the fields to change. Ratings, record/sleeve conditions, and favorites start with **Keep existing**; untouched fields retain each copy's value. Enable **Change storage location** to set a shared location; leave its input empty to clear it. Choose **Clear rating** or **Clear condition** to remove those values. Notes, inventory numbers, album metadata, covers, NFC tags, and listening history are outside this workflow.

Select **Review changes** to see the selected inventory numbers, album/artist names, and the exact shared changes. **Back to selection** retains the draft. Closing or pressing Escape before applying leaves the collection unchanged. **Apply changes** saves the batch and refreshes the collection. Closing and further submissions are temporarily disabled while the request is in progress.

## Atomic updates and concurrent changes

A batch supports between 1 and 500 distinct physical copies. The API validates all requested fields and updates all selected copies in one SQLite transaction. If a copy was deleted since selection, the whole batch fails; no remaining copy is changed. Return to selection and use **Reload records**, review the remaining selection, and apply again. Reload removes deleted copy IDs and keeps valid selections and draft changes.

The endpoint does not call Discogs or rewrite album/provider data, sync links, NFC associations, or play events. Selected personal fields are overwritten with the reviewed values even if another browser edited those same fields meanwhile. Unselected fields remain untouched. A repeated request is safe after an uncertain response because the operation sets explicit values rather than appending or incrementing anything. There is no automatic undo; use the per-copy editor or another reviewed batch to correct values.

## API

`PATCH /api/records/bulk-personal` accepts a selection and a partial changes object:

```json
{
  "record_ids": ["<copy-id>", "<another-copy-id>"],
  "changes": {
    "storage_location": "Living room · Shelf B",
    "rating": 5,
    "favorite": true
  }
}
```

Omitted fields retain their values. `rating`, `media_condition`, and `sleeve_condition` accept `null` to clear. `storage_location` uses an empty string to clear; `favorite` requires a boolean. Ratings must be integers from 1 to 5, and condition grades follow the personal editor. Unknown fields, duplicate IDs, empty selections, oversized batches, and invalid values return 422. Missing copies return 409. Success returns `updated_count` and `record_ids`.

No database migration is required. Tests cover per-copy isolation, persistence, clearing, validation, database rollback, deleted selections, the 500-copy limit, offline operation, and preserved relationships. Browser tests cover search/selection, review/back/cancel, submission guards, reload after conflicts, all themes, and mobile layouts.
