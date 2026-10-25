/*
 * FILE GUIDE: js/app.js  ·  the Photosphere Maker page (index.html)
 * Steps: 1 add pictures (and say what they are) → 2 place them roughly on the flat map → 3 patch together (snap,
 *   brightness, blend, fill the gaps, straighten) → 4 save a JPEG 360 photo (with the "this is a 360 photo" label
 *   that Facebook, Google and others look for).
 * Uses: js/geom.js (maths), js/sphere.js (drawing), js/fill.js (gaps), js/snap.js (lining up, brightness).
 * Sections (search for "// ---- <name>"): setting up · pictures · layouts · drawing · the outlines · the flat map:
 *   choosing and dragging · looking around · keys · the chosen picture's controls · patching · undo and redo ·
 *   saving · samples
 * Gotchas: pictures are shrunk on loading to what the graphics card can hold (and ≤ 8192 px; ≤ 4096 for ordinary
 *   photos, which are never shown that big anyway). Every drawing goes through Sphere, so the map, Look around and
 *   the saved file always agree.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = window.Geom;

  // ---------------------------------------------------------------- setting up
  const glc = $('gl'), over = $('over'), stage = $('stage');
  const R = window.Sphere(glc);
  if (!R) {
    $('file-status').className = 'status err';
    $('file-status').textContent = 'This browser can’t do the 3D drawing this page needs. Please use Chrome or Edge on a computer (or a recent iPad).';
    return;
  }
  const COLOURS = ['#ee8b5c', '#6fc7b8', '#f2c98a', '#b9a3ff', '#86d6a0', '#ff8fb1', '#7ec8ff', '#e6e06a', '#ffb070', '#9be3d9'];
  const pics = [];                 // { id, name, source, thumb, w, h, colour, p: piece }
  let nextId = 1, sel = null, view = 'map';
  const look = { yaw: 0, pitch: 0, fov: 80 };
  const pic = id => pics.find(x => x.id === id);
  const status = (id, kind, text) => { const e = $(id); e.className = 'status ' + (kind || ''); e.textContent = text || ''; };
  const deg = v => (Math.round(v * 10) / 10) + '°';

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
    else status('file-status', 'ok', pics.length + ' picture' + (pics.length > 1 ? 's' : '') + ' ready. Choose what they are, then press Lay them out.');
    listPics();
    suggestLayout();
    $('layouts').disabled = !pics.length; $('lay-out').disabled = !pics.length;
  }
  $('files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));

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
      b.querySelector('img').src = x.thumb; b.querySelector('.pn').textContent = x.name + (x.p.hidden ? ' (not placed)' : '');
      b.setAttribute('aria-label', 'Picture ' + (i + 1) + ': ' + x.name + (x.p.hidden ? ', not placed' : '') + '. Choose it');
      b.addEventListener('click', () => select(x.id));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'pic-x'; del.textContent = '×';
      del.setAttribute('aria-label', 'Remove picture ' + (i + 1) + ': ' + x.name);
      del.addEventListener('click', () => removePic(x.id));
      li.append(b, del); ul.append(li);
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
    $('layouts').disabled = !pics.length; $('lay-out').disabled = !pics.length;
  }

  // ---------------------------------------------------------------- layouts
  function suggestLayout() {
    const n = pics.length, a = n ? pics[0].p.aspect : 1;
    let v = 'free';
    if (n === 1) v = Math.abs(a - 2) < 0.15 ? 'sphere' : a > 2.5 ? 'strip' : 'flat';
    else if (n === 6) v = 'cube';
    else if (n > 1) v = 'ring';
    document.querySelector('input[name=layout][value=' + v + ']').checked = true;
    layoutHelp();
  }
  const HELP = {
    sphere: 'It will be placed as a whole 360° photo. Then straighten it, and fill any gaps, in step 3.',
    strip: 'It will be wrapped round you. If it didn’t go all the way round, make it smaller (step 2) until the join matches.',
    cube: 'Add them in this order: front, right, back, left, up, down (or name them front, right… or north, east…). Screenshots taken one after another are already in order. They’re trimmed to squares.',
    ring: 'They’re spread round in a circle, in the order added, turning to the right. Each should overlap the next by about a third.',
    flat: 'It goes in front of you; the rest of the room is filled in smoothly from its edges.',
    free: 'They’re lined up in front of you: drag each one to where it belongs.'
  };
  function layoutHelp() { const v = document.querySelector('input[name=layout]:checked'); $('layout-help').textContent = v ? HELP[v.value] : ''; }
  document.querySelectorAll('input[name=layout]').forEach(r => r.addEventListener('change', layoutHelp));

  // rows at the top and bottom that are all one flat dark (or blank) colour: [top, bottom] as fractions of the height
  function blankBands(x) {
    const W = 256, H = Math.round(256 * x.h / x.w), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(x.source, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const blank = y => {
      let s = 0, s2 = 0;
      for (let i = 0; i < W; i++) { const k = (y * W + i) * 4, v = (d[k] + d[k + 1] + d[k + 2]) / 3; s += v; s2 += v * v; }
      const m = s / W, sd = Math.sqrt(Math.max(0, s2 / W - m * m));
      return sd < 3 && (m < 14 || m > 248);
    };
    let t = 0, b = 0;
    while (t < H / 2 && blank(t)) t++;
    while (b < H / 2 && blank(H - 1 - b)) b++;
    const f = n => n >= 2 ? Math.min(0.45, (n + 1) / H) : 0;       // a row more, so no dark edge is left
    return [f(t), f(b)];
  }
  function crop0(x, square) {
    if (!square) return [0, 0, 0, 0];
    const a = x.w / x.h;
    return a > 1 ? [(1 - 1 / a) / 2, (1 - 1 / a) / 2, 0, 0] : [0, 0, (1 - a) / 2, (1 - a) / 2];
  }
  function setCrop(x, crop) { x.p.crop = crop; x.p.aspect = (x.w * (1 - crop[0] - crop[1])) / (x.h * (1 - crop[2] - crop[3])); }
  function cubeOrder(list) {
    const NAMES = [/front|south|^1\b/i, /right|west|^2\b/i, /back|north|^3\b/i, /left|east|^4\b/i, /\b(up|top|sky|ceiling)\b|^5\b/i, /\b(down|bottom|floor|ground)\b|^6\b/i];
    const byName = NAMES.map(re => list.find(x => re.test(x.name.replace(/\.[^.]+$/, ''))));
    if (byName.every(Boolean) && new Set(byName).size === 6) return byName;
    return list.slice(0, 6);                                       // in the order added
  }
  function layOut(v) {
    pics.forEach(x => { x.p.hidden = false; x.p.roll = 0; x.p.gain = 1; setCrop(x, [0, 0, 0, 0]); });
    R.state.global = [0, 0, 0]; syncGlobal();
    const first = pics[0];
    if (v === 'sphere') {
      Object.assign(first.p, { kind: 'sphere', yaw: 0, pitch: 0, size: 360 });
      // blank bands where the floor or ceiling is missing: trim them off (so they're filled in), keeping the rest in place
      const [ct, cb] = blankBands(first);
      if (ct || cb) {
        setCrop(first, [0, 0, ct, cb]);
        first.p.pitch = (ct - cb) * 90;
        status('file-status', 'note', 'Found ' + (ct && cb ? 'blank bands at the top and bottom' : ct ? 'a blank band at the top' : 'a blank band at the bottom') +
          ' (the missing ' + (ct && cb ? 'ceiling and floor' : ct ? 'ceiling' : 'floor') + '). They’re treated as gaps and filled in (step 3).');
      }
      pics.slice(1).forEach((x, i) => Object.assign(x.p, { kind: 'photo', yaw: -40 * (i + 1), pitch: 0, size: 60 }));
    } else if (v === 'strip') {
      // wrapped round a cylinder: if it's about 64° tall (most phones), it covers 2·a·tan(32°) radians across
      const a = first.p.aspect, across = 2 * a * Math.tan(32 * Math.PI / 180) * 180 / Math.PI;
      const size = across >= 330 ? 360 : Math.max(60, Math.round(across));
      Object.assign(first.p, { kind: 'strip', yaw: 0, pitch: 0, size });
      pics.slice(1).forEach((x, i) => Object.assign(x.p, { kind: 'photo', yaw: 0, pitch: 45 + 20 * i, size: 60 }));
    } else if (v === 'cube') {
      const faces = cubeOrder(pics), PLACES = [[0, 0], [-90, 0], [180, 0], [90, 0], [0, 90], [0, -90]];
      pics.forEach(x => { if (!faces.includes(x)) Object.assign(x.p, { kind: 'photo', yaw: 0, pitch: 0, size: 60, hidden: true }); });
      faces.forEach((x, i) => { setCrop(x, crop0(x, true)); Object.assign(x.p, { kind: 'photo', yaw: PLACES[i][0], pitch: PLACES[i][1], size: 90 }); });
      $('same-lens').checked = true;
    } else if (v === 'ring') {
      const n = pics.length, step = 360 / n;
      pics.forEach((x, i) => Object.assign(x.p, { kind: 'photo', yaw: G.wrap(-i * step), pitch: 0, size: x.p.aspect < 1 ? 48 : 65 }));
      $('same-lens').checked = true;
      const s = pics[0].p.size;
      if (step > s * 0.8) status('file-status', 'note', 'These may not overlap enough to go all the way round (each needs to overlap the next by about a third). Gaps will be filled in.');
    } else if (v === 'flat') {
      Object.assign(first.p, { kind: 'photo', yaw: 0, pitch: 0, size: 75 });
      pics.slice(1).forEach((x, i) => Object.assign(x.p, { kind: 'photo', yaw: -80 * (i + 1), pitch: 0, size: 75 }));
      setFillMode(1);
    } else {
      pics.forEach((x, i) => Object.assign(x.p, { kind: 'photo', yaw: G.wrap(-i * 45), pitch: 0, size: 60 }));
    }
    look.yaw = 0; look.pitch = 0;
    select(pics.find(x => !x.p.hidden).id);
    listPics(); changed(); commit();
    $('view-hint').textContent = hintText();
    status('snap-status', '', '');
  }
  $('lay-out').addEventListener('click', () => { const v = document.querySelector('input[name=layout]:checked'); if (v) layOut(v.value); });

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

  // ---------------------------------------------------------------- the flat map: choosing and dragging
  // the direction (in the room, before straightening) under a point of the view
  function worldAt(e) {
    const r = stage.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    let out;
    if (view === 'map') out = G.eqDir(u, v);
    else {
      const th = Math.tan(look.fov * Math.PI / 360), a = r.width / r.height;
      const d = [(u * 2 - 1) * th * a, (1 - v * 2) * th, -1], l = Math.hypot(...d);
      out = G.mul(G.rot(look.yaw, look.pitch, 0), d.map(n => n / l));
    }
    return G.mul(Gm(), out);
  }
  function pieceAt(e) {
    const wv = worldAt(e);
    const order = pics.filter(q => q.id === sel).concat(pics.filter(q => q.id !== sel).reverse());
    return order.find(q => !q.p.hidden && G.fromWorld(q.p, wv)) || null;
  }
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (!pics.some(q => !q.p.hidden)) return;
    stage.focus({ preventScroll: true });
    if (view === 'look') {
      drag = { look: true, x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch };
      stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); return;
    }
    const q = pieceAt(e);
    if (!q) return;
    select(q.id);
    const a = G.angles(worldAt(e));
    drag = { id: q.id, yaw: q.p.yaw, pitch: q.p.pitch, ay: a.yaw, ap: a.pitch, moved: false };
    stage.setPointerCapture(e.pointerId); e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if (drag && drag.look) {
      const r = stage.getBoundingClientRect(), dpp = look.fov / r.height;
      look.yaw = G.wrap(drag.yaw + (e.clientX - drag.x) * dpp);
      look.pitch = Math.max(-89, Math.min(89, drag.pitch + (e.clientY - drag.y) * dpp));
      render(); return;
    }
    if (drag) {
      const q = pic(drag.id), a = G.angles(worldAt(e));
      q.p.yaw = G.wrap(drag.yaw + G.wrap(a.yaw - drag.ay));
      q.p.pitch = Math.max(-90, Math.min(90, drag.pitch + (a.pitch - drag.ap)));
      drag.moved = true;
      showSel(); changed(); return;
    }
    if (view === 'map') stage.classList.toggle('over-piece', !!pieceAt(e));
  });
  const endDrag = () => { if (drag && drag.moved) commit(); drag = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  // scroll: resize the picture under the pointer (Shift: tilt it); in Look around, zoom
  let wheelCommit = 0;
  stage.addEventListener('wheel', e => {
    if (!pics.some(q => !q.p.hidden)) return;
    e.preventDefault();
    if (view === 'look') { look.fov = Math.max(30, Math.min(120, look.fov * Math.exp(e.deltaY * 0.001))); render(); return; }
    const q = pieceAt(e) || pic(sel);
    if (!q) return;
    select(q.id);
    if (e.shiftKey) q.p.roll = G.wrap(q.p.roll + (e.deltaY > 0 ? 1 : -1));
    else resize(q, Math.exp(-e.deltaY * 0.0008));
    showSel(); changed();
    clearTimeout(wheelCommit); wheelCommit = setTimeout(commit, 400);
  }, { passive: false });
  function resize(q, f) {
    const max = q.p.kind === 'photo' ? 170 : 360;
    if ($('same-lens').checked && q.p.kind === 'photo') pics.forEach(o => { if (o.p.kind === 'photo') o.p.size = Math.max(5, Math.min(170, o.p.size * f)); });
    else q.p.size = Math.max(5, Math.min(max, q.p.size * f));
  }

  // ---------------------------------------------------------------- looking around (and switching views)
  function setView(v) {
    view = v;
    document.querySelectorAll('.seg [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    stage.classList.toggle('look', v === 'look'); stage.classList.toggle('map', v === 'map');
    $('view-hint').textContent = hintText();
    render();
  }
  function hintText() {
    if (!pics.some(q => !q.p.hidden)) return pics.length ? 'Choose what your pictures are, then press Lay them out.' : 'Add some pictures to begin.';
    return view === 'map' ? 'Drag a picture to move it · scroll over it to resize it (Shift + scroll to tilt) · click to choose it'
      : 'Drag to look around · scroll to zoom · walls and door frames should look upright';
  }
  document.querySelectorAll('.seg [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

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
    $(id).addEventListener('change', commit);
  });
  $('sel-gain').addEventListener('input', () => { const q = pic(sel); if (!q) return; q.p.gain = +$('sel-gain').value / 100; $('sel-gain-out').textContent = $('sel-gain').value + '%'; changed(); });
  $('sel-gain').addEventListener('change', commit);
  ['l', 'r', 't', 'b'].forEach((s, j) => {
    $('crop-' + s).addEventListener('input', () => {
      const q = pic(sel); if (!q) return;
      const c = q.p.crop.slice(); c[j] = +$('crop-' + s).value / 100; setCrop(q, c);
      $('crop-' + s + '-out').textContent = Math.round(c[j] * 100) + '%'; changed();
    });
    $('crop-' + s).addEventListener('change', commit);
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
  $('feather').addEventListener('change', commit);
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
  $('fill-colour').addEventListener('change', commit);
  R.state.fillMode = 1;
  const GL = { 'g-yaw': 0, 'g-pitch': 1, 'g-roll': 2 };
  function syncGlobal() { Object.entries(GL).forEach(([id, i]) => { $(id).value = R.state.global[i]; $(id + '-out').textContent = deg(R.state.global[i]); }); }
  Object.entries(GL).forEach(([id, i]) => {
    $(id).addEventListener('input', () => { R.state.global[i] = +$(id).value; $(id + '-out').textContent = deg(+$(id).value); changed(); });
    $(id).addEventListener('change', commit);
  });
  syncGlobal();

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
      layOut(document.querySelector('input[name=layout]:checked').value);
    } catch (e) { status('file-status', 'err', 'The sample couldn’t be loaded (' + e.message + ').'); }
  }));

  setView('map');
  commit();
})();
