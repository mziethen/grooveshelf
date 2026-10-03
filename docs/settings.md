# Metadata settings

**Settings** configures this GrooveShelf installation. Both options are enabled by default and persist in the database across restarts.

**Automatically refresh expired Discogs metadata** controls refreshes when existing records and their covers are loaded. When disabled, expired provider data is hidden until **Refresh metadata** is explicitly used on a record. Fresh metadata remains available until its normal six-hour deadline. Manual corrections, personal fields, inventory numbers, NFC associations and listening history remain intact. Loading a legacy image gallery that requires a metadata refresh also respects this switch.

This option does not disable explicit Discogs searches, import previews, collection-sync actions or saving a selected import. Those are user-initiated requests. Provider expiry limits remain unchanged; disabling automatic refresh does not permit indefinite display of older provider data. Editing expired provider-backed album fields requires a manual refresh first; independent personal fields can still be edited.

**Review Discogs details before adding them to the draft** controls initial import confirmation. Enabled: selecting a search result opens the normal preview, including cover selection, followed by **Use these details**. Disabled: selecting a result fills the draft directly with the default cover preference. Users can edit the draft before saving and choose another cover afterward. Neither mode automatically creates a record. Artist/title and barcode/catalog-number searches share this behavior, as does an explicitly selected wishlist purchase preview. If settings cannot be read during preview, confirmation stays enabled for that lookup.

Schema version 8 adds a settings table. Existing collections migrate with both options enabled and no change to record identities. Tests cover defaults, validation, restart persistence, migration from version 7, disabled refresh, manual refresh, protected corrections and re-enabling refresh. Browser coverage checks saved toggles, reload, direct draft filling, preview confirmation, no automatic saving and mobile layout.
