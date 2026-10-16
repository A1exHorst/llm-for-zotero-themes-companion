# Validation

- Host: Zotero 10.0.6 on Windows, isolated scaffold profile.
- Original plugin: LLM for Zotero 3.9.12, upstream commit
  `435dd1928949ddb9361c2039da3d1ac96034c300`, with production source unchanged.
- Companion XPI installs alongside the original with a different add-on ID.
- TypeScript check and 19 custom CSS compiler tests pass.
- Eight native Zotero compatibility tests pass:
  - Both add-ons active; original function hooks unchanged.
  - All 20 palettes on the original sidebar and standalone chat.
  - Actual original model and reasoning selection under Aurora Glass,
    including pointer hit testing.
  - Native Customization gallery at 800px and 1100px window widths, local
    preview, live apply, and independent preferences pane.
  - CSS editor precedence, isolation, invalid input rejection, and clearing.
  - CSS file import, explicit save, and live application.
  - Newly opened document window and dynamically inserted dialog overlay.
  - Disabling removes styles and injected controls; re-enabling restores saved
    appearance; original plugin stays active.

Tests create fixture papers and use mocked model catalogs. They do not read a
personal library or call a paid model.
