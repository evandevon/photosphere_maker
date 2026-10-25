/* js/app/02-pictures.js · Adding files (choose or drag): addFiles().
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- pictures
async function addFiles(files) {
  const list = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(f.name));
  if (!list.length) return status('file-status', 'err', 'Those don’t look like pictures. Use JPEG or PNG files.');
  status('file-status', '', 'Opening ' + list.length + ' picture' + (list.length > 1 ? 's' : '') + '…');
  let bad = [];
  for (const f of list) {
    let bmp;
    try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
    catch (e) { bad.push(f.name); continue; }
    const w0 = bmp.width, h0 = bmp.height, a0 = w0 / h0;
    const wide = Math.abs(a0 - 2) < 0.15 || a0 > 2.5;                 // a 360 photo or a panorama: keep more detail
    const cap = Math.min(R.maxTex, wide ? 8192 : 4096), k = Math.min(1, cap / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const t = document.createElement('canvas'); t.width = 104; t.height = Math.max(20, Math.round(104 / a0));
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    const id = nextId++;
    const x = { id, name: f.name, source: c, thumb: t.toDataURL('image/jpeg', 0.7), w: c.width, h: c.height, colour: COLOURS[(id - 1) % COLOURS.length],
      p: { kind: 'photo', yaw: 0, pitch: 0, roll: 0, size: 60, aspect: c.width / c.height, crop: [0, 0, 0, 0], gain: 1, hidden: true } };
    pics.push(x);
    R.setPicture(id, c);
    R.setPiece(id, x.p);
  }
  if (bad.length) status('file-status', 'err', 'Couldn’t open ' + bad.join(', ') + '. iPhone photos (HEIC) only open in Safari: in the Photos app, share them as JPEG (or set Camera → Formats → Most Compatible).');
  else status('file-status', 'ok', pics.length + ' picture' + (pics.length > 1 ? 's' : '') + ' ready. Choose what they are, then press Add next to each picture.');
  listPics();
  suggestLayout();
  $('layouts').disabled = !pics.length;
}
$('files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
