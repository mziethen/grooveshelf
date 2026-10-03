# Listening suggestions

**What should I play?** chooses a random physical copy from the owned collection and shows its available cover, artist, album title, LP number and lifetime play count. Wishlist entries are excluded. Suggestions and opening record details never create a play.

Choose one of four groups:

- **All owned records**: every physical copy, independently of collection search or incomplete-entry filters.
- **Never played**: copies with zero recorded plays.
- **Least played**: all copies tied for the lowest lifetime play count, including never-played copies.
- **Not played in 30 days**: copies whose last recorded play is at least 30 elapsed days ago, plus never-played copies. Boundaries use UTC instants, not calendar months.

**Another suggestion** excludes the previous copy when other eligible copies exist. A group with only one copy returns that copy again. Selection is uniform across eligible copies; different copies of the same album are separate candidates.

Groups use current persisted listening history and therefore reflect manual corrections. Pending NFC sessions are not plays until completed. Empty collections and groups show an explanation. A request failure shows feedback and can be retried.

Suggestions use local data without contacting metadata providers. Expired Discogs metadata is hidden while personal corrections remain visible; the preview also hides provider content when its expiry is reached. **Open record** opens normal details, where the usual metadata refresh behavior applies.

Tests cover candidate boundaries, ties, avoiding the previous copy, single-copy and empty groups, live play counts, no play creation, expired metadata and no upstream requests. Browser coverage includes all modes, another suggestion, empty states, details and mobile layout.
