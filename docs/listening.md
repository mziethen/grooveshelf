# Listening stations and NFC

## Implemented software scope

The backend manages tag associations, persistent ten-minute listening sessions, history, manual corrections and favorites. The station browser follows incoming scan events and opens the associated record. A reader bridge interface and test-scan command are included.

The physical PN532 adapter and wiring are **not implemented or hardware-tested yet**. The user's module is not connected and its exact board/interface is unknown. Issue NFC-01 remains open. No GPIO or device access is added to Compose at this stage.

## Selected listening behavior

- A known tag starts a session on its source station, due after ten minutes.
- Repeated scans of the current record do not restart the countdown or create another session, including after completion.
- Scanning a different known record cancels an unfinished session and starts the new one. A session that already reached its threshold counts before switching.
- Unknown tags produce assignment feedback and leave an existing valid session unchanged.
- **Cancel listening** cancels a pending session without creating a play.
- **End session** clears a completed session without deleting its history. End the session before replaying the same record.
- Removing the tag from the reader does not cancel a session; it is normal to scan briefly and then play the record.
- Restarting the backend resumes persisted sessions. An overdue session produces one event at its due timestamp. This is scan-based listening tracking, not audio detection.

The first two core behaviors and cancellation on record change were confirmed by the user. Explicit ending before repeating the same completed record is the initial duplicate-prevention rule; it can be refined later.

## Pi screen

Open the station URL in the Pi browser:

```text
http://<pi-address>:8080/?station=pi-main
```

The station page polls once per second. Incoming known scans open the record details and show a countdown in the detail dialog. Unknown tags can be assigned from the station panel or detail dialog. The selector searches inventory number, artist and album, shows the existing tag, and requires explicit replacement confirmation. Failed saves retain the draft for retry; saving alone does not start a listening event. A successful assignment identifies the record and remains visible through idle heartbeats until another scan. New scans never change the UID already being confirmed in an open dialog. Scans do not interrupt an open editing/assignment dialog; navigation catches up afterward. Normal collection browsers without the station query parameter do not follow scans.

`pi-main` is the initial stable station ID. Timers and events are scoped by station. Only one station is configured for users; registration and management of more stations remain future work.

## Tags

Supported UID representations are 4, 7 or 10-byte hexadecimal identifiers, including colon, hyphen or whitespace separators. [NTAG213 uses a manufacturer-programmed seven-byte UID](https://www.nxp.com/products/NTAG213_215_216); confirm its representation in the reader output during hardware setup.

Assign or replace a tag from record details. Replacement requires explicit confirmation and preserves record IDs and listening history. A tag associated with another record cannot be silently reassigned: remove its current association first. Removing a tag does not delete its record or history.

The initial workflow uses the tag UID and does not write URLs or inventory numbers into tag memory. Tag writing and QR labels remain separate future features.

## Test scan without hardware

On a disposable collection, assign an example UID to a record, open station mode and send:

```sh
python scripts/nfc_bridge.py --uid 04112233445566 --url http://127.0.0.1:8080
```

The station displays test-scan mode. The real ten-minute delay applies. Cancel the session after testing to avoid an unwanted history entry. No hardware has been read by this command.

## Reader adapter boundary

A future installed adapter module exposes a factory that returns an object with:

```python
def read_uid(timeout: float) -> bytes | str | None:
    # Return a UID for a present tag, or None when no tag is present.
    ...
```

The bridge can then run with `--reader module:factory`. It reports a heartbeat every five seconds, emits scans on tag-presence edges, and reports reader failures. The server marks a connected reader disconnected if heartbeats stop for over fifteen seconds. Connected, test mode, disconnected and reader-error states have separate accessible feedback. Status announcements change on events rather than every countdown tick. Disconnection and read errors ask users to check the cable/reader and restart the bridge; the bridge does not automatically recover from reader exceptions. Station API failures disable stale scan-assignment controls and offer **Check station again**, alongside the existing automatic checks. Recovery restores those controls without a page reload. Reader disconnects do not cancel a previously started listening session. The adapter and its dependencies must be chosen after identifying the physical PN532 module; the supplied bridge alone is not a PN532 driver.

## History and favorites

Record details show count, last played and listening events. Add a missed play, edit a timestamp, or remove an incorrect event with confirmation. Counts and last-played values are derived from remaining events. Manual and NFC-generated events are distinguished. Favorites persist through edits and restarts.

Deleting a physical copy removes its tag association and sessions. Historical events retain their original inventory-number snapshot with an empty copy reference; they are never assigned to a new copy that reuses that number. There is not yet a global interface for those removed-copy events.

## Persistence and tests

Schema version 3 migrates both versions 1 and 2 while preserving records, notes and Discogs metadata. The timer worker runs once per second; API reads also reconcile due sessions. SQLite transactions and a unique session-to-event constraint prevent duplicate events across worker retries or restarts.

Automated tests use a controlled clock to check the exact ten-minute boundary, repeated scans, switching, cancellation, restart recovery, history correction, tag replacement, station isolation, heartbeats, favorites and inventory-number reuse. Browser fixtures verify station navigation and editing controls without touching hardware.

NFC-04’s guided assignment and reader feedback are implemented and tested at the software boundary. Physical PN532 compatibility remains unverified under NFC-01. Browser regression tests cover searchable selection, confirmation, replacement conflicts, failed-save retries, persistent assignment feedback, API recovery, captured scan UID, active sessions, all themes and mobile/Pi layouts.
