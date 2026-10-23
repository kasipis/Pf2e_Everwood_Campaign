# Everwood — local Zoom Map viewer

Work locally only. Do not publish or redeploy unless the user explicitly requests it.

## Start

Requires Node.js 20+. Run `Start-Atlas.cmd` or `npm run dev`, then open
http://localhost:4173. Keep the server running. Restart it and reload the browser
after changes to the site code.

## Renderer

The standalone, read-only Zoom Map-compatible DOM renderer is embedded in the
site. It uses image pixels from the top-left and a zoom scale multiplier, matching
Obsidian Zoom Map's coordinate model. It does not load an external map library or
execute Obsidian plugin code.

Supported features:
- Drag to pan, wheel/pointer zoom, double-click zoom, keyboard pan/zoom, touch pinch.
- Normalized markers, note/map links, tooltips and per-marker zoom visibility.
- Marker icons from the Zoom Map settings; white glyphs inside colored bubbles.
- Back inside the lower-left corner, with map position and zoom restored.
- Hide/show markers beside the zoom buttons.
- Responsive fit mode, resize handling, active base image and visible image overlays.
- Full note pages and a matching note description beneath each map.

Only `zoommap` and `zoom-map` blocks are rendered. The Maps gallery includes only
notes containing these blocks. Vault notes and installed plugins are not modified
by the renderer migration. Drawings, grids, text-layer editing, measurements and
travel tools are not implemented in this read-only viewer.

## Vault data

The local server reads `../Obsidian Campaign` every two seconds. Markers come from
`<image>.markers.json`, an explicit `.markers.json` sidecar, or inline `storage: note`
data. Hidden marker layers are respected. Image, note, sidecar and icon-setting
changes are included in live sync. Vault access is read-only.

Map notes stay under My maps. Clicking a marker opens its linked map or note
immediately. The sidebar is sorted by marker type, then by name. An ordinary note
with the same filename as a Maps note is shown below that map.

## Source and verification

- `worker/zoom-map-renderer.js`: viewport, gestures, controls and marker display.
- `worker/note-media.js`: native Zoom Map parsing and data adaptation.
- `scripts/vault-sync.mjs`: read-only vault and marker-file synchronization.
- `worker/app.html`: site interface and page navigation.

Run `npm test` and `npm run validate`. Tests cover the native coordinate system,
zoom anchoring, marker visibility, dragging, pinch, resizing, Back navigation,
inline and sidecar markers, note pages and the local HTTP API. Browser visual QA
is unavailable in this environment. Marked, DOMPurify and Font Awesome still load
from their CDNs; the map renderer itself has no external dependencies.

The previously deployed website is unchanged. The saved hosting identity is kept
for reference; local builds do not push or deploy anything.
