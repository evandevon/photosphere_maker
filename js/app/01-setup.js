/* js/app/01-setup.js · Shared helpers and state: $, G (Geom), R (Sphere), pics, sel, view, look, status(), deg(). Stops the page if WebGL 2 is missing.
 * Part of the page script; files share top-level names (see js/app/MAP.md). */
'use strict';
const $ = id => document.getElementById(id);
const G = window.Geom;

// ---------------------------------------------------------------- setting up
const glc = $('gl'), over = $('over'), stage = $('stage');
const R = window.Sphere(glc);
if (!R) {
  $('file-status').className = 'status err';
  $('file-status').textContent = 'This browser can’t do the 3D drawing this page needs. Please use Chrome or Edge on a computer (or a recent iPad).';
  throw new Error('WebGL 2 not available');
}
const COLOURS = ['#ee8b5c', '#6fc7b8', '#f2c98a', '#b9a3ff', '#86d6a0', '#ff8fb1', '#7ec8ff', '#e6e06a', '#ffb070', '#9be3d9'];
const pics = [];                 // { id, name, source, thumb, w, h, colour, p: piece }
let nextId = 1, sel = null, view = 'map';
const look = { yaw: 0, pitch: 0, fov: 80 };
const pic = id => pics.find(x => x.id === id);
const status = (id, kind, text) => { const e = $(id); e.className = 'status ' + (kind || ''); e.textContent = text || ''; };
const deg = v => (Math.round(v * 10) / 10) + '°';
