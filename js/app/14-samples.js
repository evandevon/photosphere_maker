/* js/app/14-samples.js · Sample buttons (fetch from samples/ and lay out).
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- samples
const SAMPLES = {
  cube: ['cube-1-front.jpg', 'cube-2-right.jpg', 'cube-3-back.jpg', 'cube-4-left.jpg', 'cube-5-up.jpg', 'cube-6-down.jpg'],
  ring: [1, 2, 3, 4, 5, 6, 7, 8].map(i => 'ring-' + i + '.jpg'),
  strip: ['phone-panorama.jpg'], flat: ['old-photo.jpg'], tilted: ['tilted-360.jpg']
};
document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', async () => {
  const names = SAMPLES[b.dataset.sample];
  status('file-status', '', 'Fetching the sample…');
  try {
    const files = await Promise.all(names.map(async n => { const r = await fetch('samples/' + n); if (!r.ok) throw new Error(n); return new File([await r.blob()], n, { type: r.headers.get('content-type') || 'image/jpeg' }); }));
    pics.slice().forEach(q => removePic(q.id));
    await addFiles(files);
    R.state.global = [0, 0, 0]; syncGlobal(); look.yaw = 0; look.pitch = 0;
    pics.forEach(q => { if (layoutType() !== 'cube' || placed('cube').length < 6) togglePic(q.id, true); });
    sel = (pics.find(q => !q.p.hidden) || {}).id || null;
    listPics(); showSel(); changed(); commit();
    $('view-hint').textContent = hintText();
  } catch (e) { status('file-status', 'err', 'The sample couldn’t be loaded (' + e.message + ').'); }
}));
