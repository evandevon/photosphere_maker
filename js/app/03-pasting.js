/* js/app/03-pasting.js · Ctrl+V paste and the Paste a picture button (files named "Pasted n"); also the picture list listPics() (with each picture's Add / Added button) and removePic().
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
// ---------------------------------------------------------------- pasting (screenshots from Minecraft or anywhere)
// Pasted pictures are all called "image.png", so they're renamed "Pasted 1", "Pasted 2"… (in the order pasted,
// which is the order "Six views of a cube" uses when the names don't say front, right…)
let pasted = 0;
const named = blob => new File([blob], 'Pasted ' + (++pasted) + '.' + ((blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')), { type: blob.type });
document.addEventListener('paste', e => {
  const t = e.target;
  if (t && t.matches && t.matches('input[type=text], textarea')) return;          // pasting into the file name box
  const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files.map(named));
});
const pasteBtn = $('paste');
if (navigator.clipboard && navigator.clipboard.read) {
  pasteBtn.hidden = false;
  pasteBtn.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read(), files = [];
      for (const it of items) {
        const type = it.types.find(t => /^image\//.test(t));
        if (type) files.push(named(await it.getType(type)));
      }
      if (files.length) addFiles(files);
      else status('file-status', 'note', 'There’s no picture copied yet. Take a screenshot first (Windows: Win+Shift+S · Mac: Cmd+Ctrl+Shift+4 · Chromebook: Ctrl+Shift+Show windows), then press Paste.');
    } catch (err) {
      status('file-status', 'note', 'The browser didn’t allow pasting from the button. Press Ctrl+V (Mac: Cmd+V) on this page instead.');
    }
  });
}

function listPics() {
  const ul = $('pics'); ul.innerHTML = '';
  pics.forEach((x, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pic'; b.setAttribute('aria-pressed', String(x.id === sel));
    b.innerHTML = '<span class="swatch-num" style="background:' + x.colour + '">' + (i + 1) + '</span><img alt=""><span class="pn"></span>';
    b.querySelector('img').src = x.thumb; b.querySelector('.pn').textContent = x.name;
    b.setAttribute('aria-label', 'Picture ' + (i + 1) + ': ' + x.name + (x.p.hidden ? ', not in the scene' : '') + '. Choose it');
    b.addEventListener('click', () => select(x.id));
    li.classList.toggle('out', !!x.p.hidden);
    const add = document.createElement('button'); add.type = 'button'; add.className = 'pic-add';
    add.setAttribute('aria-pressed', String(!x.p.hidden));
    add.innerHTML = x.p.hidden ? '<span aria-hidden="true">+</span> Add' : '<span aria-hidden="true">✓</span> Added';
    add.setAttribute('aria-label', 'Picture ' + (i + 1) + ' in the scene');
    add.title = x.p.hidden ? 'Add it to the scene' : 'In the scene. Press to take it out';
    add.addEventListener('click', () => togglePic(x.id));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'pic-x'; del.textContent = '×';
    del.setAttribute('aria-label', 'Remove picture ' + (i + 1) + ': ' + x.name);
    del.addEventListener('click', () => removePic(x.id));
    li.append(add, b, del); ul.append(li);
  });
  const any = pics.some(x => !x.p.hidden);
  $('stage-empty').hidden = any;
  $('snap').disabled = pics.filter(x => !x.p.hidden).length < 2;
  $('match').disabled = $('snap').disabled;
  $('save').disabled = !any;
}
function removePic(id) {
  const i = pics.findIndex(x => x.id === id);
  if (i < 0) return;
  pics.splice(i, 1); R.remove(id);
  if (sel === id) sel = null;
  listPics(); showSel(); changed(); commit();
  $('layouts').disabled = !pics.length;
}
