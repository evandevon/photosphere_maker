/*
 * FILE GUIDE: js/snap.js  ·  brightness matching, and a "how well do they match" score (window.Snap)
 * Snap.align is the feature-matching "Snap together" in js/features.js (re-exported here so the page has one name).
 * The texture copies here ("detail": brightness compared with its neighbourhood, so exposure and vignetting drop out)
 *   are used to score how well overlaps match (Snap.score, for checking and tests) and to even out brightness.
 * Sections (search for "// ---- <name>"): detail copies · the cost · brightness
 */
(function (global) {
  'use strict';
  const G = global.Geom;

  // ---------------------------------------------------------------- detail copies
  // A small grey copy (long side ≤ max), blurred by `blur` pixels, turned into "texture": each pixel's brightness
  // compared with its neighbourhood (minus the local average, divided by the local spread). That keeps the pattern
  // of light and dark, which lines up well, while differences in exposure and vignetting between photos drop out.
  function detail(source, crop, max, blur) {
    const sw = source.width, sh = source.height;
    const cx = crop[0] * sw, cy = crop[2] * sh, cw = sw * (1 - crop[0] - crop[1]), ch = sh * (1 - crop[2] - crop[3]);
    const k = Math.min(1, max / Math.max(cw, ch)), W = Math.max(8, Math.round(cw * k)), H = Math.max(8, Math.round(ch * k));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (blur) x.filter = 'blur(' + blur + 'px)';
    x.drawImage(source, cx, cy, cw, ch, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    // running sums, for the local average and spread over a square about 1/10 of the picture across
    const S = new Float64Array((W + 1) * (H + 1)), S2 = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const v = lum[y * W + xx], i = (y + 1) * (W + 1) + xx + 1;
      S[i] = v + S[i - 1] + S[i - W - 1] - S[i - W - 2];
      S2[i] = v * v + S2[i - 1] + S2[i - W - 1] - S2[i - W - 2];
    }
    const r = Math.max(2, Math.round(Math.max(W, H) / 20)), g = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const x0 = Math.max(0, xx - r), x1 = Math.min(W, xx + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      const n = (x1 - x0) * (y1 - y0);
      const at = (A, X, Y) => A[Y * (W + 1) + X];
      const sum = at(S, x1, y1) - at(S, x0, y1) - at(S, x1, y0) + at(S, x0, y0);
      const sum2 = at(S2, x1, y1) - at(S2, x0, y1) - at(S2, x1, y0) + at(S2, x0, y0);
      const m = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
      g[y * W + xx] = Math.max(-3, Math.min(3, (lum[y * W + xx] - m) / (sd + 0.02)));
    }
    return { W, H, g, lum };
  }
  function sample(img, arr, s, t) {
    const x = s * (img.W - 1), y = t * (img.H - 1), x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(img.W - 1, x0 + 1), y1 = Math.min(img.H - 1, y0 + 1), ax = x - x0, ay = y - y0;
    return (arr[y0 * img.W + x0] * (1 - ax) + arr[y0 * img.W + x1] * ax) * (1 - ay) + (arr[y1 * img.W + x0] * (1 - ax) + arr[y1 * img.W + x1] * ax) * ay;
  }

  // ---------------------------------------------------------------- the cost
  // points spread over a picture (in its own s, t), keeping clear of the very edges
  function grid(p, n) {
    const pts = [], rows = Math.max(4, Math.round(n / Math.max(0.25, p.aspect)));
    for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) pts.push([0.04 + 0.92 * (i + 0.5) / n, 0.04 + 0.92 * (j + 0.5) / rows]);
    return pts;
  }
  // how well piece a's points match piece b: [sum of squared differences, number of points that overlap]
  function pairCost(A, B) {
    let sum = 0, n = 0;
    const Ra = G.pieceRot(A.p), Rb = G.pieceRot(B.p);
    for (const [s, t] of A.pts) {
      const st = G.fromWorld(B.p, G.toWorld(A.p, s, t, Ra), Rb);
      if (!st || st[0] < 0.02 || st[0] > 0.98 || st[1] < 0.02 || st[1] > 0.98) continue;
      const d = sample(A.img, A.img.g, s, t) - sample(B.img, B.img.g, st[0], st[1]);
      sum += d * d; n++;
    }
    return [sum, n];
  }
  // ---------------------------------------------------------------- brightness
  // Gains that make overlaps match in brightness (the anchor stays at 1; others are pulled gently towards 1)
  function gains(pieces) {
    const items = pieces.map(x => ({ p: x.p, img: detail(x.source, x.p.crop, 160, 1), pts: grid(x.p, 16) }));
    const ratio = [];
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      let la = 0, lb = 0, n = 0;
      const Ra = G.pieceRot(items[a].p), Rb = G.pieceRot(items[b].p);
      for (const [s, t] of items[a].pts) {
        const st = G.fromWorld(items[b].p, G.toWorld(items[a].p, s, t, Ra), Rb);
        if (!st) continue;
        la += sample(items[a].img, items[a].img.lum, s, t); lb += sample(items[b].img, items[b].img.lum, st[0], st[1]); n++;
      }
      if (n >= 8 && la > 0.01 && lb > 0.01) ratio.push({ a, b, r: la / lb, w: n });
    }
    const g = items.map(() => 1);
    for (let it = 0; it < 60; it++) {
      for (let k = 0; k < g.length; k++) {
        if (pieces[k].fixed) continue;
        let num = 0.5, den = 0.5;                                  // the gentle pull towards no change
        for (const r of ratio) {
          if (r.a === k) { num += r.w * g[r.b] / r.r; den += r.w; }
          else if (r.b === k) { num += r.w * g[r.a] * r.r; den += r.w; }
        }
        g[k] = Math.max(0.5, Math.min(2, num / den));
      }
    }
    return g;
  }

  // How well the pictures match where they are now (lower is better): for checking and testing
  function score(pieces, max, n, blur) {
    const items = pieces.map(x => ({ p: x.p, img: detail(x.source, x.p.crop, max || 400, blur == null ? 1 : blur), pts: grid(x.p, n || 36) }));
    let sum = 0, cnt = 0;
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const [s1, n1] = pairCost(items[a], items[b]), [s2, n2] = pairCost(items[b], items[a]);
      sum += s1 + s2; cnt += n1 + n2;
    }
    return { mean: cnt ? sum / cnt : 0, points: cnt };
  }

  global.Snap = { align: global.Features.align, gains, score };
})(window);
