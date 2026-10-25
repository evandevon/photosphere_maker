# Photosphere Maker

A free, no-sign-in web page that makes a 360° photo (a "photosphere") from whatever pictures you have. Nothing is uploaded: everything happens in the browser.

It works with:
- **a phone panorama** (one long, thin picture): it's wrapped round, and the missing floor and ceiling are filled in.
- **photos taken while turning on the spot**: lay them out roughly, then **Snap together** lines them up.
- **six views of a cube** (Minecraft, games, 3D programs: front, right, back, left, up, down).
- **one ordinary photo**: the rest of the room is filled in with colour flowing in from its edges.
- **a 360° photo that needs fixing**: one that's tilted, the wrong shape, or has black bands where the floor or ceiling is missing.

## The four steps
1. **Add your pictures** by choosing files, dragging them in, or pasting screenshots (Ctrl+V, or the **Paste a picture** button). Then say what they are and press **Add** next to each picture to put it in the scene (press it again to take it out).
2. **Place them roughly.** Drag each picture on the flat map, or use its sliders or the arrow keys. Overlap neighbours a little.
3. **Patch them together.** Use **Snap together**, **Even out the brightness**, **Blend the joins**, choose how gaps are filled, and **Straighten it**.
4. **Save.** You get a JPEG twice as wide as it is tall, tagged as a 360° photo, so Google Photos, Facebook and 360° tour makers recognise it.

## Hosting
Put the folder on any static host, such as GitHub Pages. There is no build step. Works best in Chrome or Edge on a computer; needs WebGL 2.

## Tips for good results
- Turn on the spot: twist around the phone, not around your body.
- Lock the exposure if you can, and overlap each photo with the next by about a third.
- Blank walls and repeating patterns (bricks, tiles) are hard to snap. Place those by hand.

## Minecraft (or any game)
Set FOV to 90 and press F1 to hide the hand. Face each way exactly with `/tp @s ~ ~ ~ 0 0` (front), `90 0` (right), `180 0` (back), `-90 0` (left), `0 -90` (up) and `0 90` (down). Screenshot each one and paste it in that order, then choose **Six views of a cube**. Pasted pictures are named Pasted 1, 2, 3… and the cube layout uses that order.
