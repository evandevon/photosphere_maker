/*
 * FILE GUIDE: js/sphere.js  ·  the renderer (window.Sphere): pictures → the sphere, on the graphics card (WebGL 2)
 * Every view is made the same way, so what you see is what you save:
 *   1. each picture is drawn onto the sphere in turn and ADDED into a running total (colour × weight, weight).
 *      The weight fades to 0 at a picture's edges ("blend width"), so overlaps cross-fade instead of showing joins.
 *   2. the total is divided out ("compose"), and anywhere no picture reaches is filled (smooth fill / a colour).
 * Views: the flat map of the whole sphere (mode 0, also used for saving, in tiles) and looking around (mode 1).
 * Uses js/geom.js for the same maths on the computer side (outlines, clicking, snapping).
 * Sections (search for "// ---- <name>"): shaders · setting up · pictures · drawing · saving · the fill's starting point
 * Gotchas: adding up needs a float render target (EXT_color_buffer_float), which every current desktop browser
 *   and recent iPads have. Big saves are drawn in 1024-pixel tiles so they fit in the graphics card's memory.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- shaders
  const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  // Where a pixel of the view looks: map (mode 0, part of the 360 photo given by uRect) or a camera (mode 1)
  const COMMON = `
uniform int uMode; uniform vec4 uRect; uniform mat3 uView; uniform float uTanHalf, uViewAspect; uniform mat3 uGlobal;
in vec2 vUv; out vec4 o;
vec2 eqUV() { return vec2(uRect.x + vUv.x * uRect.z, uRect.y + (1.0 - vUv.y) * uRect.w); }   // across, down (0 = top)
vec3 outDir() {
  if (uMode == 0) {
    vec2 uv = eqUV();
    float yaw = (0.5 - uv.x) * 6.28318531, pitch = (0.5 - uv.y) * 3.14159265;
    return vec3(-sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch));
  }
  vec2 n = vUv * 2.0 - 1.0;
  return uView * normalize(vec3(n.x * uTanHalf * uViewAspect, n.y * uTanHalf, -1.0));
}
vec2 dirUV(vec3 d) { return vec2(0.5 - atan(-d.x, -d.z) / 6.28318531, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.14159265); }`;

  // 1. one picture: its colour × weight, and its weight
  const PIECE = `#version 300 es
precision highp float;
${COMMON}
uniform sampler2D uTex; uniform mat3 uInv; uniform int uKind, uWrap; uniform float uSize, uAspect, uFeather, uGain; uniform vec4 uCrop;
void main() {
  vec3 l = uInv * (uGlobal * outDir());
  float H = radians(uSize);
  vec2 st;
  bool behind = false;
  if (uKind == 0) {                                   // ordinary photo
    behind = l.z > -1e-4;
    float z = min(l.z, -1e-4), th = tan(H * 0.5);
    st = vec2((l.x / -z) / th * 0.5 + 0.5, 0.5 - (l.y / -z) / (th / uAspect) * 0.5);
  } else {
    float a = atan(l.x, -l.z);
    st.x = a / H + 0.5;
    if (uKind == 1) st.y = 0.5 - (l.y / max(length(l.xz), 1e-6)) * uAspect / H;   // panorama strip
    else st.y = 0.5 - asin(clamp(l.y, -1.0, 1.0)) / (H / uAspect);                // 360 photo
  }
  // how fast the picture changes across this pixel (for sharp, unblurred detail), ignoring the jump where a
  // whole-circle picture wraps round at the back (which would otherwise draw a blurred line there)
  vec2 dx = dFdx(st), dy = dFdy(st);
  if (abs(dx.x) > 0.5) dx.x -= sign(dx.x);
  if (abs(dy.x) > 0.5) dy.x -= sign(dy.x);
  if (uWrap == 1) st.x = fract(st.x);
  float ex = uWrap == 1 ? 1.0 : min(st.x, 1.0 - st.x);
  float e = min(ex, min(st.y, 1.0 - st.y));
  vec2 k = vec2(uWrap == 1 ? 1.0 : 1.0 - uCrop.x - uCrop.y, 1.0 - uCrop.z - uCrop.w);
  vec2 uv = vec2(uWrap == 1 ? st.x : uCrop.x + st.x * k.x, uCrop.z + st.y * k.y);
  vec3 c = textureGrad(uTex, uv, dx * k, dy * k).rgb * uGain;
  if (behind || e <= 0.0) discard;
  float w = smoothstep(0.0, uFeather, e) * (0.1 + e);    // fades at the edges; a little favour to each picture's middle
  o = vec4(c * w, w);
}`;

  // 2. divide out, and fill what no picture reaches
  const COMPOSE = `#version 300 es
precision highp float;
${COMMON}
uniform sampler2D uAcc, uFill; uniform int uFillMode, uPreview; uniform vec3 uColour; uniform float uFeather; uniform vec2 uAccSize;
void main() {
  vec4 a = texture(uAcc, vUv);
  vec3 col = a.a > 1e-6 ? a.rgb / a.a : vec3(0.0);
  float cov = clamp(a.a / (0.1 + uFeather), 0.0, 1.0);
  vec3 fill;
  if (uFillMode == 1) fill = texture(uFill, dirUV(outDir())).rgb;
  else if (uFillMode == 2) fill = uColour;
  else if (uPreview == 1) {                            // gaps show as dim checks while you work
    vec2 q = floor(gl_FragCoord.xy / 12.0);
    fill = mod(q.x + q.y, 2.0) < 1.0 ? vec3(0.16, 0.14, 0.13) : vec3(0.22, 0.2, 0.19);
  } else fill = vec3(0.0);
  o = vec4(mix(fill, col, cov), 1.0);
}`;

  // ---------------------------------------------------------------- setting up
  function Sphere(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    const floatOk = !!gl.getExtension('EXT_color_buffer_float');
    if (!floatOk) return null;
    gl.getExtension('OES_texture_float_linear');
    const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 16384);
    const maxView = gl.getParameter(gl.MAX_VIEWPORT_DIMS);

    function program(fs) {
      const make = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const pr = gl.createProgram();
      gl.attachShader(pr, make(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, make(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, 'p');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const U = {}, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(pr, i); U[u.name] = gl.getUniformLocation(pr, u.name); }
      return { pr, U };
    }
    const P = program(PIECE), C = program(COMPOSE);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const texture = (wrapS, filter) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS || gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    // the running total, at whatever size is being drawn
    const acc = { tex: texture(), fb: gl.createFramebuffer(), w: 0, h: 0 };
    function accSize(w, h) {
      if (acc.w === w && acc.h === h) return;
      gl.bindTexture(gl.TEXTURE_2D, acc.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, acc.tex, 0);
      acc.w = w; acc.h = h;
    }
    // a saved tile (ordinary colours)
    const tile = { tex: texture(), fb: gl.createFramebuffer(), w: 0, h: 0 };
    function tileSize(w, h) {
      if (tile.w === w && tile.h === h) return;
      gl.bindTexture(gl.TEXTURE_2D, tile.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tile.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tile.tex, 0);
      tile.w = w; tile.h = h;
    }
    const fillTex = texture(gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    // ---------------------------------------------------------------- pictures
    const pieces = new Map();                 // id → { tex, piece }
    const state = { global: [0, 0, 0], feather: 0.12, fillMode: 0, colour: [0, 0, 0] };
    function setPicture(id, source) {
      let e = pieces.get(id);
      if (!e) { e = { tex: texture(gl.REPEAT, gl.LINEAR_MIPMAP_LINEAR), piece: null }; pieces.set(id, e); }
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      const an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
    function setPiece(id, piece) { const e = pieces.get(id); if (e) e.piece = piece; }
    function remove(id) { const e = pieces.get(id); if (e) { gl.deleteTexture(e.tex); pieces.delete(id); } }
    function setFill(rgbaBytes, w, h) {
      gl.bindTexture(gl.TEXTURE_2D, fillTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaBytes);
    }

    // ---------------------------------------------------------------- drawing
    const KIND = { photo: 0, strip: 1, sphere: 2 };
    function common(U, mode, rect, view, w, h) {
      gl.uniform1i(U.uMode, mode);
      gl.uniform4fv(U.uRect, rect || [0, 0, 1, 1]);
      const g = state.global;
      gl.uniformMatrix3fv(U.uGlobal, true, Geom.rot(g[0], g[1], g[2]));
      if (view) {
        gl.uniformMatrix3fv(U.uView, true, Geom.rot(view.yaw, view.pitch, 0));
        gl.uniform1f(U.uTanHalf, Math.tan(view.fov * Math.PI / 360));
        gl.uniform1f(U.uViewAspect, w / h);
      } else gl.uniformMatrix3fv(U.uView, true, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    }
    // add every picture into the running total
    function accumulate(mode, w, h, rect, view, only) {
      accSize(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(P.pr);
      common(P.U, mode, rect, view, w, h);
      gl.uniform1f(P.U.uFeather, state.feather);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(P.U.uTex, 0);
      pieces.forEach((e, id) => {
        const p = e.piece;
        if (!p || p.hidden || (only && !only.includes(id))) return;
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.uniformMatrix3fv(P.U.uInv, false, Geom.pieceRot(p));   // row-major sent untransposed = its transpose (the inverse)
        gl.uniform1i(P.U.uKind, KIND[p.kind]);
        gl.uniform1i(P.U.uWrap, Geom.wraps(p) ? 1 : 0);
        gl.uniform1f(P.U.uSize, p.size); gl.uniform1f(P.U.uAspect, p.aspect);
        gl.uniform4fv(P.U.uCrop, p.crop); gl.uniform1f(P.U.uGain, p.gain || 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      });
      gl.disable(gl.BLEND);
    }
    function compose(target, mode, w, h, rect, view, preview) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, w, h);
      gl.useProgram(C.pr);
      common(C.U, mode, rect, view, w, h);
      gl.uniform1f(C.U.uFeather, state.feather);
      gl.uniform1i(C.U.uFillMode, state.fillMode); gl.uniform3fv(C.U.uColour, state.colour);
      gl.uniform1i(C.U.uPreview, preview ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.tex); gl.uniform1i(C.U.uAcc, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fillTex); gl.uniform1i(C.U.uFill, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.activeTexture(gl.TEXTURE0);
    }
    // the whole sphere, flat, filling the canvas
    function drawMap() {
      const w = canvas.width, h = canvas.height;
      accumulate(0, w, h);
      compose(null, 0, w, h, null, null, true);
    }
    // looking around: view = { yaw, pitch, fov (degrees, top to bottom) }
    function drawView(view) {
      const w = canvas.width, h = canvas.height;
      accumulate(1, w, h, null, view);
      compose(null, 1, w, h, null, view, true);
    }

    // ---------------------------------------------------------------- saving
    // the finished 360 photo, W × H, drawn in tiles into a 2D canvas (top row first)
    async function renderEquirect(W, H, onProgress) {
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      const T = Math.min(1024, maxView[0], maxView[1]);
      const cols = Math.ceil(W / T), rows = Math.ceil(H / T);
      let done = 0;
      for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
        const x0 = tx * T, y0 = ty * T, w = Math.min(T, W - x0), h = Math.min(T, H - y0);
        const rect = [x0 / W, y0 / H, w / W, h / H];
        accumulate(0, w, h, rect);
        tileSize(w, h);
        compose(tile.fb, 0, w, h, rect, null, false);
        const px = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, tile.fb);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // the graphics card's rows run bottom-up: flip into the picture
        const img = new ImageData(w, h), row = w * 4;
        for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
        ctx.putImageData(img, x0, y0);
        done++;
        if (onProgress) onProgress(done / (cols * rows));
        await new Promise(r => setTimeout(r));
      }
      return out;
    }

    // ---------------------------------------------------------------- the fill's starting point
    // A small copy of the sphere: each pixel's colour and how covered it is (for working out the fill)
    function coverage(W, H) {
      accumulate(0, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
      const f = new Float32Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, f);
      const rgb = new Float32Array(W * H * 3), a = new Float32Array(W * H), k = 1 / (0.1 + state.feather);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = ((H - 1 - y) * W + x) * 4, j = y * W + x, wgt = f[i + 3];
        if (wgt > 1e-6) { rgb[j * 3] = f[i] / wgt; rgb[j * 3 + 1] = f[i + 1] / wgt; rgb[j * 3 + 2] = f[i + 2] / wgt; }
        a[j] = Math.min(1, wgt * k);
      }
      return { rgb, a, W, H };
    }

    return {
      gl, maxTex, state, setPicture, setPiece, remove, setFill, drawMap, drawView, renderEquirect, coverage,
      get count() { return pieces.size; }
    };
  }
  global.Sphere = Sphere;
})(window);
