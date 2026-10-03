# Listening statistics

**Listening statistics** displays recorded listening events. These represent NFC timers that completed and manually entered events, not verified audio playback. Pending and canceled sessions do not count.

**Most played copies** ranks currently owned physical copies by events in the selected date range. Copies of the same album remain separate and are labeled with their LP numbers; ties sort by inventory number. **Plays by month** groups events in Europe/Berlin, including daylight-saving changes. Months without events are omitted. Removed-copy events remain in monthly totals and are reported separately, but removed copies do not appear in the ranking.

The optional **From** and **Through** dates are inclusive local calendar dates. Either boundary can be omitted. **All dates** clears both. Invalid or reversed ranges show an error. **Never played · lifetime** lists owned copies with no events in their entire recorded history, independently of the date range. Empty history and empty groups have explanatory messages. Listed records open normal details without recording plays.

Statistics are recalculated on every request and reflect manual additions, timestamp edits and removals. Reopen the dialog or apply dates to refresh it after a correction. The dialog uses local data without provider requests. Expired provider labels are hidden, and results are cleared when displayed provider metadata expires; personal corrections remain available on refresh.

Tests cover inclusive local boundaries, UTC events crossing month boundaries, summer time, per-copy ranking, lifetime never-played behavior, manual corrections, retained events from removed copies, empty data, invalid ranges and no provider requests. Browser coverage checks date selection, clearing, corrections, details navigation and mobile layout.
