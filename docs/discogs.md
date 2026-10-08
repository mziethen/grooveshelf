# Discogs integration

## Scope

The initial adapter searches master entries by artist and album title. It normalizes artist, album title, original year, tracks and side positions, genre and style. If available, label names and album notes come from the master's main release; they describe that reference release, not necessarily the user's exact pressing. Reviews and exact pressing identification remain future work.

Search and metadata preview do not create collection entries. Opening the image gallery downloads bounded, validated image previews. A user explicitly chooses **Use these details** and then saves the record. Missing results or an unconfigured token do not prevent manual entry. Cover failures do not prevent importing the remaining metadata.

## Source and freshness

Every view of imported data includes a **Data provided by Discogs** link. This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of Zink Media, LLC.

Discogs API content and images have their own terms and are not licensed by GrooveShelf's MIT license. Review the [API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use) and any image rights that apply to your deployment.

By default, imported source snapshots and covers are refreshed on access once they reach six hours. Preview snapshots are reused for at most five minutes. The browser checks deadlines, polls once a minute while visible and checks again on returning to the page. By default, expired provider fields and images are hidden if refresh fails, while protected manual edits and personal notes remain visible. The user can retry a refresh. API responses and cover responses disable browser caching.

[Metadata settings](settings.md) let users independently disable automatic refresh or opt into displaying saved expired snapshots. The latter is off by default and includes a terms notice and a visible last-check label. An already open draft form is a user-editable draft; saving rechecks its selected master and preserves differences as manual corrections.

## Manual edits

Artist, title, year and track list differences are tracked as protected fields. Refresh updates only unprotected fields. Notes are personal data and never populated from provider album notes. Editing one copy's album metadata creates a separate album association if necessary, preserving other copies. [Review metadata corrections](metadata-corrections.md) compares protected fields with saved Discogs values and explicitly removes protection for fields you adopt. Exact release linking can change the source of an existing copy through the [collection sync workflow](discogs-sync.md).

## Storage and failures

The SQLite migration adds metadata without replacing existing IDs, records or notes. Covers live beside the database in `covers/`, inside the same Compose volume. Unreferenced covers are removed after record saves and deletions. A failed provider request never creates a partial copy. Authentication errors, rate limits and temporary failures produce actionable messages. Rate-limit cooldowns do not trigger repeated upstream requests.

The adapter uses fixed Discogs API endpoints. Cover retrieval accepts only HTTPS `i.discogs.com` URLs, follows no redirects, sends no authentication headers, limits files to 5 MiB and accepts PNG/JPEG/WebP signatures. Raster files are served with explicit image content types and `nosniff`.

## Verification

Automated fixtures cover search/preview without saving, confirmation payloads, local covers, attribution, missing tokens, failed imports, provider outages, rate-limit cooldowns, protected edits, copy isolation, cache expiry, cleanup and database migration. Browser fixtures test the full confirmation flow independently of real credentials. Live anonymous master preview/import and cover retrieval were checked using master 10362 in a disposable database; authenticated search still needs validation with the deployment owner's token.

## Cover selection

The import preview offers a thumbnail gallery and a larger preview. Choose an image before **Use these details**, or leave **Use default cover** selected. Existing Discogs records have a **Choose cover** action in their details. Previewing or canceling does not change the saved selection; **Save cover** confirms it.

The preference belongs to the physical copy, not the shared album. Stable image identifiers retain the preference when Discogs changes signed image URLs. Refreshes preserve the choice; a removed image is reported as missing without silently substituting another image. Resetting to the default uses the provider's primary image. Import previews expire after six hours. Saved-record galleries use the installation’s display preference; opted-in expired galleries serve cached images without refreshing the provider snapshot. Credentials and original image URLs are not returned by the gallery API.

The gallery uses the linked exact release when one is selected, otherwise the album master. See [release linking and collection sync](discogs-sync.md). Some Discogs entries have no accessible images, especially without authenticated API access.
