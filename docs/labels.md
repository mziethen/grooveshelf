# Inventory labels

**Print labels** loads the owned collection independently of collection search or filters. Find LP numbers, check individual copies, use **Select visible**, or **Clear selection**. Filtering preserves already selected copies. Plain labels contain the inventory number. Optional QR labels also encode the configured collection origin and stable copy ID; artist, album, metadata, NFC UID and credentials are excluded. Inventory order determines label order.

Configure A4 or Letter paper, label width and height, column count, symmetric horizontal/vertical margins and gaps in millimeters. Defaults are A4, three columns, 63.5 × 38.1 mm labels, 7 mm side margins, 15 mm top/bottom margins, 2 mm horizontal gap and no vertical gap. These are editable starting values, not a guarantee of compatibility with a particular manufacturer's label stock.

**Used labels on first sheet** skips positions in row-major order, starting at the top left. It must be less than the sheet capacity. Rows and page count are calculated automatically from the dimensions. Layouts that exceed the printable page geometry are rejected. Later sheets start at their first position. Only required pages are generated.

**Build preview** creates a document with exact millimeter geometry. Changing selection or layout invalidates the preview to prevent printing an earlier selection. **Print labels** opens the browser print dialog for that document. Choose the configured paper, 100% / actual size, no browser headers or footers and no print-dialog margins: the document includes its own margins. Check alignment on plain paper before using label stock, since printer feed and printable margins vary. Browser print dialogs can also save as PDF.

**Download printable HTML** saves a standalone UTF-8 document with embedded print styles and no scripts or external dependencies. Open it in a browser to preview and print. Dashed cell boundaries appear on screen and are omitted from print. Printing and downloading do not alter collection data. Optional QR links are described below.

Validation covers page geometry, overflow, first-sheet skipped slots, pagination, Letter dimensions and invalid inventory numbers. Browser tests cover empty collections, selection and filtering, preview invalidation, print dispatch, a standalone download, error feedback and mobile layout. A physical printer has not been tested.

## Optional QR codes

Enable **Include QR record links** and set the collection address to a hostname or LAN IP reachable by your phone. Build the preview again after changing the address. Codes refer to internal copy IDs and survive LP-number changes. QR size checks reject labels that are too small or dense. See [QR usage and print guidance](qr-codes.md).
