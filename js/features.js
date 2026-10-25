/*
 * FILE GUIDE: js/features.js  ·  "Snap together": lining pictures up by matching details (window.Features)
 * The way panorama stitchers do it, made to start from the rough placement:
 *   1. find distinctive points in each picture (corners, marks), each with a "fingerprint" of the pattern around it
 *      that still matches if the picture is turned (like ORB: a corner finder + 256 brightness comparisons);
 *   2. for each pair of pictures that overlap where they've been placed, match fingerprints, but only between points
 *      the rough placement says are near each other (so repeating patterns, like planks or tiles, can't fool it);
 *   3. throw out wrong matches: keep only the matches that agree on one turn (RANSAC);
 *   4. turn every picture (and, if they share a lens, zoom them together) so all matched points meet, all at once
 *      (so small errors don't build up round a circle of photos). One picture, the anchor, stays put.
 * Pictures without enough matches stay where they were placed.
 * Sections (search for "// ---- <name>"): grey copies · finding points · fingerprints · matching · one turn for a pair ·
 *   all at once · putting it together
 */
(function (global) {
  'use strict';
  const G = global.Geom;
  const yieldNow = () => new Promise(r => setTimeout(r));

  // ---------------------------------------------------------------- grey copies
  function grey(source, crop, max) {
    const sw = source.width, sh = source.height;
    const cx = crop[0] * sw, cy = crop[2] * sh, cw = sw * (1 - crop[0] - crop[1]), ch = sh * (1 - crop[2] - crop[3]);
    const k = Math.min(1, max / Math.max(cw, ch)), W = Math.max(40, Math.round(cw * k)), H = Math.max(40, Math.round(ch * k));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(source, cx, cy, cw, ch, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return { W, H, g };
  }
  // a quick blur (box, twice ≈ gaussian)
  function blur(img, r) {
    const { W, H } = img, a = Float32Array.from(img.g), b = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) { b[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; } }
    }
    return { W, H, g: a };
  }

  // ---------------------------------------------------------------- finding points
  // Corners (Harris): places where brightness changes in two directions. Spread out over the picture (a few per cell).
  const PATCH = 15;                                    // fingerprint radius, in pixels
  function corners(img, want) {
    const { W, H } = img, s = blur(img, 1).g;
    const xx = new Float32Array(W * H), yy = new Float32Array(W * H), xy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = (s[i - W + 1] + 2 * s[i + 1] + s[i + W + 1]) - (s[i - W - 1] + 2 * s[i - 1] + s[i + W - 1]);
      const gy = (s[i + W - 1] + 2 * s[i + W] + s[i + W + 1]) - (s[i - W - 1] + 2 * s[i - W] + s[i - W + 1]);
      xx[i] = gx * gx; yy[i] = gy * gy; xy[i] = gx * gy;
    }
    const A = blur({ W, H, g: xx }, 2).g, B = blur({ W, H, g: yy }, 2).g, C = blur({ W, H, g: xy }, 2).g;
    const R = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) R[i] = A[i] * B[i] - C[i] * C[i] - 0.04 * (A[i] + B[i]) * (A[i] + B[i]);
    const m = PATCH + 3, cells = 16, cw = W / cells, chh = H / Math.max(4, Math.round(cells * H / W)), per = Math.max(2, Math.ceil(want / (cells * Math.round(cells * H / W))));
    const byCell = new Map();
    for (let y = m; y < H - m; y++) for (let x = m; x < W - m; x++) {
      const i = y * W + x, v = R[i];
      if (v <= 0) continue;
      let peak = true;
      for (let dy = -3; dy <= 3 && peak; dy++) for (let dx = -3; dx <= 3; dx++) if ((dx || dy) && R[i + dy * W + dx] > v) { peak = false; break; }
      if (!peak) continue;
      const key = Math.floor(y / chh) * 1000 + Math.floor(x / cw);
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push({ x, y, v });
    }
    let pts = [];
    byCell.forEach(list => { list.sort((a, b) => b.v - a.v); pts = pts.concat(list.slice(0, per)); });
    // drop the weakest (flat noise) relative to the strongest
    pts.sort((a, b) => b.v - a.v);
    const top = pts.length ? pts[Math.min(pts.length - 1, 10)].v : 0;
    return pts.filter(p => p.v > top * 0.002).slice(0, want);
  }

  // ---------------------------------------------------------------- fingerprints
  // 256 pairs of nearby pixels, compared (brighter or not) on a smoothed copy, turned to match the point's own
  // direction (from where its brightness leans), so the fingerprint still matches if the picture is tilted.
  const PAIRS = (() => {
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const g = () => { let v = 0; for (let i = 0; i < 4; i++) v += rnd(); return (v - 2) * PATCH * 0.55; };
    const out = [];
    while (out.length < 256) {
      const p = [g(), g(), g(), g()];
      if (p.every(v => Math.abs(v) <= PATCH - 1)) out.push(p);
    }
    return out;
  })();
  function fingerprints(img, pts) {
    const { W } = img, s = blur(img, 2).g, out = [];
    for (const p of pts) {
      let m10 = 0, m01 = 0;
      for (let dy = -PATCH; dy <= PATCH; dy++) for (let dx = -PATCH; dx <= PATCH; dx++) {
        if (dx * dx + dy * dy > PATCH * PATCH) continue;
        const v = s[(p.y + dy) * W + p.x + dx]; m10 += dx * v; m01 += dy * v;
      }
      const a = Math.atan2(m01, m10), c = Math.cos(a), sn = Math.sin(a);
      const d = new Uint32Array(8);
      for (let k = 0; k < 256; k++) {
        const [x1, y1, x2, y2] = PAIRS[k];
        const ax = Math.round(p.x + x1 * c - y1 * sn), ay = Math.round(p.y + x1 * sn + y1 * c);
        const bx = Math.round(p.x + x2 * c - y2 * sn), by = Math.round(p.y + x2 * sn + y2 * c);
        if (s[ay * W + ax] < s[by * W + bx]) d[k >> 5] |= 1 << (k & 31);
      }
      out.push({ x: p.x, y: p.y, d });
    }
    return out;
  }
  function hamming(a, b) {
    let n = 0;
    for (let i = 0; i < 8; i++) { let v = a[i] ^ b[i]; v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); n += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
    return n;
  }

  // ---------------------------------------------------------------- matching
  // Each point becomes a direction (a "ray") in its picture's own frame; the rough placement turns it into the room.
  const ray = (it, f, size) => G.localDir(size != null ? Object.assign({}, it.p, { size }) : it.p, (f.x + 0.5) / it.img.W, (f.y + 0.5) / it.img.H);
  const angle = (u, v) => Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
  function matchPair(A, B, gate) {
    const RA = G.pieceRot(A.p), RB = G.pieceRot(B.p);
    const wb = B.f.map(f => G.mul(RB, ray(B, f)));
    const out = [];
    for (const fa of A.f) {
      const wa = G.mul(RA, ray(A, fa));
      let best = 999, second = 999, bi = -1;
      for (let j = 0; j < B.f.length; j++) {
        if (angle(wa, wb[j]) > gate) continue;          // only where the rough placement says it could be
        const h = hamming(fa.d, B.f[j].d);
        if (h < best) { second = best; best = h; bi = j; } else if (h < second) second = h;
      }
      if (bi >= 0 && best <= 64 && best < 0.85 * second) out.push({ fa, fb: B.f[bi] });
    }
    return out;
  }

  // ---------------------------------------------------------------- one turn for a pair
  // The turn Q that best carries directions v onto u (Horn's method: the biggest eigenvector of a 4×4 matrix)
  function bestTurn(us, vs) {
    const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < us.length; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += vs[i][r] * us[i][c];
    const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
    const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz],
               [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
    const shift = us.length + 1;
    let q = [1, 0.01, 0.01, 0.01];
    for (let it = 0; it < 60; it++) {
      const n = [0, 1, 2, 3].map(r => N[r][0] * q[0] + N[r][1] * q[1] + N[r][2] * q[2] + N[r][3] * q[3] + shift * q[r]);
      const l = Math.hypot(...n); q = n.map(v => v / l);
    }
    const [w, x, y, z] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
            2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
            2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  }
  // RANSAC: try turns made from two random matches; keep the turn most matches agree with (within `tol` radians)
  function agree(matches, A, B, tol) {
    if (matches.length < 6) return [];
    const RA = G.pieceRot(A.p), RB = G.pieceRot(B.p);
    const U = matches.map(m => G.mul(RA, ray(A, m.fa))), V = matches.map(m => G.mul(RB, ray(B, m.fb)));
    let best = [];
    let seed = 99; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let it = 0; it < 400; it++) {
      const i = rnd(matches.length), j = rnd(matches.length);
      if (i === j || angle(U[i], U[j]) < 0.01) continue;
      const Q = bestTurn([U[i], U[j]], [V[i], V[j]]);
      const inl = [];
      for (let k = 0; k < matches.length; k++) if (angle(U[k], G.mul(Q, V[k])) < tol) inl.push(k);
      if (inl.length > best.length) best = inl;
    }
    return best.map(k => matches[k]);
  }

  // ---------------------------------------------------------------- all at once
  // Turn every picture (not the anchor) by a small amount w (and zoom the shared lens) to bring all matched points
  // together: Gauss-Newton with damping, on the small turns. A turn w changes a picture's frame R to R·exp(w).
  function expTurn(w) {
    const t = Math.hypot(w[0], w[1], w[2]);
    if (t < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y, z] = w.map(v => v / t), c = Math.cos(t), s = Math.sin(t), C = 1 - c;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  }
  const mm = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // a picture's frame back to turn / tilt / roll (R = Ry · Rx · Rz)
  function toAngles(R) {
    const D = 180 / Math.PI;
    return { yaw: Math.atan2(R[2], R[8]) * D, pitch: Math.asin(Math.max(-1, Math.min(1, -R[5]))) * D, roll: Math.atan2(R[3], R[4]) * D };
  }
  function solve(A, b) {                                   // Gaussian elimination with pivoting
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) continue;
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = Math.abs(A[i][i]) < 1e-12 ? 0 : s / A[i][i]; }
    return x;
  }
  // links: [{ a, b, ma: [features of a], mb: [features of b] }]; items: [{ p, img, R (frame), free }]
  function adjust(items, links, lens, iterations) {
    const free = items.map((it, i) => it.free ? i : -1).filter(i => i >= 0), col = new Map(free.map((i, k) => [i, k * 3]));
    const nP = free.length * 3 + (lens ? 1 : 0);
    let scale = 1, lambda = 1e-3;
    const sizeOf = it => it.p.kind === 'photo' && lens ? it.p.size * scale : it.p.size;
    const resid = () => {
      let e = 0, n = 0;
      for (const L of links) for (let k = 0; k < L.ma.length; k++) {
        const A = items[L.a], B = items[L.b];
        const u = G.mul(A.R, ray(A, L.ma[k], sizeOf(A))), v = G.mul(B.R, ray(B, L.mb[k], sizeOf(B)));
        e += (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2 + (u[2] - v[2]) ** 2; n++;
      }
      return e / Math.max(1, n);
    };
    let err = resid();
    for (let it = 0; it < iterations; it++) {
      const H = Array.from({ length: nP }, () => new Array(nP).fill(0)), g = new Array(nP).fill(0);
      for (const L of links) {
        const A = items[L.a], B = items[L.b], ca = col.get(L.a), cb = col.get(L.b);
        for (let k = 0; k < L.ma.length; k++) {
          const ra = ray(A, L.ma[k], sizeOf(A)), rb = ray(B, L.mb[k], sizeOf(B));
          const u = G.mul(A.R, ra), v = G.mul(B.R, rb), e = [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
          // how e changes: −R[r]× w for picture a, +R[r]× w for picture b; and by the lens zoom (numerically)
          const J = [[], [], []];
          const add = (c, R, r, sign) => {
            for (let q = 0; q < 3; q++) {
              const w = [0, 0, 0]; w[q] = 1;
              const d = G.mul(R, cross(w, r));               // R (w × r) = R [w]× r
              for (let row = 0; row < 3; row++) J[row].push([c + q, sign * d[row]]);
            }
          };
          if (ca != null) add(ca, A.R, ra, 1);
          if (cb != null) add(cb, B.R, rb, -1);
          if (lens && (A.p.kind === 'photo' || B.p.kind === 'photo')) {
            const h = 1e-3;
            const ua = A.p.kind === 'photo' && lens ? G.mul(A.R, ray(A, L.ma[k], A.p.size * (scale + h))) : u;
            const vb = B.p.kind === 'photo' && lens ? G.mul(B.R, ray(B, L.mb[k], B.p.size * (scale + h))) : v;
            for (let row = 0; row < 3; row++) J[row].push([nP - 1, ((ua[row] - vb[row]) - e[row]) / h]);
          }
          // robust: matches far off count for less
          const r2 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2], wgt = r2 > 1e-4 ? 1e-2 / Math.sqrt(r2) : 1;
          for (let row = 0; row < 3; row++) for (const [i, vi] of J[row]) {
            g[i] += wgt * vi * e[row];
            for (const [j, vj] of J[row]) H[i][j] += wgt * vi * vj;
          }
        }
      }
      let improved = false;
      for (let tries = 0; tries < 6 && !improved; tries++) {
        const Hd = H.map((row, i) => row.map((v, j) => i === j ? v * (1 + lambda) + 1e-9 : v));
        const dx = solve(Hd, g.map(v => -v));
        const saved = items.map(it => it.R), savedScale = scale;
        free.forEach((i, k) => { items[i].R = mm(items[i].R, expTurn([dx[k * 3], dx[k * 3 + 1], dx[k * 3 + 2]])); });
        if (lens) scale = Math.max(0.7, Math.min(1.4, scale + dx[nP - 1]));
        const e2 = resid();
        if (e2 < err) { err = e2; lambda = Math.max(1e-7, lambda / 3); improved = true; }
        else { items.forEach((it, i) => { it.R = saved[i]; }); scale = savedScale; lambda *= 10; }
      }
      if (!improved) break;
    }
    return { scale, err };
  }

  // ---------------------------------------------------------------- putting it together
  // pieces: [{ p, source, fixed }]; opts: { sameLens, onProgress(f), stop(), gate (degrees: how far off the rough
  // placement may be; default 15) }
  async function align(pieces, opts) {
    opts = opts || {};
    const progress = f => opts.onProgress && opts.onProgress(f);
    const before = pieces.map(x => ({ yaw: x.p.yaw, pitch: x.p.pitch, roll: x.p.roll, size: x.p.size }));
    const stopped = () => { if (opts.stop && opts.stop()) { pieces.forEach((x, i) => Object.assign(x.p, before[i])); return true; } return false; };
    // 1. points and fingerprints
    const items = [];
    for (let i = 0; i < pieces.length; i++) {
      const x = pieces[i], max = x.p.kind === 'photo' ? 900 : Math.min(2400, 900 * Math.max(1, x.p.aspect / 1.5));
      const img = grey(x.source, x.p.crop, max);
      const f = fingerprints(img, corners(img, x.p.kind === 'photo' ? 700 : 1600));
      items.push({ p: x.p, img, f, free: !x.fixed });
      if (opts.debug) opts.debug.push({ piece: i, corners: f.length, W: img.W, H: img.H });
      progress(0.3 * (i + 1) / pieces.length);
      await yieldNow(); if (stopped()) return { ok: false, stopped: true, before };
    }
    // 2 and 3. matches between pairs that overlap, kept only if they agree on one turn
    const gate = (opts.gate || 15) * Math.PI / 180, links = [];
    const pairs = [];
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) pairs.push([a, b]);
    let k = 0;
    for (const [a, b] of pairs) {
      const m = matchPair(items[a], items[b], gate);
      const pxA = items[a].p.size / items[a].img.W, pxB = items[b].p.size / items[b].img.W;
      const tol = Math.max(0.6, 4 * Math.max(pxA, pxB)) * Math.PI / 180;   // generous at first: the lens size isn't known yet
      const good = agree(m, items[a], items[b], tol * 2.5);
      if (opts.debug) opts.debug.push({ a, b, raw: m.length, good: good.length });
      if (good.length >= 8) links.push({ a, b, ma: good.map(g => g.fa), mb: good.map(g => g.fb) });
      progress(0.3 + 0.4 * (++k) / pairs.length);
      if (k % 4 === 0) { await yieldNow(); if (stopped()) return { ok: false, stopped: true, before }; }
    }
    if (!links.length) {
      return { ok: false, before, why: 'it couldn’t find matching details between the pictures. That happens with plain walls, sky, or too little overlap. Place them by hand as closely as you can (overlapping about a third), and turn up “Blend the joins”.' };
    }
    // 4. all at once (twice: then once more with only the closest matches)
    items.forEach(it => { it.R = G.pieceRot(it.p); });
    const photos = items.filter(it => it.p.kind === 'photo');
    const lens = !!opts.sameLens && photos.length > 1;
    const errBefore = meanGap(items, links);
    let res = adjust(items, links, lens, 30);
    if (lens) photos.forEach(it => { it.p.size *= res.scale; });
    // keep only the matches that now meet closely, and finish with those
    const px = Math.max(...items.map(it => it.p.size / it.img.W)) * Math.PI / 180;
    links.forEach(L => {
      const keep = [];
      L.ma.forEach((fa, i) => { const u = G.mul(items[L.a].R, ray(items[L.a], fa)), v = G.mul(items[L.b].R, ray(items[L.b], L.mb[i])); if (angle(u, v) < Math.max(3 * px, 0.004)) keep.push(i); });
      L.ma = keep.map(i => L.ma[i]); L.mb = keep.map(i => L.mb[i]);
    });
    const kept = links.filter(L => L.ma.length >= 6);
    res = adjust(items, kept, lens, 30);
    if (lens) photos.forEach(it => { it.p.size *= res.scale; });
    items.forEach(it => { if (it.free) Object.assign(it.p, toAngles(it.R)); });
    // safety net: a picture that "moved" much further than the rough placement could be off was fooled (by a repeating
    // pattern, say): put it back where it was placed
    const limit = (opts.gate || 15) + 5;
    pieces.forEach((x, i) => {
      const b = before[i];
      if (Math.max(Math.abs(G.wrap(x.p.yaw - b.yaw)), Math.abs(x.p.pitch - b.pitch), Math.abs(G.wrap(x.p.roll - b.roll))) > limit) { Object.assign(x.p, b); items[i].reverted = true; }
    });
    progress(1);
    // what to tell the person
    const linked = new Set(); kept.forEach(L => { linked.add(L.a); linked.add(L.b); });
    const unmatched = items.map((it, i) => i).filter(i => (!linked.has(i) || items[i].reverted) && items[i].free);
    const moved = Math.max(0, ...pieces.map((x, i) => Math.max(Math.abs(G.wrap(x.p.yaw - before[i].yaw)), Math.abs(x.p.pitch - before[i].pitch), Math.abs(G.wrap(x.p.roll - before[i].roll)))));
    return { ok: true, before, moved, gapBefore: errBefore, gapAfter: meanGap(items, kept), matches: kept.reduce((s, L) => s + L.ma.length, 0), unmatched };
  }
  // the average distance (in degrees) between matched points
  function meanGap(items, links) {
    let s = 0, n = 0;
    for (const L of links) L.ma.forEach((fa, i) => {
      const RA = items[L.a].R || G.pieceRot(items[L.a].p), RB = items[L.b].R || G.pieceRot(items[L.b].p);
      s += angle(G.mul(RA, ray(items[L.a], fa)), G.mul(RB, ray(items[L.b], L.mb[i]))); n++;
    });
    return n ? s / n * 180 / Math.PI : 0;
  }

  global.Features = { align };
})(window);
