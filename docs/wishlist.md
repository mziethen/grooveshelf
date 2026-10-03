# Wishlist

Use **Wishlist** to manage albums you would like to find separately from physical copies. Wishes contain your own artist, album title and notes; they have no inventory number, NFC association or listening history.

**Add a wish** supports manual entry without Discogs credentials. **Find on Discogs** offers optional album-master references. Selecting a result links the reference without replacing your wording. Search results are temporary, show attribution and expire; only the reference ID and your own fields are saved. **Clear Discogs link** restores an entirely manual wish. Wishlist entries are local; Discogs wantlist synchronization remains future work.

The list supports search across artist, album and notes, editing, and removal with confirmation. Removing a wish keeps the collection and listening history intact.

## After purchasing a record

Choose **I bought this record** to open the regular record editor with the wish's artist, title and notes. If linked, its Discogs album is offered as an optional preview; use **Use these details** to import metadata explicitly. You can still save manually when Discogs is unavailable.

Enter an unused LP number and review the physical copy before saving. Canceling the editor leaves the wish active. Saving creates the copy and marks the wish acquired in the same transaction; the wish leaves the active list only after the save succeeds. Invalid data, a duplicate LP number or failed provider import retains the wish.

Retries using the same LP number return the acquired copy rather than creating another copy. Acquired entries retain an internal receipt for this purpose; deleting that physical copy does not reactivate its old wish automatically. Add a new wish explicitly if you want the album again.

## Storage and verification

Schema version 7 adds the wishlist table without changing existing copy IDs or personal fields. Acquisition uses a database write lock so concurrent requests cannot consume the same wish twice. Tests cover CRUD/search, restart persistence, migration, failed import, LP-number conflict and repeat acquisition. Browser coverage includes Discogs reference selection, canceled acquisition, manual fallback, edit/search and confirmed removal on a mobile screen.
