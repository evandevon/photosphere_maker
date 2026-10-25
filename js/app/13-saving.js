/* js/app/13-saving.js · Save button: renderEquirect → JPEG, addPanoTag() writes the GPano XMP 360 label.
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- saving
if (R.maxTex < 8192) { const o = $('out-size').querySelector('option[value="8192"]'); o.disabled = true; o.textContent += ' (not on this device)'; }
$('save').addEventListener('click', async () => {
  const W = +$('out-size').value, H = W / 2;
  $('save').disabled = true; $('download').hidden = true; $('save-progress').hidden = false;
  status('save-status', '', 'Making it…');
  const bar = $('save-progress').firstElementChild;
  try {
    clearTimeout(fillTimer); updateFill();                     // the fill, up to date
    const canvas = await R.renderEquirect(W, H, f => { bar.style.width = (f * 90) + '%'; });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', W > 4096 ? 0.88 : 0.9));
    const tagged = await addPanoTag(blob, W, H);
    const a = $('download');
    if (a.href) URL.revokeObjectURL(a.href);
    const name = ($('out-name').value.trim() || 'photosphere').replace(/[^\w-]+/g, '-') + '.jpg';
    a.href = URL.createObjectURL(tagged); a.download = name;
    a.textContent = '⬇ Download ' + name + ' (' + (tagged.size / 1048576).toFixed(1) + ' MB)';
    a.hidden = false;
    bar.style.width = '100%';
    status('save-status', 'ok', 'Done: ' + W + ' × ' + H + '.' + (tagged.size > 8 * 1048576 ? ' It’s a big file; the Quick to load size suits phones better.' : ''));
  } catch (e) {
    console.error(e);
    status('save-status', 'err', 'Something went wrong making it (' + e.message + '). Try a smaller size.');
  }
  $('save').disabled = false; $('save-progress').hidden = true; bar.style.width = '0';
});
// The label inside the JPEG that tells Facebook, Google and other 360 viewers it's a 360 photo ("GPano" XMP)
async function addPanoTag(blob, W, H) {
  const xmp = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:UsePanoramaViewer="True" GPano:ProjectionType="equirectangular"' +
    ' GPano:FullPanoWidthPixels="' + W + '" GPano:FullPanoHeightPixels="' + H + '" GPano:CroppedAreaImageWidthPixels="' + W + '" GPano:CroppedAreaImageHeightPixels="' + H + '"' +
    ' GPano:CroppedAreaLeftPixels="0" GPano:CroppedAreaTopPixels="0" GPano:PoseHeadingDegrees="0"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const head = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0'), body = new TextEncoder().encode(xmp);
  const len = 2 + head.length + body.length;
  const seg = new Uint8Array(4 + head.length + body.length);
  seg.set([0xFF, 0xE1, len >> 8, len & 255]); seg.set(head, 4); seg.set(body, 4 + head.length);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // straight after the start-of-image marker (FF D8), before everything else
  return new Blob([bytes.subarray(0, 2), seg, bytes.subarray(2)], { type: 'image/jpeg' });
}
