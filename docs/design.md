# GrooveShelf visual design

The interface treats the collection as a personal record gallery. Expressive headings, quiet surfaces and carefully spaced covers establish the hierarchy; collection controls stay familiar and easy to reach.

## Three appearances

- **Gallery:** warm ivory, bronze actions and a deep green navigation. Serif italic headings give the archive an editorial character.
- **Studio:** cool white surfaces, restrained blue accents and precise sans-serif headings.
- **Listening Room:** deep green surfaces, champagne accents and warm text for an atmospheric evening collection.

Choose an appearance in the top bar. The choice is remembered in the browser and preserves drafts, search and the selected view.

## Layout and interaction

The top bar provides three workspaces: **Collection**, a centered cover wall; **Archive**, the searchable inventory table; and **Listening**, a large album sleeve, artist, copy details and expandable track list. Gallery, Studio and Listening Room apply to all three workspaces. Search and filters survive workspace changes. Sorting offers inventory number, artist, album and year in either direction; copies without a year remain at the end. The sort order is remembered per browser. Favorites, genre and location filters combine with search and missing-information filters. Clear search & filters retains the chosen sort order. The table/grid controls also switch between Archive and Collection.

The tools drawer is available at every screen size through the navigation button. It contains wishlist, discovery, statistics, Discogs sync, labels, bulk editing, exports and settings. Escape returns focus to the opener; background content is inert while the drawer is open.

Listening lets you select an owned copy and open its existing details. Recognized NFC scans update the album directly while Listening is active; in other workspaces they retain the record-detail workflow. The station banner provides real reader feedback and countdowns. Selecting an album or opening Listening does not create a listening event. Missing covers retain a record placeholder, and metadata visibility follows the same expiry settings as the collection.

Covers have a subtle sleeve shadow, expressive titles and quiet copy metadata. Desktop uses four columns, compact screens use three, and phones use two. No remote font service or new image dependency is required.

Dialogs share the same surface, typography and corner treatment. Touch actions retain a minimum 44-pixel height, form text remains readable, and focus outlines remain visible in every theme. Theme changes update button backgrounds immediately to avoid temporarily mismatching dark text with the previous theme’s color. Reduced-motion preferences disable transitions and cover zoom.

The refinement is implemented in `frontend/design.css`, loaded after the shared functional styles. Theme tokens and layout rules are grouped by purpose and responsive size. Fonts use the existing system stacks; no font service, extra image assets or network dependency is introduced.

## Validation

The browser suite covers appearance persistence, unchanged drafts, keyboard navigation, core text contrast, small-screen overflow, Pi settings access, sticky dialog actions and the existing collection workflows. Visual review uses real collection covers at desktop, mobile and Pi sizes.

## Pi startup

Settings → This screen → Startup view selects Collection, Archive or Listening for the current browser. The default, Last collection view, preserves the existing grid/table preference. Startup view is a browser preference, independent of installation-wide Discogs settings; the Pi can start in Listening while a phone opens Collection. Listening remembers the selected physical copy by its fixed ID. A removed copy falls back to the album chooser, and direct record links take precedence over the startup preference. Opening a view or restoring an album does not record a play. The existing `?station=…` address continues to provide reader feedback and the session countdown.
