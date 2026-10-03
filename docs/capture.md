# Rapid entry and duplicate warnings

The record editor suggests the first free inventory number. **Suggest a free LP number** requests another suggestion. Suggestions are not reservations: saving still checks that the number is unique. After **Save and add another**, the editor stays open and suggests the next free number, wrapping around at LP-99999.

The next draft keeps the record format. **Keep artist for the next record** also retains the artist. Album title, year, tracks, Discogs selection, cover selection, rating, condition, storage location and notes are cleared. Regular **Save record** opens the saved record as usual. Wishlist acquisition uses regular saving.

Possible duplicates appear while entering an artist and title or selecting a Discogs album. Matches use the same Discogs master/release reference, or equal artist and title after ignoring case, punctuation and extra spaces. Matching an album does not establish that two pressings are identical. The panel links to existing LP numbers without discarding the draft.

When creating a copy, confirm **I am adding another physical copy** if matches exist. Editing excludes the current copy and does not require this confirmation. Duplicate checking is advisory; if it is unavailable, the editor reports this and still allows saving. The API permits additional physical copies.

Checks use local collection data without contacting Discogs. Expired provider fields are hidden in results, while saved personal corrections remain visible. Results show up to 50 matches and the total count. Fuzzy matching and automatic record merging are outside this feature.

Validation covers free-number selection and wrapping, source and normalized-name matches, additional-copy creation, stale metadata, consecutive capture, cleared fields, duplicate confirmation, editing and late suggestion responses that must not overwrite typed inventory numbers.
