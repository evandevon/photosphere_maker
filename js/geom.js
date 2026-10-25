/*
 * FILE GUIDE: js/geom.js  ·  sphere maths shared by everything (window.Geom)
 * Directions: yaw in degrees (left +, right −; 0 = the front), pitch in degrees (up +). A direction vector is
 *   (−sin yaw · cos pitch, sin pitch, −cos yaw · cos pitch): −z is the front, +y is up (the same as the 360 tours).
 * A finished 360 photo ("equirectangular"): across 0..1 = yaw +180 → −180 (left edge = behind, centre = front),
 *   down 0..1 = pitch +90 → −90.
 * A "piece" is one picture placed on the sphere:
 *   { kind: 'photo' | 'strip' | 'sphere', yaw, pitch, roll, size, aspect, crop: [left, right, top, bottom] }
 *   photo  = an ordinary (flat, pinhole) photo; size = its width in degrees of view
 *   strip  = a phone panorama (wrapped round a cylinder); size = how many degrees across it covers
 *   sphere = a 360 photo or part of one (equirectangular); size = degrees across (360 for a whole one)
 *   aspect = the cropped picture's width ÷ height. s, t = 0..1 across / down the cropped picture.
 * Sections (search for "// ---- <name>"): rotations · directions · pieces: picture → sphere and back · the 360 photo
 */
(function (global) {
  'use strict';
  const D = Math.PI / 180;

  // ---------------------------------------------------------------- rotations (3×3, row-major arrays)
  // R = turn (yaw, about up) · tilt (pitch, about the side axis) · roll (about the forward axis)
  function rot(yaw, pitch, roll) {
    const cy = Math.cos(yaw * D), sy = Math.sin(yaw * D), cp = Math.cos(pitch * D), sp = Math.sin(pitch * D);
    const cr = Math.cos((roll || 0) * D), sr = Math.sin((roll || 0) * D);
    // Ry · Rx
    const a = [cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp];
    // · Rz
    return [a[0] * cr + a[1] * sr, -a[0] * sr + a[1] * cr, a[2],
            a[3] * cr + a[4] * sr, -a[3] * sr + a[4] * cr, a[5],
            a[6] * cr + a[7] * sr, -a[6] * sr + a[7] * cr, a[8]];
  }
  const mul = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const mulT = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];

  // ---------------------------------------------------------------- directions
  const dir = (yaw, pitch) => [-Math.sin(yaw * D) * Math.cos(pitch * D), Math.sin(pitch * D), -Math.cos(yaw * D) * Math.cos(pitch * D)];
  const angles = v => ({ yaw: Math.atan2(-v[0], -v[2]) / D, pitch: Math.asin(Math.max(-1, Math.min(1, v[1]))) / D });
  const wrap = a => ((a % 360) + 540) % 360 - 180;

  // ---------------------------------------------------------------- pieces: picture → sphere and back
  // a point on the picture (s, t) → a direction in the picture's own frame
  function localDir(p, s, t) {
    const H = p.size * D, a = p.aspect;
    if (p.kind === 'photo') {
      const th = Math.tan(H / 2);
      const x = (s - 0.5) * 2 * th, y = (0.5 - t) * 2 * th / a, l = Math.hypot(x, y, 1);
      return [x / l, y / l, -1 / l];
    }
    const th = (s - 0.5) * H;
    if (p.kind === 'strip') {
      const tp = (0.5 - t) * H / a, l = Math.hypot(1, tp);
      return [Math.sin(th) / l, tp / l, -Math.cos(th) / l];
    }
    const ph = (0.5 - t) * H / a;
    return [Math.sin(th) * Math.cos(ph), Math.sin(ph), -Math.cos(th) * Math.cos(ph)];
  }
  // a direction in the picture's own frame → (s, t), or null if it isn't on the picture
  function pictureAt(p, l) {
    const H = p.size * D, a = p.aspect;
    let s, t;
    if (p.kind === 'photo') {
      if (l[2] >= -1e-4) return null;
      const th = Math.tan(H / 2);
      s = (l[0] / -l[2]) / th * 0.5 + 0.5;
      t = 0.5 - (l[1] / -l[2]) / (th / a) * 0.5;
    } else {
      const th = Math.atan2(l[0], -l[2]);
      s = th / H + 0.5;
      if (p.kind === 'strip') t = 0.5 - (l[1] / Math.max(Math.hypot(l[0], l[2]), 1e-6)) * a / H;
      else t = 0.5 - Math.asin(Math.max(-1, Math.min(1, l[1]))) / (H / a);
    }
    if (wraps(p)) s = ((s % 1) + 1) % 1;
    return s >= 0 && s <= 1 && t >= 0 && t <= 1 ? [s, t] : null;
  }
  const wraps = p => p.kind !== 'photo' && p.size >= 359.5;          // a whole circle: no left or right edge
  const pieceRot = p => rot(p.yaw, p.pitch, p.roll);
  // picture point → world direction, and back
  const toWorld = (p, s, t, R) => mul(R || pieceRot(p), localDir(p, s, t));
  const fromWorld = (p, v, R) => pictureAt(p, mulT(R || pieceRot(p), v));

  // ---------------------------------------------------------------- the 360 photo
  const eqDir = (u, v) => dir((0.5 - u) * 360, (0.5 - v) * 180);
  function eqAt(v) { const a = angles(v); return [0.5 - a.yaw / 360, 0.5 - a.pitch / 180]; }

  global.Geom = { D, rot, mul, mulT, dir, angles, wrap, localDir, pictureAt, wraps, pieceRot, toWorld, fromWorld, eqDir, eqAt };
})(window);
