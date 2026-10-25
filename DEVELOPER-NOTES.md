# Photosphere Maker: developer notes

Plain HTML, CSS and JS, with no build and no libraries. It uses WebGL 2 with EXT_color_buffer_float. It uses the same "Ember and slate" colour tokens as the 360° tour tools (css/style.css :root). Bump the `?v=` number in index.html on every CSS or JS change (it's currently 20261025g).

## Files (loaded in this order)
| File | What it does |
|---|---|
| js/geom.js (`Geom`) | Rotations and the picture ↔ world ↔ equirectangular maths. Yaw is positive to the left. Equirect u = 0.5 − yaw/360, v = 0.5 − pitch/180. Pieces are `{kind, yaw, pitch, roll, size, aspect, crop[l,r,t,b], gain, hidden}`. Kinds: `photo` (pinhole, size = horizontal field of view), `strip` (cylinder, size = degrees across), `sphere` (equirect, size = degrees across). |
| js/sphere.js (`Sphere(canvas)`) | The GPU blender. Each piece is drawn into an RGBA32F buffer with feathered weights; the COMPOSE pass divides by the weight and fills the gaps (fill modes: 0 black/checks, 1 fill texture, 2 colour). `drawMap`, `drawView`, and `renderEquirect(W,H)` (tiled 1024² so 8192 wide works) and `coverage`. `state.global` is the "Straighten it" rotation. |
| js/fill.js (`Fill`) | Push-pull gap filling (wraps left↔right) and the average colour. |
| js/features.js (`Features.align`) | **Snap together.** Harris corners → steered 256-bit BRIEF fingerprints → matches only between pieces that overlap in the rough layout (angle gate 15°) → RANSAC per pair (Horn's quaternion method) → Gauss–Newton/LM adjustment of every piece's turn plus one shared lens size (pruned and run twice) → safety revert if anything moved implausibly far. Returns `{ok, matches, gapBefore, gapAfter, …}` or `{ok:false, why}`. `opts.debug` collects counts for tests. |
| js/snap.js (`Snap`) | Brightness evening (`gains`), a texture-difference `score` (used in tests), and a re-export of `Features.align`. |
| js/app/*.js | The page, split into one small file per section (setup, pictures, pasting, layouts, drawing, outlines, map dragging, look around, keys, piece controls, patching, undo, saving, samples, start). **See js/app/MAP.md** for what each file does and which names it defines, so you only open the file you need. They're plain scripts that share top-level names, loaded in number order. Regenerate the map with `python3 tools/map.py .` |

## Adding pictures (js/app/04-layouts.js)
There's no "Lay them out" button. Each picture in the list has an **Add / Added** toggle (`togglePic`). The first time a picture is added, `placePic` sets it up according to the "What are they?" choice and puts it in the next free spot (`x.slot = {type, i}`). Pictures already in the scene are never moved. Taking a picture out hides it; adding it again puts it back where it was. The samples add every picture in order, which gives the same result as the old layout.
- **Cube:** goes to the side its name says (front/right/back/left/up/down, south/west/north/east, or 1–6), otherwise the next empty side; square crop, size 90.
- **Ring:** next free place round the circle (360 / number of pictures loaded); size 65 (48 for portrait).
- **Strip:** the first is wrapped round, assuming the phone's view is about 64° tall, so it covers 2·aspect·tan 32° across. Above 330° it's treated as full circle. Extras go above it.
- **Sphere:** the first is the 360° photo; `blankBands()` finds flat black or white rows at the top and bottom, trims them, and moves the pitch so they become gaps for filling.
- **Flat:** the first goes in front with smooth fill.
- **Something else** (and extras beyond the above): where you're looking in Look around, otherwise next along in front.

## Known limits
- Snap needs texture in the overlaps. Blank walls, repeating tiles, or moving people can fail; the message then says so and nothing moves.
- A tilted 360° photo isn't levelled automatically; use **Straighten it**.
- Memory: very big pictures are scaled down (8192 for wide pictures, 4096 otherwise).

## Tests (in the separate tests folder, run from its parent)
- **tests/tps.py:** end to end, for every sample. Saves, checks the XMP tag and size, and measures error against the reference room. The ring's "after" figure is in picture 1's frame, so compare by eye (work/ps-ring-look.png).
- **tests/tsnap2.py, tsnap3.py:** snap accuracy against known poses (0.1–0.5° from errors up to 15°).
- **tests/tpaste.py:** pasting by keyboard event and by the button, file names, and axe.
- **tests/tpsa11y.py:** axe (WCAG 2.1 AA), phone width (no sideways scroll), and keyboard selection.
- **tests/mkroom.py → tests/data/_room-rich.jpg → tests/mksamples.py → samples/:** how the samples are made.
