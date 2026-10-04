# Track lists and durations

Each track can have a side position, title and optional duration. Record details and the Discogs import preview show available durations beside track titles. Missing durations are left blank.

## Manual entry

Enter one track per line in the record editor:

```text
Opening song
A1 | Another song
A2 | Longer song | 3:45
B1 | Extended mix | 1:02:03
```

Use `m:ss` or `h:mm:ss`, with two digits for seconds (and two minute digits in hour notation). To add a duration without a position, use `| Title | 3:45`. Remove the final duration segment to clear a duration. Saving changes to other fields keeps existing track durations.

Untouched imported track titles containing `|` are retained as stored. For new lines, a valid final time segment is interpreted as a duration; other pipe text remains part of the title. A final time segment with invalid minutes or seconds produces a validation message.

## Discogs

Durations are read from the selected master or release's track list where available. Sub-tracks keep their own durations; heading or parent durations are not assigned to child tracks. Invalid or missing values are omitted rather than estimated. Existing records acquire provider durations when their metadata is refreshed; refreshing uses the existing provider behavior and limits.

Track lists are protected as a whole when manually corrected. A duration correction therefore also protects that track list from later provider refreshes. Expired unprotected provider tracks and durations are hidden together; protected personal tracks retain their durations.

## Data compatibility and exports

Older track objects with only `position` and `title` remain valid. Nonempty durations are stored as an optional `duration` string in each track object. Missing durations are omitted from API and JSON/CSV track objects, preserving the earlier shape. Database schema version 9 is unchanged.

JSON and CSV retain durations inside track arrays. Printable HTML catalogs show durations next to track titles. Portable ZIP archives preserve them through verification and restore.

Songwriter, producer and other provider-derived credits are available in a separate disclosure; see [album and track credits](credits.md).
