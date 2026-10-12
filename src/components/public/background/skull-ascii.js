// <skull-ascii colors="bg,g1,g2,g3" seed="N" loop="0" manual> — punk skulls drifting diagonally, drawn as ASCII.
// Ported from the Claude Design page "ASCII Skull A Block Field Diagonal" (skull A, block ramp, field, diagonal mode)
// the way bulbashenko-com/auth ported its eye drone (ui/src/components/visual/eye-ascii.js). Changes:
// - the ASCII pass runs in shaders: the design read every frame back and drew each cell with fillText;
// - colours come from the site palette (`colors`) instead of the design's acid green;
// - the choreography is a seeded pure function of time; with loop="N" every motion repeats after N seconds, which the
//   pre-rendered fallback video needs (scripts/skull-render renders this element);
// - the skull under the pointer glitches.
// `manual` disables the animation loop and the pointer: the caller draws with renderAt(t) once `ready` resolves to true.
// Dispatches "background:fail" on window when WebGL2 is unavailable, software-only or lost.
import {
  AmbientLight, BoxGeometry, Camera, CanvasTexture, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, InstancedMesh,
  LinearFilter, Mesh, MeshStandardMaterial, NearestFilter, NoBlending, Object3D, PerspectiveCamera, PlaneGeometry,
  PointLight, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3, Vector4, WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RAMP = ' ░▒▓█';
const GLITCH = '01<>/\\|=+*:;$#ABCDEF';
// Every glyph in the atlas; a cell's glyph id is its index here + 1, and 0 means an empty cell.
const GLYPHS = [...new Set([...RAMP, ...GLITCH])].filter((c) => c !== ' ');
const gid = (c) => GLYPHS.indexOf(c) + 1;
const FONT = 10, CW = 6, CH = 10;
// Glyphs may spill into the rows below theirs, so atlas tiles are three rows high with the glyph in the middle row.
const TILE_ROWS = 3;
// Atlas tiles also carry this many device pixels on each side for the anti-aliased glyph edges.
const PAD = 2;
const SKULLS = 11;
const TAU = Math.PI * 2;

// ---------- deterministic randomness
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Integer hash of a few ints → [0, 1).
function hashf(...n) {
  let h = 0x9e3779b9;
  for (const v of n) { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// 16-entry palette over luminance from colour stops [[l, [r, g, b]], ...]; sRGB 0..1, flat for a vec3[16] uniform.
const mkPal = (stops) => new Float32Array(Array.from({ length: 16 }, (_, k) => {
  const l = k / 15;
  let i = 0; while (i < stops.length - 2 && l > stops[i + 1][0]) i++;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1], f = Math.min(1, Math.max(0, (l - a) / (b - a)));
  return ca.map((v, j) => Math.round(v + (cb[j] - v) * f) / 255);
}).flat());

const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Pass 1, one fragment per cell: the scene is rendered at one pixel per cell (as in the design); pick glyph and colour.
// Output: rgb = glyph colour (sRGB), a = glyph id / 255.
const CELL_FRAG = `
uniform sampler2D uScene;
uniform vec2 uGrid;
uniform int uRamp[8];
uniform int uRampLen;
uniform int uGlitchGlyphs[32];
uniform int uGlitchLen;
uniform vec3 uPal[16];
uniform bool uGlitch;
uniform vec3 uBands[6];
uniform int uBandCount;
uniform float uSeed;
uniform vec4 uHover[3];
float hash(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  return float(v.x) / 4294967295.0;
}
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  int cols = int(uGrid.x), rows = int(uGrid.y);
  int y = rows - 1 - cell.y, off = 0;
  if (uGlitch) for (int i = 0; i < 6; i++) {
    if (i >= uBandCount) break;
    if (y >= int(uBands[i].x) && y < int(uBands[i].y)) off = int(uBands[i].z);
  }
  // Hovered skulls (centre and radius in px, strength): rows tear sideways and glyphs swap, re-rolled at 15 Hz.
  vec2 cp = (vec2(float(cell.x), float(y)) + 0.5) * vec2(${CW}.0, ${CH}.0);
  float hv = 0.0;
  for (int i = 0; i < 3; i++) if (uHover[i].w > 0.0 && distance(cp, uHover[i].xy) < uHover[i].z) hv = max(hv, uHover[i].w);
  uint tick = uint(uSeed) / 2u;
  if (hv > 0.0 && hash(uvec3(uint(y), tick, 77u)) < 0.35 * hv) off += int((hash(uvec3(uint(y), tick, 78u)) - 0.5) * 14.0);
  int sx = cell.x - off;
  sx -= cols * int(floor(float(sx) / float(cols)));
  vec3 c = texelFetch(uScene, ivec2(sx, cell.y), 0).rgb;
  float lum = max(c.r, max(c.g, c.b));
  if (lum <= 0.04) { gl_FragColor = vec4(0.0); return; }
  int g = uRamp[1 + min(uRampLen - 2, int(floor(pow(lum, 0.85) * float(uRampLen - 1))))];
  uint s = uint(uSeed);
  if (hash(uvec3(cell, s)) < (uGlitch ? 0.04 : 0.0) + 0.2 * hv) g = uGlitchGlyphs[min(uGlitchLen - 1, int(hash(uvec3(cell, s + 7919u)) * float(uGlitchLen)))];
  gl_FragColor = vec4(uPal[min(15, int(lum * 16.0))], float(g) / 255.0);
}`;

// Pass 2, one fragment per cell: the glow layer (the design's blurred, saturated copy of the ASCII canvas). Each cell's
// colour weighted by its glyph's ink coverage, Gaussian-blurred over its neighbours (σ = 6px: 1 column, 0.6 rows).
const GLOW_FRAG = `
uniform sampler2D uCells;
uniform vec2 uGrid;
uniform float uCover[32];
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy), grid = ivec2(uGrid);
  vec3 acc = vec3(0.0);
  for (int dy = -1; dy <= 1; dy++) for (int dx = -2; dx <= 2; dx++) {
    ivec2 q = cell + ivec2(dx, dy);
    if (q.x < 0 || q.y < 0 || q.x >= grid.x || q.y >= grid.y) continue;
    vec4 c = texelFetch(uCells, q, 0);
    int g = int(c.a * 255.0 + 0.5);
    if (g == 0) continue;
    acc += c.rgb * uCover[g] * exp(-0.5 * float(dx * dx) - 1.389 * float(dy * dy));
  }
  acc /= 3.7226;
  float l = dot(acc, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(clamp(mix(vec3(l), acc, 1.3), 0.0, 1.0), 1.0);
}`;

// Pass 3, per screen pixel. A lit cell is first filled with the background colour (the design masks the field under the
// skulls), then the glyphs of the own row and the rows above and below are composited, top row first, in the order
// fillText drew them; neighbour columns count within the atlas padding, so anti-aliased edges meet without seams.
// Last, the glow is screened on top at half strength.
const OUT_FRAG = `
uniform sampler2D uCells;
uniform sampler2D uGlow;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uDpr;
uniform float uBufH;
uniform vec2 uTile;
uniform vec2 uAtlasSize;
uniform vec3 uBg;
uniform float uFlick;
uniform float uGlowK;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uDpr;
  int col = int(floor(p.x / ${CW}.0)), rc = int(floor(p.y / ${CH}.0)), cols = int(uGrid.x), rows = int(uGrid.y);
  vec4 o = vec4(0.0);
  if (col < cols && rc < rows && texelFetch(uCells, ivec2(col, rows - 1 - rc), 0).a > 0.0) o = vec4(uBg, 1.0);
  for (int k = -1; k <= 1; k++) {
    int r = rc + k;
    if (r < 0 || r >= rows) continue;
    float ly = (p.y - float(r) * ${CH}.0 + ${CH}.0) * uDpr;
    for (int m = -1; m <= 1; m++) {
      int c = col + m;
      float lx = (p.x - float(c) * ${CW}.0) * uDpr + ${PAD}.0;
      if (c < 0 || c >= cols || lx < 0.0 || lx >= uTile.x) continue;
      vec4 cell = texelFetch(uCells, ivec2(c, rows - 1 - r), 0);
      int g = int(cell.a * 255.0 + 0.5);
      if (g == 0) continue;
      float a = texture2D(uAtlas, vec2(float(g - 1) * uTile.x + lx, ly) / uAtlasSize).a * uFlick;
      o = vec4(cell.rgb * a, a) + o * (1.0 - a);
    }
  }
  vec3 glow = texture2D(uGlow, vec2(p.x / (${CW}.0 * uGrid.x), 1.0 - p.y / (${CH}.0 * uGrid.y))).rgb * uGlowK;
  float a = o.a + max(glow.r, max(glow.g, glow.b)) * (1.0 - o.a);
  gl_FragColor = vec4(min(o.rgb + glow * (1.0 - o.rgb), vec3(a)), a);
}`;

// ---------- skull A (the design's v1)
function buildSkull() {
  const bone = new MeshStandardMaterial({ color: 0xf2ffe0, roughness: 0.55, metalness: 0.05 });
  const voidM = new MeshStandardMaterial({ color: 0x020302, roughness: 1 });
  const neon = new MeshStandardMaterial({ color: 0xb6ff3a, emissive: 0x9aff1a, emissiveIntensity: 0.9, roughness: 0.4 });
  const chrome = new MeshStandardMaterial({ color: 0xd8e8d0, roughness: 0.2, metalness: 0.9 });
  const g = new Group();
  const add = (geo, mat, pos, scale, rot) => {
    const m = new Mesh(geo, mat);
    m.position.set(...pos); if (scale) m.scale.set(...scale); if (rot) m.rotation.set(...rot);
    g.add(m); return m;
  };
  const S = (r, w = 48, h = 32) => new SphereGeometry(r, w, h);
  const side = (fn) => { for (const sx of [-1, 1]) fn(sx); };
  add(S(1, 72, 56), bone, [0, 0.35, -0.1], [0.92, 0.95, 1.08]);
  add(S(0.72), bone, [0, 0.5, 0.34], [1.05, 0.95, 0.78]);
  add(S(0.62), bone, [0, 0.2, -0.78], [1.05, 0.95, 0.8]);
  add(new CapsuleGeometry(0.06, 0.7, 6, 20), bone, [0, -0.08, -1.02], null, [0, 0, Math.PI / 2]);
  add(new TorusGeometry(1.0, 0.012, 6, 96, Math.PI * 0.75), voidM, [0, 0.35, -0.1], [1.002, 0.952, 1.082], [0, Math.PI / 2, Math.PI * 0.2]);
  add(new BoxGeometry(0.018, 0.42, 0.02), voidM, [-0.28, 0.78, 0.8], null, [0.6, 0.3, 0.5]);
  add(new BoxGeometry(0.016, 0.22, 0.02), voidM, [-0.42, 0.66, 0.76], null, [0.4, 0.5, -0.4]);
  add(S(0.62), bone, [0, -0.3, 0.3], [1.05, 0.8, 0.9]);
  add(new BoxGeometry(0.1, 0.22, 0.08), bone, [0, 0.04, 0.95], null, [-0.25, 0, 0]);
  add(S(0.12), bone, [0, 0.2, 0.93], [1.3, 0.7, 0.6]);
  side((sx) => {
    add(new CapsuleGeometry(0.075, 0.3, 8, 24), bone, [sx * 0.31, 0.25, 0.86], [1, 1, 0.8], [0, -sx * 0.35, Math.PI / 2 + sx * 0.12]);
    add(new TorusGeometry(0.25, 0.045, 12, 48), bone, [sx * 0.33, 0.0, 0.84], [1.05, 0.92, 1], [0, sx * 0.3, 0]);
    add(S(0.26), voidM, [sx * 0.33, 0.0, 0.8], [1.02, 0.92, 0.55]);
    add(S(0.035, 16, 12), neon, [sx * 0.31, -0.02, 0.83]);
    add(S(0.2), bone, [sx * 0.55, -0.2, 0.52], [1.15, 0.75, 0.95]);
    add(new CapsuleGeometry(0.055, 0.4, 6, 20), bone, [sx * 0.71, -0.2, 0.15], null, [Math.PI / 2, 0, 0]);
    add(S(0.3), voidM, [sx * 0.84, 0.0, 0.15], [0.22, 0.75, 0.7]);
    add(S(0.11), bone, [sx * 0.62, -0.42, -0.32], [1, 1.4, 1]);
    add(S(0.25, 32, 24), bone, [sx * 0.53, -0.56, -0.02], [0.24, 0.9, 0.6], [0.15, 0, sx * 0.12]);
    add(S(0.08), bone, [sx * 0.6, -0.34, -0.12]);
    add(new ConeGeometry(0.06, 0.26, 3), voidM, [sx * 0.045, -0.26, 0.9], [1, 1, 0.6], [0.25, 0, Math.PI - sx * 0.12]);
  });
  add(new BoxGeometry(0.015, 0.18, 0.04), bone, [0, -0.28, 0.93]);
  add(S(0.6), bone, [0, -0.78, 0.12], [0.88, 0.48, 0.88]);
  add(S(0.2), bone, [0, -0.98, 0.55], [1.4, 0.7, 0.8]);
  add(new BoxGeometry(0.66, 0.03, 0.22), voidM, [0, -0.66, 0.72]);
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i - (N - 1) / 2) * 0.14;
    const canine = i === 3 || i === N - 4;
    const tooth = new BoxGeometry(0.058, canine ? 0.15 : 0.12, 0.06);
    add(tooth, bone, [Math.sin(a) * 0.48, -0.588 - (canine ? 0.015 : 0), 0.32 + Math.cos(a) * 0.45], null, [0, a, 0]);
    add(tooth, bone, [Math.sin(a) * 0.46, -0.732 + (canine ? 0.015 : 0), 0.32 + Math.cos(a) * 0.43], null, [0, a, 0]);
  }
  for (let i = 0; i < 11; i++) {
    const phi = 0.5 + i * 0.18;
    const h = 0.7 - Math.abs(i - 3) * 0.045;
    add(new ConeGeometry(0.06, h, 24), neon,
      [0, 0.35 + 0.95 * Math.sin(phi) + Math.sin(phi) * h * 0.42, -0.1 + 1.08 * Math.cos(phi) + Math.cos(phi) * h * 0.42],
      null, [Math.PI / 2 - phi, 0, 0]);
  }
  add(new CylinderGeometry(0.2, 0.2, 0.05, 32), chrome, [0.84, 0.45, -0.05], null, [0, 0, Math.PI / 2 - 0.3]);
  add(new TorusGeometry(0.13, 0.025, 12, 48), neon, [0.87, 0.46, -0.05], null, [0, Math.PI / 2, -0.3]);
  add(S(0.05, 16, 12), neon, [0.88, 0.46, -0.05]);
  add(new TorusGeometry(0.55, 0.018, 8, 64, Math.PI * 0.6), chrome, [0.55, 0.05, -0.35], null, [0, Math.PI / 2, Math.PI * 1.1]);
  for (let i = 0; i < 3; i++) add(S(0.03, 12, 8), chrome, [0.8 - i * 0.02, 0.72 - i * 0.12, 0.25 + i * 0.05]);
  add(S(0.032, 16, 12), chrome, [-0.665, -0.385, -0.12]);
  add(new TorusGeometry(0.09, 0.018, 12, 40), chrome, [-0.67, -0.475, -0.12], null, [0, Math.PI / 2, 0]);
  return g;
}

// All skulls in one draw call per material: each part's transform is baked into its geometry, the parts are merged per
// material, and every skull is an instance (the design drew ~60 meshes per skull, ~700 per frame).
function instanceSkulls(skull, count) {
  skull.updateMatrixWorld(true);
  const parts = new Map();
  skull.traverse((m) => {
    if (!m.isMesh) return;
    if (!parts.has(m.material)) parts.set(m.material, []);
    parts.get(m.material).push(m.geometry.clone().applyMatrix4(m.matrixWorld));
  });
  return [...parts].map(([material, geos]) => {
    const mesh = new InstancedMesh(mergeGeometries(geos), material, count);
    mesh.frustumCulled = false; // instances move every frame; the cached bounds would go stale
    return mesh;
  });
}

// ---------- choreography: a pure function of time s (seconds)
// Diagonal mode: each skull crosses the screen top-left → bottom-right, then the next crossing starts off-screen with a
// new lane, depth, size and spin axis. With a loop, periods are snapped so that everything repeats after `loop` seconds.
function choreography(seed, loop) {
  const rand = mulberry32(seed);
  const rnd = (a, b) => a + rand() * (b - a);
  const per = (p) => (loop ? loop / Math.max(1, Math.round(loop / p)) : p);
  const count = (p) => (loop ? Math.round(loop / p) : 0);
  const wrap = (k, n) => (n ? ((k % n) + n) % n : k);
  const snap = (w) => (loop ? (Math.sign(w) * TAU * Math.max(1, Math.round((Math.abs(w) * loop) / TAU))) / loop : w);
  const tracks = Array.from({ length: SKULLS }, (_, i) => {
    // The design advances 0.035–0.07 of a crossing per second; a crossing spans 1.3 (−0.15 … 1.15).
    const period = per(1.3 / rnd(0.035, 0.07));
    return { i, period, n: count(period), phase: rand(), spin: snap(rnd(0.8, 2.2) * (rand() < 0.5 ? -1 : 1)), k: NaN, leg: null };
  });
  const leg = (tr, k) => {
    if (tr.k !== k) {
      const r = (j) => hashf(seed, tr.i, wrap(k, tr.n), j);
      tr.k = k;
      tr.leg = { lane: r(0) * 2 - 1, z: -6 + 7.5 * r(1), sc: 0.55 + 0.45 * r(2), ax: new Vector3(r(3) * 2 - 1, r(4) * 2 - 1, r(5) - 0.5).normalize() };
    }
    return tr.leg;
  };
  // Glitch bursts: at most one per slot of ~2.8 s (the design fires one every 2.8 s on average).
  const gSlot = per(2.8), gN = count(gSlot);
  const glitch = (s, cols, rows) => {
    const k = Math.floor(s / gSlot), r = (j) => hashf(seed, 0x6c, wrap(k, gN), j);
    const t0 = k * gSlot + r(1) * (gSlot - 0.3);
    if (r(0) > 0.8 || s < t0 || s >= t0 + 0.08 + 0.18 * r(2)) return null;
    return Array.from({ length: 2 + Math.floor(4 * r(3)) }, (_, b) => {
      const y0 = Math.floor(r(4 + 3 * b) * rows);
      return [y0, y0 + 1 + Math.floor(6 * r(5 + 3 * b)), Math.trunc((r(6 + 3 * b) - 0.5) * cols * 0.25)];
    });
  };
  // Canvas flicker at 30 Hz: a 4% chance per tick of a dip to 0.72 that recovers by 35% per tick, plus 3% jitter.
  const ticks = loop * 30;
  const flick = (s) => {
    const n = Math.floor(s * 30);
    let f = 1;
    for (let j = 0; j < 6; j++) if (hashf(seed, 0xf1, wrap(n - j, ticks)) < 0.04) f -= 0.098 * 0.65 ** j;
    return f * (0.97 + 0.03 * hashf(seed, 0xf2, wrap(n, ticks)));
  };
  return { tracks, leg, glitch, flick, lightW: snap(13) };
}

class SkullAscii extends HTMLElement {
  static get observedAttributes() { return ['colors']; }
  get _manual() { return this.hasAttribute('manual'); }
  constructor() {
    super();
    this._t = 0; this._frame = this._frame.bind(this);
    this.ready = new Promise((resolve) => { this._resolveReady = resolve; });
  }
  attributeChangedCallback() { if (this._r) this._palette(); }
  connectedCallback() {
    Object.assign(this.style, { display: 'block', position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    if (!this._manual) {
      this._onMove = (e) => { this._ptr = { x: e.clientX, y: e.clientY }; };
      this._onOut = (e) => { if (!e.relatedTarget) this._ptr = null; };
      window.addEventListener('pointermove', this._onMove, { passive: true });
      window.addEventListener('pointerout', this._onOut);
    }
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
    this._io = new IntersectionObserver((es) => { this._vis = es[es.length - 1].isIntersecting; }); this._io.observe(this);
    this._start();
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    if (this._onMove) {
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('pointerout', this._onOut);
    }
    this._ro?.disconnect(); this._io?.disconnect();
    this._teardown();
  }
  _fail() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    this._resolveReady(false);
    window.dispatchEvent(new Event('background:fail'));
  }
  _teardown() {
    if (!this._r) return;
    const R = this._r; this._r = null;
    this._gpu.forEach((o) => o.dispose());
    R.domElement.removeEventListener('webglcontextlost', this._onLost);
    R.dispose(); R.forceContextLoss(); R.domElement.remove();
  }
  _start() {
    if (!this._r) {
      const manual = this._manual;
      let R;
      // Live: refuse software rendering, which would cost more than the fallback video. The headless renderer has no GPU.
      try {
        R = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: !manual, preserveDrawingBuffer: manual });
      } catch { this._fail(); return; }
      this._r = R;
      R.setClearColor(0x000000, 0);
      R.autoClear = false;
      Object.assign(R.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
      this._onLost = (e) => { e.preventDefault(); this._fail(); };
      R.domElement.addEventListener('webglcontextlost', this._onLost);
      this.appendChild(R.domElement);
      if (!this._scene) {
        const scene = new Scene(); this._scene = scene;
        this._cam = new PerspectiveCamera(36, 1, 0.1, 80);
        this._cam.position.set(0, 0.05, 6);
        this._key = new PointLight(0xd9ff9a, 70, 0, 2); this._key.position.set(3.5, 3, 4.5);
        const fill = new PointLight(0x5cff5c, 25, 0, 2); fill.position.set(-4, -1, 3);
        const rim = new PointLight(0xb6ff3a, 50, 0, 2); rim.position.set(0, 3, -5);
        scene.add(this._key, fill, rim, new AmbientLight(0x1c2a12, 0.5));
        this._parts = instanceSkulls(buildSkull(), SKULLS);
        scene.add(...this._parts);
        // Transforms only; the instances above draw them.
        this._skulls = Array.from({ length: SKULLS }, () => Object.assign(new Object3D(), { userData: { hover: 0 } }));
        const seed = Number(this.getAttribute('seed')) >>> 0 || (Math.random() * 2 ** 32) >>> 0;
        this._loop = Math.max(0, parseFloat(this.getAttribute('loop') || '0') || 0);
        this._C = choreography(seed, this._loop);
      }
      const cellOpts = { minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false, depthBuffer: false };
      this._rt = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false });
      this._cells = new WebGLRenderTarget(1, 1, cellOpts);
      this._glow = new WebGLRenderTarget(1, 1, { ...cellOpts, minFilter: LinearFilter, magFilter: LinearFilter });
      this._atlasCanvas = document.createElement('canvas');
      this._atlas = new CanvasTexture(this._atlasCanvas);
      Object.assign(this._atlas, { flipY: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
      const ints = (a) => { const out = new Int32Array(32); out.set(a); return out; };
      const pass = (fragmentShader, uniforms) => new ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, blending: NoBlending, depthTest: false, depthWrite: false });
      this._cellMat = pass(CELL_FRAG, {
        uScene: { value: this._rt.texture }, uGrid: { value: new Vector2(1, 1) },
        uRamp: { value: new Int32Array([...RAMP].map((c) => (c === ' ' ? 0 : gid(c))).concat([0, 0, 0])) }, uRampLen: { value: RAMP.length },
        uGlitchGlyphs: { value: ints([...GLITCH].map(gid)) }, uGlitchLen: { value: GLITCH.length },
        uPal: { value: new Float32Array(48) }, uGlitch: { value: false }, uBands: { value: new Float32Array(18) }, uBandCount: { value: 0 }, uSeed: { value: 0 },
        uHover: { value: Array.from({ length: 3 }, () => new Vector4()) },
      });
      this._glowMat = pass(GLOW_FRAG, {
        uCells: { value: this._cells.texture }, uGrid: { value: new Vector2(1, 1) }, uCover: { value: new Float32Array(32) },
      });
      this._outMat = pass(OUT_FRAG, {
        uCells: { value: this._cells.texture }, uGlow: { value: this._glow.texture }, uAtlas: { value: this._atlas },
        uGrid: { value: new Vector2(1, 1) }, uDpr: { value: 1 }, uBufH: { value: 1 },
        uTile: { value: new Vector2(1, 1) }, uAtlasSize: { value: new Vector2(1, 1) },
        uBg: { value: new Vector3() }, uFlick: { value: 1 }, uGlowK: { value: 0.5 },
      });
      const geo = new PlaneGeometry(2, 2);
      this._quad = new Mesh(geo, this._cellMat); this._quad.frustumCulled = false;
      this._quadScene = new Scene(); this._quadScene.add(this._quad);
      this._quadCam = new Camera();
      this._gpu = [this._rt, this._cells, this._glow, this._atlas, this._cellMat, this._glowMat, this._outMat, geo];
      this._atlasDpr = 0;
      this._palette();
      document.fonts?.load(`${FONT}px "IBM Plex Mono"`).then(() => { this._atlasDpr = 0; this._resize(); });
    }
    this._resize();
    this._last = performance.now();
    this._resolveReady(true);
    if (!this._manual && !this._raf) this._raf = requestAnimationFrame(this._frame);
  }
  // colors = "bg,g1,g2,g3". Glyphs run g3 → g2 → g1 with luminance and the brightest bleach toward white, as the
  // design's acid green did; lit cells hide the field behind them with bg.
  _palette() {
    const [bg = '#060b06', g1 = '#b8f0a4', g2 = '#78b864', g3 = '#4a7840'] = (this.getAttribute('colors') || '').split(',').map((s) => s.trim());
    const c1 = rgb(g1), hi = c1.map((v) => v + (255 - v) * 0.6);
    this._cellMat.uniforms.uPal.value = mkPal([[0, rgb(g3)], [0.5, rgb(g2)], [0.8, c1], [1, hi]]);
    this._outMat.uniforms.uBg.value.set(...rgb(bg).map((v) => v / 255));
  }
  _buildAtlas(dpr) {
    const tw = Math.ceil(CW * dpr) + 2 * PAD, th = Math.ceil(TILE_ROWS * CH * dpr);
    const c = this._atlasCanvas;
    c.width = GLYPHS.length * tw; c.height = th;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = `${FONT * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    GLYPHS.forEach((ch, i) => ctx.fillText(ch, i * tw + PAD, CH * dpr));
    // Ink per glyph, relative to a full cell, for the glow pass (one readback per atlas build).
    const px = ctx.getImageData(0, 0, c.width, c.height).data, cover = this._glowMat.uniforms.uCover.value;
    GLYPHS.forEach((_, i) => {
      let sum = 0;
      for (let y = 0; y < th; y++) for (let x = i * tw; x < (i + 1) * tw; x++) sum += px[(y * c.width + x) * 4 + 3];
      cover[i + 1] = Math.min(1, sum / 255 / (CW * CH * dpr * dpr));
    });
    // A resized canvas needs a fresh GPU texture.
    this._atlas.dispose(); this._atlas.needsUpdate = true;
    const u = this._outMat.uniforms;
    u.uTile.value.set(tw, th); u.uAtlasSize.value.set(c.width, c.height);
    this._atlasDpr = dpr;
  }
  _resize() {
    if (!this._r) return;
    const W = this.clientWidth, H = this.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), R = this._r;
    this._W = W; this._H = H;
    const cols = (this._cols = Math.ceil(W / CW)), rows = (this._rows = Math.ceil(H / CH));
    R.setPixelRatio(dpr); R.setSize(W, H, false);
    this._rt.setSize(cols, rows); this._cells.setSize(cols, rows); this._glow.setSize(cols, rows);
    if (dpr !== this._atlasDpr) this._buildAtlas(dpr);
    this._cellMat.uniforms.uGrid.value.set(cols, rows);
    this._glowMat.uniforms.uGrid.value.set(cols, rows);
    const buf = R.getDrawingBufferSize(new Vector2()), u = this._outMat.uniforms;
    u.uGrid.value.set(cols, rows);
    u.uDpr.value = buf.y / H; u.uBufH.value = buf.y;
    const cam = this._cam;
    cam.aspect = (cols * CW) / (rows * CH);
    cam.fov = cam.aspect < 1 ? (36 / cam.aspect) * 0.85 : 36;
    cam.updateProjectionMatrix();
  }
  _viewHalf(z) {
    const h = Math.tan(((this._cam.fov / 2) * Math.PI) / 180) * (6 - z);
    return [h * this._cam.aspect, h];
  }
  _place(s, dt) {
    const C = this._C, P = dt !== undefined ? this._ptr : null;
    const GW = this._cols * CW, GH = this._rows * CH, hover = [];
    this._skulls.forEach((k, i) => {
      const tr = C.tracks[i], u = tr.phase + s / tr.period, kc = Math.floor(u), p = -0.15 + 1.3 * (u - kc);
      const L = C.leg(tr, kc);
      const [hw, hh] = this._viewHalf(L.z), m = 2.2;
      const sx = -hw - m, sy = hh + m, ex = hw + m, ey = -hh - m;
      const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy);
      const px = -dy / len, py = dx / len, spread = Math.max(hw, hh) * 1.1;
      const x = sx + dx * p + px * L.lane * spread, y = sy + dy * p + py * L.lane * spread;
      k.position.set(x, y, L.z);
      k.scale.setScalar(L.sc);
      k.quaternion.setFromAxisAngle(L.ax, tr.spin * s + i);
      if (dt !== undefined) {
        // Live only. The skull on screen (px over the cell grid) against the pointer.
        const cx = (x / hw * 0.5 + 0.5) * GW, cy = (0.5 - (y - 0.05) / hh * 0.5) * GH, r = (1.35 * L.sc / hh) * GH * 0.5;
        const d = P ? Math.hypot(P.x - cx, P.y - cy) : Infinity;
        k.userData.hover += ((d < r ? 1 : 0) - k.userData.hover) * Math.min(1, dt * 8);
        if (k.userData.hover > 0.02) hover.push([cx, cy, r * 1.15, k.userData.hover, L.z]);
      }
      k.updateMatrix();
      this._parts.forEach((part) => part.setMatrixAt(i, k.matrix));
    });
    this._parts.forEach((part) => { part.instanceMatrix.needsUpdate = true; });
    // The nearest hovered skulls glitch (the shader takes three).
    const slots = this._cellMat.uniforms.uHover.value;
    hover.sort((a, b) => b[4] - a[4]);
    slots.forEach((v, j) => (hover[j] ? v.set(...hover[j].slice(0, 4)) : v.set(0, 0, 0, 0)));
  }
  _pass(mat, target) {
    this._quad.material = mat;
    this._r.setRenderTarget(target);
    this._r.render(this._quadScene, this._quadCam);
  }
  _draw(s, dt) {
    const C = this._C, R = this._r;
    this._place(s, dt);
    this._key.intensity = 70 + Math.sin(s * C.lightW) * 3;
    R.setRenderTarget(this._rt); R.clear(); R.render(this._scene, this._cam);
    const u = this._cellMat.uniforms, bands = C.glitch(s, this._cols, this._rows);
    u.uGlitch.value = !!bands;
    (bands || []).slice(0, 6).forEach((b, i) => u.uBands.value.set(b, i * 3));
    u.uBandCount.value = bands ? Math.min(6, bands.length) : 0;
    u.uSeed.value = Math.floor(s * 30) % 16777216;
    this._outMat.uniforms.uFlick.value = C.flick(s);
    this._pass(this._cellMat, this._cells);
    this._pass(this._glowMat, this._glow);
    R.setRenderTarget(null); R.clear();
    this._pass(this._outMat, null);
  }
  _frame(now) {
    this._raf = requestAnimationFrame(this._frame);
    if (this._vis === false) { this._last = now; return; }
    if (now - (this._last || 0) < 32) return; // ~30fps
    if (!this._W) { this._resize(); if (!this._W) return; }
    const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
    this._t += dt;
    this._draw(this._t, dt);
  }
  /** Draws the frame at time t (seconds); in loop mode t wraps around the loop. For `manual` elements, after `ready`. */
  renderAt(t) {
    if (!this._r) return;
    if (!this._W) { this._resize(); if (!this._W) return; }
    const L = this._loop;
    this._draw(L ? ((t % L) + L) % L : t);
  }
}
if (!customElements.get('skull-ascii')) customElements.define('skull-ascii', SkullAscii);
