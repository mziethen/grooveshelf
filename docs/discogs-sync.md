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

This release synchronizes collection additions and exact-release identity. Local ratings and record/sleeve condition are available, but sync does not transfer ratings, custom collection fields, folders, condition or personal notes. Metadata refresh remains independent of collection membership. Missing remote links can be explicitly removed after revalidation. Changed-release conflicts can be reviewed and detached locally; remote deletion and automatic reassignment of present synchronized instances are not provided. Scheduled automatic sync, advanced conflict resolutions and personal-field mapping remain follow-up work in #55. Pressing details and separate original/pressing years are available in record details.

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

The local copy and its saved pressing, metadata, corrections, photos, tag and plays remain intact; nothing is deleted from Discogs. The remote instance stays remembered as a tombstone and cannot be silently reimported. Use the record’s release picker to correct the pressing if needed, then refresh the sync preview and choose any further changes explicitly. Account conflicts remain review notices and are not resolved automatically.
