// <ascii-bg dim="0..1" colors="bg,g1,g2,g3" loop="0" manual> — dim drifting ASCII field + sparse glyph rain.
// Ported from bulbashenko-com/auth (ui/src/components/visual/ascii-bg.js): one fragment shader in plain WebGL2, no
// three.js. Changes: colours come from the site palette (`colors`), and loop="N" makes every motion repeat after N
// seconds (the pre-rendered fallback video, scripts/skull-render). `manual` disables the animation loop: the caller
// draws with renderAt(t). Dispatches "background:fail" on window when WebGL2 is unavailable, software-only or lost.
const RAMP = ' .·:-=+*#%';
const RAIN = '01<>/\\|=+*:;$#ABCDEF';
const CW = 10, CH = 16;
const TAU = Math.PI * 2;
// Atlas: one tile per distinct glyph; RAMP and RAIN index into it.
const GLYPHS = [...new Set([...RAMP, ...RAIN])];
const ids = (s) => [...s].map((c) => GLYPHS.indexOf(c));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform vec2 uTile;
uniform float uDpr;
uniform float uBufH;
uniform vec2 uGrid;
uniform float uT;
uniform float uK;
uniform float uLoop;
uniform vec4 uW;
uniform vec3 uField;
uniform vec3 uHead;
uniform vec3 uTail;
uniform int uRamp[${RAMP.length}];
uniform int uRain[${RAIN.length}];
out vec4 o;
float h(float a, float b) { return fract(sin(a * 127.1 + b * 311.7) * 43758.5453); }
float glyph(int g, vec2 local) { return texture(uAtlas, (vec2(float(g) * uTile.x, 0.0) + local * uDpr) / vec2(float(${GLYPHS.length}) * uTile.x, uTile.y)).a; }
void over(inout vec4 o, vec3 c, float a) { o = vec4(c * a, a) + o * (1.0 - a); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uDpr;
  vec2 cell = floor(p / vec2(${CW}.0, ${CH}.0)), local = p - cell * vec2(${CW}.0, ${CH}.0);
  float x = cell.x, y = cell.y, t = uT;
  o = vec4(0.0);
  float u = x * 0.11, v = y * 0.19;
  float n = sin(u + v * 0.8 - t * uW.x) * 0.5
          + sin(u * 0.53 - v * 1.3 + t * uW.y + sin(t * uW.z) * 3.0) * 0.32
          + sin((u + v) * 0.27 + t * uW.w) * 0.18;
  n = (n + 1.0) / 2.0; n = n * n * n;
  if (n >= 0.18) {
    int rl = ${RAMP.length - 1};
    int ri = min(rl, int(floor(n * float(rl) + 0.5)));
    if (ri > 0) over(o, uField, glyph(uRamp[ri], local) * (0.06 + n * 0.32) * uK);
  }
  // Rain: each column runs drops in slots of its own length; a slot holds at most one drop, and some slots none.
  // In loop mode a slot divides the loop, and slot k reuses the dice of slot k mod (slots per loop).
  float slot = 6.0 + 3.0 * h(x, 1.0);
  float per = max(1.0, floor(uLoop / slot + 0.5));
  if (uLoop > 0.0) slot = uLoop / per;
  float tt = t + h(x, 2.0) * slot, k = floor(tt / slot), lt = tt - k * slot;
  if (uLoop > 0.0) k = mod(k, per);
  if (h(x + k * 0.37, 3.0) < 0.34) {
    float speed = (4.0 + 10.0 * h(x, k + 4.0)) * 4.2, len = 5.0 + floor(12.0 * h(x, k + 5.0));
    float head = floor(-h(x, k + 6.0) * uGrid.y * 0.5 + lt * speed);
    float j = head - y;
    if (j >= 0.0 && j < len) {
      uint hs = (uint(x) * 73856093u) ^ (uint(y) * 19349663u);
      int g = uRain[(hs + (j == 0.0 ? uint(t * 8.0) : 0u)) % ${RAIN.length}u];
      float f = 1.0 - j / len;
      if (j == 0.0) over(o, uHead, glyph(g, local) * 0.55 * uK);
      else over(o, uTail, glyph(g, local) * (0.05 + 0.2 * f * f) * uK);
    }
  }
}`;

class AsciiBg extends HTMLElement {
  static get observedAttributes() { return ['colors', 'loop']; }
  get _manual() { return this.hasAttribute('manual'); }
  get _loop() { return Math.max(0, parseFloat(this.getAttribute('loop') || '0') || 0); }
  attributeChangedCallback() { if (this._gl) this._uniforms(); }
  connectedCallback() {
    Object.assign(this.style, { display: 'block', position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    if (!this._gl && !this._init()) { window.dispatchEvent(new Event('background:fail')); return; }
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
    this._io = new IntersectionObserver((es) => { this._vis = es[es.length - 1].isIntersecting; }); this._io.observe(this);
    this._last = performance.now(); this._t = this._t || 0;
    if (this._manual) return;
    const loop = (now) => { this._raf = requestAnimationFrame(loop); this._draw(now); };
    this._raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect(); this._io?.disconnect();
    if (this._gl) {
      this._c.removeEventListener('webglcontextlost', this._onLost);
      const lose = this._gl.getExtension('WEBGL_lose_context');
      lose?.loseContext();
      this._c.remove(); this._c = this._gl = null;
    }
  }
  _init() {
    const c = document.createElement('canvas');
    Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    // Live: refuse software rendering, which would cost more than the fallback video. The headless renderer has no GPU.
    const gl = c.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: !this._manual, preserveDrawingBuffer: this._manual,
    });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const U = {};
    for (const n of ['uAtlas', 'uTile', 'uDpr', 'uBufH', 'uGrid', 'uT', 'uK', 'uLoop', 'uW', 'uField', 'uHead', 'uTail', 'uRamp', 'uRain']) U[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(U.uAtlas, 0);
    gl.uniform1iv(U.uRamp, ids(RAMP));
    gl.uniform1iv(U.uRain, ids(RAIN));
    this._onLost = (e) => { e.preventDefault(); cancelAnimationFrame(this._raf); window.dispatchEvent(new Event('background:fail')); };
    c.addEventListener('webglcontextlost', this._onLost);
    this.appendChild(c);
    this._c = c; this._gl = gl; this._U = U; this._dpr = 0;
    this._uniforms();
    document.fonts?.load('12px "IBM Plex Mono"').then(() => { this._dpr = 0; this._resize(); });
    return true;
  }
  // Palette and loop. colors = "bg,g1,g2,g3": the field is g2, a drop's head g1 and its tail between the two.
  _uniforms() {
    const gl = this._gl, U = this._U;
    const [, g1 = '#b8f0a4', g2 = '#78b864'] = (this.getAttribute('colors') || '').split(',').map((s) => s.trim());
    const c1 = rgb(g1), c2 = rgb(g2);
    gl.uniform3fv(U.uField, c2);
    gl.uniform3fv(U.uHead, c1);
    gl.uniform3fv(U.uTail, c2.map((v, i) => v + (c1[i] - v) * 0.7));
    // In loop mode each drift frequency is snapped to a whole number of cycles per loop.
    const L = this._loop, snap = (w) => (L ? (Math.round((w * L) / TAU) * TAU) / L : w);
    gl.uniform4f(U.uW, snap(0.55), snap(0.31), snap(0.07), snap(0.9));
    gl.uniform1f(U.uLoop, L);
    this._lastPaint = 0;
  }
  _atlas(dpr) {
    const tw = Math.ceil(CW * dpr), th = Math.ceil(CH * dpr);
    const a = document.createElement('canvas');
    a.width = GLYPHS.length * tw; a.height = th;
    const ctx = a.getContext('2d');
    ctx.font = `${12 * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    GLYPHS.forEach((ch, i) => ctx.fillText(ch, i * tw, 0));
    const gl = this._gl;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.uniform2f(this._U.uTile, tw, th);
    this._dpr = dpr;
  }
  _resize() {
    if (!this._gl) return;
    const W = this.clientWidth, H = this.clientHeight; if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), gl = this._gl;
    this._W = W; this._H = H;
    this._c.width = Math.round(W * dpr); this._c.height = Math.round(H * dpr);
    gl.viewport(0, 0, this._c.width, this._c.height);
    if (dpr !== this._dpr) this._atlas(dpr);
    gl.uniform1f(this._U.uDpr, this._c.height / H);
    gl.uniform1f(this._U.uBufH, this._c.height);
    gl.uniform2f(this._U.uGrid, Math.ceil(W / CW), Math.ceil(H / CH));
    this._lastPaint = 0;
  }
  _draw(now) {
    if (this._vis === false) { this._last = now; return; }
    if (!this._W) { this._resize(); if (!this._W) return; }
    const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
    const sp = parseFloat(this.getAttribute('speed') || '1');
    this._t += dt * sp;
    if (now - (this._lastPaint || 0) < 66) return; // ~15fps: quiet, cheap
    this._lastPaint = now;
    this._paint(this._t);
  }
  _paint(t) {
    const dim = Math.max(0, Math.min(1, parseFloat(this.getAttribute('dim') ?? '0.5')));
    const gl = this._gl;
    gl.uniform1f(this._U.uT, t);
    gl.uniform1f(this._U.uK, 1 - dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  /** Draws the field at time t (seconds); in loop mode t wraps around the loop. For `manual` elements. */
  renderAt(t) {
    if (!this._gl) return;
    if (!this._W) { this._resize(); if (!this._W) return; }
    const L = this._loop;
    this._paint(L ? ((t % L) + L) % L : t);
  }
}
if (!customElements.get('ascii-bg')) customElements.define('ascii-bg', AsciiBg);

// Side-effect module: registers the custom element.
export {}
