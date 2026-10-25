/* js/app/12-undo.js · snapshot(), commit() (call after any change worth undoing), restore(), undo(), redo().
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- undo and redo
let past = [], future = [], last = null;
function snapshot() {
  return JSON.stringify({ order: pics.map(q => q.id), pieces: pics.map(q => [q.id, q.p]), global: R.state.global, feather: R.state.feather, fill: R.state.fillMode, colour: $('fill-colour').value });
}
function commit() {
  const now = snapshot();
  if (now === last) return;
  if (last) { past.push(last); if (past.length > 100) past.shift(); }
  future = []; last = now; histButtons();
}
function restore(s) {
  const st = JSON.parse(s);
  const byId = new Map(st.pieces);
  pics.sort((a, b) => st.order.indexOf(a.id) - st.order.indexOf(b.id));
  pics.forEach(q => { if (byId.has(q.id)) q.p = Object.assign({}, byId.get(q.id)); });
  R.state.global = st.global.slice(); R.state.feather = st.feather; $('feather').value = Math.round(st.feather * 100); $('feather-out').textContent = $('feather').value + '%';
  $('fill-colour').value = st.colour; setFillMode(st.fill);
  syncGlobal(); listPics(); showSel(); changed();
}
function undo() { if (!past.length) return; future.push(last); last = past.pop(); restore(last); histButtons(); }
function redo() { if (!future.length) return; past.push(last); last = future.pop(); restore(last); histButtons(); }
function histButtons() { $('undo').disabled = !past.length; $('redo').disabled = !future.length; }
$('undo').addEventListener('click', undo); $('redo').addEventListener('click', redo);
