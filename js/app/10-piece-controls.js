/* js/app/10-piece-controls.js · select(id), showSel(), and the chosen picture's sliders, crop, kind, hide, bring to front.
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- the chosen picture's controls
function select(id) { sel = id; listPics(); showSel(); render(); }
const SL = { 'sel-yaw': 'yaw', 'sel-pitch': 'pitch', 'sel-roll': 'roll', 'sel-size': 'size' };
function showSel() {
  const q = pic(sel);
  $('piece-ctl').hidden = !q; $('piece-none').hidden = !!q;
  if (!q) return;
  const i = pics.indexOf(q);
  $('sel-num').textContent = i + 1; $('sel-num').style.background = q.colour;
  $('sel-name').textContent = q.name;
  $('sel-kind').value = q.p.kind;
  Object.entries(SL).forEach(([id, k]) => { $(id).value = q.p[k]; $(id + '-out').textContent = deg(q.p[k]); });
  $('sel-size').max = q.p.kind === 'photo' ? 170 : 360;
  $('sel-gain').value = Math.round(q.p.gain * 100); $('sel-gain-out').textContent = Math.round(q.p.gain * 100) + '%';
  ['l', 'r', 't', 'b'].forEach((s, j) => { $('crop-' + s).value = Math.round(q.p.crop[j] * 1000) / 10; $('crop-' + s + '-out').textContent = Math.round(q.p.crop[j] * 100) + '%'; });
  $('sel-hide').checked = !!q.p.hidden;
}
Object.entries(SL).forEach(([id, k]) => {
  $(id).addEventListener('input', () => {
    const q = pic(sel); if (!q) return;
    const v = +$(id).value;
    if (k === 'size') resize(q, v / q.p.size); else q.p[k] = v;
    $(id + '-out').textContent = deg(q.p[k]); changed();
  });
  $(id).addEventListener('change', () => commit());
});
$('sel-gain').addEventListener('input', () => { const q = pic(sel); if (!q) return; q.p.gain = +$('sel-gain').value / 100; $('sel-gain-out').textContent = $('sel-gain').value + '%'; changed(); });
$('sel-gain').addEventListener('change', () => commit());
['l', 'r', 't', 'b'].forEach((s, j) => {
  $('crop-' + s).addEventListener('input', () => {
    const q = pic(sel); if (!q) return;
    const c = q.p.crop.slice(); c[j] = +$('crop-' + s).value / 100; setCrop(q, c);
    $('crop-' + s + '-out').textContent = Math.round(c[j] * 100) + '%'; changed();
  });
  $('crop-' + s).addEventListener('change', () => commit());
});
$('sel-kind').addEventListener('change', () => {
  const q = pic(sel); if (!q) return;
  q.p.kind = $('sel-kind').value;
  if (q.p.kind === 'photo') q.p.size = Math.min(q.p.size, 120);
  showSel(); changed(); commit();
});
$('sel-hide').addEventListener('change', () => { const q = pic(sel); if (!q) return; q.p.hidden = $('sel-hide').checked; listPics(); changed(); commit(); });
$('sel-front').addEventListener('click', () => {               // drawn last, so it wins where pictures overlap in the outlines and clicks
  const i = pics.findIndex(x => x.id === sel); if (i < 0) return;
  pics.push(pics.splice(i, 1)[0]); listPics(); changed(); commit();
});
