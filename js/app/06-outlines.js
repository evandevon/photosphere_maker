/* js/app/06-outlines.js · Picture outlines and labels drawn on the overlay canvas: project(), edgePoints(), drawOverlay(), label().
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- the outlines
// a picture's edge, as points on the screen (map or Look around); null where it's out of view
const Gm = () => { const g = R.state.global; return G.rot(g[0], g[1], g[2]); };
function project(out, w, h) {
  if (view === 'map') { const uv = G.eqAt(out); return [uv[0] * w, uv[1] * h]; }
  const V = G.rot(look.yaw, look.pitch, 0), v = G.mulT(V, out);
  if (v[2] > -0.05) return null;
  const th = Math.tan(look.fov * Math.PI / 360);
  return [(v[0] / -v[2] / (th * w / h) * 0.5 + 0.5) * w, (0.5 - v[1] / -v[2] / th * 0.5) * h];
}
function edgePoints(x) {
  const p = x.p, pts = [], n = 36, Rp = G.pieceRot(p), g = Gm();
  const add = (s, t) => pts.push(G.mulT(g, G.toWorld(p, s, t, Rp)));
  if (G.wraps(p)) {                                             // a whole circle: only its top and bottom edges
    for (let i = 0; i <= n * 2; i++) add(i / (n * 2), 0);
    pts.push(null);
    for (let i = 0; i <= n * 2; i++) add(i / (n * 2), 1);
    return pts;
  }
  for (let i = 0; i <= n; i++) add(i / n, 0);
  for (let i = 0; i <= n; i++) add(1, i / n);
  for (let i = n; i >= 0; i--) add(i / n, 1);
  for (let i = n; i >= 0; i--) add(0, i / n);
  return pts;
}
function drawOverlay() {
  const x = over.getContext('2d'), w = over.width, h = over.height, k = w / over.getBoundingClientRect().width || 1;
  x.clearRect(0, 0, w, h);
  if (!$('show-outlines').checked || !pics.some(q => !q.p.hidden)) return;
  if (view === 'map') {                                         // guide lines: every 30°, the horizon, and the names of the directions
    x.lineWidth = 1 * k; x.strokeStyle = 'rgba(255,255,255,.18)';
    for (let i = 1; i < 12; i++) { x.beginPath(); x.moveTo(i * w / 12, 0); x.lineTo(i * w / 12, h); x.stroke(); }
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * h / 6); x.lineTo(w, i * h / 6); x.stroke(); }
    x.strokeStyle = 'rgba(255,90,90,.85)'; x.lineWidth = 1.5 * k;
    x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    x.font = '700 ' + (11 * k) + 'px system-ui, sans-serif'; x.textAlign = 'center';
    [['BACK', 0.02], ['LEFT', 0.25], ['FRONT', 0.5], ['RIGHT', 0.75], ['BACK', 0.98]].forEach(([t, u]) => label(x, t, u * w, h / 2 - 8 * k, k));
    label(x, 'UP', w / 2, 14 * k, k); label(x, 'DOWN', w / 2, h - 6 * k, k);
  }
  // outlines, the chosen one on top and thicker
  const order = pics.filter(q => !q.p.hidden && q.id !== sel).concat(pics.filter(q => q.id === sel && !q.p.hidden));
  order.forEach(q => {
    const pts = edgePoints(q).map(v => v && project(v, w, h));
    x.strokeStyle = q.colour; x.lineWidth = (q.id === sel ? 3 : 1.5) * k;
    x.setLineDash(q.id === sel ? [] : [6 * k, 4 * k]);
    x.beginPath();
    let prev = null;
    pts.forEach(pt => {
      if (!pt) { prev = null; return; }
      if (!prev || (view === 'map' && Math.abs(pt[0] - prev[0]) > w / 2)) x.moveTo(pt[0], pt[1]); else x.lineTo(pt[0], pt[1]);
      prev = pt;
    });
    x.stroke(); x.setLineDash([]);
    // its number, at its middle
    const c = project(G.mulT(Gm(), G.toWorld(q.p, 0.5, 0.5)), w, h);
    if (c) {
      const n = String(pics.indexOf(q) + 1), r = 11 * k;
      x.beginPath(); x.arc(c[0], c[1], r, 0, Math.PI * 2); x.fillStyle = q.colour; x.fill();
      x.lineWidth = 2 * k; x.strokeStyle = q.id === sel ? '#fff' : 'rgba(0,0,0,.6)'; x.stroke();
      x.fillStyle = '#111'; x.font = '700 ' + (12 * k) + 'px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(n, c[0], c[1] + 0.5 * k); x.textBaseline = 'alphabetic';
    }
  });
}
function label(x, t, cx, cy, k) {
  const m = x.measureText(t).width;
  x.fillStyle = 'rgba(15,13,12,.7)'; x.fillRect(cx - m / 2 - 5 * k, cy - 11 * k, m + 10 * k, 15 * k);
  x.fillStyle = '#f3ede9'; x.fillText(t, cx, cy);
}
$('show-outlines').addEventListener('change', render);
