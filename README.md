# Everwood

Campaign notes and interactive maps from the adjacent `Obsidian Campaign` vault.

## Run

Requires Node.js 20+. Double-click `Start-Atlas.cmd`, or run `npm run dev`.
Open http://localhost:4173 and keep the server running. Restart the server
and reload the page after changes to the site code.

## Vault sync

Notes and images update every two seconds. Additions, edits, moves and deletions
are reflected automatically. Notes under `Maps/`, including subfolders, appear
in My maps and open in the atlas layout. Other notes appear in Notes.

Pictures support Obsidian embeds and Markdown image syntax. Fenced `leaflet`
blocks support image maps, height, inline bounds and marker declarations.
Saved markers are also read from the Obsidian Leaflet plugin's data.json,
matched by map ID and image layer, and positioned using Obsidian coordinates.
Edit imported markers in Obsidian. Changes sync without importing or rebuilding.

## Navigation

Click a pin to open its linked note or map immediately. Back appears inside the bottom-left of the Leaflet map when a previous map
is available. It restores the previous map position and zoom, including chains
of linked maps. All maps opens the map gallery.

The interface has no import, Add a map, Add pin, Layers or Fit map controls.
Zoom and pan remain available. Hide markers beside the zoom buttons toggles
map markers without changing the image or location list. There is no bundled sample world.

## Storage and checks

Vault access is read-only. Existing site pins and site data are stored in
`.preview-data/`. Obsidian settings are excluded except for the Leaflet plugin's
saved map-marker data. Plugin code is never executed.

Run `npm test` and `npm run validate` to check the client, local API, marker
sync, map navigation and build artifact. Browser internet access is required
for Leaflet, Marked and DOMPurify.

This folder connection applies to the local site. A remotely hosted site
cannot read the folder on your computer. The existing private Site identity
is retained in `.openai/hosting.json`; these local updates are not deployed.

Below each vault atlas map, the site displays the ordinary note with the same
filename (for example, Maps/Harjah.md uses Locations/Harjah.md). The panel supports
Markdown, images and links, omits duplicate Leaflet blocks, and refreshes with
vault edits. It is hidden when no matching ordinary note exists.

Notes open as full pages in the main content area. Their images, links and
inline maps remain available, and edits sync while the note is open.

Marker types, icon names and bubble colors come from the
Obsidian Leaflet default marker and markerIcons settings. Type labels are
preserved in the sidebar. Font Awesome supplies the matching icon glyphs on
both atlas maps and inline maps. Changing type settings also triggers live sync.

Marker glyphs are white and centered at a consistent size inside the colored
bubble. The bubble fill uses the color assigned to its type in Obsidian.
