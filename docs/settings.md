# Metadata settings

**Settings** configures this GrooveShelf installation. Automatic refresh and import review are enabled by default; displaying expired data is disabled by default. All three preferences persist in the database across restarts.

**Automatically refresh expired Discogs metadata** controls refreshes when existing records and their covers are loaded. When disabled, and unless saved-data display is enabled below, expired provider data is hidden until **Refresh metadata** is explicitly used on a record. Fresh metadata remains available until its normal six-hour deadline. Manual corrections, personal fields, inventory numbers, NFC associations and listening history remain intact. Loading a legacy image gallery that requires a metadata refresh also respects this switch.

This option does not disable explicit Discogs searches, import previews, collection-sync actions or saving a selected import. Those are user-initiated requests. Without the saved-data option below, editing expired provider-backed album fields requires a manual refresh first; independent personal fields can still be edited.

**Review Discogs details before adding them to the draft** controls initial import confirmation. Enabled: selecting a search result opens the normal preview, including cover selection, followed by **Use these details**. Disabled: selecting a result fills the draft directly with the default cover preference. Users can edit the draft before saving and choose another cover afterward. Neither mode automatically creates a record. Artist/title and barcode/catalog-number searches share this behavior, as does an explicitly selected wishlist purchase preview. If settings cannot be read during preview, confirmation stays enabled for that lookup.

Schema version 8 adds a settings table. Existing collections migrate with both options enabled and no change to record identities. Tests cover defaults, validation, restart persistence, migration from version 7, disabled refresh, manual refresh, protected corrections and re-enabling refresh. Browser coverage checks saved toggles, reload, direct draft filling, preview confirmation, no automatic saving and mobile layout.

## Continue showing saved Discogs data after six hours

This installation-wide preference is **off by default**. Enable it to display existing database snapshots and cached covers after their six-hour deadline. Older album details are labelled **Saved Discogs data**, with their last check time. Corrections, personal fields and source attribution remain intact. List views, record details, discovery, statistics and collection exports use the same preference. Import previews still expire normally.

Turn **automatic refresh off** as well to read saved records without contacting Discogs. With automatic refresh on, GrooveShelf attempts to update them and falls back to saved data when Discogs is unavailable. Explicit searches, sync and manual refresh remain user-initiated provider requests. Missing expired cover files are not silently downloaded: refresh the record to retrieve them. Existing cached images are retained while this option is enabled, including during other image downloads. Deleting the final record referencing a source still removes its cached images.

Turning this option off immediately restores the existing hiding behavior. It does not erase album snapshots or change inventory numbers, NFC associations or listening history. Settings persist across restarts; older API clients omitting the new field preserve the existing choice. No schema migration is necessary.

The [Discogs API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use) require current data and constrain storage. Continuing to display older snapshots may conflict with those terms; this preference does not grant additional usage rights.
