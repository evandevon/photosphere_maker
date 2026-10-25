# js/app/ map

The page script, split by section. Plain scripts (no modules): top-level `const`/`let`/`function` names are shared by every later file, so load order matters (see index.html). Open only the file you need; use this table to find where a name lives.

Gotcha: at load time a file can't hand over a function from a *later* file as a value (e.g. `addEventListener('change', commit)` in a file before 12-undo.js). Wrap it: `() => commit()`.

Regenerate this table after adding or renaming top-level names: `python3 tools/map.py .` (or update it by hand).

| File | Purpose | Defines |
|---|---|---|
| 01-setup.js | Shared helpers and state: $, G (Geom), R (Sphere), pics, sel, view, look, status(), deg(). Stops the page if WebGL 2 is missing. | `$`, `G`, `glc`, `over`, `stage`, `R`, `COLOURS`, `pics`, `nextId`, `sel`, `view`, `look`, `pic`, `status`, `deg` |
| 02-pictures.js | Adding files (choose or drag): addFiles(). | `addFiles()`, `drop` |
| 03-pasting.js | Ctrl+V paste and the Paste a picture button (files named "Pasted n"); also the picture list listPics() (with each picture's Add / Added button) and removePic(). | `pasted`, `named`, `pasteBtn`, `listPics()`, `removePic()` |
| 04-layouts.js | "What are they?" + adding pictures one at a time: suggestLayout(), HELP, blankBands(), crops, cubeFace(), placePic(x), togglePic(id). | `suggestLayout()`, `HELP`, `layoutHelp()`, `blankBands()`, `crop0()`, `setCrop()`, `cubeFace()`, `layoutType()`, `placed()`, `freeSlot()`, `placePic()`, `togglePic()` |
| 05-drawing.js | render(), sizeCanvases(), changed() (redraw + debounced fill), updateFill(), hex(). | `queued`, `fillTimer`, `render()`, `sizeCanvases()`, `changed()`, `updateFill()`, `hex` |
| 06-outlines.js | Picture outlines and labels drawn on the overlay canvas: project(), edgePoints(), drawOverlay(), label(). | `Gm`, `project()`, `edgePoints()`, `drawOverlay()`, `label()` |
| 07-map-drag.js | Flat map: worldAt(), pieceAt(), pointer dragging, wheel resizing, resize(). | `worldAt()`, `pieceAt()`, `drag`, `endDrag`, `wheelCommit`, `resize()` |
| 08-look-around.js | setView("map" or "look"), hintText(), the view switch buttons. | `setView()`, `hintText()` |
| 09-keys.js | Keyboard: arrow keys etc. on the stage, plus page-wide shortcuts (undo/redo). | `keyCommit` |
| 10-piece-controls.js | select(id), showSel(), and the chosen picture's sliders, crop, kind, hide, bring to front. | `select()`, `SL`, `showSel()` |
| 11-patching.js | Snap together, match brightness, blend (feather), fill the gaps, Straighten it (global rotation). | `stopSnap`, `fillColourSet`, `setFillMode()`, `GL`, `syncGlobal()` |
| 12-undo.js | snapshot(), commit() (call after any change worth undoing), restore(), undo(), redo(). | `past`, `future`, `last`, `snapshot()`, `commit()`, `restore()`, `undo()`, `redo()`, `histButtons()` |
| 13-saving.js | Save button: renderEquirect → JPEG, addPanoTag() writes the GPano XMP 360 label. | `addPanoTag()` |
| 14-samples.js | Sample buttons (fetch from samples/ and lay out). | `SAMPLES` |
| 99-start.js | Runs last: shows the flat map and takes the first undo snapshot. |  |
