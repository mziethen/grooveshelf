# GrooveShelf visual design

The interface treats the collection as a personal record gallery. Expressive headings, quiet surfaces and carefully spaced covers establish the hierarchy; collection controls stay familiar and easy to reach.

## Three appearances

- **Gallery:** warm ivory, bronze actions and a deep green navigation. Serif italic headings give the archive an editorial character.
- **Studio:** cool white surfaces, restrained blue accents and precise sans-serif headings.
- **Listening Room:** deep green surfaces, champagne accents and warm text for an atmospheric evening collection.

Choose an appearance in the top bar. The choice is remembered in the browser and preserves drafts, search and the selected view.

## Layout and interaction

Covers have a subtle sleeve border and shadow. Collection metadata uses fine dividing lines rather than heavy card containers. Filters are compact chips with explicit selection states. The decorative record rings appear only on roomy desktop screens. Compact Pi layouts retain four covers per row and reachable settings; phones use two covers per row and a navigation drawer.

Dialogs share the same surface, typography and corner treatment. Touch actions retain a minimum 44-pixel height, form text remains readable, and focus outlines remain visible in every theme. Theme changes update button backgrounds immediately to avoid temporarily mismatching dark text with the previous theme’s color. Reduced-motion preferences disable transitions and cover zoom.

The refinement is implemented in `frontend/design.css`, loaded after the shared functional styles. Theme tokens and layout rules are grouped by purpose and responsive size. Fonts use the existing system stacks; no font service, extra image assets or network dependency is introduced.

## Validation

The browser suite covers appearance persistence, unchanged drafts, keyboard navigation, core text contrast, small-screen overflow, Pi settings access, sticky dialog actions and the existing collection workflows. Visual review uses real collection covers at desktop, mobile and Pi sizes.
