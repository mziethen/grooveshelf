# Album and track credits

Record details and the Discogs preview include a collapsed **Album & track credits** section when credits are available. Open it to see credited names, roles and any scope supplied by Discogs. The native disclosure supports keyboard navigation; long text wraps on small screens. An open disclosure and its keyboard focus survive background refreshes while credits remain available.

## Source and scope

GrooveShelf imports `extraartists` from the selected Discogs entry and its track list, including sub-tracks. Names use the credited name variation where present. Roles such as `Written-By`, `Producer`, `Arranged By` or instruments retain their provider wording. Exact duplicate name/role/scope entries are removed, and the list is limited to 300 credits.

Album-level credits can carry a scope such as `A1 to B2`; track-level entries use their supplied scope or track position/title. Parent credits retain their parent scope. GrooveShelf does not expand ranges, infer authorship, or copy parent credits into every child track.

When importing a master, available credits from its main reference release are used and explicitly labeled **Credits from the reference release; your pressing may differ.** The attribution link points to that release. If the reference release has no credits or cannot be fetched, available master credits keep their master source. A selected release uses its own credits and source.

## Refresh, editing and expiration

Credits are provider-derived and read-only, like genres and labels. Editing personal fields or a track duration preserves them. Metadata refresh replaces credits from the provider independently of protected artist, title, year or track corrections. Existing imports can acquire credits at their next metadata refresh.

After provider metadata expires, credits and their source field are hidden until refreshed. Protected personal track titles and durations remain available. Missing credits produce no empty disclosure or invented values.

## API and exports

Public records expose `credits`, an array of objects with `name`, `role` and `tracks` (scope text, empty for unspecified scope), and `credits_source_url`. JSON exports retain these fields. CSV appends a JSON-encoded `credits` column and a `credits_source_url` column to the previous fields. Printable HTML catalogs include the credit list and source as text, with all collection content escaped.

Credits are stored in the existing album metadata. Schema version 9 and old records remain compatible; older records expose an empty credit list. Portable ZIP archives preserve credits through verification and restore.

Expired saved provider data can remain visible when the installation opts into [displaying saved Discogs snapshots](settings.md). The default still hides expired details.
