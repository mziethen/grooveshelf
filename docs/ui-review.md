# Usability review — October 2026

The review covered the collection, record details, capture flow, navigation and themes at desktop, phone and Raspberry Pi screen sizes. The visual direction remains Gallery, Studio and Listening Room. The principal usability problem was the accumulation of features without a matching hierarchy: tiny functional text, long scrolling paths to routine actions and too many equally weighted controls.

| Finding | Change | Issue |
| --- | --- | --- |
| Functional text often measured 8–12px; filters were small touch targets. Decorative header space displaced the collection on Pi. | Larger functional text, 16px form inputs, comfortable control targets, compact small-screen headers and grouped exports. Settings remains visible on Pi. | [#83](https://github.com/mziethen/grooveshelf/issues/83) |
| Search and filters lacked a single reset; a first loading failure could look like an empty collection. | Clear search & filters, an actionable no-result state, distinct connection failure and Retry loading. Existing results remain visible after later failures. | [#84](https://github.com/mziethen/grooveshelf/issues/84) |
| Editing, favorites and QR were buried beneath long track lists. Delete appeared alongside routine controls. | Record overview followed by primary actions and personal/listening details. Pressing facts precede tracks. Less frequent Discogs actions and separately grouped deletion appear in Manage record near the overview. Close remains reachable while scrolling. | [#85](https://github.com/mziethen/grooveshelf/issues/85) |
| Lookup appeared before the inputs it needs. Save/cancel were at the end of a long form. | Artist and album first, then inventory/format/year and optional lookup. Named form sections, a persistent action bar and one primary Save record action. | [#86](https://github.com/mziethen/grooveshelf/issues/86) |

Native disclosures support keyboard interaction. Mobile navigation includes their summaries in its focus loop. Manage record starts closed on a newly opened record and retains its state and focus during same-record updates. Credits retain their existing independent disclosure behavior. Dialogs identify the current record or editor mode through accessible names.

Validation includes all three themes at 320×700, 390×844, 1024×600 and 1440×900; reset/debounce behavior; initial failure/retry; native disclosure keyboard interaction; sticky save and close controls; and preservation of every existing browser workflow. Tests use disposable or synthetic collection data. This is a design and implementation review, not a substitute for usability testing with household members or a complete accessibility conformance audit.
