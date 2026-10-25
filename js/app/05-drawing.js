/* js/app/05-drawing.js · render(), sizeCanvases(), changed() (redraw + debounced fill), updateFill(), hex().
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- drawing
let queued = false, fillTimer = 0;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    sizeCanvases();
    if (view === 'map') R.drawMap(); else R.drawView(look);
    drawOverlay();
  });
}
function sizeCanvases() {
  const r = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  let w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  const cap = view === 'map' ? 2048 : 1800;
  if (w > cap) { h = Math.round(h * cap / w); w = cap; }
  w = Math.max(64, w); h = Math.max(32, h);
  [glc, over].forEach(c => { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
}
// something about the pictures changed: draw again, and (soon) work out the smooth fill again
function changed() {
  pics.forEach(x => R.setPiece(x.id, x.p));
  render();
  clearTimeout(fillTimer);
  fillTimer = setTimeout(updateFill, 250);
}
function updateFill() {
  if (!pics.some(x => !x.p.hidden)) return;
  const c = R.coverage(512, 256);
  const avg = Fill.average(c);
  if (!fillColourSet) $('fill-colour').value = '#' + avg.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  if (R.state.fillMode === 2) R.state.colour = hex($('fill-colour').value);
  if (R.state.fillMode === 1) R.setFill(Fill.pushPull(c), 512, 256);
  render();
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
new ResizeObserver(render).observe(stage);
