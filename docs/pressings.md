# Release and pressing details

The **Release & pressing** section separates the original release year reported by the Discogs master from the year, country and catalog numbers of your selected release. The existing editable **Saved year** remains independent; changing it does not rewrite provider facts.

Use **Choose Discogs release** in record details, enter a Discogs release ID and review the preview before confirming. Compare its country, catalog number and release page with your sleeve and labels. Selecting a release retains local corrections, your LP number, NFC assignment and listening history. A master identifies an album; its main reference release is never treated as your physical pressing.

Missing values are labeled explicitly. A selected release without a master has no original-year value. A failed optional master lookup leaves the pressing import usable. Discogs master years reflect its database and may be incomplete or inaccurate; the original-year link identifies the source. Catalog numbers are deduplicated, bounded and omit common absent-value markers. These facts do not automatically identify a pressing from a barcode or matrix number.

## Refresh and exports

Provider fields are read-only and cached with the existing metadata policy. Older imports acquire them at their next Discogs refresh. Expired provider facts disappear until refreshed, independently of protected saved-year corrections. No database migration is required; schema versions 9 and 10 and old archives remain compatible.

Public records and JSON exports include `original_year`, `original_year_source_url`, `pressing_year`, `country` and `catalog_numbers`. CSV appends these columns, encoding catalog numbers as a JSON array. Printable catalogs include the facts and original-year source. ZIP archives retain the metadata for full restore.

Expired saved provider data can remain visible when the installation opts into [displaying saved Discogs snapshots](settings.md). The default still hides expired details.
