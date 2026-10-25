/* js/app/09-keys.js · Keyboard: arrow keys etc. on the stage, plus page-wide shortcuts (undo/redo).
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- keys
let keyCommit = 0;
stage.addEventListener('keydown', e => {
  if (!pics.some(q => !q.p.hidden)) return;
  const big = e.shiftKey ? 10 : 1;
  if (view === 'look') {
    const m = { ArrowLeft: [big * 3, 0], ArrowRight: [-big * 3, 0], ArrowUp: [0, big * 3], ArrowDown: [0, -big * 3] }[e.key];
    if (!m) return;
    e.preventDefault(); look.yaw = G.wrap(look.yaw + m[0]); look.pitch = Math.max(-89, Math.min(89, look.pitch + m[1])); render(); return;
  }
  if (e.key === 'n' || e.key === 'N') {                          // the next (or, with Shift, previous) picture
    const placed = pics.filter(q => !q.p.hidden);
    const i = placed.findIndex(q => q.id === sel);
    select(placed[(i + (e.shiftKey ? -1 : 1) + placed.length) % placed.length].id); e.preventDefault(); return;
  }
  const q = pic(sel);
  if (!q) return;
  const m = { ArrowLeft: ['yaw', big], ArrowRight: ['yaw', -big], ArrowUp: ['pitch', big], ArrowDown: ['pitch', -big], '[': ['roll', -big], ']': ['roll', big] }[e.key];
  if (m) { q.p[m[0]] = m[0] === 'pitch' ? Math.max(-90, Math.min(90, q.p.pitch + m[1])) : G.wrap(q.p[m[0]] + m[1]); }
  else if (e.key === '+' || e.key === '=') resize(q, 1.03);
  else if (e.key === '-' || e.key === '_') resize(q, 1 / 1.03);
  else return;
  e.preventDefault(); showSel(); changed();
  clearTimeout(keyCommit); keyCommit = setTimeout(commit, 600);
});
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return;
  e.preventDefault(); e.shiftKey ? redo() : undo();
});
