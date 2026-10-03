# Barcode and catalog-number lookup

The add-record editor provides **Find by identifier** alongside normal artist/title search. Choose **Barcode** or **Catalog number** and enter the printed value. Barcodes retain leading zeros; spaces and hyphens are removed before search. Barcode input accepts 6–32 ASCII digits. Catalog numbers retain meaningful punctuation and spaces.

A USB scanner that types into the focused identifier field and sends Enter starts the lookup without submitting the record form. Camera-based scanning is not included.

Results are Discogs releases with available year, country and catalog number. Multiple results can share an identifier. Select a result to preview its tracks and covers, then explicitly choose **Use these details**. Saving stores the exact release reference, with its master reference when available, and preserves edited fields. Barcode matches alone do not verify the pressing: compare the result and its Discogs page with your physical record.

Pagination retains the identifier query. No matches or an unavailable provider leave manual entry and artist/title search available. Searches require a server-side Discogs token. Search input is not persisted as an additional personal field. Rapid capture clears the selected release between copies, and duplicate warnings check both master and release references.

Validation covers parameter normalization, leading zeros, invalid input, pagination, release-only results and exact-release saving. Browser coverage checks scanner-style Enter, preview without saving, explicit confirmation, retained release ID, manual correction, provider attribution, covers and metadata expiry. A read-only lookup against the live Discogs API also succeeded.
