/*
 * FILE GUIDE: js/fill.js  ·  filling the gaps no picture reaches (window.Fill)
 * "Push-pull": the picture is shrunk again and again (each step averaging only the parts that have something in
 *   them), until even the biggest gap is covered; then it's grown back, and each gap takes the smooth colour from
 *   the shrunk copy just above it. The result: gaps fill with soft colour that flows in from their edges, so a
 *   missing ceiling or floor (or the rest of a room around one old photo) blends in rather than showing black.
 * Works on the small "coverage" copy from Sphere.coverage(): rgb (0..1) and a (how covered, 0..1).
 *   The sphere's left and right edges meet, so averaging wraps round.
 * Sections: average colour · push-pull
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- average colour (of what's covered)
  function average(c) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < c.a.length; j++) {
      const w = c.a[j] * Math.cos(((j / c.W | 0) + 0.5) / c.H * Math.PI - Math.PI / 2);   // rows near the poles count less
      r += c.rgb[j * 3] * w; g += c.rgb[j * 3 + 1] * w; b += c.rgb[j * 3 + 2] * w; n += w;
    }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
  }

  // ---------------------------------------------------------------- push-pull
  function pushPull(c) {
    // level 0: the coverage copy; each next level is half the size
    const levels = [{ W: c.W, H: c.H, rgb: Float32Array.from(c.rgb), a: Float32Array.from(c.a) }];
    while (levels[levels.length - 1].W > 2 && levels[levels.length - 1].H > 1) {
      const p = levels[levels.length - 1], W = Math.max(1, p.W >> 1), H = Math.max(1, p.H >> 1);
      const rgb = new Float32Array(W * H * 3), a = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, s = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const yy = Math.min(p.H - 1, y * 2 + dy), xx = (x * 2 + dx) % p.W, k = yy * p.W + xx, w = p.a[k];
          r += p.rgb[k * 3] * w; g += p.rgb[k * 3 + 1] * w; b += p.rgb[k * 3 + 2] * w; s += w;
        }
        const j = y * W + x;
        if (s > 1e-6) { rgb[j * 3] = r / s; rgb[j * 3 + 1] = g / s; rgb[j * 3 + 2] = b / s; }
        a[j] = Math.min(1, s);                           // partly covered averages still count as fairly sure
      }
      levels.push({ W, H, rgb, a });
    }
    // the very top: anything still empty takes the overall average
    const top = levels[levels.length - 1], avg = average(c);
    for (let j = 0; j < top.a.length; j++) {
      const t = top.a[j];
      for (let k = 0; k < 3; k++) top.rgb[j * 3 + k] = top.rgb[j * 3 + k] * t + avg[k] * (1 - t);
      top.a[j] = 1;
    }
    // back down: each level's gaps take the (smooth, wrapped) colour from the level above
    for (let L = levels.length - 2; L >= 0; L--) {
      const f = levels[L], q = levels[L + 1];
      for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) {
        const j = y * f.W + x, t = f.a[j];
        if (t >= 0.999) continue;
        // bilinear sample of the coarser level at this point
        const fx = (x + 0.5) * q.W / f.W - 0.5, fy = Math.max(0, Math.min(q.H - 1, (y + 0.5) * q.H / f.H - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        const y1 = Math.min(q.H - 1, y0 + 1);
        const X0 = ((x0 % q.W) + q.W) % q.W, X1 = (X0 + 1) % q.W;
        for (let k = 0; k < 3; k++) {
          const v = (q.rgb[(y0 * q.W + X0) * 3 + k] * (1 - ax) + q.rgb[(y0 * q.W + X1) * 3 + k] * ax) * (1 - ay) +
                    (q.rgb[(y1 * q.W + X0) * 3 + k] * (1 - ax) + q.rgb[(y1 * q.W + X1) * 3 + k] * ax) * ay;
          f.rgb[j * 3 + k] = f.rgb[j * 3 + k] * t + v * (1 - t);
        }
        f.a[j] = 1;
      }
    }
    // to bytes, for the graphics card
    const out = new Uint8Array(c.W * c.H * 4), L0 = levels[0];
    for (let j = 0; j < c.W * c.H; j++) {
      out[j * 4] = Math.max(0, Math.min(255, L0.rgb[j * 3] * 255));
      out[j * 4 + 1] = Math.max(0, Math.min(255, L0.rgb[j * 3 + 1] * 255));
      out[j * 4 + 2] = Math.max(0, Math.min(255, L0.rgb[j * 3 + 2] * 255));
      out[j * 4 + 3] = 255;
    }
    return out;
  }

  global.Fill = { average, pushPull };
})(window);
