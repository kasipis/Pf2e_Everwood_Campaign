# Everwood — local Zoom Map viewer

Work locally only. Do not publish or redeploy unless the user explicitly requests it.

## Start

Requires Node.js 20+. Run `npm install` once to install image processing dependencies. Run `Start-Atlas.cmd` or `npm run dev`, then open
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

## Node deployment

Build command: `npm run build`
Start command: `npm start`

The build produces a portable `dist/` folder containing the Node server, site,
and a snapshot of the current vault. Deploy that folder on a Node.js 20+ host,
then run `npm start` from inside it, or `node server.mjs`. No dependency install
is required for the built folder. The root project also supports `npm start`,
which runs `node dist/server.mjs` after a build. `Procfile` declares that command
for platforms that use it. This configuration does not publish to the old site.

Example from the source project:

```powershell
npm run build
npm start -- --host 0.0.0.0 --port 3000
```

Example after deploying the contents of `dist/`:

```text
node server.mjs --host 0.0.0.0 --port 3000
```

The server prints its actual bound host and port, a local URL, available IPv4
network URLs when listening on all interfaces, and the vault folder in use.
It also provides `GET /healthz` for deployment health checks.

| Setting | Meaning |
| --- | --- |
| `HOST` / `--host` | Bind address. Defaults to `127.0.0.1` locally, or `0.0.0.0` when a hosting provider supplies `PORT` or `NODE_ENV=production`. |
| `PORT` / `--port` | Listening port; defaults to `4173`. |
| `PUBLIC_URL` / `--public-url` | External HTTP(S) origin behind a reverse proxy, such as `https://maps.example.com`. |
| `VAULT_PATH` / `--vault` | Read a live mounted vault instead of the packaged snapshot. |
| `DATA_PATH` | Folder for server-side data; defaults to `.preview-data` next to the build. |

The local development server reads the original adjacent Obsidian vault. The
portable Node server uses `dist/vault` by default. To refresh its snapshot,
rebuild and redeploy; for continuous updates, mount or sync the vault on the
server and set `VAULT_PATH` to that folder.

The Node server has no sign-in layer. For private remote access, configure
access control in your hosting platform or reverse proxy. `PUBLIC_URL` restricts
accepted hostnames and origins; it does not authenticate visitors.

## Map loading performance

The vault index includes PNG, JPEG, GIF and WebP dimensions read from their headers.
Map startup no longer downloads or decodes every map to discover its size. Only
images for the displayed map and its visible overlays are requested. Repeated
renders reuse the displayed image, overlays and unchanged marker elements.

Image URLs contain a content hash. Matching versions use private browser caching;
unversioned requests use ETag revalidation. Replacing an image generates a new URL,
and an old version URL never receives immutable caching for different content.
Image requests reuse the recent vault index rather than scanning the vault for
every asset. The unrelated Zoom Map SVG library folder is excluded from indexing.

On the current vault, the map index builds all 11 maps from metadata with zero
upfront browser image loads, replacing the previous 11 sequential image loads.
This is a request-count check, not a measured end-to-end browser speedup.

Character overview portraits use cached 320px WebP thumbnails, generated during builds and refreshed when vault images change. Full note portraits use their original images. If deploying only dist/, run npm install --omit=dev there before starting the server.
