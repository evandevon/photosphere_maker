/* js/app/07-map-drag.js · Flat map: worldAt(), pieceAt(), pointer dragging, wheel resizing, resize().
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- the flat map: choosing and dragging
// the direction (in the room, before straightening) under a point of the view
function worldAt(e) {
  const r = stage.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
  let out;
  if (view === 'map') out = G.eqDir(u, v);
  else {
    const th = Math.tan(look.fov * Math.PI / 360), a = r.width / r.height;
    const d = [(u * 2 - 1) * th * a, (1 - v * 2) * th, -1], l = Math.hypot(...d);
    out = G.mul(G.rot(look.yaw, look.pitch, 0), d.map(n => n / l));
  }
  return G.mul(Gm(), out);
}
function pieceAt(e) {
  const wv = worldAt(e);
  const order = pics.filter(q => q.id === sel).concat(pics.filter(q => q.id !== sel).reverse());
  return order.find(q => !q.p.hidden && G.fromWorld(q.p, wv)) || null;
}
let drag = null;
stage.addEventListener('pointerdown', e => {
  if (!pics.some(q => !q.p.hidden)) return;
  stage.focus({ preventScroll: true });
  if (view === 'look') {
    drag = { look: true, x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch };
    stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); return;
  }
  const q = pieceAt(e);
  if (!q) return;
  select(q.id);
  const a = G.angles(worldAt(e));
  drag = { id: q.id, yaw: q.p.yaw, pitch: q.p.pitch, ay: a.yaw, ap: a.pitch, moved: false };
  stage.setPointerCapture(e.pointerId); e.preventDefault();
});
stage.addEventListener('pointermove', e => {
  if (drag && drag.look) {
    const r = stage.getBoundingClientRect(), dpp = look.fov / r.height;
    look.yaw = G.wrap(drag.yaw + (e.clientX - drag.x) * dpp);
    look.pitch = Math.max(-89, Math.min(89, drag.pitch + (e.clientY - drag.y) * dpp));
    render(); return;
  }
  if (drag) {
    const q = pic(drag.id), a = G.angles(worldAt(e));
    q.p.yaw = G.wrap(drag.yaw + G.wrap(a.yaw - drag.ay));
    q.p.pitch = Math.max(-90, Math.min(90, drag.pitch + (a.pitch - drag.ap)));
    drag.moved = true;
    showSel(); changed(); return;
  }
  if (view === 'map') stage.classList.toggle('over-piece', !!pieceAt(e));
});
const endDrag = () => { if (drag && drag.moved) commit(); drag = null; stage.classList.remove('dragging'); };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
// scroll: resize the picture under the pointer (Shift: tilt it); in Look around, zoom
let wheelCommit = 0;
stage.addEventListener('wheel', e => {
  if (!pics.some(q => !q.p.hidden)) return;
  e.preventDefault();
  if (view === 'look') { look.fov = Math.max(30, Math.min(120, look.fov * Math.exp(e.deltaY * 0.001))); render(); return; }
  const q = pieceAt(e) || pic(sel);
  if (!q) return;
  select(q.id);
  if (e.shiftKey) q.p.roll = G.wrap(q.p.roll + (e.deltaY > 0 ? 1 : -1));
  else resize(q, Math.exp(-e.deltaY * 0.0008));
  showSel(); changed();
  clearTimeout(wheelCommit); wheelCommit = setTimeout(commit, 400);
}, { passive: false });
function resize(q, f) {
  const max = q.p.kind === 'photo' ? 170 : 360;
  if ($('same-lens').checked && q.p.kind === 'photo') pics.forEach(o => { if (o.p.kind === 'photo') o.p.size = Math.max(5, Math.min(170, o.p.size * f)); });
  else q.p.size = Math.max(5, Math.min(max, q.p.size * f));
}
