/* js/app/04-layouts.js · "What are they?" + adding pictures one at a time: suggestLayout(), HELP, blankBands(), crops, cubeFace(), placePic(x), togglePic(id).
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- layouts
function suggestLayout() {
  const n = pics.length, a = n ? pics[0].p.aspect : 1;
  let v = 'free';
  if (n === 1) v = Math.abs(a - 2) < 0.15 ? 'sphere' : a > 2.5 ? 'strip' : 'flat';
  else if (n === 6) v = 'cube';
  else if (n > 1) v = 'ring';
  document.querySelector('input[name=layout][value=' + v + ']').checked = true;
  layoutHelp();
}
const HELP = {
  sphere: 'It will be placed as a whole 360° photo. Then straighten it, and fill any gaps, in step 3.',
  strip: 'It will be wrapped round you. If it didn’t go all the way round, make it smaller (step 2) until the join matches.',
  cube: 'Add them in this order: front, right, back, left, up, down (or name them front, right… or north, east…). Each one goes to the next empty side of the cube, trimmed to a square.',
  ring: 'Each one you add goes next round the circle, turning to the right. Each should overlap the next by about a third.',
  flat: 'It goes in front of you; the rest of the room is filled in smoothly from its edges.',
  free: 'Each one goes where you’re looking (in Look around) or next along in front of you: drag it to where it belongs.'
};
function layoutHelp() { const v = document.querySelector('input[name=layout]:checked'); $('layout-help').textContent = v ? HELP[v.value] : ''; }
document.querySelectorAll('input[name=layout]').forEach(r => r.addEventListener('change', layoutHelp));

// rows at the top and bottom that are all one flat dark (or blank) colour: [top, bottom] as fractions of the height
function blankBands(x) {
  const W = 256, H = Math.round(256 * x.h / x.w), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(x.source, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const blank = y => {
    let s = 0, s2 = 0;
    for (let i = 0; i < W; i++) { const k = (y * W + i) * 4, v = (d[k] + d[k + 1] + d[k + 2]) / 3; s += v; s2 += v * v; }
    const m = s / W, sd = Math.sqrt(Math.max(0, s2 / W - m * m));
    return sd < 3 && (m < 14 || m > 248);
  };
  let t = 0, b = 0;
  while (t < H / 2 && blank(t)) t++;
  while (b < H / 2 && blank(H - 1 - b)) b++;
  const f = n => n >= 2 ? Math.min(0.45, (n + 1) / H) : 0;       // a row more, so no dark edge is left
  return [f(t), f(b)];
}
function crop0(x, square) {
  if (!square) return [0, 0, 0, 0];
  const a = x.w / x.h;
  return a > 1 ? [(1 - 1 / a) / 2, (1 - 1 / a) / 2, 0, 0] : [0, 0, (1 - a) / 2, (1 - a) / 2];
}
function setCrop(x, crop) { x.p.crop = crop; x.p.aspect = (x.w * (1 - crop[0] - crop[1])) / (x.h * (1 - crop[2] - crop[3])); }
// which cube side a picture is named for (front/right/back/left/up/down, or south/west/north/east, or 1–6), or -1
function cubeFace(x) {
  const NAMES = [/front|south|^1\b/i, /right|west|^2\b/i, /back|north|^3\b/i, /left|east|^4\b/i, /\b(up|top|sky|ceiling)\b|^5\b/i, /\b(down|bottom|floor|ground)\b|^6\b/i];
  const n = x.name.replace(/\.[^.]+$/, '');
  return NAMES.findIndex(re => re.test(n));
}
// ---- adding pictures one at a time
// The first time a picture is added, it's set up according to "What are they?" and put in the next free spot.
// Pictures already in the scene are never moved. Taking one out and adding it again puts it back where it was.
// x.slot = { type, i } remembers which spot (cube side, place round the ring…) it took.
function layoutType() { const v = document.querySelector('input[name=layout]:checked'); return v ? v.value : 'free'; }
function placed(type) { return pics.filter(q => !q.p.hidden && q.slot && q.slot.type === type); }
function freeSlot(type, max, want) {
  const used = new Set(placed(type).map(q => q.slot.i));
  if (want >= 0 && !used.has(want)) return want;
  for (let i = 0; i < max; i++) if (!used.has(i)) return i;
  return -1;
}
function placePic(x) {
  const v = layoutType();
  Object.assign(x.p, { hidden: false, roll: 0, gain: 1 }); setCrop(x, [0, 0, 0, 0]);
  let i;
  if (v === 'sphere' && (i = freeSlot('sphere', 1)) === 0) {
    x.slot = { type: 'sphere', i };
    Object.assign(x.p, { kind: 'sphere', yaw: 0, pitch: 0, size: 360 });
    // blank bands where the floor or ceiling is missing: trim them off (so they're filled in), keeping the rest in place
    const [ct, cb] = blankBands(x);
    if (ct || cb) {
      setCrop(x, [0, 0, ct, cb]);
      x.p.pitch = (ct - cb) * 90;
      status('file-status', 'note', 'Found ' + (ct && cb ? 'blank bands at the top and bottom' : ct ? 'a blank band at the top' : 'a blank band at the bottom') +
        ' (the missing ' + (ct && cb ? 'ceiling and floor' : ct ? 'ceiling' : 'floor') + '). They’re treated as gaps and filled in (step 3).');
    }
  } else if (v === 'strip' && (i = freeSlot('strip', 1)) === 0) {
    x.slot = { type: 'strip', i };
    // wrapped round a cylinder: if it's about 64° tall (most phones), it covers 2·a·tan(32°) radians across
    const a = x.p.aspect, across = 2 * a * Math.tan(32 * Math.PI / 180) * 180 / Math.PI;
    Object.assign(x.p, { kind: 'strip', yaw: 0, pitch: 0, size: across >= 330 ? 360 : Math.max(60, Math.round(across)) });
  } else if (v === 'cube' && (i = freeSlot('cube', 6, cubeFace(x))) >= 0) {
    const PLACES = [[0, 0], [-90, 0], [180, 0], [90, 0], [0, 90], [0, -90]];
    x.slot = { type: 'cube', i };
    setCrop(x, crop0(x, true));
    Object.assign(x.p, { kind: 'photo', yaw: PLACES[i][0], pitch: PLACES[i][1], size: 90 });
    $('same-lens').checked = true;
  } else if (v === 'ring') {
    const n = Math.max(2, pics.length), step = 360 / n;
    i = freeSlot('ring', n); if (i < 0) i = placed('ring').length;
    x.slot = { type: 'ring', i };
    Object.assign(x.p, { kind: 'photo', yaw: G.wrap(-i * step), pitch: 0, size: x.p.aspect < 1 ? 48 : 65 });
    $('same-lens').checked = true;
    if (step > x.p.size * 0.8) status('file-status', 'note', 'These may not overlap enough to go all the way round (each needs to overlap the next by about a third). Gaps will be filled in.');
  } else if (v === 'flat' && (i = freeSlot('flat', 1)) === 0) {
    x.slot = { type: 'flat', i };
    Object.assign(x.p, { kind: 'photo', yaw: 0, pitch: 0, size: 75 });
    setFillMode(1);
  } else {
    // something else, or extras beyond the 360 photo / panorama / cube / old photo
    i = freeSlot('free', 999);
    x.slot = { type: 'free', i };
    const around = { sphere: [-40, 0], strip: [0, 45], flat: [-80, 0] }[v];
    if (view === 'look' && !around) Object.assign(x.p, { kind: 'photo', yaw: G.wrap(look.yaw), pitch: Math.max(-80, Math.min(80, look.pitch)), size: 60 });
    else if (v === 'strip') Object.assign(x.p, { kind: 'photo', yaw: 0, pitch: Math.min(85, 45 + 20 * i), size: 60 });
    else { const s = around ? around[0] : -45; Object.assign(x.p, { kind: 'photo', yaw: G.wrap(s * (around ? i + 1 : i)), pitch: 0, size: v === 'flat' ? 75 : 60 }); }
  }
}
// the Add / Added button next to each picture
function togglePic(id, quiet) {
  const x = pic(id); if (!x) return;
  if (!x.p.hidden) { x.p.hidden = true; if (sel === id) sel = null; }
  else if (x.slot) x.p.hidden = false;                                   // back where it was
  else placePic(x);
  if (!x.p.hidden) sel = id;
  if (quiet) return;
  listPics(); showSel(); changed(); commit();
  $('view-hint').textContent = hintText();
  if (!x.p.hidden) status('snap-status', '', '');
}
