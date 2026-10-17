# Find an album from a cover photo

In **Add a record → Find album details**, open **Find an album from a cover photo**. Choose a JPEG, PNG or WebP image, or take a photo on a supported phone. Use **Read cover text**, correct the extracted artist/title text, then choose **Find matching albums**. Select a Discogs result and confirm **Use these details**. Review the draft and save the record separately.

For sideways or upside-down artwork, use **Rotate photo 90°** until the preview is upright. Both OCR and saved-cover comparison receive the prepared image. Rotation happens locally in your browser, leaves the original file unchanged, and clears results from the previous orientation. Each turn is rendered from the original rather than repeatedly recompressing an intermediate image. **Restore original photo** restores the original bytes. Prepared images are resized to at most 2048 pixels per side and use JPEG with a white background for transparency. Rotation itself does not contact the server.

## Scope and feasibility

This first implementation uses local optical character recognition (OCR), not reverse-image matching. It can suggest albums when a cover has readable artist/title text. Textless artwork, elaborate lettering, glare, perspective and low contrast can prevent recognition. Photograph the cover straight-on in good light. Correct noisy text or use the existing manual, barcode or catalog-number searches when needed. Album artwork cannot establish the exact pressing; use **Choose Discogs release** separately.

Tesseract is a free, open-source OCR engine. Discogs supplies album candidates through its existing authenticated database search, using the server's `DISCOGS_TOKEN`; there is no paid vision service or image-search account. No freely usable general cover-image recognition API was verified for this implementation. This is an assisted lookup, and does not claim a confidence score or guaranteed match.

## Compare saved collection covers

After choosing a photo, use **Compare saved collection covers** for a local visual comparison. This also works without readable text, but only when a similar cover is already saved in your collection. Review the suggested titles and LP numbers, then explicitly open a record. Opening a saved record closes the unsaved entry draft; it never adds or merges copies. Duplicate physical copies remain separate suggestions.

The comparison uses a small grayscale difference hash and a coarse color-layout comparison, with conservative fixed thresholds. These are similarity heuristics, not calibrated probabilities. Uniform/very low-detail photos are rejected. Perspective, cropping, lighting and similar artwork can produce missed or incorrect suggestions. Photograph just the cover, straight-on and well-lit. This does not search an online artwork catalog or identify an exact pressing.

Selected personal covers take precedence. Provider covers must already exist locally and meet the current saved-data display policy; expired images are skipped unless displaying older saved data is enabled. Missing, corrupt or unselected photos are not fetched. Neither comparison nor its result list makes provider requests or stores image features, uploads or new photos. Opening a chosen record uses the normal detail-view refresh behavior.

Each backend process permits one visual comparison at a time. At most 500 usable cover comparisons are processed, with a ten-second budget checked between images. A partial-comparison notice indicates that more copies may match. Up to ten suggestions are shown, along with counts for matches, compared covers and unavailable covers. These processing limits and conservative thresholds suit a small local collection; they are not an accuracy guarantee for large libraries.

## Installation

The Docker backend includes Tesseract and English recognition data on both supported architectures. For local development, install it on the backend host:

```sh
# macOS with Homebrew
brew install tesseract

# Raspberry Pi OS / Debian / Ubuntu
sudo apt-get update
sudo apt-get install tesseract-ocr tesseract-ocr-eng
```

English recognition data is used initially. Latin-script artist/title names may work in other languages, but this does not provide comprehensive multilingual recognition. Restart `./dev.sh` after installation if necessary. `GET /api/capture/cover-text/status` reports executable availability; recognition reports missing language data or runtime errors separately. Missing OCR leaves existing lookup and manual capture available.

## Photo handling and confirmation

- Photos go only to your GrooveShelf backend, never to Discogs or another image service. The photo is not attached to a record or stored in the database or backups.
- Input is limited to 5 MiB, a single still image, at most 24 megapixels and 8192 pixels on either side. Existing photo decoding removes camera metadata, handles orientation and resizes to at most 2048 pixels.
- One OCR operation runs per backend process, with one OpenMP thread and a 20-second execution timeout. Temporary OCR output is removed after reading, with response text limited to 300 characters. Logs and error responses do not include raw OCR diagnostics.
- Only the reviewed search text is sent to Discogs, after **Find matching albums**. Rate limits, metadata preview expiry, attribution and normal provider errors apply.
- Photo candidates always require explicit detail confirmation, including when direct import is enabled in Settings. No photo upload, recognition or search saves a record, changes an existing copy, or sends collection writes to Discogs.
- Closing the editor clears the photo/text and discards late responses. A no-text result permits correction or a different photo; it does not invent an album.

## Validation

Backend tests cover image validation, missing OCR, bounded execution, busy/error recovery, no provider access during OCR, reviewed text search, and a real synthetic printed-cover recognition test. CI installs Tesseract to exercise the real binary. Browser tests cover upload errors, no automatic search/save, corrected text, forced detail confirmation, retry, blank text, stale responses, and three responsive themes. These tests do not establish recognition accuracy across real-world album artwork.

Sources: [Tesseract documentation](https://tesseract-ocr.github.io/tessdoc/), [command-line usage](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html), [Discogs database API](https://www.discogs.com/developers#page:database,header:database-search).
