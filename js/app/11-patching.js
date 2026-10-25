/* js/app/11-patching.js · Snap together, match brightness, blend (feather), fill the gaps, Straighten it (global rotation).
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- patching
let stopSnap = false;
$('snap').addEventListener('click', async () => {
  const placed = pics.filter(q => !q.p.hidden);
  if (placed.length < 2) return;
  // the anchor stays put: a whole 360 photo if there is one, otherwise the first picture
  const anchor = placed.find(q => q.p.kind === 'sphere') || placed[0];
  stopSnap = false;
  $('snap').disabled = true; $('snap-cancel').hidden = false; $('snap-progress').hidden = false;
  status('snap-status', '', 'Lining the pictures up… (picture ' + (placed.indexOf(anchor) + 1) + ' stays put)');
  const bar = $('snap-progress').firstElementChild;
  const res = await Snap.align(placed.map(q => ({ p: q.p, source: q.source, fixed: q === anchor })), {
    sameLens: $('same-lens').checked, onProgress: f => { bar.style.width = (f * 100) + '%'; changed(); }, stop: () => stopSnap
  });
  $('snap').disabled = false; $('snap-cancel').hidden = true; $('snap-progress').hidden = true; bar.style.width = '0';
  if (res.stopped) {
    placed.forEach((q, i) => Object.assign(q.p, res.before[i]));
    status('snap-status', '', 'Stopped; the pictures are back where they were.');
  } else if (!res.ok) status('snap-status', 'err', 'Couldn’t snap them together: ' + res.why);
  else {
    const pl = n => n + ' picture' + (n === 1 ? '' : 's');
    const left = res.unmatched.length ? ' ' + pl(res.unmatched.length) + ' (' + res.unmatched.map(i => pics.indexOf(placed[i]) + 1).join(', ') + ') had no details to match, so stayed where you put ' + (res.unmatched.length === 1 ? 'it' : 'them') + '.' : '';
    status('snap-status', res.gapAfter < 0.5 ? 'ok' : 'note', 'Snapped together using ' + res.matches + ' matching details: the joins now line up to within ' +
      (res.gapAfter < 0.1 ? 'less than 0.1°' : 'about ' + deg(res.gapAfter)) + ' (they were ' + deg(res.gapBefore) + ' out).' + left + ' Check them in Look around; Undo puts them back.');
    commit();
  }
  showSel(); changed();
});
$('snap-cancel').addEventListener('click', () => { stopSnap = true; });
$('match').addEventListener('click', () => {
  const placed = pics.filter(q => !q.p.hidden);
  const anchor = placed.find(q => q.p.kind === 'sphere') || placed[0];
  const g = Snap.gains(placed.map(q => ({ p: q.p, source: q.source, fixed: q === anchor })));
  placed.forEach((q, i) => { q.p.gain = g[i]; });
  status('snap-status', 'ok', 'Brightness evened out across the joins. Each picture’s Brightness (step 2) can still be adjusted.');
  showSel(); changed(); commit();
});
$('feather').addEventListener('input', () => { R.state.feather = +$('feather').value / 100; $('feather-out').textContent = $('feather').value + '%'; changed(); });
$('feather').addEventListener('change', () => commit());
$('feather-out').textContent = $('feather').value + '%';
let fillColourSet = false;
function setFillMode(m) {
  R.state.fillMode = m;
  document.querySelector('input[name=fill][value="' + m + '"]').checked = true;
  if (m === 2) R.state.colour = hex($('fill-colour').value);
  changed();
}
document.querySelectorAll('input[name=fill]').forEach(r => r.addEventListener('change', () => { setFillMode(+r.value); commit(); }));
$('fill-colour').addEventListener('input', () => { fillColourSet = true; setFillMode(2); });
$('fill-colour').addEventListener('change', () => commit());
R.state.fillMode = 1;
const GL = { 'g-yaw': 0, 'g-pitch': 1, 'g-roll': 2 };
function syncGlobal() { Object.entries(GL).forEach(([id, i]) => { $(id).value = R.state.global[i]; $(id + '-out').textContent = deg(R.state.global[i]); }); }
Object.entries(GL).forEach(([id, i]) => {
  $(id).addEventListener('input', () => { R.state.global[i] = +$(id).value; $(id + '-out').textContent = deg(+$(id).value); changed(); });
  $(id).addEventListener('change', () => commit());
});
syncGlobal();
