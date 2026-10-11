# Discogs collection sync

## Using the manual sync

Set a personal Discogs token in the server's `DISCOGS_TOKEN` environment variable, then restart the backend. The application reads the authenticated identity from Discogs; a username is not entered separately. Credentials remain on the server.

1. For existing GrooveShelf records, open their details and choose **Choose Discogs release**. Enter the numeric ID from the exact release's Discogs URL, preview it, and confirm **Use this release**. Master IDs group multiple pressings and cannot identify a collection copy.
2. Choose **Sync with Discogs** to read a preview. This performs no collection writes. Non-vinyl remote releases are counted but are not offered for import.
3. Each remote vinyl copy can be left unchanged, imported as a new local copy, or matched to a local copy linked to that same release. Each eligible local copy can be left unchanged or added to Discogs. All choices initially leave the copy unchanged.
4. Confirm **Apply selected changes**. Changes are applied individually with progress and a result per entry. On an error, processing stops while completed changes remain saved. Refresh the preview before proceeding.

Imports use the first free number from LP-00001 through LP-99999. Matching retains the existing number. Multiple instances of one release remain separate copies. Release linking retains local artist, title, year, tracks, notes, favorites, NFC tags and listening history; local album fields become protected against provider refresh. Linked release images are used by the cover picker; an earlier master-image preference is retained and reported as missing if it does not belong to the selected release.

Outbound additions go to Discogs' Uncategorised folder (folder 1). Export is blocked while the release has an unlinked remote instance, prompting the user to match it or explicitly import it as another copy first. Collection link IDs are persisted so a repeated unchanged sync adds nothing. An already linked copy cannot be changed to another release through the release picker.

## Failures and missing copies

Each outbound request has a durable intent saved before sending. A timeout, ambiguous response or process crash leaves it unresolved and blocks automatic retries. Refresh the preview and match a newly appearing Discogs instance to the local copy. If the addition is absent, choose **Review failed export**, check the real Discogs collection and explicitly acknowledge that the copy is absent. At least one minute must have passed; the server also checks for new instances before enabling another attempt. This acknowledgment only enables a fresh preview and does not send an export.

A remote deletion never deletes or re-adds the local copy automatically. Deleting a local copy retains its remote link as a tombstone, preventing accidental reimport and leaving the Discogs entry intact. Missing entries and account/release conflicts are shown for review. Linking across different accounts is blocked. Synchronization links and outbound intents survive server restarts.

Preview data expires after ten minutes. Source metadata and images continue to follow the six-hour freshness handling described in [Discogs integration](discogs.md). Pagination, API cooldowns and errors are handled without silently accepting an incomplete collection.

## Current scope and remaining work

This release synchronizes collection additions and exact-release identity. Local ratings and record/sleeve condition are available, and reviewed imports of per-copy Discogs ratings are available. Explicitly mapped imports of record/sleeve condition and personal notes, optional imports of custom folder names as storage locations, and account-specific saved mappings are available. Reviewed per-copy rating exports are available; reviewed exports of mapped condition and notes are also available. Outbound folder changes remain pending. Metadata refresh remains independent of collection membership. Missing remote links can be explicitly removed after revalidation. Changed-release and previous-account conflicts can be reviewed and detached locally; remote deletion and automatic reassignment of present synchronized instances are not provided. Scheduled automatic sync, advanced conflict resolutions remain follow-up work in #55. Pressing details and separate original/pressing years are available in record details.

Official references: [Discogs developer portal](https://www.discogs.com/developers#page:user-collection), [collection usage](https://support.discogs.com/hc/en-us/articles/360007331534-How-Does-The-Collection-Feature-Work), and [API terms](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use). The authenticated identity and collection GET response shapes were verified read-only with the deployment token. Outbound POSTs are covered by mock-transport tests; the real account has not been modified during development. The developer portal returned HTTP 403 during implementation, so a real outbound addition remains to be verified by the owner through the explicit preview flow.

## Resolve a missing Discogs link

In the sync preview, choose **Review missing link** next to a missing remote copy. Review the LP number and confirm **Remove missing link**. GrooveShelf rechecks the connected account and complete collection before clearing the local association. If the remote copy has returned or the association changed, refresh the preview instead.

Your local record, exact release, NFC tag, photos and listening history are retained. This action sends no Discogs write. The old instance remains remembered as a tombstone to prevent accidental reimport if it returns. Only a matching, resolved export receipt is cleared; uncertain exports must be reviewed separately.

A fresh preview offers matching or export as separate choices. Nothing is automatically added back to Discogs. Fully absent tombstones do not generate warnings; a returning instance is flagged for review.

## Final review and partial results

Choose per-entry actions, then select **Review changes**. The final review lists exact releases and remote instances, destinations, matched LP numbers and outbound additions to the connected account’s Uncategorised folder. Going back retains the choices; only **Apply these changes** starts synchronization. A local copy cannot be matched to two remote instances or matched and exported in the same batch.

Expired or changed previews cannot be confirmed. If a change fails, the batch stops and shows how many succeeded, which change failed or has an unconfirmed outcome, and which entries were not attempted. Successful changes are retained. Refresh the preview before retrying, especially for unconfirmed outbound additions. Server-side revalidation and uncertain-export reconciliation remain authoritative.

## Changed-release conflicts

If an already linked Discogs collection instance now refers to another release, the preview lists its saved release ID, current remote release ID, instance ID and local LP number. **Review release conflict** opens an explicit confirmation to remove the local association. GrooveShelf rechecks the connected account, complete collection, exact conflicting release and unchanged local association before applying it. An uncertain or inconsistent export blocks removal.

The local copy and its saved pressing, metadata, corrections, photos, tag and plays remain intact; nothing is deleted from Discogs. The remote instance stays remembered as a tombstone and cannot be silently reimported. Use the record’s release picker to correct the pressing if needed, then refresh the sync preview and choose any further changes explicitly. Account conflicts require the separate review below.

## Previous-account conflicts

A copy linked to a different Discogs account now shows **Review account conflict** with its LP number, saved/connected account IDs, release ID and instance ID. Explicitly confirm **Remove previous-account link** to detach only the saved local association. The connected identity, complete current collection and unchanged local association are revalidated. Uncertain or inconsistent export receipts block removal; reconnect the previous account and review those exports first.

The previous account cannot be queried with the current credentials and is not contacted. No Discogs write is sent. Local copy data, pressing, metadata, photos, NFC tags and listening history remain; the previous instance stays remembered under its original account to prevent accidental reimport when reconnecting. A fresh preview may offer explicit matching or export to the current account; neither happens automatically. Changing accounts or local links during review invalidates the action.

## Import collection ratings

Already linked copies with a valid, different Discogs collection rating appear in the manual preview. Both values are shown separately for each physical instance. Choose **Use Discogs rating** and review the old and new value before **Apply these changes**. All entries initially keep their values. Discogs zero is shown as **Unrated** and clears the local rating only after confirmation. Missing, malformed or out-of-range values do not propose a change.

The server rechecks the account, complete collection, exact instance/release link and both values; stale changes require a new preview. Only the copy's local rating is changed. Metadata, notes, photos, NFC and listening history remain. Ratings are not automatically adopted during membership import or matching; refresh the preview afterward to review them. No Discogs write is sent. Reviewed outbound ratings are available as described below. The official Discogs client exposes collection-instance ratings ([source](https://github.com/discogs/discogs_client/blob/master/discogs_client/models.py)); the developer portal remained unavailable during implementation.

## Map condition and personal notes

Choose **Map personal fields** in the sync dialog. GrooveShelf reads field definitions from the connected account and lets you assign a different Discogs field to each of Record condition, Sleeve condition and Personal notes. All selectors start at **Do not import**; IDs are not assumed from field names. Without saving, mapping is kept only while that sync dialog stays open and is checked against the account again on every mapped preview. Closing the sync dialog resets temporary choices. See the saving option below.

Choose **Preview mapped fields**, then select individual changes. Each changed field shows its current local and Discogs values; **Review changes** repeats the old/new values before applying. Ratings and multiple personal fields on the same copy can be selected together. Nothing is adopted during initial membership import or matching. No Discogs writes are sent.

Standard full Discogs condition labels and local grade codes are recognized; Generic and No Cover apply only to sleeves. Explicit empty condition values clear the grade; explicit empty notes clear the text only after review. Omitted, duplicated, malformed or unsupported values keep local data unchanged and produce a notice. Notes must fit the existing 10,000-character limit. Personal notes are independent of album release notes.

Every application rechecks account, complete collection, field definition (including name/type/options), exact instance/release association and both field values. Changed definitions or values require a new preview/mapping; a partial batch retains completed changes. Only the selected local field is updated. Photos, inventory, storage location, favorites, metadata corrections, NFC and listening history remain. The field endpoint and collection-note response were verified read-only against the connected account; the [official Discogs client](https://github.com/discogs/discogs_client/blob/master/discogs_client/models.py) also exposes instance notes. Outbound folder handling remains future work.

### Import folder names as storage locations

In **Map personal fields**, enable **Use Discogs folder names as storage locations**, then choose **Preview mapped fields**. This option is off by default. It applies to the current sync session unless you explicitly save the account mapping. Custom folder names are proposed as text for each linked copy's storage location. Review the current and proposed values, select individual changes and confirm the final review. The All and Uncategorised folders are ignored; unavailable folders never clear a local location.

Before applying a change, GrooveShelf checks the connected account, collection instance, release, current folder assignment and name, local association and current storage location again. Changed values require a fresh preview. This feature does not create, rename or move Discogs folders, and does not export local storage locations.


### Save or forget an account mapping

In **Map personal fields**, select **Save these choices for this Discogs account**, then **Preview mapped fields**. Saving stores the selected condition/note field IDs, their current definitions and the folder-location option in the local database. A save failure keeps the dialog open for retry and does not start a preview. Canceling before submission saves nothing. Saving does not import any collection values or send Discogs writes.

When you reopen the mapping dialog, saved choices are prefilled only for the currently authenticated account. The initial collection preview remains unmapped; review the choices and select **Preview mapped fields** to use them. Every proposed update still needs individual selection and final confirmation. Saved mappings are not a background synchronization policy.

If a saved field has been removed, renamed, or changed in type or options, the app warns and does not prefill that saved mapping. Select and save a new mapping, or use **Forget saved mapping**. Forgetting removes only this account's saved preferences; current dialog choices can still be used temporarily. Other accounts' mappings and your collection data remain intact. Unchecking the save option makes the current choices temporary; use **Forget saved mapping** to remove an older saved mapping.

Mappings survive server restarts and are included in validated backups. Database schema 11 adds the account mapping table. Schema 9 and 10 archives remain supported and restore into the current schema with no saved mappings. Archives contain account IDs and mapping definitions, but no Discogs token.

## Export collection ratings

For a linked copy with different local and Discogs ratings, the sync preview now offers **Send GrooveShelf rating to Discogs** when its current folder is known. Choose either importing the Discogs value or exporting the GrooveShelf value; the default remains **Keep unchanged**. The final review names the destination account, exact release/collection instance and old/new Discogs rating. **Unrated** exports zero to clear the rating only after confirmation.

Before sending, GrooveShelf rechecks the authenticated account, full collection, instance/release/folder, saved association and both ratings. The POST body contains only `rating`; it does not move folders or add collection entries. Local data remains unchanged. A successful result requires reading the collection again and finding the requested rating on the same instance/release/folder.

The reviewed action is consumed before the write and cannot be replayed, including after an unconfirmed response. There is no automatic retry. If the write or verification fails, the batch stops; a fresh preview checks current Discogs values, and any further update requires a new explicit selection and confirmation. A server restart also discards previews. This is a set-value operation rather than a membership addition. GrooveShelf performs the final remote check and POST as separate requests; an edit made directly in Discogs between those requests cannot be excluded.

Implementation reference: the [Minim client implementation](https://minim.readthedocs.io/en/latest/_modules/minim/discogs.html#API.edit_collection_folder_release) documents and calls the instance-rating POST endpoint. The [Discogs endpoint reference](https://www.discogs.com/developers#page:user-collection,header:user-collection-change-rating-of-release-post) remained unavailable during development. Transport tests cover successful empty responses, clearing, exact instance targeting, stale values, denied access, lost/invalid responses and failed read-back. No real rating was changed during development; the owner can validate an actual write through the explicit review flow.

## Export mapped condition and personal notes

After **Map personal fields → Preview mapped fields**, supported fields offer **Send GrooveShelf … to Discogs**. Select import or export independently for each field. The final review shows the account, LP number, exact release/instance, destination field, current remote text and exact outgoing text. Empty notes are displayed as **(empty)** and clear the remote text only after confirmation. Local data remains unchanged.

Exports require a known current folder and a readable, explicit remote value. Missing, duplicate, malformed or unsupported source values remain unavailable. Dropdown values must exactly match the destination's options; standard local grade codes use the corresponding full Discogs label when offered, or the matching code option. Unsupported values and clearing a dropdown without an empty option are not offered. Supported text fields accept the exact note or grade text. Storage-location changes remain import-only.

Field visibility is shown in the export review as public, private, or a prompt to check visibility in Discogs when unavailable. Visibility is part of the field definition checked before and after writing; changing it requires a fresh preview. Existing saved mappings may need resaving when newly reported visibility differs from their saved definition.

Every export rechecks identity, complete collection, field definition, instance/release/folder, saved association, exact raw remote text and the local field. Only the selected field's value is sent. The collection and field definition are read again before reporting success. The action is consumed before writing; lost responses or failed verification stop the batch, with no automatic retry. A fresh preview and explicit confirmation are required for any subsequent update. The remote read and POST are separate requests, so concurrent edits made directly in Discogs between them cannot be excluded.

References: [Minim's collection field implementation](https://minim.readthedocs.io/en/latest/_modules/minim/discogs.html#API.edit_collection_release_field), [Discogs client discussion with a JSON value payload](https://github.com/joalla/discogs_client/discussions/166), and the [Discogs field endpoint](https://www.discogs.com/developers/#page:user-collection,header:user-collection-edit-fields-instance-post). Real writes remain to be validated by the owner through the explicit review flow; development uses transport tests and read-only account checks.
