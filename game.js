import * as THREE from 'three';
import { PLAYER, WEAPONS as WSTATS, MAPS, ECO, TEAMS, MATCH, RECOIL, rayAABB, OPERATORS, randomOp } from './shared.js';

/* =====================================================
   BLOCKY STRIKE  -  Paso 3: multijugador
   Modos:  'solo' = práctica contra bots
           'mp'   = online con otros jugadores (el servidor valida disparos y daño)
   ===================================================== */

const CFG = {
  speed: 7.2, walkSpeed: 3.4, jump: 9.0, gravity: 26,
  radius: PLAYER.radius, height: PLAYER.height, eye: PLAYER.eye, step: PLAYER.step,
  playerRespawn: PLAYER.respawn, killHeal: PLAYER.killHeal,
  // modo solo (ajusta estos valores para hacerlo más fácil o difícil)
  bots: 6, botHp: 100, botDamage: 12, botSpeed: 3.6, botRespawn: 5,
};

const $ = id => document.getElementById(id);
const overlay = $('overlay'), hitEl = $('hit'), msgEl = $('msg'), dmgEl = $('dmg');
const deathEl = $('death'), deathTxt = $('deathtxt'), feedEl = $('feed');
const boardEl = $('board'), chatLog = $('chatlog'), chatIn = $('chatin');
const r3 = v => Math.round(v * 1000) / 1000;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let mode = 'menu';   // 'menu' | 'solo' | 'mp' | 'ended'

/* ---------- Escena ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec4e8);
scene.fog = new THREE.Fog(0x9ec4e8, 48, 135);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

// Iluminación tipo CS (sol fuerte + cielo + relleno frío)
const hemi = new THREE.HemisphereLight(0xdce9f8, 0x5a5040, 0.92);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x3a4450, 0.28);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.55);
sun.position.set(38, 58, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.028;
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 190 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa8c4e8, 0.42);
fill.position.set(-28, 20, -18);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe8c0, 0.22);
rim.position.set(0, 12, 42);
scene.add(rim);

// Cielo en gradiente + nubes suaves
function makeSky(skyHex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  const top = new THREE.Color(skyHex).offsetHSL(0.03, 0.08, 0.18);
  const mid = new THREE.Color(skyHex);
  const bot = new THREE.Color(skyHex).offsetHSL(-0.03, -0.08, -0.12);
  g.addColorStop(0, '#' + top.getHexString());
  g.addColorStop(0.4, '#' + mid.getHexString());
  g.addColorStop(1, '#' + bot.getHexString());
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // nubes
  for (let i = 0; i < 28; i++) {
    const x = Math.random() * 512;
    const y = 30 + Math.random() * 100;
    const r = 20 + Math.random() * 50;
    const grd = ctx.createRadialGradient(x, y, 2, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // sol suave
  const sx = 380, sy = 50;
  const sunG = ctx.createRadialGradient(sx, sy, 2, sx, sy, 40);
  sunG.addColorStop(0, 'rgba(255,245,200,0.9)');
  sunG.addColorStop(0.4, 'rgba(255,220,150,0.25)');
  sunG.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = sunG;
  ctx.beginPath(); ctx.arc(sx, sy, 40, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 20),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false })
  );
  sky.name = 'sky';
  return sky;
}
let skyMesh = makeSky(0x87b8e0);
scene.add(skyMesh);

// Suelo de baldosas claras (estilo Complejo AGI / CS)
function makeTilesTex(baseHex) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  const n = 8, t = 512 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const col = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.045);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(i * t, j * t, t, t);
    const g = ctx.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.07)');
    ctx.fillStyle = g;
    ctx.fillRect(i * t, j * t, t, t);
  }
  for (let i = 0; i < 9000; i++) {
    const v = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.fillStyle = v;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 14; i++) {      // manchas y rozaduras
    const x = Math.random() * 512, y = Math.random() * 512, r = 14 + Math.random() * 34;
    const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(30,36,44,0.10)');
    gr.addColorStop(1, 'rgba(30,36,44,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(52,60,70,0.62)';        // juntas
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(i * t - 1.5, 0, 3, 512);
    ctx.fillRect(0, i * t - 1.5, 512, 3);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.14)';     // brillo del borde de cada loseta
  for (let i = 0; i < n; i++) {
    ctx.fillRect(i * t + 2, 0, 1, 512);
    ctx.fillRect(0, i * t + 2, 512, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Muro de bloques de concreto grandes (estilo CS / Complejo AGI)
function makeConcreteTex(hexColor) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(hexColor);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 512, 512);
  // Bloques grandes alineados (como en las capturas)
  const cols = 2, rows = 3, bw = 512 / cols, bh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * bw, y = r * bh;
      const col = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
      ctx.fillStyle = '#' + col.getHexString();
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      // bisel superior claro
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 4, y + 4, bw - 8, 5);
      // sombra inferior
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + 4, y + bh - 10, bw - 8, 6);
      // sombra lateral derecha
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(x + bw - 10, y + 6, 5, bh - 12);
    }
  }
  // Juntas profundas entre bloques
  ctx.fillStyle = 'rgba(12,16,22,0.88)';
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * bh - 2, 512, 5);
  for (let k = 0; k <= cols; k++) ctx.fillRect(k * bw - 2, 0, 5, 512);
  // Grano fino de concreto
  for (let i = 0; i < 12000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  // Manchas de humedad / suciedad
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 512, h = 50 + Math.random() * 140;
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(18,22,28,0.18)');
    gr.addColorStop(1, 'rgba(18,22,28,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, Math.random() * 80, 8 + Math.random() * 14, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGroundTex(baseHex) {
  if (MAP.floor === 'tiles') return makeTilesTex(baseHex);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const v = (Math.random() - 0.5) * 36;
    const col = base.clone().offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.05, v / 255);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // manchas más grandes (arena / tierra)
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 8 + Math.random() * 28;
    const col = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // grietas suaves
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 25; i++) {
    ctx.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Textura de muro / concreto / metal según color
const wallTexCache = new Map();
function makeWallTex(hexColor) {
  const concrete = MAP.style === 'concrete';
  const key = (hexColor | 0) + (concrete ? 0x1000000 : 0);
  if (wallTexCache.has(key)) return wallTexCache.get(key);
  if (concrete) { const ct = makeConcreteTex(hexColor | 0); wallTexCache.set(key, ct); return ct; }
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(hexColor | 0);
  const lum = base.r * 0.3 + base.g * 0.5 + base.b * 0.2;
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 512, 512);
  // ruido base (arena / piedra)
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const col = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(x, y, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  // Paneles / bloques de piedra arenisca (estilo Dust)
  if (lum > 0.22 && lum < 0.82) {
    const bh = 48, bw = 96;
    for (let row = 0; row < 12; row++) {
      const off = (row % 2) * (bw / 2);
      for (let col = -1; col < 8; col++) {
        const x = col * bw + off, y = row * bh;
        // relleno ligeramente distinto por bloque
        const colB = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
        ctx.fillStyle = '#' + colB.getHexString();
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        ctx.globalAlpha = 1;
        // bisel
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 2, y + 2, bw - 4, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(x + 2, y + bh - 5, bw - 4, 3);
        // junta
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      }
    }
  } else if (lum >= 0.82) {
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 512; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 50; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, 0);
      ctx.lineTo(Math.random() * 512, 512);
      ctx.stroke();
    }
  }
  // manchas / desgaste
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 16 + Math.random() * 50;
    const grd = ctx.createRadialGradient(x, y, 2, x, y, r);
    grd.addColorStop(0, 'rgba(0,0,0,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  wallTexCache.set(key, tex);
  return tex;
}

function matWorld(color) {
  const map = makeWallTex(color);
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.04,
  });
}

/* ---------- Texturas de tela (procedurales) ---------- */
const fabricCache = new Map();
function makeFabricTex(hexColor) {
  const key = (hexColor | 0);
  if (fabricCache.has(key)) return fabricCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(key);
  // base
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 128, 128);
  // trama de tejido (cruzada)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const weave = ((x >> 1) & 1) ^ ((y >> 1) & 1);
      const fiber = ((x + y * 3) % 7 === 0) ? 1 : 0;
      let v = weave ? -10 : 8;
      v += fiber ? -6 : 0;
      v += (Math.random() - 0.5) * 12;
      const col = base.clone().offsetHSL(0, 0, v / 255);
      ctx.fillStyle = '#' + col.getHexString();
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // hilos horizontales suaves
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < 128; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, y, 128, 1);
  }
  // hilos verticales
  for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(x, 0, 1, 128);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  fabricCache.set(key, tex);
  return tex;
}

const matCharCache = new Map();
function matChar(color, kind = 'cloth') {
  const key = kind + ':' + (color | 0);
  if (matCharCache.has(key)) return matCharCache.get(key);
  let mat;
  if (kind === 'skin') {
    mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.58, metalness: 0.02,
    });
  } else if (kind === 'hard') {
    mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.4, metalness: 0.35,
    });
  } else if (kind === 'plastic') {
    mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.35, metalness: 0.1,
    });
  } else {
    // tela: textura de tejido + sin brillo metálico
    const map = makeFabricTex(color);
    mat = new THREE.MeshStandardMaterial({
      map,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: false,
    });
  }
  matCharCache.set(key, mat);
  return mat;
}

// Calidad gráfica: 0 baja (más FPS), 1 media, 2 alta
let gfxQuality = 2;
try {
  const g = parseInt(localStorage.getItem('bs_gfx'), 10);
  if (g === 0 || g === 1 || g === 2) gfxQuality = g;
} catch (e) {}

function applyGfxQuality(q) {
  gfxQuality = q;
  const pr = q === 0 ? Math.min(devicePixelRatio, 1) : q === 1 ? Math.min(devicePixelRatio, 1.75) : Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  const shadows = q > 0;
  renderer.shadowMap.enabled = shadows;
  sun.castShadow = shadows;
  if (shadows) {
    const size = q === 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    renderer.shadowMap.type = q === 2 ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  }
  renderer.toneMappingExposure = q === 0 ? 1.12 : q === 1 ? 1.25 : 1.38;
  hemi.intensity = q === 0 ? 0.75 : 0.92;
  sun.intensity = q === 0 ? 1.15 : q === 1 ? 1.4 : 1.55;
  try { localStorage.setItem('bs_gfx', String(q)); } catch (e) {}
  const sel = $('gfxsel');
  if (sel) sel.value = String(q);
}
applyGfxQuality(gfxQuality);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- Mapa (los datos vienen de shared.js, igual que en el servidor) ---------- */
const solids = [];       // cajas de colisión
const worldMeshes = [];  // mallas del mundo (para disparos y línea de visión)
const decals = [];       // marcas de bala (máx. MAX_HOLES)
let rayTargets = [];     // mundo + bots + jugadores (para raycast de disparos)
const groundGuns = [];   // armas en el suelo (declarado pronto: loadMap lo usa al inicio)
const medkits = [];      // botiquines

function addBox(cx, cz, w, d, h, color, y0 = 0) {
  const mat = matWorld(color);
  // repetir textura según tamaño del bloque
  if (mat.map) {
    mat.map = mat.map.clone();
    mat.map.needsUpdate = true;
    const repX = Math.max(1, w / 2.2);
    const repY = Math.max(1, h / 2.2);
    mat.map.repeat.set(repX, repY);
  }
  mat.roughness = 0.72 + Math.random() * 0.18;
  mat.metalness = 0.04 + Math.random() * 0.08;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(cx, y0 + h / 2, cz);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  worldMeshes.push(mesh);
  solids.push({ x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 });

  // borde superior (cornisa) en muros altos → más detalle
  if (h >= 2.5 && w >= 0.6 && d >= 0.6) {
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.12, 0.12, d + 0.12),
      matWorld(new THREE.Color(color).offsetHSL(0, 0, -0.1).getHex())
    );
    lip.position.set(cx, y0 + h + 0.05, cz);
    lip.castShadow = lip.receiveShadow = true;
    scene.add(lip);
    worldMeshes.push(lip);
  }
  // base ligeramente sobresaliente
  if (h >= 1.5 && y0 < 0.05) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.08, 0.15, d + 0.08),
      matWorld(new THREE.Color(color).offsetHSL(0, 0, -0.15).getHex())
    );
    base.position.set(cx, 0.07, cz);
    base.receiveShadow = true;
    scene.add(base);
    worldMeshes.push(base);
  }
}

// Operación AGI: configuración y estado (declarado aquí porque loadMap() lo usa al arrancar)
const AGI_CFG = {
  hp: 150, armor: 100,                       // vida y armadura del jugador en este modo
  allies: 3, allyHp: 100, allyDamage: 12, allyObjDamage: 9, allyFire: 0.32, allyRespawn: 18,
  robotHp: 80, robotDamage: 7, robotDamageAlly: 11, robotSpeed: 3.5, robotFire: 0.42,
  poolMax: 26, startRobots: 6,
  baseCap: 8, capPerMin: 1.5, capMax: 16,    // robots vivos a la vez
  prodRate: 12, prodDrop: 3,                 // robots por minuto (baja con cada nodo destruido)
  reinforceEvery: 40, reinforceCount: 2,
  compileSeconds: 540, nodeSlow: 0.75, killSetback: 0.12,   // la IA se compila en ~9 min
  ammoDropChance: 0.45,
};
const AGI = {
  active: false, over: false, win: false, t: 0, compile: 0, compileRate: 1, kills: 0, nodesDown: 0,
  prodT: 3, reinforceT: 25, eventT: 0, hudT: 0, shieldMsgT: 0, endT: 0, endMsg: '',
  objs: [], robots: [], allies: [], drops: [], nav: null, wpEls: [], rowEls: {}, humEls: [],
};
let MAP = MAPS.dust;
let groundMesh = null;
let bombState = null; // { state, carrier, x, z, site, explodesAt, plantProg, defuseProg }
let bombMesh = null;
let siteMarkers = [];
let bombBeepT = 0;   // temporizador del pitido acelerado de la bomba

// Construye (o reconstruye) el mundo con el mapa elegido
function loadMap(key) {
  MAP = MAPS[key] || MAPS.dust;
  agiResetWorld();
  for (const m of worldMeshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  worldMeshes.length = 0;
  solids.length = 0;
  // limpiar marcas de bala al cambiar de mapa
  for (const d of decals) { scene.remove(d); d.material.dispose(); }
  decals.length = 0;
  scene.background = new THREE.Color(MAP.sky);
  const fogFar = (MAP.half || 60) * 2.4;
  scene.fog = new THREE.Fog(MAP.sky, Math.max(45, fogFar * 0.35), fogFar);
  // cielo con nubes
  if (skyMesh) { scene.remove(skyMesh); skyMesh.material.map?.dispose(); skyMesh.material.dispose(); skyMesh.geometry.dispose(); }
  skyMesh = makeSky(MAP.sky);
  scene.add(skyMesh);
  const gTex = makeGroundTex(MAP.ground);
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300, 32, 32),
    new THREE.MeshStandardMaterial({
      map: gTex, color: 0xffffff, roughness: MAP.floor === 'tiles' ? 0.5 : 0.95, metalness: MAP.floor === 'tiles' ? 0.06 : 0.0,
    })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  worldMeshes.push(groundMesh);
  for (const b of MAP.boxes) addBox(...b);
  buildSiteMarkers();
  bombState = null;
  bombBeepT = 0;
  if (bombMesh) bombMesh.visible = false;
  // vaciar armas/botiquines si ya existen (arrays declarados arriba)
  while (groundGuns.length) {
    const g = groundGuns.pop();
    try { scene.remove(g.mesh); g.mesh.material?.dispose?.(); } catch (e) {}
  }
  while (medkits.length) {
    const m = medkits.pop();
    try { scene.remove(m.mesh); } catch (e) {}
  }
  rayTargets = [...worldMeshes];
}
loadMap('dust');

/* ---------- Física compartida (jugador y bots) ---------- */
function hits(x, y, z) {
  const r = CFG.radius, h = CFG.height;
  for (const b of solids) {
    if (x + r > b.x0 && x - r < b.x1 &&
        y + h > b.y0 && y < b.y1 - 0.001 &&
        z + r > b.z0 && z - r < b.z1) return b;
  }
  return null;
}

/** True si el punto está libre (sin colisión con muros, teniendo en cuenta el radio del jugador). */
function isFree(x, y, z) {
  return !hits(x, y, z);
}

/**
 * Busca una posición segura cerca de (x, z).
 * Evita que al reaparecer el jugador quede atrapado dentro de una pared.
 */
function findSafePos(x, z, y = 0) {
  if (isFree(x, y, z)) return [x, y, z];
  // Espiral de intentos: primero cerca, luego más lejos
  const dists = [0.45, 0.9, 1.4, 2.0, 2.8, 3.6, 4.5];
  for (const dist of dists) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const nx = x + Math.cos(ang) * dist;
      const nz = z + Math.sin(ang) * dist;
      if (isFree(nx, y, nz)) return [nx, y, nz];
      // probar un poco más arriba por si hay un escalón / plataforma
      if (y < 0.2 && isFree(nx, y + 0.55, nz)) return [nx, y + 0.55, nz];
    }
  }
  // Último recurso: posición original
  return [x, y, z];
}

// e = { pos, vx, vy, vz, onGround }
function slide(e, axis, d) {
  const p = e.pos;
  const nx = axis === 'x' ? p.x + d : p.x;
  const nz = axis === 'z' ? p.z + d : p.z;
  const b = hits(nx, p.y, nz);
  if (!b) { p.x = nx; p.z = nz; return; }
  // intentar subir un escalón
  if (e.onGround && b.y1 - p.y <= CFG.step && !hits(nx, b.y1, nz)) {
    p.x = nx; p.z = nz; p.y = b.y1;
  } else if (axis === 'x') e.vx = 0;
  else e.vz = 0;
}

function gravityStep(e, dt) {
  const p = e.pos;
  e.vy -= CFG.gravity * dt;
  const ny = p.y + e.vy * dt;
  const b = hits(p.x, ny, p.z);
  if (b) {
    if (e.vy < 0) { p.y = b.y1; e.onGround = true; }
    e.vy = 0;
  } else { p.y = ny; e.onGround = false; }
  if (p.y <= 0) { p.y = 0; e.vy = 0; e.onGround = true; }
}

/* ---------- Jugador ---------- */
const bots = [];
const player = {
  pos: new THREE.Vector3(), vx: 0, vy: 0, vz: 0, onGround: false,
  yaw: 0, pitch: 0, hp: 100, maxHp: 100, armor: 0, helmet: false, kills: 0, deaths: 0,
  dead: false, respawnT: 0, killer: '',
};

function pickPlayerSpawn() {
  let best = MAP.spawns[0], bestD = -1;
  for (const s of MAP.spawns) {
    let md = 1e9;
    for (const b of bots) if (b.alive) md = Math.min(md, Math.hypot(s[0] - b.pos.x, s[1] - b.pos.z));
    if (md > bestD) { bestD = md; best = s; }
  }
  return best;
}

function placePlayer() {
  const s = pickPlayerSpawn();
  const [sx, sy, sz] = findSafePos(s[0], s[1], 0);
  player.pos.set(sx, sy, sz);
  player.vx = player.vy = player.vz = 0;
  player.onGround = true;
  player.yaw = s[1] > 0 ? 0 : Math.PI;
  player.pitch = 0;
  player.hp = 100;
}
placePlayer();

const keys = {};
let locked = false, mouseDown = false, trigger = false;

/* ---------- Armas (estadísticas en shared.js, aspecto y sonido aquí) ---------- */
// parts: [ancho, alto, largo, x, y, z, color]  — vista FP: largo hacia -Z
const LOOKS = [
  // 0 cuchillo
  { recoil: 0.01, kick: 0.55, vol: 0.15, rate2: 1.2, muzzleZ: -0.42,
    parts: [
      [0.035, 0.018, 0.32, 0, 0.03, -0.08, 0xd8dce0],   // hoja
      [0.05, 0.04, 0.04, 0, 0.02, 0.1, 0x222226],      // guarda
      [0.045, 0.07, 0.12, 0, -0.01, 0.18, 0x5a3a22],   // mango
      [0.04, 0.04, 0.03, 0, -0.01, 0.26, 0xb0b4b8],    // pomo
    ] },
  // 1 pistola
  { recoil: 0.025, kick: 1.25, vol: 0.28, rate2: 1.3, muzzleZ: -0.36,
    parts: [
      [0.055, 0.1, 0.22, 0, 0.02, -0.02, 0x2a2c30],    // corredera
      [0.05, 0.07, 0.18, 0, -0.02, 0.02, 0x1e2024],    // armazón
      [0.04, 0.035, 0.12, 0, 0.06, -0.08, 0x3a3c40],   // cañón
      [0.048, 0.15, 0.08, 0, -0.12, 0.1, 0x4a3220],    // empuñadura
      [0.03, 0.03, 0.04, 0, 0.08, 0.04, 0x111113],     // alza
      [0.015, 0.02, 0.02, 0, 0.09, -0.14, 0xf0c040],   // punto mira
      [0.04, 0.08, 0.05, 0, -0.08, 0.02, 0x1a1a1c],    // cargador
    ] },
  // 2 SMG
  { recoil: 0.014, kick: 0.8, vol: 0.22, rate2: 1.5, muzzleZ: -0.48,
    parts: [
      [0.06, 0.1, 0.32, 0, 0.02, -0.05, 0x2c2e32],
      [0.04, 0.04, 0.22, 0, 0.02, -0.3, 0x1a1c1e],     // cañón
      [0.05, 0.06, 0.08, 0, 0.02, -0.42, 0x111113],    // freno
      [0.045, 0.16, 0.06, 0, -0.12, 0.05, 0x1a1a1c],   // cargador
      [0.05, 0.12, 0.1, 0, -0.1, 0.14, 0x3a3a3e],     // grip
      [0.04, 0.05, 0.14, 0, 0.02, 0.22, 0x2a2c30],     // culata corta
      [0.03, 0.04, 0.05, 0, 0.1, 0.0, 0x111113],       // mira
      [0.08, 0.03, 0.08, 0, -0.04, -0.15, 0x4a4a50],   // guardamanos
    ] },
  // 3 rifle (M4A1) — más detalle para vista FP
  { recoil: 0.018, kick: 1.1, vol: 0.32, rate2: 1, muzzleZ: -0.66,
    parts: [
      [0.062, 0.085, 0.30, 0, 0.0, 0.02, 0x1e2126],      // receptor inferior
      [0.058, 0.07, 0.34, 0, 0.065, -0.02, 0x282c32],    // receptor superior
      [0.038, 0.022, 0.34, 0, 0.115, -0.02, 0x17191d],   // riel Picatinny superior
      [0.014, 0.055, 0.014, 0, 0.125, -0.48, 0x111315],  // punto de mira delantero
      [0.032, 0.042, 0.032, 0, 0.13, 0.12, 0x111315],    // alza trasera
      [0.072, 0.072, 0.28, 0, 0.03, -0.32, 0x2a2e34],    // guardamanos
      [0.076, 0.012, 0.28, 0, 0.07, -0.32, 0x16181c],    // riel superior guardamanos
      [0.076, 0.012, 0.28, 0, -0.008, -0.32, 0x16181c],  // riel inferior
      [0.012, 0.06, 0.28, 0.038, 0.03, -0.32, 0x16181c], // riel lateral
      [0.012, 0.06, 0.28, -0.038, 0.03, -0.32, 0x16181c],
      [0.028, 0.028, 0.14, 0, 0.03, -0.52, 0x121416],    // cañón
      [0.042, 0.042, 0.08, 0, 0.03, -0.61, 0x0c0d0f],    // apagallamas
      [0.052, 0.17, 0.078, 0, -0.125, -0.02, 0x1a1d22],  // cargador
      [0.048, 0.125, 0.062, 0, -0.105, 0.12, 0x131518],  // empuñadura
      [0.042, 0.042, 0.14, 0, 0.02, 0.24, 0x1a1d22],     // tubo de culata
      [0.052, 0.078, 0.22, 0, 0.0, 0.34, 0x1a1d22],      // culata
      [0.055, 0.02, 0.08, 0, 0.05, 0.42, 0x121416],      // cantonera
      [0.022, 0.022, 0.022, 0, 0.145, -0.12, 0xf0c040],  // punto rojo
    ] },
  // 4 escopeta
  { recoil: 0.07, kick: 2.3, vol: 0.48, rate2: 0.7, muzzleZ: -0.8,
    parts: [
      [0.075, 0.1, 0.35, 0, 0.02, 0.05, 0x3a3c40],
      [0.05, 0.05, 0.55, 0, 0.03, -0.35, 0x1a1c1e],    // cañón largo
      [0.055, 0.055, 0.08, 0, 0.03, -0.68, 0x111113],
      [0.07, 0.07, 0.2, 0, -0.05, -0.15, 0x6b4a28],    // guardamanos madera
      [0.06, 0.12, 0.12, 0, -0.08, 0.18, 0x6b4a28],    // grip
      [0.07, 0.1, 0.28, 0, -0.02, 0.4, 0x6b4a28],      // culata
      [0.03, 0.04, 0.04, 0, 0.1, 0.05, 0x111113],
    ] },
  // 5 sniper
  { recoil: 0.055, kick: 2.6, vol: 0.55, rate2: 0.55, muzzleZ: -0.98,
    parts: [
      [0.065, 0.09, 0.5, 0, 0.02, 0.0, 0x2a3528],
      [0.04, 0.04, 0.55, 0, 0.02, -0.48, 0x1a1c1e],
      [0.05, 0.05, 0.1, 0, 0.02, -0.82, 0x111113],
      [0.06, 0.08, 0.22, 0, 0.12, -0.05, 0x151515],    // visor
      [0.045, 0.045, 0.16, 0, 0.12, -0.2, 0x0a0a0a],   // tubo óptico
      [0.05, 0.05, 0.05, 0, 0.12, 0.08, 0x222226],
      [0.06, 0.12, 0.1, 0, -0.1, 0.1, 0x5a3a22],
      [0.06, 0.09, 0.28, 0, -0.02, 0.38, 0x5a3a22],
      [0.07, 0.05, 0.2, 0, -0.02, -0.25, 0x3a4a35],
    ] },
  // 6 HE
  { recoil: 0, kick: 0.4, vol: 0.2, rate2: 1, muzzleZ: -0.22,
    parts: [
      [0.11, 0.15, 0.11, 0, -0.02, -0.04, 0x3a5a2a],
      [0.09, 0.04, 0.09, 0, 0.08, -0.04, 0x2a4a1a],
      [0.04, 0.07, 0.04, 0, 0.12, -0.04, 0x888888],
      [0.03, 0.03, 0.03, 0, 0.16, -0.04, 0xcc3333],
    ] },
  // 7 Flash
  { recoil: 0, kick: 0.4, vol: 0.2, rate2: 1, muzzleZ: -0.22,
    parts: [
      [0.1, 0.14, 0.1, 0, -0.02, -0.04, 0xc8b060],
      [0.08, 0.04, 0.08, 0, 0.08, -0.04, 0xa09040],
      [0.04, 0.06, 0.04, 0, 0.12, -0.04, 0x666666],
    ] },
  // 8 Smoke
  { recoil: 0, kick: 0.4, vol: 0.2, rate2: 1, muzzleZ: -0.22,
    parts: [
      [0.11, 0.15, 0.11, 0, -0.02, -0.04, 0x4a6a8a],
      [0.09, 0.04, 0.09, 0, 0.08, -0.04, 0x3a5a7a],
      [0.04, 0.07, 0.04, 0, 0.12, -0.04, 0x888888],
      [0.03, 0.03, 0.03, 0, 0.16, -0.04, 0xdddddd],
    ] },
];
const WEAPONS = WSTATS.map((s, i) => ({ ...s, ...(LOOKS[i] || { recoil: 0, kick: 0.3, vol: 0.2, rate2: 1, muzzleZ: -0.2, parts: [[0.1, 0.12, 0.1, 0, 0, 0, 0x555555]] }) }));

let armSkinMat = null;   // piel de los brazos de la vista en primera persona
const guns = WEAPONS.map(w => {
  const g = new THREE.Group();
  for (const [a, b, c, x, y, z, col] of w.parts) {
    const metal = (col & 0xff) < 0x50 || ((col >> 16) & 0xff) < 0x40;
    const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), new THREE.MeshStandardMaterial({
      color: col,
      roughness: metal ? 0.28 : 0.68,
      metalness: metal ? 0.72 : 0.06,
    }));
    m.position.set(x, y, z);
    g.add(m);
  }
  // Flash de boca más visible (esfera + halo)
  const flash = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95 })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.45 })
  );
  flash.add(core); flash.add(halo);
  flash.position.set(0, 0.02, w.muzzleZ || -0.4);
  flash.visible = false;
  g.add(flash);
  g.position.set(0.24, -0.18, -0.48);
  g.visible = false;
  camera.add(g);
  return { group: g, flash };
});

let cur = 1;                                   // 0 cuchillo, 1 pistola, ...
const ammo = WEAPONS.map(w => w.mag);
const reserve = WEAPONS.map(() => 0);        // munición de reserva (solo se usa en Operación AGI)
let owned = WEAPONS.map((_, i) => i <= 1);     // cuchillo + pistola
let myMoney = ECO.startMoney;
let myTeam = 0;
let myOpId = 0; // operador militar 0-7
let pendingStart = null; // { type:'practice'|'mp'|'solo'|'agi', ... }
let teamScore = [0, 0];
let reloading = false, reloadT = 0, fireCd = 0, gunKick = 0, flashT = 0, msgT = 0, drawT = 0, dmgFlash = 0;
let buyOpen = false;
let bombHold = false; // manteniendo E
let bombActAcc = 0;
let recoilPitch = 0, recoilYaw = 0;

// Cosméticos del jugador (inventario). Valores guardados en localStorage.
function loadCos(key, max, def = 0) {
  try {
    const v = parseInt(localStorage.getItem(key), 10);
    if (v >= 0 && v <= max) return v;
  } catch (e) {}
  return def;
}
function saveCos(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
let cosFace = loadCos('bs_face', 3, 0);
let cosShirt = loadCos('bs_skin', 13, 0);  // 0-3 clásicas, 4-13 deportivas (10)
let cosPants = loadCos('bs_pants', 9, 0);
let cosTone = loadCos('bs_tone', 4, 0);
let cosHair = loadCos('bs_hair', 5, 1);    // 0 calvo, 1 corto, 2 medio, 3 largo, 4 mohawk, 5 rizado
const myFace = () => cosFace;
const mySkin = () => cosShirt;
const myPants = () => cosPants;
const myTone = () => cosTone;
const myHair = () => cosHair;
// sincronizar selects ocultos (por si algo los lee)
function syncCosSelects() {
  if ($('facesel')) $('facesel').value = String(cosFace);
  if ($('skinsel')) $('skinsel').value = String(cosShirt);
  if ($('tonesel')) $('tonesel').value = String(cosTone);
  if ($('pantsel')) $('pantsel').value = String(cosPants);
}
syncCosSelects();

// Tercera persona (tecla V): para ver tu propio personaje y su skin
let thirdP = false, selfChar = null, selfSkin = -1;
function placeCamera(p) {
  if (!thirdP) {
    if (selfChar) selfChar.visible = false;
    // Cámara estable (sin bob ni inclinación) para no marear
    camera.position.set(p.x, p.y + CFG.eye, p.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    guns[cur].group.visible = true;
    return;
  }
  const key = (myOpId | 0) + (myTeam | 0) * 10;
  if (!selfChar || selfSkin !== key) {
    if (selfChar) scene.remove(selfChar);
    selfChar = makeCharacter(myOpId | 0);
    selfSkin = key;
    scene.add(selfChar);
  }
  selfChar.visible = true;
  const spdSelf = Math.hypot(player.vx, player.vz);
  animateCharacter(selfChar, spdSelf, 1 / 60, !player.onGround);
  const bob = selfChar.userData.anim?.bob || 0;
  selfChar.position.set(p.x, p.y + bob, p.z);
  selfChar.rotation.set(0, player.yaw + Math.PI, 0);
  camera.position.set(p.x + Math.sin(player.yaw) * 3, p.y + CFG.eye + 0.5, p.z + Math.cos(player.yaw) * 3);
  camera.rotation.set(player.pitch, player.yaw, 0);
  guns[cur].group.visible = false;
}

function showGun() {
  for (let i = 0; i < guns.length; i++) guns[i].group.visible = i === cur;
  if (armSkinMat) armSkinMat.color.setHex(SKIN_TONES[cosTone] ?? SKIN_TONES[0]);   // brazos del color de piel elegido
}

function selectWeapon(i) {
  if (i === cur || player.dead) return;
  if (i > 1 && !owned[i]) { say('No tienes esa arma — pulsa B para comprar', 1.5); return; }
  guns[cur].group.visible = false;
  cur = i;
  guns[cur].group.visible = true;
  reloading = false; fireCd = 0.3; drawT = 1; trigger = false; zoomed = false;
  msgEl.textContent = ''; msgT = 0;
  beep(420, 0.04, 0.06);

  updateHud();
}

/* ---------- Opciones (sensibilidad + volumen) ---------- */
let sensMult = 1, masterVol = 0.8;
try {
  const s = parseInt(localStorage.getItem('bs_sens'), 10);
  if (s >= 20 && s <= 200) sensMult = s / 100;
  const v = parseInt(localStorage.getItem('bs_vol'), 10);
  if (v >= 0 && v <= 100) masterVol = v / 100;
} catch (e) { /* sin almacenamiento */ }

/* ---------- Sonido ---------- */
let actx = null, shotBuf = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    shotBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.16), actx.sampleRate);
    const d = shotBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  } catch (e) { actx = null; }
}
function sfxShot(vol = 0.3, rate = 1) {
  if (!actx || masterVol <= 0) return;
  const src = actx.createBufferSource();
  const g = actx.createGain();
  src.buffer = shotBuf; src.playbackRate.value = rate; g.gain.value = vol * masterVol;
  src.connect(g); g.connect(actx.destination); src.start();
}
let stepAcc = 0;
function sfxStep(vol = 0.06) {
  if (!actx || masterVol <= 0) return;
  const src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 500;
  src.buffer = shotBuf; src.playbackRate.value = 0.35 + Math.random() * 0.1; g.gain.value = vol * masterVol;
  src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
}
function sfxReloadEnd() { beep(520, 0.04, 0.08); setTimeout(() => beep(780, 0.05, 0.08), 70); }
function beep(freq, dur, vol = 0.12) {
  if (!actx || masterVol <= 0) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = freq; o.type = 'square'; g.gain.value = vol * masterVol;
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}

/* ---------- Personaje en bloques ---------- */
function shade(c, f) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// Soldado de bloques: botas, chaleco, mochila, arma y equipo según el bando. Mira hacia +z.
// =====================================================
// Operadores militares — silueta humana + equipo táctico
// =====================================================
const SKIN_TONES_OP = [0xf0c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3317];
const SKIN_TONES = SKIN_TONES_OP;
const WORLD_KITS = {};

/**
 * Personaje humano (proporciones realistas en bloques) + gear del operador 0-7.
 */
function makeCharacter(colorOrOp, skin = 0, face = 0, team = -1, tone = 0, pants = 0, hair = 1, opId = null) {
  let op;
  if (typeof colorOrOp === 'number' && colorOrOp >= 0 && colorOrOp <= 7 && arguments.length <= 2) {
    op = OPERATORS[colorOrOp | 0];
  } else if (opId != null && opId >= 0 && opId <= 7) {
    op = OPERATORS[opId | 0];
  } else if (team === 0 || team === 1) {
    op = randomOp(team);
  } else {
    op = OPERATORS[Math.max(0, Math.min(7, (typeof colorOrOp === 'number' ? colorOrOp : skin) | 0) % 8)];
  }
  const id = op.id;
  const teamId = op.team;
  const primary = op.primary, accent = op.accent, detail = op.detail;
  // tono de piel distinto por operador (más humano)
  const SKIN = SKIN_TONES_OP[[1, 2, 0, 3, 1, 4, 2, 3][id]];
  const SKIN2 = SKIN; // sombra suave
  const HAIR = [0x1a1a1a, 0x2a1a0a, 0x3b2a1a, 0x1a1a1a, 0x4a3a2a, 0x1a1a1a, 0x5a3a1a, 0x1a0a0a][id];
  const GLOVE = 0x1c1c20;
  const BOOT = 0x141416;

  const g = new THREE.Group();
  g.userData.opId = id;
  g.userData.opName = op.name;
  g.userData.team = teamId;
  g.userData.anim = { t: 0, bob: 0, legsL: [], legsR: [], armsL: [], armsR: [] };

  const mats = {};
  function mat(c, kind = 'cloth') {
    const key = c + '_' + kind;
    if (!mats[key]) {
      mats[key] = new THREE.MeshStandardMaterial({
        color: c,
        roughness: kind === 'skin' ? 0.9 : kind === 'hard' ? 0.4 : 0.75,
        metalness: kind === 'hard' ? 0.4 : kind === 'skin' ? 0.0 : 0.05,
      });
    }
    return mats[key];
  }
  function add(part, w, h, d, x, y, z, c, side, kind = 'cloth') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, kind));
    m.position.set(x, y, z);
    m.userData.part = part;
    m.userData.baseY = y;
    m.userData.baseZ = z;
    g.add(m);
    if (part === 'legs') {
      if (side === 'L') g.userData.anim.legsL.push(m);
      else if (side === 'R') g.userData.anim.legsR.push(m);
    }
    if (part === 'arm') {
      if (side === 'L') g.userData.anim.armsL.push(m);
      else if (side === 'R') g.userData.anim.armsR.push(m);
    }
    return m;
  }

  // ========== CUERPO HUMANO (misma escala ~1.8 m) ==========
  // Piernas: muslo + pantorrilla + bota (proporción humana)
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'L' : 'R';
    // muslo
    add('legs', 0.18, 0.38, 0.2, sx * 0.12, 0.55, 0.02, primary, side);
    // pantorrilla
    add('legs', 0.16, 0.34, 0.18, sx * 0.12, 0.22, 0.01, primary, side);
    // bota
    add('legs', 0.18, 0.14, 0.26, sx * 0.12, 0.07, 0.04, BOOT, side, 'hard');
    // punta de bota
    add('legs', 0.16, 0.08, 0.1, sx * 0.12, 0.05, 0.14, BOOT, side, 'hard');
  }

  // Cadera / cintura
  add('body', 0.42, 0.16, 0.24, 0, 0.78, 0, primary);
  add('body', 0.44, 0.07, 0.26, 0, 0.78, 0, detail, undefined, 'hard'); // cinturón

  // Torso (pecho más ancho que cintura)
  add('body', 0.46, 0.42, 0.26, 0, 1.08, 0.01, primary);
  // pecho / pectorales sutiles
  add('body', 0.44, 0.2, 0.12, 0, 1.18, 0.12, accent);

  // Chaleco táctico base (todos)
  add('body', 0.5, 0.36, 0.3, 0, 1.1, 0.03, accent, undefined, 'hard');
  add('body', 0.13, 0.11, 0.07, -0.14, 1.05, 0.18, detail, undefined, 'hard');
  add('body', 0.13, 0.11, 0.07, 0.14, 1.05, 0.18, detail, undefined, 'hard');
  add('body', 0.11, 0.09, 0.07, 0, 1.22, 0.18, detail, undefined, 'hard');

  // Hombros
  add('body', 0.54, 0.12, 0.22, 0, 1.32, 0, primary);
  add('body', 0.14, 0.12, 0.18, -0.32, 1.32, 0, accent, undefined, 'hard');
  add('body', 0.14, 0.12, 0.18, 0.32, 1.32, 0, accent, undefined, 'hard');

  // Cuello
  add('body', 0.14, 0.12, 0.14, 0, 1.42, 0.01, SKIN, undefined, 'skin');

  // Brazos: hombro + bíceps + antebrazo + mano
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'L' : 'R';
    const z = 0.04;
    // deltoides
    add('arm', 0.16, 0.16, 0.16, sx * 0.36, 1.28, z, primary, side);
    // bíceps / brazo superior
    add('arm', 0.15, 0.28, 0.15, sx * 0.38, 1.08, z, primary, side);
    // codo
    add('arm', 0.13, 0.1, 0.13, sx * 0.38, 0.92, z + 0.01, primary, side);
    // antebrazo
    add('arm', 0.14, 0.26, 0.14, sx * 0.38, 0.76, z + 0.02, primary, side);
    // mano / guante
    add('arm', 0.12, 0.12, 0.14, sx * 0.38, 0.58, z + 0.04, GLOVE, side, 'hard');
    // dedos
    add('arm', 0.1, 0.06, 0.08, sx * 0.38, 0.52, z + 0.1, GLOVE, side, 'hard');
  }

  // ========== CABEZA HUMANA ==========
  // cráneo
  add('head', 0.32, 0.3, 0.3, 0, 1.62, 0.02, SKIN, undefined, 'skin');
  // mandíbula un poco más estrecha
  add('head', 0.28, 0.12, 0.26, 0, 1.48, 0.03, SKIN, undefined, 'skin');
  // orejas
  add('head', 0.05, 0.1, 0.08, -0.18, 1.6, 0.02, SKIN, undefined, 'skin');
  add('head', 0.05, 0.1, 0.08, 0.18, 1.6, 0.02, SKIN, undefined, 'skin');
  // nariz
  add('head', 0.06, 0.08, 0.08, 0, 1.58, 0.16, SKIN, undefined, 'skin');
  // ojos (blancos + iris + pupila)
  for (const sx of [-1, 1]) {
    add('head', 0.08, 0.05, 0.03, sx * 0.08, 1.62, 0.16, 0xf5f5f5);
    add('head', 0.04, 0.04, 0.03, sx * 0.08, 1.62, 0.175, 0x3a5a4a);
    add('head', 0.02, 0.02, 0.02, sx * 0.08, 1.62, 0.185, 0x0a0a0a);
  }
  // cejas
  add('head', 0.1, 0.03, 0.03, -0.08, 1.68, 0.15, HAIR);
  add('head', 0.1, 0.03, 0.03, 0.08, 1.68, 0.15, HAIR);
  // boca
  add('head', 0.1, 0.03, 0.03, 0, 1.5, 0.16, 0x8a4a4a);

  // pelo base (si no lleva casco que lo tape del todo)
  const fullHelmet = (id === 1 || id === 3 || id === 5 || id === 7);
  if (!fullHelmet) {
    add('head', 0.34, 0.12, 0.32, 0, 1.78, 0.0, HAIR);
    add('head', 0.32, 0.14, 0.12, 0, 1.72, -0.12, HAIR); // nuca
  }

  // ========== EQUIPO POR OPERADOR ==========
  if (id === 0) {
    // Sombra — pasamontañas negro + chaleco táctico
    add('head', 0.34, 0.22, 0.32, 0, 1.64, 0.02, 0x0e0e12); // balaclava
    add('head', 0.36, 0.1, 0.34, 0, 1.8, -0.02, 0x0e0e12);
    // solo ojos visibles
    add('head', 0.22, 0.08, 0.04, 0, 1.62, 0.17, 0x0e0e12);
    add('body', 0.52, 0.22, 0.32, 0, 1.15, 0.05, 0x121216, undefined, 'hard');
    add('body', 0.1, 0.1, 0.08, 0.24, 1.28, 0.12, 0x2a2a30, undefined, 'hard'); // radio
  } else if (id === 1) {
    // Lince — casco con visor + lentes
    add('head', 0.38, 0.18, 0.38, 0, 1.8, 0, 0x2a4a2a, undefined, 'hard');
    add('head', 0.34, 0.1, 0.18, 0, 1.7, 0.14, 0x1a2a1a, undefined, 'hard');
    add('head', 0.3, 0.05, 0.08, 0, 1.64, 0.18, 0x3a8a6a, undefined, 'hard'); // lentes
    add('body', 0.1, 0.14, 0.08, -0.28, 1.12, 0.12, 0x2a3a2a, undefined, 'hard');
  } else if (id === 2) {
    // Tormenta — ghillie + binoculares
    add('head', 0.4, 0.2, 0.4, 0, 1.76, -0.02, 0x4a5a3a);
    add('head', 0.48, 0.08, 0.48, 0, 1.7, 0, 0x5a6a4a);
    add('body', 0.56, 0.48, 0.34, 0, 1.08, 0, 0x5a6a3a);
    add('head', 0.2, 0.08, 0.1, 0, 1.68, 0.2, 0x2a2a2e, undefined, 'hard');
    add('head', 0.06, 0.07, 0.07, -0.05, 1.68, 0.26, 0x1a1a1e, undefined, 'hard');
    add('head', 0.06, 0.07, 0.07, 0.05, 1.68, 0.26, 0x1a1a1e, undefined, 'hard');
  } else if (id === 3) {
    // Roca — armadura pesada + casco grande
    add('head', 0.42, 0.22, 0.42, 0, 1.82, 0, 0x3a3e44, undefined, 'hard');
    add('head', 0.28, 0.08, 0.14, 0, 1.7, 0.18, 0x2a2e34, undefined, 'hard');
    add('body', 0.56, 0.46, 0.36, 0, 1.1, 0.04, 0x4a5058, undefined, 'hard');
    add('body', 0.22, 0.16, 0.1, 0, 1.24, 0.22, 0x5a6068, undefined, 'hard');
    add('arm', 0.2, 0.14, 0.22, -0.4, 1.3, 0, 0x4a5058, 'L', 'hard');
    add('arm', 0.2, 0.14, 0.22, 0.4, 1.3, 0, 0x4a5058, 'R', 'hard');
  } else if (id === 4) {
    // Coronel Acero — gorra militar + medallas
    add('head', 0.36, 0.1, 0.38, 0, 1.82, -0.02, 0x3a3a2a, undefined, 'hard');
    add('head', 0.22, 0.04, 0.18, 0, 1.86, 0.1, detail, undefined, 'hard');
    add('body', 0.1, 0.07, 0.04, -0.12, 1.2, 0.16, detail, undefined, 'hard');
    add('body', 0.1, 0.07, 0.04, 0.12, 1.2, 0.16, detail, undefined, 'hard');
    add('body', 0.07, 0.18, 0.04, 0, 1.12, 0.16, 0xc9a84a, undefined, 'hard');
  } else if (id === 5) {
    // Fantasma — casco futurista + luces azules
    add('head', 0.38, 0.2, 0.38, 0, 1.8, 0, 0x5a6068, undefined, 'hard');
    add('head', 0.32, 0.1, 0.16, 0, 1.68, 0.16, 0x3a90c8, undefined, 'hard');
    add('body', 0.52, 0.44, 0.32, 0, 1.1, 0.03, 0x4a5058, undefined, 'hard');
    add('body', 0.07, 0.28, 0.05, -0.18, 1.12, 0.18, 0x3a90c8, undefined, 'hard');
    add('body', 0.07, 0.28, 0.05, 0.18, 1.12, 0.18, 0x3a90c8, undefined, 'hard');
    add('body', 0.36, 0.05, 0.05, 0, 1.28, 0.18, 0x3a90c8, undefined, 'hard');
  } else if (id === 6) {
    // Víbora — pañuelo + gafas de aviador
    add('head', 0.34, 0.12, 0.18, 0, 1.5, 0.1, 0xb89a6a);
    add('head', 0.28, 0.04, 0.1, 0, 1.64, 0.18, 0x1a1a1e, undefined, 'hard');
    add('head', 0.1, 0.035, 0.035, -0.07, 1.64, 0.22, 0x3a2a1a, undefined, 'hard');
    add('head', 0.1, 0.035, 0.035, 0.07, 1.64, 0.22, 0x3a2a1a, undefined, 'hard');
    add('body', 0.48, 0.1, 0.28, 0, 0.88, 0, 0x8a6a3a);
  } else if (id === 7) {
    // Cobra — casco rojo, luces, cicatriz
    add('head', 0.38, 0.18, 0.38, 0, 1.8, 0, 0x4a1010, undefined, 'hard');
    add('head', 0.1, 0.05, 0.05, -0.12, 1.76, 0.14, 0xc03030, undefined, 'hard');
    add('head', 0.1, 0.05, 0.05, 0.12, 1.76, 0.14, 0xc03030, undefined, 'hard');
    add('head', 0.02, 0.12, 0.04, 0.1, 1.58, 0.16, 0x8a2020); // cicatriz
    add('body', 0.5, 0.18, 0.3, 0, 1.18, 0.04, 0x5a1010, undefined, 'hard');
  }

  // Arma en la mano derecha (silueta simple)
  add('gun', 0.07, 0.09, 0.5, 0.4, 0.95, 0.32, 0x2a2a30, undefined, 'hard');
  add('gun', 0.05, 0.1, 0.1, 0.4, 0.9, 0.38, 0x3a3a40, undefined, 'hard');
  return g;
}

/** Animación de caminar / correr (piernas, brazos y torso) */
function animateCharacter(g, speed, dt, airborne = false) {
  if (!g || !g.userData.anim) return;
  const a = g.userData.anim;
  const moving = speed > 0.5 && !airborne;
  if (moving) a.t += dt * Math.min(14, 7 + speed * 1.1);
  else a.t *= 0.85;
  const amp = moving ? Math.min(0.7, 0.28 + speed * 0.055) : 0;
  const swing = Math.sin(a.t) * amp;
  const bob = moving ? Math.abs(Math.sin(a.t * 2)) * (0.035 + speed * 0.004) : 0;
  for (const m of a.legsL) {
    m.rotation.x = swing;
    m.position.z = (m.userData.baseZ || 0) + Math.sin(swing) * 0.1;
    m.position.y = (m.userData.baseY || m.position.y) + Math.max(0, -Math.sin(swing)) * 0.04;
  }
  for (const m of a.legsR) {
    m.rotation.x = -swing;
    m.position.z = (m.userData.baseZ || 0) - Math.sin(swing) * 0.1;
    m.position.y = (m.userData.baseY || m.position.y) + Math.max(0, Math.sin(swing)) * 0.04;
  }
  for (const m of a.armsL) {
    m.rotation.x = -swing * 0.85;
    m.rotation.z = -swing * 0.12;
  }
  for (const m of a.armsR) {
    m.rotation.x = swing * 0.85;
    m.rotation.z = swing * 0.12;
  }
  // ligera inclinación al correr
  g.rotation.x = moving ? -Math.min(0.08, speed * 0.008) : g.rotation.x * 0.9;
  g.rotation.z = moving ? Math.sin(a.t) * 0.03 : g.rotation.z * 0.85;
  a.bob = bob;
  a.walkPhase = a.t;
}

function makeTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, Arial';
  g.textAlign = 'center';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.fillStyle = '#fff';
  g.strokeText(text, 128, 42);
  g.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  s.scale.set(2, 0.5, 1);
  s.position.set(0, 2.35, 0);
  return s;
}

// posición de la boca del arma de un personaje (yaw = rotación del modelo)
function gunWorld(pos, yaw, out) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  return out.set(pos.x + 0.42 * cy + 0.9 * sy, pos.y + 1.25, pos.z - 0.42 * sy + 0.9 * cy);
}

function setLit(o, lit) {
  if (lit === o.lit) return;
  o.lit = lit;
  for (const m of o.meshes) m.material.emissive.setHex(lit ? 0x992222 : 0x000000);
}

/* ---------- Efectos ---------- */
const fx = [];
const pGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const holeGeo = new THREE.PlaneGeometry(0.12, 0.12);
const casingGeo = new THREE.BoxGeometry(0.04, 0.02, 0.08);
const MAX_HOLES = 80;

function puff(pt, color, n = 6, scale = 1) {
  // en calidad baja, menos partículas = más FPS
  const maxN = gfxQuality === 0 ? Math.min(n, 4) : gfxQuality === 1 ? Math.min(n, 12) : n;
  for (let i = 0; i < maxN; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pt);
    m.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
    scene.add(m);
    fx.push({
      obj: m, life: 0.35 + Math.random() * 0.35,
      vel: new THREE.Vector3((Math.random() - .5) * 4 * scale, Math.random() * 4 * scale, (Math.random() - .5) * 4 * scale)
    });
  }
}
function tracer(a, b, color = 0xffe9a0) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a, b]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  scene.add(line);
  fx.push({ obj: line, life: 0.05, line: true });
}
function bulletHole(pt, normal) {
  if (gfxQuality === 0) return; // en baja no hay marcas (ahorra FPS)
  const maxH = gfxQuality === 2 ? MAX_HOLES : 40;
  while (decals.length >= maxH) {
    const old = decals.shift();
    scene.remove(old);
    old.material.dispose();
  }
  const m = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({
    color: 0x1a1510, transparent: true, opacity: 0.85, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1
  }));
  m.position.copy(pt).addScaledVector(normal, 0.015);
  m.lookAt(pt.clone().add(normal));
  scene.add(m);
  decals.push(m);
}
function ejectCasing() {
  if (!camera) return;
  const m = new THREE.Mesh(casingGeo, new THREE.MeshBasicMaterial({ color: 0xc9a227 }));
  const side = (Math.random() > 0.5 ? 1 : -1);
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(pos);
  camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  m.position.copy(pos).addScaledVector(right, 0.25 * side).addScaledVector(dir, 0.35);
  m.position.y -= 0.15;
  scene.add(m);
  const vel = right.multiplyScalar((1.5 + Math.random()) * side)
    .add(new THREE.Vector3(0, 1.8 + Math.random(), 0))
    .addScaledVector(dir, 0.4);
  fx.push({ obj: m, life: 1.2 + Math.random() * 0.6, vel, spin: true });
}
function bigExplosion(pt) {
  puff(pt, 0xff6622, 28, 2.2);
  puff(pt, 0xffaa33, 18, 1.6);
  puff(pt, 0x333333, 12, 1.4);
  dmgFlash = 1.2;
  // sacudida de cámara
  player.pitch += (Math.random() - 0.5) * 0.12;
  player.yaw += (Math.random() - 0.5) * 0.1;
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.vel) {
      f.obj.position.addScaledVector(f.vel, dt);
      f.vel.y -= 12 * dt;
      if (f.spin) f.obj.rotation.x += dt * 8;
    }
    if (f.life <= 0) {
      scene.remove(f.obj);
      if (f.line) f.obj.geometry.dispose();
      f.obj.material.dispose();
      fx.splice(i, 1);
    }
  }
}

let hitTimer = 0;
function showHit(kill) {
  hitEl.style.color = kill ? '#ff3b3b' : '#fff';
  hitEl.style.opacity = 1;
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => (hitEl.style.opacity = 0), 130);
  beep(kill ? 900 : 600, 0.06);
}

/* ---------- Granadas ---------- */
const activeNades = [];
let blindT = 0; // cegado por flashbang
const nadeGeo = new THREE.SphereGeometry(0.12, 8, 8);

function throwGrenade(w) {
  if (!w.grenade || ammo[cur] <= 0) return;
  ammo[cur]--;
  fireCd = w.rate;
  updateHud();
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(pos);
  camera.getWorldDirection(dir);
  pos.addScaledVector(dir, 0.5);
  pos.y = Math.max(pos.y, player.pos.y + 1.2);
  // velocidad de lanzamiento (más fuerte mirando arriba)
  const power = 14 + Math.max(0, player.pitch) * 6;
  const vel = dir.clone().multiplyScalar(power);
  vel.y += 3.5 + Math.max(0, -player.pitch) * 2;
  const mesh = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({
    color: w.gtype === 'he' ? 0x3a5a2a : w.gtype === 'flash' ? 0xc8b060 : 0x4a6a8a
  }));
  mesh.position.copy(pos);
  scene.add(mesh);
  const nade = {
    mesh, pos, vel, fuse: w.fuse || 1.5, type: w.gtype, radius: w.radius || 5,
    damage: w.damage || 0, owner: myId, bounced: 0
  };
  activeNades.push(nade);
  beep(180, 0.04, 0.1);
  if (mode === 'mp') {
    netSend({ t: 'nade', type: w.gtype, x: r3(pos.x), y: r3(pos.y), z: r3(pos.z),
              vx: r3(vel.x), vy: r3(vel.y), vz: r3(vel.z), fuse: w.fuse });
  }
  // si se acaba, volver a pistola
  if (ammo[cur] <= 0) setTimeout(() => { if (ammo[cur] <= 0 && WEAPONS[cur]?.grenade) selectWeapon(1); }, 200);
}

function spawnRemoteNade(m) {
  const pos = new THREE.Vector3(m.x, m.y, m.z);
  const vel = new THREE.Vector3(m.vx, m.vy, m.vz);
  const color = m.type === 'he' ? 0x3a5a2a : m.type === 'flash' ? 0xc8b060 : 0x4a6a8a;
  const mesh = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.copy(pos);
  scene.add(mesh);
  activeNades.push({
    mesh, pos, vel, fuse: m.fuse || 1.5, type: m.type, radius: m.type === 'flash' ? 9 : m.type === 'smoke' ? 4.5 : 5.5,
    damage: m.type === 'he' ? 98 : 0, owner: m.id || 0, bounced: 0, remote: true
  });
}

function updateNades(dt) {
  for (let i = activeNades.length - 1; i >= 0; i--) {
    const n = activeNades[i];
    n.fuse -= dt;
    // física simple
    n.vel.y -= 18 * dt;
    const nx = n.pos.x + n.vel.x * dt;
    const ny = n.pos.y + n.vel.y * dt;
    const nz = n.pos.z + n.vel.z * dt;
    // suelo
    if (ny < 0.12) {
      n.pos.y = 0.12;
      n.vel.y *= -0.35;
      n.vel.x *= 0.7;
      n.vel.z *= 0.7;
      n.bounced++;
      if (Math.abs(n.vel.y) < 1) n.vel.y = 0;
    } else {
      n.pos.y = ny;
    }
    // paredes (AABB simples del mapa)
    let blocked = false;
    for (const s of solids) {
      if (nx > s.x0 - 0.12 && nx < s.x1 + 0.12 && n.pos.y > s.y0 && n.pos.y < s.y1 &&
          n.pos.z > s.z0 - 0.12 && n.pos.z < s.z1 + 0.12) {
        n.vel.x *= -0.4; blocked = true; break;
      }
      if (n.pos.x > s.x0 - 0.12 && n.pos.x < s.x1 + 0.12 && n.pos.y > s.y0 && n.pos.y < s.y1 &&
          nz > s.z0 - 0.12 && nz < s.z1 + 0.12) {
        n.vel.z *= -0.4; blocked = true; break;
      }
    }
    if (!blocked) { n.pos.x = nx; n.pos.z = nz; }
    n.mesh.position.copy(n.pos);
    n.mesh.rotation.x += dt * 4;
    n.mesh.rotation.z += dt * 3;

    if (n.fuse <= 0) {
      detonateNade(n);
      scene.remove(n.mesh);
      n.mesh.material.dispose();
      activeNades.splice(i, 1);
    }
  }
  if (blindT > 0) {
    blindT = Math.max(0, blindT - dt);
    const el = $('flash');
    if (el) el.style.opacity = Math.min(1, blindT > 0.5 ? 1 : blindT / 0.5);
  } else {
    const el = $('flash');
    if (el) el.style.opacity = 0;
  }
}

function detonateNade(n) {
  const pt = n.pos.clone();
  if (n.type === 'he') {
    puff(pt, 0xff6622, 22, 1.8);
    puff(pt, 0xffaa33, 14, 1.2);
    beep(70, 0.35, 0.35);
    // daño local a bots y a ti (si no eres el remoto que solo ve)
    if (!n.remote || mode === 'solo') {
      for (const b of bots) {
        if (!b.alive) continue;
        const d = Math.hypot(b.pos.x - pt.x, b.pos.y + 0.9 - pt.y, b.pos.z - pt.z);
        if (d < n.radius) {
          const falloff = 1 - d / n.radius;
          const dmg = Math.ceil(n.damage * falloff * falloff);
          if (dmg > 0) damageBot(b, 'body', { damage: dmg, head: 1, id: 'he' }, d);
        }
      }
    }
    // daño a ti mismo
    if (!player.dead) {
      const d = Math.hypot(player.pos.x - pt.x, player.pos.y + 1 - pt.y, player.pos.z - pt.z);
      if (d < n.radius) {
        const falloff = 1 - d / n.radius;
        const dmg = Math.ceil(n.damage * falloff * falloff * 0.85);
        if (dmg > 0) {
          player.hp = Math.max(0, player.hp - dmg);
          dmgFlash = Math.min(1, dmg / 40);
          if (player.hp <= 0) playerDied('Granada');
          updateHud();
        }
      }
    }
    // online: el servidor aplica daño a jugadores si enviamos la posición
    if (mode === 'mp' && !n.remote) {
      netSend({ t: 'nadeboom', type: 'he', x: r3(pt.x), y: r3(pt.y), z: r3(pt.z), radius: n.radius, damage: n.damage });
    }
  } else if (n.type === 'flash') {
    puff(pt, 0xffffee, 16, 1.5);
    beep(1200, 0.15, 0.25);
    // si estás mirando hacia la granada o cerca, te ciega
    if (!player.dead) {
      const toN = new THREE.Vector3(pt.x - player.pos.x, pt.y - (player.pos.y + 1.5), pt.z - player.pos.z);
      const dist = toN.length();
      if (dist < n.radius) {
        toN.normalize();
        const look = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), -Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
        const dot = look.dot(toN);
        // de frente = más ceguera; de espaldas casi nada
        const facing = Math.max(0, dot);
        const prox = 1 - dist / n.radius;
        const strength = facing * 0.85 + prox * 0.35;
        if (strength > 0.2) blindT = Math.max(blindT, 1.2 + strength * 2.5);
      }
    }
  } else if (n.type === 'smoke') {
    // nube de humo persistente
    for (let k = 0; k < 40; k++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.6 + Math.random() * 0.8, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x9aa3a8, transparent: true, opacity: 0.35 })
      );
      m.position.set(
        pt.x + (Math.random() - 0.5) * n.radius * 1.4,
        0.4 + Math.random() * 2.2,
        pt.z + (Math.random() - 0.5) * n.radius * 1.4
      );
      scene.add(m);
      fx.push({ obj: m, life: 12 + Math.random() * 6, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3) });
    }
    beep(90, 0.2, 0.15);
  }
}

function say(text, t = 1.2) { msgEl.textContent = text; msgT = t; }

function feed(text) {
  const el = document.createElement('div');
  el.textContent = text;
  feedEl.appendChild(el);
  while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
  setTimeout(() => el.remove(), 4500);
}

/* =====================================================
   MODO SOLO: bots con IA
   ===================================================== */
const BOT_NAMES = ['Ráfaga', 'Sombra', 'Tigre', 'Víbora', 'Roca', 'Lobo', 'Halcón', 'Cobra'];
const BOT_COLORS = [0xb03a2e, 0xa04030, 0xc0492f, 0x9c3b3b];

function makeBot(i, team = 1) {
  const op = randomOp(team === 0 || team === 1 ? team : 1);
  const g = makeCharacter(op.id);
  scene.add(g);
  const b = {
    name: op.name, g, pos: g.position, team, opId: op.id,
    vx: 0, vy: 0, vz: 0, onGround: true,
    hp: CFG.botHp, alive: false, yaw: 0, fall: 0, respawn: 0,
    flash: 0, lit: false, meshes: [],
    sees: false, seeT: Math.random() * 0.2, alert: 0, lastSeen: new THREE.Vector3(),
    react: 0, fireCd: 0, strafe: 1, strafeT: 0, side: Math.random() < 0.5 ? 1 : -1,
    wp: null, wantsMove: false, stuckT: 1, stuckPos: new THREE.Vector3(),
  };
  g.traverse(o => {
    if (o.isMesh) { o.userData.bot = b; b.meshes.push(o); rayTargets.push(o); }
  });
  bots.push(b);
  return b;
}

function spawnBot(b) {
  let candidates = MAP.waypoints || [[0, 0]];
  if (mode === 'practice' && MAP.teamSpawns && MAP.teamSpawns[b.team]) {
    candidates = MAP.teamSpawns[b.team];
  }
  let best = null, bestD = -1;
  for (let k = 0; k < 8; k++) {
    const w = candidates[Math.floor(Math.random() * candidates.length)];
    if (bots.some(o => o !== b && o.alive && Math.hypot(o.pos.x - w[0], o.pos.z - w[1]) < 3)) continue;
    const d = Math.hypot(w[0] - player.pos.x, w[1] - player.pos.z);
    if (d > bestD) { bestD = d; best = w; }
  }
  if (!best) best = candidates[0] || MAP.waypoints[0];
  b.pos.set(best[0], 0, best[1]);
  b.vx = b.vy = b.vz = 0;
  b.hp = CFG.botHp; b.alive = true; b.fall = 0;
  b.sees = false; b.alert = 0; b.wp = null; b.react = 0; b.fireCd = 0;
  b.yaw = Math.random() * Math.PI * 2;
  b.g.rotation.set(0, b.yaw, 0);
}

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _mz = new THREE.Vector3(), _e = new THREE.Vector3();
const losRay = new THREE.Raycaster();

function lineOfSight(b) {
  _a.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
  _t.set(player.pos.x, player.pos.y + 1.2, player.pos.z).sub(_a);
  const d = _t.length();
  _t.normalize();
  losRay.set(_a, _t);
  losRay.far = d;
  return losRay.intersectObjects(worldMeshes, false).length === 0;
}

function turnTo(b, target, dt, rate) {
  let d = target - b.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  b.yaw += d * Math.min(1, dt * rate);
}

// Camina hacia (dx,dz) esquivando paredes: prueba varios ángulos hasta encontrar paso libre
const ANGLES = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4];
function steer(b, dx, dz, speed, dt) {
  const len = Math.hypot(dx, dz);
  let tvx = 0, tvz = 0;
  if (len > 0.01 && speed > 0) {
    b.wantsMove = true;
    const base = Math.atan2(dx, dz);
    for (const a of ANGLES) {
      const ang = base + a * b.side;
      const sx = Math.sin(ang), sz = Math.cos(ang);
      if (!hits(b.pos.x + sx * 0.9, b.pos.y + 0.65, b.pos.z + sz * 0.9)) { tvx = sx * speed; tvz = sz * speed; break; }
    }
  }
  const k = Math.min(1, dt * 8);
  b.vx += (tvx - b.vx) * k;
  b.vz += (tvz - b.vz) * k;
  slide(b, 'x', b.vx * dt);
  slide(b, 'z', b.vz * dt);
}

function faceMove(b, dt) {
  if (Math.hypot(b.vx, b.vz) > 0.5) turnTo(b, Math.atan2(b.vx, b.vz), dt, 6);
}

function botShoot(b, dist) {
  gunWorld(b.pos, b.yaw, _mz);
  const moving = Math.hypot(player.vx, player.vz) > 2.5 ? 0.7 : 1;
  const chance = Math.max(0.1, Math.min(0.55, 0.62 - dist * 0.014)) * moving;
  const hit = Math.random() < chance;
  _e.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  if (!hit) _e.add(new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .5) * 2, (Math.random() - .5) * 3));
  tracer(_mz.clone(), _e.clone());
  puff(_mz, 0xffdd66, 2);
  sfxShot(0.3 / (1 + dist * 0.08), 1.1);
  if (hit) damagePlayer(CFG.botDamage, b);
}

function updateBot(b, dt) {
  const p = b.pos;

  if (!b.alive) {
    b.fall = Math.min(1, b.fall + dt * 4);
    b.g.rotation.x = -Math.PI / 2 * b.fall;
    p.y = 0.2 * b.fall;
    b.respawn -= dt;
    if (b.flash > 0) b.flash -= dt;
    setLit(b, b.flash > 0);
    if (b.respawn <= 0) spawnBot(b);
    return;
  }

  b.wantsMove = false;
  const isEnemyOfPlayer = (mode !== 'practice') || (b.team !== myTeam);
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
  const dist = Math.hypot(dx, dz);

  // visión (cada ~0.2 s para no gastar rendimiento)
  b.seeT -= dt;
  if (b.seeT <= 0) {
    b.seeT = 0.2 + Math.random() * 0.1;
    const was = b.sees;
    b.sees = isEnemyOfPlayer && !player.dead && dist < 40 && lineOfSight(b);
    if (b.sees) {
      if (!was) b.react = 0.5 + Math.random() * 0.5;   // tiempo de reacción
      b.alert = 6;
      b.lastSeen.copy(player.pos);
    }
  }
  b.alert = Math.max(0, b.alert - dt);

  // en práctica: defensores van al site si hay bomba plantada
  if (mode === 'practice' && bombState && (bombState.state === 'planted' || bombState.state === 'defusing') && b.team === MATCH.defenderTeam) {
    const tx = bombState.x - p.x, tz = bombState.z - p.z;
    if (Math.hypot(tx, tz) > 2) steer(b, tx, tz, CFG.botSpeed * 1.1, dt);
    else steer(b, 0, 0, 0, dt);
    faceMove(b, dt);
  } else if (b.sees && !player.dead && isEnemyOfPlayer) {
    // combate: mirar al jugador, mantener distancia, moverse de lado y disparar
    turnTo(b, Math.atan2(dx, dz), dt, 10);
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = 1 + Math.random() * 1.8; b.strafe = Math.random() < 0.5 ? -1 : 1; }
    const nx = dx / dist, nz = dz / dist;
    let mx = 0, mz = 0;
    if (dist > 13) { mx = nx; mz = nz; } else if (dist < 6) { mx = -nx; mz = -nz; }
    mx += -nz * b.strafe * 0.8;
    mz += nx * b.strafe * 0.8;
    steer(b, mx, mz, CFG.botSpeed * 0.8, dt);
    b.react -= dt; b.fireCd -= dt;
    if (b.react <= 0 && b.fireCd <= 0) { botShoot(b, dist); b.fireCd = 0.3 + Math.random() * 0.25; }
  } else if (b.alert > 0 && isEnemyOfPlayer) {
    // buscar: ir hacia donde te vio por última vez
    const tx = b.lastSeen.x - p.x, tz = b.lastSeen.z - p.z;
    if (Math.hypot(tx, tz) > 1.8) steer(b, tx, tz, CFG.botSpeed * 1.15, dt);
    else steer(b, 0, 0, 0, dt);
    faceMove(b, dt);
  } else {
    // patrullar entre puntos del mapa
    if (!b.wp || Math.hypot(b.wp[0] - p.x, b.wp[1] - p.z) < 1.6) {
      b.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)];
    }
    steer(b, b.wp[0] - p.x, b.wp[1] - p.z, CFG.botSpeed, dt);
    faceMove(b, dt);
  }

  gravityStep(b, dt);

  // detectar si se quedó atascado
  b.stuckT -= dt;
  if (b.stuckT <= 0) {
    b.stuckT = 1;
    if (b.wantsMove && Math.hypot(p.x - b.stuckPos.x, p.z - b.stuckPos.z) < 0.4) {
      b.side *= -1; b.strafe *= -1; b.wp = null;
    }
    b.stuckPos.copy(p);
  }

  b.g.rotation.y = b.yaw;
  const bSpd = Math.hypot(b.vx, b.vz);
  animateCharacter(b.g, bSpd, dt, !b.onGround);
  if (b.g.userData.anim) b.g.position.y = b.pos.y + (b.g.userData.anim.bob || 0);
  if (b.flash > 0) b.flash -= dt;
  setLit(b, b.flash > 0);
}

function updateBots(dt) { for (const b of bots) updateBot(b, dt); }

function damageBot(b, part, w, dist) {
  if (b.agi) return agiDamageUnit(b, part, w, dist);   // Operación AGI
  // sin fuego amigo en práctica
  if (mode === 'practice' && b.team === myTeam) return false;
  let dmg = w.damage * (part === 'head' ? w.head : 1);
  if (w.pellets > 1) dmg *= Math.max(0.25, 1 - dist / 20);   // la escopeta pierde daño con la distancia
  b.hp -= dmg;
  b.flash = 0.08;
  b.alert = 8; b.lastSeen.copy(player.pos);
  if (b.hp > 0) return false;
  b.alive = false; b.respawn = CFG.botRespawn; b.fall = 0;
  player.kills++;
  player.hp = Math.min(player.maxHp, player.hp + CFG.killHeal);
  feed('Tú  ➜  ' + b.name);
  updateHud();
  return true;
}

function damagePlayer(n, bot) {
  if (player.dead) return;
  if (player.armor > 0) {                       // la armadura absorbe la mitad del daño
    const ab = Math.min(player.armor, n * 0.5);
    player.armor -= ab; n -= ab;
  }
  player.hp = Math.max(0, player.hp - n);
  dmgFlash = 1;
  beep(120, 0.08, 0.15);
  if (player.hp <= 0) {
    player.deaths++;
    feed(mode === 'agi' ? bot.name + '  ➜  ' + (bot.kind === 'robot' ? 'RIFLE' : 'M4A1') + '  ➜  Jugador' : bot.name + '  ➜  Tú');
    playerDied(bot.name);
  }
  updateHud();
}

function respawnPlayer() {
  if (mode === 'agi') agiPlacePlayer(); else placePlayer();
  reviveLocal();
}

/* =====================================================
   Muerte / reaparición del jugador (común a solo y online)
   ===================================================== */
// Espectador: al morir en multijugador puedes mirar a compañeros vivos
let specIdx = 0, specTargets = [], specYaw = 0, specPitch = 0.15;

/* ---------- Armas en el suelo (al morir se caen y se pueden recoger) ---------- */
const groundGunGeo = new THREE.BoxGeometry(0.55, 0.12, 0.18);

function spawnGroundGun(wi, mag, x, z) {
  if (wi <= 1) return; // cuchillo/pistola no se tiran
  const w = WEAPONS[wi];
  if (!w) return;
  const col = w.grenade ? (w.gtype === 'he' ? 0x3a5a2a : w.gtype === 'flash' ? 0xc8b060 : 0x4a6a8a) : 0x2b2b2b;
  const mesh = new THREE.Mesh(groundGunGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.4 }));
  mesh.position.set(x, 0.08, z);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  mesh.rotation.z = 0.15;
  scene.add(mesh);
  groundGuns.push({ mesh, wi, ammo: mag | 0, x, z, life: 45 });
}

function dropMyWeapons() {
  const px = player.pos.x, pz = player.pos.z;
  let n = 0;
  for (let i = 2; i < WEAPONS.length; i++) {
    if (!owned[i]) continue;
    if (WEAPONS[i].grenade && (!ammo[i] || ammo[i] <= 0)) continue;
    const ox = px + (Math.random() - 0.5) * 1.8;
    const oz = pz + (Math.random() - 0.5) * 1.8;
    spawnGroundGun(i, ammo[i] || WEAPONS[i].mag, ox, oz);
    owned[i] = false;
    ammo[i] = 0;
    n++;
  }
  if (n > 0) {
    selectWeapon(1);
    updateHud();
    if (mode === 'mp') netSend({ t: 'dropguns', x: r3(px), z: r3(pz), guns: groundGuns.slice(-n).map(g => [g.wi, g.ammo, r3(g.x), r3(g.z)]) });
  }
}

function updateGroundGuns(dt) {
  for (let i = groundGuns.length - 1; i >= 0; i--) {
    const g = groundGuns[i];
    g.life -= dt;
    g.mesh.rotation.y += dt * 0.8;
    g.mesh.position.y = 0.08 + Math.sin(performance.now() * 0.004 + i) * 0.03;
    if (g.life <= 0) {
      scene.remove(g.mesh);
      g.mesh.material.dispose();
      groundGuns.splice(i, 1);
    }
  }
  // auto-recoger al pasar cerca
  if (player.dead) return;
  for (let i = groundGuns.length - 1; i >= 0; i--) {
    const g = groundGuns[i];
    if (Math.hypot(player.pos.x - g.x, player.pos.z - g.z) > 1.35) continue;
    owned[g.wi] = true;
    ammo[g.wi] = Math.max(ammo[g.wi] || 0, g.ammo || WEAPONS[g.wi].mag);
    selectWeapon(g.wi);
    say('Recogiste ' + WEAPONS[g.wi].name, 1.4);
    beep(440, 0.06, 0.12);
    scene.remove(g.mesh);
    g.mesh.material.dispose();
    groundGuns.splice(i, 1);
    updateHud();
    if (mode === 'mp') netSend({ t: 'pickgun', wi: g.wi });
    break;
  }
}

function clearGroundGuns() {
  for (const g of groundGuns) { scene.remove(g.mesh); g.mesh.material.dispose(); }
  groundGuns.length = 0;
}

/* ---------- Botiquines ---------- */
function clearMedkits() {
  for (const m of medkits) { scene.remove(m.mesh); m.mesh.material.dispose?.(); }
  medkits.length = 0;
}
function makeMedkitMesh() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.32, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.55, metalness: 0.05 })
  );
  box.castShadow = true;
  g.add(box);
  const crossH = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.08, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.4 })
  );
  crossH.position.set(0, 0.05, 0.16);
  g.add(crossH);
  const crossV = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.28, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.4 })
  );
  crossV.position.set(0, 0.05, 0.16);
  g.add(crossV);
  return g;
}
function spawnMedkits() {
  clearMedkits();
  const pts = [];
  if (MAP.sites) {
    for (const s of Object.values(MAP.sites)) pts.push([s[0], s[1]]);
  }
  if (MAP.waypoints) {
    const wps = MAP.waypoints.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(5, wps.length); i++) pts.push(wps[i]);
  }
  // puntos fijos centro
  pts.push([0, 0], [8, -6], [-10, 8]);
  const used = new Set();
  for (const [x, z] of pts) {
    const key = (x | 0) + ',' + (z | 0);
    if (used.has(key)) continue;
    used.add(key);
    if (medkits.length >= 8) break;
    const mesh = makeMedkitMesh();
    mesh.position.set(x, 0.22, z);
    scene.add(mesh);
    medkits.push({ mesh, x, z, heal: 40, respawn: 0, active: true });
  }
}
function updateMedkits(dt) {
  for (const m of medkits) {
    if (!m.active) {
      m.respawn -= dt;
      if (m.respawn <= 0) {
        m.active = true;
        m.mesh.visible = true;
      }
      continue;
    }
    m.mesh.rotation.y += dt * 1.2;
    m.mesh.position.y = 0.22 + Math.sin(performance.now() * 0.004) * 0.05;
    if (player.dead) continue;
    if (player.hp >= player.maxHp) continue;
    if (Math.hypot(player.pos.x - m.x, player.pos.z - m.z) > 1.3) continue;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + m.heal);
    m.active = false;
    m.mesh.visible = false;
    m.respawn = 28;
    say('Botiquín +' + Math.round(player.hp - before) + ' HP', 1.6);
    beep(520, 0.1, 0.15);
    updateHud();
    if (mode === 'mp') netSend({ t: 'medkit', x: r3(m.x), z: r3(m.z) });
  }
}

let lastCdShown = -1;
function updateCountdownDisplay() {
  const el = $('countdown');
  if (!el) return;
  if (!player.dead || !offlineMode()) {
    el.textContent = '';
    el.classList.remove('go');
    lastCdShown = -1;
    return;
  }
  const t = player.respawnT;
  if (t <= 0) {
    el.textContent = 'GO';
    el.classList.add('go');
    if (lastCdShown !== 0) { beep(660, 0.12, 0.22); lastCdShown = 0; }
    return;
  }
  el.classList.remove('go');
  const n = Math.max(1, Math.ceil(t));
  el.textContent = String(n);
  if (n !== lastCdShown) {
    lastCdShown = n;
    beep(n === 1 ? 520 : 280, 0.07, 0.14);
  }
}

function playerDied(killerName) {
  player.dead = true;
  if (mode !== 'mp') { player.armor = 0; player.helmet = false; }
  // 5 s con números grandes en el centro: 5 4 3 2 1 GO
  player.respawnT = offlineMode() ? 5 : CFG.playerRespawn;
  player.killer = killerName;
  mouseDown = false; trigger = false; reloading = false; zoomed = false;
  guns[cur].group.visible = false;
  deathEl.style.display = 'flex';
  lastCdShown = -1;
  updateCountdownDisplay();
  beep(80, 0.3, 0.2);
  // armas al suelo
  if (mode === 'mp') {
    for (let i = 2; i < WEAPONS.length; i++) { owned[i] = false; ammo[i] = 0; }
    if (cur > 1) selectWeapon(1);
    updateHud();
  } else if (mode !== 'agi') {
    dropMyWeapons();
  }
  if (mode === 'practice' && bombState && bombState.state === 'carried' && bombState.carrier === 'local') {
    bombState.state = 'dropped';
    bombState.carrier = null;
    bombState.x = player.pos.x;
    bombState.z = player.pos.z;
    updateBombVisual();
    say('La bomba cayó al suelo', 2);
  }
  if (mode === 'mp') {
    refreshSpecTargets();
    specIdx = 0;
    specYaw = player.yaw;
    specPitch = 0.2;
    updateDeathTxt();
  }
}

function reviveLocal() {
  player.dead = false;
  player.maxHp = mode === 'agi' ? AGI_CFG.hp : 100;
  player.hp = player.maxHp;
  player.armor = mode === 'agi' ? AGI_CFG.armor : 0;
  if (mode === 'agi') agiRefillReserve();
  for (let i = 0; i < WEAPONS.length; i++) {
    ammo[i] = (i <= 1 || owned[i]) ? WEAPONS[i].mag : 0;
  }
  if (cur > 1 && !owned[cur]) { selectWeapon(1); }
  guns[cur].group.visible = true;
  deathEl.style.display = 'none';
  const cd = $('countdown');
  if (cd) { cd.textContent = ''; cd.classList.remove('go'); }
  lastCdShown = -1;
  camera.rotation.z = 0;
  drawT = 1;
  updateHud();
  specTargets = [];
}

function refreshSpecTargets() {
  // Preferir compañeros del mismo equipo vivos; si no hay, cualquier vivo
  const allies = [], others = [];
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    if (r.team === myTeam) allies.push(r);
    else others.push(r);
  }
  specTargets = allies.length ? allies : others;
  if (specIdx >= specTargets.length) specIdx = 0;
}

function nextSpectator(dir = 1) {
  refreshSpecTargets();
  if (!specTargets.length) return;
  specIdx = (specIdx + dir + specTargets.length) % specTargets.length;
  updateDeathTxt();
}

function updateDeathTxt() {
  if (!player.dead) return;
  if (mode === 'solo') {
    deathTxt.textContent = 'Te eliminó ' + player.killer + ' — reapareces en ' + Math.max(1, Math.ceil(player.respawnT));
    return;
  }
  refreshSpecTargets();
  let msg = 'Te eliminó ' + player.killer;
  if (specTargets.length) {
    const t = specTargets[specIdx];
    msg += ' — Mirando a ' + (t.name || 'jugador') + '  ·  Espacio / clic = cambiar';
  } else {
    msg += ' — esperando siguiente ronda (nadie vivo para mirar)';
  }
  deathTxt.textContent = msg;
}

function updateSpectator(dt) {
  refreshSpecTargets();
  // permitir mirar con el ratón mientras estás muerto
  camera.rotation.z *= Math.max(0, 1 - dt * 4); // recuperar inclinación de muerte
  if (specTargets.length) {
    const t = specTargets[specIdx];
    if (!t || !t.alive) { nextSpectator(1); return; }
    const gx = t.g.position.x, gy = t.g.position.y, gz = t.g.position.z;
    // cámara detrás y un poco arriba (estilo espectador CS)
    const dist = 3.2;
    const tx = gx + Math.sin(specYaw) * dist;
    const tz = gz + Math.cos(specYaw) * dist;
    const ty = gy + 1.7 + Math.sin(specPitch) * 1.2;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 8);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 8);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 8);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = specYaw + Math.PI;
    camera.rotation.x = -specPitch * 0.6;
  } else {
    // nadie vivo: cámara fija sobre tu cadáver
    const p = player.pos;
    camera.position.x += (p.x - camera.position.x) * Math.min(1, dt * 3);
    camera.position.y += ((p.y + 4) - camera.position.y) * Math.min(1, dt * 3);
    camera.position.z += (p.z - camera.position.z) * Math.min(1, dt * 3);
    camera.lookAt(p.x, p.y + 0.5, p.z);
  }
}

/* =====================================================
   MODO ONLINE
   ===================================================== */
let ws = null, myId = 0, mpReady = false, netError = '', myPing = 0, pingTimer = 0, stateT = 0;
let roomCode = '', connectTimer = 0, retryTimer = 0, connectT0 = 0, joinMsg = null;
const WAKE_SECONDS = 75;   // cuánto se espera a que despierte un servidor dormido
const isLocalHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(location.hostname || '');
const remotes = new Map();   // id -> jugador remoto
const roster = new Map();    // id -> { name, kills, deaths }
const PALETTE = [0x2e6db0, 0x2e9e5b, 0xd98a1f, 0x8e44ad, 0x16a0a0, 0xc2579f, 0x7f8c8d, 0xb7a21a, 0x3b5bdb, 0xe67e22];

function nameOf(id) {
  if (id === myId) return 'Tú';
  const r = remotes.get(id);
  if (r) return r.name;
  const q = roster.get(id);
  return q ? q.name : 'Jugador';
}

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const opId = (p.op != null && p.op >= 0 && p.op <= 7) ? (p.op | 0) : (p.skin != null ? (p.skin | 0) % 8 : randomOp(p.team | 0).id);
  const g = makeCharacter(opId);
  g.position.set(p.x, p.y, p.z);
  g.add(makeTag(p.name));
  scene.add(g);
  const r = {
    id: p.id, name: p.name, team: p.team, g, tx: p.x, ty: p.y, tz: p.z, tyaw: p.yaw || 0,
    yaw: (p.yaw || 0) + Math.PI, alive: p.alive !== false, fall: 0, flash: 0, lit: false, meshes: [],
  };
  g.rotation.set(0, r.yaw, 0);
  g.traverse(o => {
    if (o.isMesh) { o.userData.remote = r; r.meshes.push(o); rayTargets.push(o); }
  });
  remotes.set(p.id, r);
  if (!r.alive) { r.fall = 1; g.rotation.x = -Math.PI / 2; g.position.y = 0.2; }
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.g);
  rayTargets = rayTargets.filter(o => o.userData.remote !== r);
  remotes.delete(id);
}

function updateRemotes(dt) {
  for (const r of remotes.values()) {
    if (r.alive) {
      const k = 1 - Math.exp(-dt * 14);           // suavizado del movimiento
      const p = r.g.position;
      const ox = p.x, oz = p.z;
      p.x += (r.tx - p.x) * k; p.y += (r.ty - p.y) * k; p.z += (r.tz - p.z) * k;
      r.stepAcc = (r.stepAcc || 0) + Math.hypot(p.x - ox, p.z - oz);
      if (r.stepAcc > 2.3) {
        r.stepAcc = 0;
        const dist = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
        if (dist < 28 && p.y < 0.3) sfxStep(0.07 * (1 - dist / 28));
      }
      let d = r.tyaw + Math.PI - r.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.yaw += d * k;
      r.g.rotation.set(0, r.yaw, 0);
      const rSpd = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001);
      animateCharacter(r.g, rSpd, dt, false);
      if (r.g.userData.anim) p.y += (r.g.userData.anim.bob || 0);
    } else {
      r.fall = Math.min(1, r.fall + dt * 4);
      r.g.rotation.x = -Math.PI / 2 * r.fall;
      r.g.position.y = 0.2 * r.fall;
    }
    if (r.flash > 0) r.flash -= dt;
    setLit(r, r.flash > 0);
    const ghost = performance.now() < (r.prot || 0);       // protegido al reaparecer: se ve semitransparente
    if (ghost !== !!r.ghost) {
      r.ghost = ghost;
      for (const m of r.meshes) { m.material.transparent = ghost; m.material.opacity = ghost ? 0.4 : 1; m.material.needsUpdate = true; }
    }
  }
}

function updateRoomInfo() {
  $('map').textContent = mode === 'mp'
    ? 'Sala ' + roomCode + ' · ' + (remotes.size + 1) + ' jugadores · ' + myPing + ' ms'
    : 'Mapa: ' + MAP.name;
}

// create = true: crea una sala nueva · false: se une a la sala cuyo código está escrito en el menú

/* ---------- Selección de equipo (estilo CS) ---------- */
function openTeamSelect(pending) {
  pendingStart = pending;
  const el = $('teamsel');
  if (!el) { confirmTeam(-1); return; }
  el.style.display = 'flex';
  try { document.exitPointerLock(); } catch (e) {}
}
function closeTeamSelect() {
  const el = $('teamsel');
  if (el) el.style.display = 'none';
}
function confirmTeam(choice) {
  // choice: 0 Alfa, 1 Bravo, -1 auto
  closeTeamSelect();
  const pending = pendingStart;
  pendingStart = null;
  if (!pending) return;
  if (choice === 0 || choice === 1) myTeam = choice;
  else myTeam = Math.random() < 0.5 ? 0 : 1;
  const op = randomOp(myTeam);
  myOpId = op.id;
  if (pending.type === 'mp') {
    startMultiNow(pending.create);
  } else if (pending.type === 'solo') {
    startSoloNow();
  } else if (pending.type === 'practice') {
    startPracticeNow();
  } else if (pending.type === 'agi') {
    startAgiNow();
  }
}

function startMulti(create) {
  const name = ($('name').value || '').trim().slice(0, 14);
  const code = ($('code').value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (!create && code.length !== 4) { $('menuerr').textContent = 'Escribe el código de 4 letras que te pasó tu amigo.'; return; }
  openTeamSelect({ type: 'mp', create: !!create });
}
function startMultiNow(create) {
  const name = ($('name').value || '').trim().slice(0, 14);
  const code = ($('code').value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  try { localStorage.setItem('bs_name', name); } catch (e) { /* sin almacenamiento */ }
  resetKeys();
  initAudio();
  mode = 'mp'; mpReady = false; netError = ''; roomCode = '';
  $('menuerr').textContent = '';
  joinMsg = { t: 'join', name, create: !!create, room: create ? '' : code, map: $('mapsel').value, team: myTeam, op: myOpId };
  lockGame();
  say('Conectando... · ' + (TEAMS[myTeam]?.name || '') + ' · ' + (OPERATORS[myOpId]?.name || ''), 999);
  connectT0 = Date.now();
  clearTimeout(retryTimer);
  connectAttempt();

  clearInterval(connectTimer);
  connectTimer = setInterval(() => {
    if (mode !== 'mp' || mpReady) { clearInterval(connectTimer); return; }
    const s = (Date.now() - connectT0) / 1000;
    if (s > WAKE_SECONDS) { netFail('El servidor no respondió. Si estaba dormido, espera un minuto e inténtalo de nuevo.'); return; }
    if (s > 4) wakeNote();
  }, 1000);
}

function wakeNote() {
  say('Despertando el servidor... puede tardar hasta un minuto (' + Math.round((Date.now() - connectT0) / 1000) + ' s)', 999);
}

// Un intento de conexión. En internet (hosting gratis) el servidor puede estar dormido: mientras despierta,
// la conexión falla enseguida, así que se reintenta sola cada 3 s hasta WAKE_SECONDS.
// En tu PC o red local no se reintenta: si no conecta es que el servidor no está encendido.
function connectAttempt() {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let sock;
  try { sock = new WebSocket(url); } catch (e) { netFail('No se pudo conectar al servidor.'); return; }
  ws = sock;
  let opened = false, over = false;
  const giveUp = setTimeout(() => { if (!opened) { try { sock.close(); } catch (e) { /* ya cerrado */ } } }, 12000);   // saludo colgado
  sock.onopen = () => { opened = true; clearTimeout(giveUp); sock.send(JSON.stringify(joinMsg)); };
  sock.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    onNet(m);
  };
  const ended = () => {
    clearTimeout(giveUp);
    if (over) return;
    over = true;
    if (sock !== ws || mode !== 'mp') return;
    if (mpReady) { netFail('Se perdió la conexión con el servidor.'); return; }
    if (!opened && !isLocalHost && (Date.now() - connectT0) / 1000 < WAKE_SECONDS) {
      wakeNote();
      retryTimer = setTimeout(() => { if (mode === 'mp' && !mpReady && ws === sock) connectAttempt(); }, 3000);
      return;
    }
    netFail(opened ? 'El servidor cerró la conexión antes de entrar.'
          : isLocalHost ? 'No se pudo conectar. ¿Está encendido el servidor (node server.js)?'
          : 'El servidor no respondió. Si estaba dormido, espera un minuto e inténtalo de nuevo.');
  };
  sock.onerror = () => { if (!opened) ended(); };   // algunos navegadores solo avisan con "error" si no logra conectar
  sock.onclose = ended;
}

function netFail(msg) {
  const wasReady = mpReady;
  mpReady = false;
  clearInterval(pingTimer); clearInterval(connectTimer); clearTimeout(retryTimer);
  const old = ws; ws = null;
  try { if (old) old.close(); } catch (e) { /* ya estaba cerrado */ }
  msgEl.textContent = ''; msgT = 0;
  if (!wasReady) { mode = 'menu'; roomCode = ''; $('menuerr').textContent = msg; }
  else { mode = 'ended'; netError = msg; }
  deathEl.style.display = 'none';
  unlockGame();
  showOverlay();
}

function netSend(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function onNet(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id; mpReady = true;
      myTeam = m.team ?? 0;
      if (m.op != null) myOpId = m.op | 0;
      myMoney = m.money ?? ECO.startMoney;
      player.armor = m.armor | 0;
      player.helmet = !!m.helmet;
      owned = WEAPONS.map((_, i) => i <= 1);
      loadMap(m.map || 'dust');
      spawnMedkits();
      {
        const [sx, sy, sz] = findSafePos(m.spawn.x, m.spawn.z, m.spawn.y || 0);
        player.pos.set(sx, sy, sz);
      }
      player.vx = player.vy = player.vz = 0;
      player.onGround = true;
      player.yaw = m.spawn.yaw; player.pitch = 0;
      player.kills = 0; player.deaths = 0;
      for (const p of m.players) addRemote(p);
      reviveLocal();
      showGun();
      msgEl.textContent = ''; msgT = 0;
      roomCode = m.room;
      feed('Sala ' + roomCode + ' · Equipo ' + (TEAMS[myTeam]?.name || '?') + ' · B comprar · Enter chat · V verte');
      clearInterval(pingTimer);
      pingTimer = setInterval(() => netSend({ t: 'ping', ts: Date.now(), rtt: myPing }), 2000);
      netSend({ t: 'ping', ts: Date.now(), rtt: myPing });
      shieldUntil = performance.now() + 1500;
      updateRoomInfo();
      updateHud();
      break;
    }
    case 'join':
      addRemote(m.p);
      { const nr = remotes.get(m.p.id); if (nr) nr.prot = performance.now() + 1500; }
      feed(m.p.name + ' entró a la partida');
      updateRoomInfo();
      break;
    case 'leave':
      removeRemote(m.id);
      roster.delete(m.id);
      feed(m.name + ' salió');
      updateRoomInfo();
      break;
    case 'state':
      for (const s of m.p) {
        if (s[0] === myId) continue;
        const r = remotes.get(s[0]);
        if (r) { r.tx = s[1]; r.ty = s[2]; r.tz = s[3]; r.tyaw = s[4]; }
      }
      break;
    case 'shot': {
      const r = remotes.get(m.id);
      if (!r) break;
      gunWorld(r.g.position, r.yaw, _mz);
      for (const e of m.e) { _e.set(e[0], e[1], e[2]); tracer(_mz.clone(), _e.clone()); puff(_e, 0xb8a888, 2); }
      const w = WEAPONS[m.w] || WEAPONS[1];
      const d = Math.hypot(r.g.position.x - player.pos.x, r.g.position.z - player.pos.z);
      sfxShot(w.vol / (1 + d * 0.08), w.rate2);
      break;
    }
    case 'nade': {
      spawnRemoteNade(m);
      break;
    }
    case 'dropguns': {
      // otro jugador soltó armas al morir
      if (Array.isArray(m.guns)) {
        for (const g of m.guns) {
          const [wi, mag, x, z] = g;
          spawnGroundGun(wi | 0, mag | 0, +x, +z);
        }
      }
      break;
    }
    case 'medkit': {
      // otro jugador recogió un botiquín cerca de x,z
      for (const mk of medkits) {
        if (mk.active && Math.hypot(mk.x - (m.x || 0), mk.z - (m.z || 0)) < 2) {
          mk.active = false; mk.mesh.visible = false; mk.respawn = 28;
        }
      }
      break;
    }
    case 'hit': {
      const me = m.v === myId, mine = m.s === myId;
      if (me) {
        player.hp = m.hp;
        if (m.armor != null) player.armor = m.armor | 0;
        if (m.helmet != null) player.helmet = !!m.helmet;
        dmgFlash = 1; beep(120, 0.08, 0.15);
      }
      else { const r = remotes.get(m.v); if (r) r.flash = 0.08; }
      if (mine) { showHit(m.kill); player.hp = m.sh; }
      if (m.kill) {
        feed(nameOf(m.s) + '  ➜  ' + nameOf(m.v));
        if (me) { player.armor = 0; player.helmet = false; playerDied(nameOf(m.s)); }
        else { const r = remotes.get(m.v); if (r) { r.alive = false; r.fall = 0; } }
      }
      updateHud();
      break;
    }
    case 'respawn': {
      if (m.id === myId) {
        shieldUntil = performance.now() + 1500;
        // Evitar quedar atrapado en paredes (el servidor no valida colisión exacta)
        const [sx, sy, sz] = findSafePos(m.x, m.z, m.y || 0);
        player.pos.set(sx, sy, sz);
        player.vx = player.vy = player.vz = 0;
        player.onGround = true;
        player.yaw = m.yaw; player.pitch = 0;
        reviveLocal();
      } else {
        const r = remotes.get(m.id);
        if (r) {
          r.alive = true; r.fall = 0; r.prot = performance.now() + 1500;
          r.g.position.set(m.x, m.y, m.z);
          r.tx = m.x; r.ty = m.y; r.tz = m.z; r.tyaw = m.yaw; r.yaw = m.yaw + Math.PI;
          r.g.rotation.set(0, r.yaw, 0);
        }
      }
      break;
    }
    case 'correct': {
      const [sx, sy, sz] = findSafePos(m.x, m.z, m.y || 0);
      player.pos.set(sx, sy, sz);
      player.vx = player.vy = player.vz = 0;
      player.onGround = true;
      break;
    }
    case 'scores':
      roster.clear();
      if (m.teamScore) teamScore = m.teamScore;
      for (const row of m.l) {
        // [id, name, team, kills, deaths, money, alive]
        const [id, name, team, k, d, money, alive] = row;
        roster.set(id, { name, team, kills: k, deaths: d, money, alive });
      }
      if (roster.has(myId)) {
        player.kills = roster.get(myId).kills;
        player.deaths = roster.get(myId).deaths;
      }
      updateHud();
      if (boardEl.style.display === 'block') renderBoard();
      break;
    case 'money':
      myMoney = m.money;
      if (m.owned) owned = m.owned;
      if (m.armor != null) player.armor = m.armor | 0;
      if (m.helmet != null) player.helmet = !!m.helmet;
      if (m.boughtArmor) {
        const lab = m.boughtArmor === 'vest' ? 'Chaleco' : m.boughtArmor === 'helmet' ? 'Casco' : 'Chaleco + Casco';
        say('Compraste ' + lab, 1.2);
      }
      if (m.bought != null) {
        const bw = WEAPONS[m.bought];
        if (bw) {
          if (bw.grenade) ammo[m.bought] = Math.min(bw.mag, (ammo[m.bought] || 0) + 1);
          else ammo[m.bought] = bw.mag;
        }
        selectWeapon(m.bought);
        say('Compraste ' + (bw?.name || 'arma'), 1.2);
      }
      updateHud();
      if (buyOpen) renderBuyMenu();
      break;
    case 'buyfail': {
      const reasons = {
        dinero: 'No tienes suficiente dinero',
        ya: 'Ya tienes esa protección',
        chaleco: 'Primero compra el chaleco',
      };
      say(reasons[m.reason] || 'No se puede comprar ahora', 1.5);
      break;
    }
    case 'pong':
      myPing = Math.max(0, Date.now() - m.ts);
      updateRoomInfo();
      break;
    case 'phase':
      onPhase(m);
      break;
    case 'chat':
      addChat(m.n, m.text, m.team);
      break;
    case 'bomb': {
      if (m.state === 'clear') { bombState = null; updateBombVisual(); break; }
      bombState = {
        state: m.state,
        carrier: m.carrier,
        x: m.x, z: m.z, site: m.site,
        explodesAt: m.explodesAt,
        plantProg: m.plantProg || 0,
        defuseProg: m.defuseProg || 0,
        defuser: m.defuser,
      };
      updateBombVisual();
      if (m.state === 'planted') {
        say('¡BOMBA PLANTADA en ' + (m.site || '?') + '!', 2.5);
        // “Bomb planted” aproximado con tonos
        beep(180, 0.08, 0.18); setTimeout(() => beep(220, 0.08, 0.18), 90);
        setTimeout(() => beep(280, 0.12, 0.2), 200); setTimeout(() => beep(360, 0.18, 0.22), 340);
        bombBeepT = 0;
      }
      if (m.state === 'defused') {
        say('Bomba desactivada', 2);
        beep(520, 0.1, 0.18); setTimeout(() => beep(620, 0.1, 0.18), 100);
        setTimeout(() => beep(780, 0.2, 0.22), 220);
      }
      if (m.state === 'explode') {
        say('¡BOOM!', 2);
        beep(60, 0.5, 0.4); setTimeout(() => beep(40, 0.4, 0.3), 120);
        if (bombState) bigExplosion(new THREE.Vector3(bombState.x, 0.5, bombState.z));
        else dmgFlash = 1.2;
      }
      if (m.state === 'carried' && m.carrier === myId) say('Tienes la bomba — planta en A o B (E)', 2.5);
      break;
    }
    case 'full':
      netFail('La sala está llena (máximo 12 jugadores).');
      break;
    case 'noroom':
      netFail('No existe una sala con ese código. Revisa las 4 letras o crea una sala nueva.');
      break;
    case 'busy':
      netFail('El servidor tiene demasiadas salas abiertas. Inténtalo de nuevo en unos minutos.');
      break;
  }
}

// envía tu posición al servidor 20 veces por segundo (también en pausa)
function netTick(dt) {
  if (mode !== 'mp' || !mpReady || player.dead) return;
  stateT += dt;
  if (stateT < 0.05) return;
  stateT = 0;
  netSend({ t: 'state', x: r3(player.pos.x), y: r3(player.pos.y), z: r3(player.pos.z),
            yaw: r3(player.yaw), pitch: r3(player.pitch), w: cur });
}

/* ---------- Marcador (Tab) y chat (Enter) ---------- */
function renderBoard() {
  const rows = [...roster.entries()].sort((a, b) => (a[1].team - b[1].team) || b[1].kills - a[1].kills || a[1].deaths - b[1].deaths);
  let h = '<h3>Sala ' + esc(roomCode) + ' · <span style="color:#3b82f6">' + teamScore[0] + '</span> - <span style="color:#ef4444">' + teamScore[1] + '</span></h3>';
  h += '<table><tr><th>Nombre</th><th>Equipo</th><th>Bajas</th><th>Muertes</th><th>$</th></tr>';
  for (const [id, r] of rows) {
    const col = TEAMS[r.team]?.hex || '#fff';
    const dead = r.alive === false ? ' opacity:.5' : '';
    h += '<tr class="' + (id === myId ? 'me' : '') + '" style="' + dead + '"><td>' + esc(r.name) + '</td><td style="color:' + col + '">' + (TEAMS[r.team]?.name || '?') + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td><td>' + (r.money ?? '—') + '</td></tr>';
  }
  h += '</table><div class="ping">Tu ping: ' + myPing + ' ms · Equipo: ' + (TEAMS[myTeam]?.name || '?') + '</div>';
  boardEl.innerHTML = h;
}
function showBoard(on) {
  const show = on && mode === 'mp';
  boardEl.style.display = show ? 'block' : 'none';
  if (show) renderBoard();
}

let chatOpen = false;
function openChat() {
  chatOpen = true;
  chatIn.style.display = 'block';
  chatIn.value = '';
  chatIn.focus();
  resetKeys();
}
function closeChat() {
  chatOpen = false;
  chatIn.style.display = 'none';
  chatIn.blur();
}
chatIn.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const text = chatIn.value.trim();
    if (text) netSend({ t: 'chat', text });
    closeChat();
  } else if (e.key === 'Escape') closeChat();
});
const muted = new Set();      // nombres silenciados en el chat (solo para ti)
function addChat(name, text, team) {
  if (muted.has(name)) return;
  const el = document.createElement('div');
  const nm = document.createElement('b');
  nm.textContent = name + ': ';
  if (TEAMS[team]) nm.style.color = TEAMS[team].hex;
  el.appendChild(nm);
  el.appendChild(document.createTextNode(text));
  chatLog.appendChild(el);
  while (chatLog.children.length > 6) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => el.remove(), 9000);
}


/* =====================================================
   Bomba (Defuse)
   ===================================================== */
function clearSiteMarkers() {
  for (const m of siteMarkers) { scene.remove(m); m.geometry?.dispose(); m.material?.dispose(); }
  siteMarkers = [];
}
function buildSiteMarkers() {
  clearSiteMarkers();
  if (!MAP.sites) return;
  for (const [name, arr] of Object.entries(MAP.sites)) {
    const [x, z, rad] = arr;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(rad - 0.15, rad, 32),
      new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    scene.add(ring);
    siteMarkers.push(ring);
    // letra A/B
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5a623'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85 }));
    spr.scale.set(1.8, 1.8, 1); spr.position.set(x, 2.2, z);
    scene.add(spr); siteMarkers.push(spr);
  }
}
function ensureBombMesh() {
  if (bombMesh) return bombMesh;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.5), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  body.position.y = 0.12; g.add(body);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  light.position.set(0.12, 0.22, 0.15); g.add(light);
  g.visible = false; scene.add(g); bombMesh = g; return g;
}
function updateBombVisual() {
  const m = ensureBombMesh();
  if (!bombState || bombState.state === 'clear' || bombState.state === 'carried') {
    m.visible = false; return;
  }
  if (bombState.state === 'dropped' || bombState.state === 'planted' || bombState.state === 'defusing') {
    m.visible = true;
    m.position.set(bombState.x, 0, bombState.z);
    // parpadeo más rápido cuando queda poco
    if (bombState.explodesAt) {
      const left = (bombState.explodesAt - Date.now()) / 1000;
      const blink = left < 10 ? (Math.sin(Date.now() * 0.02) > 0) : (Math.sin(Date.now() * 0.008) > 0);
      m.children[1].material.color.set(blink ? 0xff2222 : 0x440000);
    }
  }
}

/** Pitido de la bomba que se acelera según el tiempo restante (estilo CS) */
function tickBombBeep(dt) {
  if (!bombState || (bombState.state !== 'planted' && bombState.state !== 'defusing') || !bombState.explodesAt) return;
  const left = Math.max(0, (bombState.explodesAt - Date.now()) / 1000);
  // intervalo: ~1.0 s al principio → ~0.12 s al final
  const interval = Math.max(0.12, 0.12 + (left / 40) * 0.9);
  bombBeepT -= dt;
  if (bombBeepT <= 0) {
    bombBeepT = interval;
    const pitch = left < 8 ? 280 : 200;
    beep(pitch, 0.05, left < 5 ? 0.22 : 0.14);
  }
}
function bombPrompt() {
  if (player.dead) return '';
  if (mode === 'mp' && (!mpReady || phase.ph !== 'play')) return '';
  if (mode !== 'mp' && mode !== 'practice') return '';
  const b = bombState;
  if (!b) return '';
  const carrierOk = mode === 'practice' ? (b.carrier === 'local') : (b.carrier === myId);
  // ¿Puedo plantar?
  if (b.state === 'carried' && carrierOk && myTeam === MATCH.attackerTeam) {
    if (!MAP.sites) return '';
    for (const [name, arr] of Object.entries(MAP.sites)) {
      const [sx, sz, rad] = arr;
      if (Math.hypot(player.pos.x - sx, player.pos.z - sz) <= rad) {
        const prog = Math.min(1, (b.plantProg || 0) / MATCH.plantSec);
        return prog > 0 ? ('Plantando ' + name + '… ' + Math.floor(prog * 100) + '%') : ('Mantén E para plantar en ' + name);
      }
    }
  }
  // ¿Puedo desactivar?
  if ((b.state === 'planted' || b.state === 'defusing') && myTeam === MATCH.defenderTeam) {
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) <= MATCH.bombRadius + 0.6) {
      const prog = Math.min(1, (b.defuseProg || 0) / MATCH.defuseSec);
      return prog > 0 ? ('Desactivando… ' + Math.floor(prog * 100) + '%') : 'Mantén E para desactivar la bomba';
    }
  }
  // ¿Puedo recoger?
  if (b.state === 'dropped' && myTeam === MATCH.attackerTeam) {
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < 1.5) return 'Pasa cerca para recoger la bomba';
  }
  return '';
}
function tickBombHold(dt) {
  if (!bombHold || player.dead) return;
  if (mode === 'mp') {
    if (!mpReady || phase.ph !== 'play') return;
    bombActAcc += dt;
    if (bombActAcc < 0.12) return;
    bombActAcc = 0;
    const b = bombState;
    if (!b) return;
    if (b.state === 'carried' && b.carrier === myId && myTeam === MATCH.attackerTeam) {
      if (!MAP.sites) return;
      for (const [name, arr] of Object.entries(MAP.sites)) {
        const [sx, sz, rad] = arr;
        if (Math.hypot(player.pos.x - sx, player.pos.z - sz) <= rad) {
          netSend({ t: 'bombact', act: 'plant', site: name });
          return;
        }
      }
      netSend({ t: 'bombact', act: 'stop' });
    } else if ((b.state === 'planted' || b.state === 'defusing') && myTeam === MATCH.defenderTeam) {
      if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) <= MATCH.bombRadius + 0.6) {
        netSend({ t: 'bombact', act: 'defuse' });
      } else {
        netSend({ t: 'bombact', act: 'stop' });
      }
    }
    return;
  }
  // ----- práctica local -----
  if (mode !== 'practice' || !bombState) return;
  const b = bombState;
  if (b.state === 'carried' && b.carrier === 'local' && myTeam === MATCH.attackerTeam && MAP.sites) {
    let onSite = null, sx = 0, sz = 0;
    for (const [name, arr] of Object.entries(MAP.sites)) {
      const [x, z, rad] = arr;
      if (Math.hypot(player.pos.x - x, player.pos.z - z) <= rad) { onSite = name; sx = x; sz = z; break; }
    }
    if (onSite) {
      b.plantProg = (b.plantProg || 0) + dt;
      if (b.plantProg >= MATCH.plantSec) {
        b.state = 'planted'; b.site = onSite; b.x = sx; b.z = sz; b.carrier = null;
        b.plantProg = 0; b.explodesAt = Date.now() + MATCH.bombTimerSec * 1000;
        bombBeepT = 0;
        say('¡BOMBA PLANTADA en ' + onSite + '!', 2.5);
        beep(180, 0.08, 0.18); setTimeout(() => beep(220, 0.08, 0.18), 90);
        setTimeout(() => beep(280, 0.12, 0.2), 200);
        updateBombVisual();
      }
    } else {
      b.plantProg = 0;
    }
  } else if ((b.state === 'planted' || b.state === 'defusing') && myTeam === MATCH.defenderTeam) {
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) <= MATCH.bombRadius + 0.6) {
      b.state = 'defusing';
      b.defuseProg = (b.defuseProg || 0) + dt;
      if (b.defuseProg >= MATCH.defuseSec) {
        say('Bomba desactivada', 2);
        beep(520, 0.1, 0.18); setTimeout(() => beep(780, 0.2, 0.22), 220);
        bombState = null;
        updateBombVisual();
        practiceRoundEnd('defuse');
      }
    } else {
      b.defuseProg = 0;
      if (b.state === 'defusing') b.state = 'planted';
    }
  }
}

let practiceResetT = 0;
function practiceRoundEnd(reason) {
  if (mode !== 'practice') return;
  if (reason === 'explode') {
    say('¡BOOM! — nueva ronda en 4 s', 3);
    if (bombState) bigExplosion(new THREE.Vector3(bombState.x, 0.5, bombState.z));
  } else if (reason === 'defuse') {
    say('Desactivada — nueva ronda en 4 s', 3);
  } else {
    say('Nueva ronda en 4 s', 2);
  }
  practiceResetT = 4;
  bombState = null;
  updateBombVisual();
}

function tickPractice(dt) {
  if (mode !== 'practice') return;
  // explosión de bomba
  if (bombState && bombState.state === 'planted' && bombState.explodesAt && Date.now() >= bombState.explodesAt) {
    practiceRoundEnd('explode');
  }
  // recoger bomba del suelo
  if (bombState && bombState.state === 'dropped' && myTeam === MATCH.attackerTeam && !player.dead) {
    if (Math.hypot(player.pos.x - bombState.x, player.pos.z - bombState.z) < 1.4) {
      bombState.state = 'carried'; bombState.carrier = 'local';
      say('Tienes la bomba — planta en A o B (E)', 2);
      updateBombVisual();
    }
  }
  if (practiceResetT > 0) {
    practiceResetT -= dt;
    if (practiceResetT <= 0) resetPracticeRound();
  }
}

function resetPracticeRound() {
  // revivir jugador y bots, dar bomba de nuevo
  placePlayer();
  reviveLocal();
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  for (const b of bots) {
    b.alive = false; b.respawn = 0.1;
  }
  bombState = {
    state: 'carried', carrier: 'local', plantProg: 0, defuseProg: 0,
    x: 0, z: 0, site: null, explodesAt: 0
  };
  updateBombVisual();
  say('Ronda de práctica — eres Bravo, planta la bomba (E en A/B)', 3);
  updateHud();
}

/* =====================================================
   Disparo del jugador
   ===================================================== */
const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3(), fwd = new THREE.Vector3(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3();

function shoot() {
  const w = WEAPONS[cur];
  // las fases de ronda (freeze, descanso...) solo existen en línea; contra bots siempre se puede disparar
  if (mode === 'mp' && (phase.ph === 'freeze' || phase.ph === 'break' || phase.ph === 'final' || phase.ph === 'wait')) return;
  if (w.grenade) { throwGrenade(w); return; }
  if (!w.melee && ammo[cur] <= 0) { say('Sin munición — R para recargar'); return; }
  if (!w.melee) ammo[cur]--;
  fireCd = w.rate;
  gunKick = w.kick; flashT = 0.04; guns[cur].flash.visible = !w.melee;
  sfxShot(w.vol, w.rate2);

  camera.updateMatrixWorld(true);
  // Precisión estilo CS: muy preciso quieto, impreciso al correr/saltar
  const spd = Math.hypot(player.vx, player.vz);
  let spread = w.spread || 0;
  if (w.melee) spread = 0.015;
  else {
    if (!player.onGround) spread += 0.08;
    else if (spd > 3.5) spread += 0.045;
    else if (spd > 1.2) spread += 0.018;
    if (keys.ShiftLeft || keys.ShiftRight) spread *= 0.55;
  }
  camera.getWorldDirection(fwd);
  camera.getWorldPosition(origin);
  guns[cur].flash.getWorldPosition(muzzle);

  let anyHit = false, anyKill = false;
  const dirs = [];
  for (let i = 0; i < w.pellets; i++) {
    dir.copy(fwd);
    dir.x += (Math.random() - .5) * spread * 2;
    dir.y += (Math.random() - .5) * spread * 2;
    dir.z += (Math.random() - .5) * spread * 2;
    dir.normalize();
    dirs.push([r3(dir.x), r3(dir.y), r3(dir.z)]);
    raycaster.set(origin, dir);
    raycaster.far = w.melee ? 2.2 : 150;
    let end = origin.clone().addScaledVector(dir, 100);
    for (const h of raycaster.intersectObjects(rayTargets, false)) {
      const b = h.object.userData.bot, r = h.object.userData.remote;
      if (b && !b.alive) continue;
      if (r && !r.alive) continue;
      const ob = h.object.userData.obj;
      if (ob && !ob.alive) continue;
      end = h.point;
      if (ob) {                                   // Operación AGI: nodos y Núcleo
        anyHit = true;
        agiDamageObj(ob, w.damage, 'player');
        puff(h.point, ob.shielded ? 0x66ccff : 0xffaa44, w.pellets > 1 ? 2 : 5);
      } else if (b) {                             // solo: el daño se calcula aquí
        anyHit = true;
        if (damageBot(b, h.object.userData.part, w, h.distance)) anyKill = true;
        puff(h.point, 0xcc2222, w.pellets > 1 ? 2 : 6);
      } else if (r) puff(h.point, 0xcc2222, w.pellets > 1 ? 2 : 6);   // online: el servidor decide el daño
      else {
        puff(h.point, 0xb8a888, w.pellets > 1 ? 2 : 4);
        if (!w.melee && h.face) bulletHole(h.point, h.face.normal);
      }
      break;
    }
    if (i < 3) tracer(muzzle.clone(), end);
  }
  if (!w.melee) ejectCasing();
  if (anyHit) showHit(anyKill);
  if (mode === 'mp') netSend({ t: 'shoot', w: cur, dirs });

  // Recoil acumulativo estilo CS
  const rc = RECOIL[w.id] || { up: 0.02, side: 0.01, recover: 5 };
  recoilPitch += rc.up * 0.55;
  recoilYaw += (Math.random() - 0.5) * rc.side * 1.2;
  player.pitch += rc.up * 0.45;
  player.yaw += (Math.random() - 0.5) * rc.side;
  updateHud();
}

function reload() {
  const w = WEAPONS[cur];
  if (w.melee || w.grenade || reloading || ammo[cur] === w.mag || player.dead) return;
  if (mode === 'agi' && (reserve[cur] | 0) <= 0) { say('Sin munición de reserva — busca cajas de munición', 1.4); return; }
  reloading = true; reloadT = w.reload;
  say('Recargando...', w.reload);
  beep(300, 0.06, 0.1); setTimeout(() => beep(220, 0.05, 0.1), 90);
  if (mode === 'mp') netSend({ t: 'reload', w: cur });
}

/* ---------- HUD ---------- */
function updateHud() {
  const w = WEAPONS[cur];
  const ag = mode === 'agi', pm = player.maxHp || 100;
  $('hptxt').textContent = Math.ceil(player.hp);
  const fill = $('hpfill');
  fill.style.width = Math.max(0, Math.min(100, player.hp / pm * 100)) + '%';
  fill.style.background = player.hp / pm > 0.5 ? '#3ddc5a' : player.hp / pm > 0.25 ? '#f5c542' : '#e5483b';
  if ($('hpmax')) $('hpmax').textContent = ag ? ' /' + pm : '';
  if ($('armbox')) {
    const ar = Math.ceil(player.armor || 0);
    $('armbox').style.display = (ag || ar > 0 || player.helmet) ? 'block' : 'none';
    $('armtxt').textContent = ar + (player.helmet ? ' 🪖' : '');
  }
  if ($('wname')) $('wname').textContent = ag ? w.name : '';
  $('score').style.display = ag ? 'none' : '';
  if (w.melee) $('ammo').innerHTML = '∞';
  else if (ag && !w.grenade) $('ammo').innerHTML = ammo[cur] + ' <small>/ ' + (reserve[cur] | 0) + '</small>';
  else $('ammo').innerHTML = ammo[cur] + ' <small>/ ' + w.mag + '</small>';
  const teamName = TEAMS[myTeam]?.name || '';
  const teamCol = TEAMS[myTeam]?.hex || '#fff';
  $('score').innerHTML = '<span style="color:' + teamCol + '">' + teamName + '</span> · $' + myMoney
    + ' · <span style="color:#3b82f6">' + teamScore[0] + '</span>-<span style="color:#ef4444">' + teamScore[1] + '</span>'
    + ' · K/D ' + player.kills + '/' + player.deaths;
  for (let i = 0; i < WEAPONS.length; i++) {
    const el = $('w' + i);
    if (!el) continue;
    el.classList.toggle('on', i === cur);
    const has = i <= 1 || (owned[i] && (!WEAPONS[i].grenade || ammo[i] > 0));
    el.style.opacity = has ? (i === cur ? '1' : '0.75') : '0.3';
  }
}
updateHud();

/* ---------- Menú de compra (B) ---------- */
function closeBuy(relock = true) {
  if (!buyOpen) return;
  buyOpen = false;
  const el = $('buymenu');
  if (el) el.style.display = 'none';
  if (relock && !player.dead && mode !== 'menu') {
    try { lockGame(); } catch (e) {}
  }
}

function openBuy() {
  if (mode === 'agi') { say('Todas las armas están desbloqueadas (teclas 1-9)', 1.6); return; }
  if (mode !== 'mp' || !mpReady) {
    say('La tienda solo está en multijugador', 1.5);
    return;
  }
  if (phase.ph !== 'freeze' && phase.ph !== 'break') {
    say('Solo puedes comprar en freeze o descanso', 1.5);
    return;
  }
  buyOpen = true;
  const el = $('buymenu');
  if (!el) return;
  el.style.display = 'block';
  // evitar que el menú de pausa tape la tienda
  if (isMobile) {
    setMobileUI(false);
    if (overlay) overlay.style.display = 'none';
  } else {
    try { document.exitPointerLock(); } catch (e) {}
    if (overlay) overlay.style.display = 'none';
  }
  renderBuyMenu();
}

function toggleBuy() {
  if (buyOpen) closeBuy(true);
  else openBuy();
}

/** Dibuja el modelo de bloques del arma en un canvas 2D (vista lateral) */
function drawWeaponPreview(canvas, wi) {
  const w = WEAPONS[wi];
  if (!w || !canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, 0, W, H);
  const parts = w.parts || [[0.1, 0.1, 0.3, 0, 0, 0, 0x555555]];
  // bounds de las partes
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [a, b, c, x, y, z] of parts) {
    // vista lateral: eje Z del arma → X del canvas, Y del arma → Y del canvas
    const x0 = z - c / 2, x1 = z + c / 2;
    const y0 = y - b / 2, y1 = y + b / 2;
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
  }
  const pad = 10;
  const bw = maxX - minX || 0.5, bh = maxY - minY || 0.3;
  const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh) * 0.9;
  const cx = W / 2, cy = H / 2;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(cx - bw * scale * 0.45, cy + bh * scale * 0.35, bw * scale * 0.9, 6);
  // piezas de atrás a adelante (por x del arma para un poco de profundidad)
  const sorted = parts.slice().sort((p, q) => p[3] - q[3]);
  for (const [a, b, c, x, y, z, col] of sorted) {
    const px = cx + (z - mx) * scale - (c * scale) / 2;
    const py = cy - (y - my) * scale - (b * scale) / 2;
    const pw = Math.max(2, c * scale);
    const ph = Math.max(2, b * scale);
    const color = new THREE.Color(col);
    // cara frontal
    ctx.fillStyle = '#' + color.getHexString();
    ctx.fillRect(px, py, pw, ph);
    // borde
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);
    // highlight superior
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(px, py, pw, Math.max(1, ph * 0.25));
  }
}

function renderBuyMenu() {
  const el = $('buymenu');
  if (!el) return;
  let h = '<div class="buyhead"><h2>TIENDA · $' + myMoney + '</h2>'
    + '<button type="button" class="buyx" id="btnBuyClose" title="Cerrar">×</button></div>'
    + '<p class="buysub">Protección y armas · B / Esc / × para salir</p>';

  // --- Protección ---
  const ar = player.armor | 0, hasHelm = !!player.helmet;
  const armorItems = [
    { id: 'vest', name: 'Chaleco', price: ECO.vestPrice, desc: '100 armadura', have: ar >= ECO.armorMax, can: myMoney >= ECO.vestPrice && ar < ECO.armorMax },
    { id: 'helmet', name: 'Casco', price: ECO.helmetPrice, desc: 'Reduce headshots', have: hasHelm, can: myMoney >= ECO.helmetPrice && !hasHelm && ar > 0 },
    { id: 'vesthelm', name: 'Chaleco + Casco', price: ECO.vestHelmPrice, desc: 'Pack completo', have: ar >= ECO.armorMax && hasHelm, can: myMoney >= ECO.vestHelmPrice && !(ar >= ECO.armorMax && hasHelm) },
  ];
  h += '<div class="buysec">PROTECCIÓN</div><div class="buygrid buyarmor">';
  for (const it of armorItems) {
    const cls = 'buycard' + (it.have ? ' have' : '') + (!it.can && !it.have ? ' disabled' : '');
    let st = it.have ? 'Equipado ✓' : (!it.can ? (it.id === 'helmet' && ar <= 0 ? 'Necesitas chaleco' : 'Sin dinero') : 'Comprar');
    h += '<div class="' + cls + '" data-armor="' + it.id + '">'
      + '<div class="bn">' + it.name + '</div>'
      + '<div class="bp">$' + it.price + '</div>'
      + '<div class="bst">' + st + '</div>'
      + '<div class="bst" style="opacity:.7">' + it.desc + '</div></div>';
  }
  h += '</div><div class="buysec">ARMAS</div><div class="buygrid">';
  for (let i = 2; i < WEAPONS.length; i++) {
    const w = WEAPONS[i];
    const isNade = !!w.grenade;
    const full = isNade ? (ammo[i] >= w.mag) : owned[i];
    const can = myMoney >= w.price && !full;
    const have = owned[i] && (!isNade || ammo[i] > 0);
    const cls = 'buycard' + (have ? ' have' : '') + (!can && !have ? ' disabled' : '');
    let st = '';
    if (have && !isNade) st = 'Equipada ✓';
    else if (isNade && ammo[i] > 0) st = '×' + ammo[i];
    else if (!can) st = 'Sin dinero';
    else st = 'Comprar';
    h += '<div class="' + cls + '" data-w="' + i + '">'
      + '<canvas width="200" height="90" data-wi="' + i + '"></canvas>'
      + '<div class="bn">' + w.name + '</div>'
      + '<div class="bp">$' + w.price + '</div>'
      + '<div class="bst">' + st + '</div></div>';
  }
  h += '</div>';
  el.innerHTML = h;
  // dibujar modelos
  el.querySelectorAll('canvas[data-wi]').forEach(cv => {
    drawWeaponPreview(cv, +cv.dataset.wi);
  });
  $('btnBuyClose')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeBuy(true);
  });
  el.querySelectorAll('.buycard').forEach(card => {
    card.addEventListener('click', () => {
      if (card.classList.contains('disabled') || card.classList.contains('have')) return;
      // Protección
      if (card.dataset.armor) {
        netSend({ t: 'buy', item: card.dataset.armor });
        return;
      }
      const wi = +card.dataset.w;
      const w = WEAPONS[wi];
      if (!w) return;
      if (owned[wi] && !w.grenade) { selectWeapon(wi); closeBuy(true); return; }
      if (w.grenade && ammo[wi] >= w.mag) { selectWeapon(wi); closeBuy(true); return; }
      netSend({ t: 'buy', w: wi });
    });
  });
}


/* =====================================================
   Tutorial interactivo (primera vez / botón del menú)
   ===================================================== */
const TUTORIAL_STEPS = [
  {
    title: '¡Bienvenido a Blocky Strike!',
    body: 'Es un shooter en equipos inspirado en el estilo de Counter-Strike.<br><br><b>Alpha (azul)</b> defiende · <b>Bravo (rojo)</b> ataca y planta la bomba.<br><br>En 1 minuto sabrás jugar.',
  },
  {
    title: 'Moverte y mirar',
    body: '<b>W A S D</b> para moverte<br><b>Mouse</b> para mirar<br><b>Espacio</b> para saltar<br><b>Shift</b> para caminar (más preciso y silencioso)<br><b>V</b> para verte en tercera persona<br><br>Quédate quieto o camina al disparar: si corres, fallas más.',
  },
  {
    title: 'Disparar y armas',
    body: '<b>Clic izquierdo</b> dispara<br><b>R</b> recarga<br><b>1</b> cuchillo · <b>2</b> pistola · <b>3</b> SMG · <b>4</b> rifle · <b>5</b> escopeta · <b>6</b> sniper<br><b>Clic derecho</b> zoom del francotirador<br><br>El rifle y el SMG tienen retroceso: suelta el gatillo para recuperar precisión.',
  },
  {
    title: 'Equipos y rondas',
    body: 'Cada ronda empieza con <b>freeze</b> (unos segundos sin moverte).<br><br>Si mueres, <b>no reapareces</b> hasta la siguiente ronda.<br>Gana el equipo que elimina al otro o cumple el objetivo de la bomba.<br><br>Partida a 12 rondas. Marcador con <b>Tab</b>.',
  },
  {
    title: 'Economía y compra',
    body: 'Empiezas con <b>$800</b>. Ganas dinero por kills y por ganar/perder rondas.<br><br>Durante el freeze o el descanso pulsa <b>B</b> para abrir la tienda.<br><br>Compra <b>chaleco</b> ($650) y <b>casco</b> ($350) para protegerte, o el pack completo ($1000).<br>La pistola y el cuchillo son gratis.',
  },
  {
    title: 'La bomba (Defuse)',
    body: '<b>Bravo</b> recibe la bomba. Llévala a un sitio <b>A</b> o <b>B</b> (anillos naranjas) y mantén <b>E</b> para plantar.<br><br><b>Alpha</b> debe encontrar la bomba y mantener <b>E</b> para desactivarla antes de que explote (40 s).<br><br>Si el portador muere, la bomba cae y otro atacante puede recogerla.',
  },
  {
    title: 'Listo para jugar',
    body: 'Practica primero con <b>Jugar contra bots</b>.<br>Cuando quieras, <b>Crear sala</b> y comparte el código de 4 letras con tus amigos.<br><br>Controles rápidos: <b>B</b> tienda · <b>E</b> bomba · <b>Tab</b> marcador · <b>Enter</b> chat · <b>V</b> verte · <b>Esc</b> pausa.<br><br>¡Buena suerte, soldado!',
  },
];

let tutStep = 0;
let tutForced = false;

function hasSeenTutorial() {
  try { return localStorage.getItem('bs_tut_v2') === '1'; } catch { return false; }
}
function markTutorialSeen() {
  try { localStorage.setItem('bs_tut_v2', '1'); } catch {}
}

function openTutorial(fromMenu) {
  tutStep = 0;
  tutForced = !fromMenu;
  const el = $('tutorial');
  if (!el) return;
  el.style.display = 'flex';
  renderTutorialStep();
}

function closeTutorial(mark) {
  const el = $('tutorial');
  if (el) el.style.display = 'none';
  if (mark) markTutorialSeen();
}

function renderTutorialStep() {
  const s = TUTORIAL_STEPS[tutStep];
  if (!s) { closeTutorial(true); return; }
  $('tstepnum').textContent = 'Paso ' + (tutStep + 1) + ' de ' + TUTORIAL_STEPS.length;
  $('ttitle').textContent = s.title;
  $('tbody').innerHTML = s.body;
  const prog = $('tprogress');
  prog.innerHTML = TUTORIAL_STEPS.map((_, i) => '<i class="' + (i <= tutStep ? 'on' : '') + '"></i>').join('');
  $('tNext').textContent = tutStep >= TUTORIAL_STEPS.length - 1 ? '¡A jugar!' : 'Siguiente';
  $('tSkip').style.display = tutStep >= TUTORIAL_STEPS.length - 1 ? 'none' : 'inline-block';
}

function tutorialNext() {
  if (tutStep >= TUTORIAL_STEPS.length - 1) {
    closeTutorial(true);
    return;
  }
  tutStep++;
  renderTutorialStep();
}

// Auto-abrir la primera vez
try {
  if (!hasSeenTutorial()) {
    // pequeño delay para que cargue el DOM
    setTimeout(() => openTutorial(false), 400);
  }
} catch {}


/* =====================================================
   Menú, pausa y entrada
   ===================================================== */
function resetKeys() {
  for (const k in keys) keys[k] = false;
  mouseDown = false; trigger = false;
  if (mobile) { mobile.lx = mobile.ly = mobile.rx = mobile.ry = 0; mobile.fire = false; }
}

/* ---------- Controles móviles ---------- */
const isMobile = (() => {
  try {
    return /Android|iPhone|iPad|iPod|Mobile|Touch/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches)
      || window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
  } catch (e) { return false; }
})();
const mobile = { lx: 0, ly: 0, rx: 0, ry: 0, fire: false, lookId: null, moveId: null };

function setMobileUI(on) {
  const el = $('mobileUI');
  if (!el) return;
  el.classList.toggle('on', !!on && isMobile);
}

function lockGame() {
  // Siempre ocultar menú y activar juego (aunque falle el pointer lock)
  try { overlay.style.display = 'none'; } catch (e) {}
  locked = true;
  try { initAudio(); } catch (e) {}
  if (isMobile) {
    setMobileUI(true);
    return;
  }
  setMobileUI(false);
  try {
    const req = canvas.requestPointerLock && canvas.requestPointerLock();
    if (req && typeof req.catch === 'function') req.catch(() => {});
  } catch (e) {}
}

function unlockGame() {
  locked = false;
  resetKeys();
  if (isMobile) {
    setMobileUI(false);
    if (!buyOpen && mode !== 'menu') showOverlay();
    return;
  }
  try {
    if (document.pointerLockElement) document.exitPointerLock();
  } catch (e) {}
  if (!buyOpen && mode !== 'menu') showOverlay();
}

function bindStick(el, side) {
  if (!el) return;
  const knob = el.querySelector('.knob');
  const maxR = 42;
  const setKnob = (dx, dy) => {
    if (knob) { knob.style.transform = `translate(${dx}px,${dy}px)`; }
  };
  const onStart = (e) => {
    e.preventDefault();
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const id = t.identifier ?? 'm';
    if (side === 'L') mobile.moveId = id; else mobile.lookId = id;
    onMove(e);
  };
  const onMove = (e) => {
    const touches = e.touches || [e];
    for (const t of touches) {
      const id = t.identifier ?? 'm';
      if (side === 'L' && id !== mobile.moveId) continue;
      if (side === 'R' && id !== mobile.lookId) continue;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
      setKnob(dx, dy);
      const nx = dx / maxR, ny = dy / maxR;
      if (side === 'L') {
        mobile.lx = nx;
        mobile.ly = -ny; // adelante = arriba
      } else {
        // look: aplicar en el frame
        mobile.rx = nx;
        mobile.ry = ny;
      }
    }
  };
  const onEnd = (e) => {
    const touches = e.changedTouches || [e];
    for (const t of touches) {
      const id = t.identifier ?? 'm';
      if (side === 'L' && id === mobile.moveId) {
        mobile.moveId = null; mobile.lx = 0; mobile.ly = 0; setKnob(0, 0);
      }
      if (side === 'R' && id === mobile.lookId) {
        mobile.lookId = null; mobile.rx = 0; mobile.ry = 0; setKnob(0, 0);
      }
    }
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd, { passive: false });
  el.addEventListener('touchcancel', onEnd, { passive: false });
}

function initMobileControls() {
  if (!isMobile) return;
  setMobileUI(false);
  bindStick($('joyL'), 'L');
  bindStick($('joyR'), 'R');
  // look también arrastrando por toda la mitad derecha (fuera del stick)
  const lookZone = document.createElement('div');
  lookZone.style.cssText = 'position:fixed;left:50%;top:0;right:0;bottom:140px;z-index:8;pointer-events:auto;touch-action:none';
  lookZone.id = 'lookZone';
  document.body.appendChild(lookZone);
  let lookLast = null;
  lookZone.addEventListener('touchstart', e => {
    if (!locked || buyOpen) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    lookLast = { id: t.identifier, x: t.clientX, y: t.clientY };
  }, { passive: false });
  lookZone.addEventListener('touchmove', e => {
    if (!locked || !lookLast) return;
    e.preventDefault();
    for (const t of e.touches) {
      if (t.identifier !== lookLast.id) continue;
      const dx = t.clientX - lookLast.x, dy = t.clientY - lookLast.y;
      lookLast.x = t.clientX; lookLast.y = t.clientY;
      const sens = 0.0045 * sensMult;
      if (player.dead && mode === 'mp') {
        specYaw -= dx * sens; specPitch -= dy * sens;
        specPitch = Math.max(-0.8, Math.min(1.2, specPitch));
      } else if (!player.dead) {
        player.yaw -= dx * sens;
        player.pitch -= dy * sens;
        player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
      }
    }
  }, { passive: false });
  lookZone.addEventListener('touchend', e => {
    for (const t of e.changedTouches) if (lookLast && t.identifier === lookLast.id) lookLast = null;
  }, { passive: false });

  const hold = (btn, down, up) => {
    if (!btn) return;
    const d = (e) => { e.preventDefault(); e.stopPropagation(); down(); };
    const u = (e) => { e.preventDefault(); e.stopPropagation(); up(); };
    btn.addEventListener('touchstart', d, { passive: false });
    btn.addEventListener('touchend', u, { passive: false });
    btn.addEventListener('touchcancel', u, { passive: false });
  };
  hold($('mFire'), () => { mouseDown = true; trigger = true; mobile.fire = true; }, () => { mouseDown = false; mobile.fire = false; });
  hold($('mJump'), () => { keys.Space = true; }, () => { keys.Space = false; });
  hold($('mReload'), () => { reload(); }, () => {});
  hold($('mUse'), () => { bombHold = true; keys.KeyE = true; }, () => { bombHold = false; keys.KeyE = false; if (mode === 'mp') netSend({ t: 'bombact', act: 'stop' }); });
  hold($('mBuy'), () => { toggleBuy(); }, () => {});
  hold($('mView'), () => {
    if ((offlineMode() || (mode === 'mp' && mpReady)) && !player.dead) {
      thirdP = !thirdP; say(thirdP ? '3ª persona' : '1ª persona', 1.2);
    }
  }, () => {});
  hold($('mWpn'), () => {
    // ciclar armas poseídas
    for (let n = 1; n <= 9; n++) {
      const i = (cur + n) % WEAPONS.length;
      if (i <= 1 || owned[i]) { selectWeapon(i); break; }
    }
  }, () => {});
  hold($('mPause'), () => { unlockGame(); }, () => {});

  // evitar scroll / gestos del navegador
  document.addEventListener('touchmove', e => {
    if (locked && e.target && !e.target.closest?.('#overlay, #buymenu, #invBrowser, #mapBrowser, #tutorial, input, select, textarea')) {
      e.preventDefault();
    }
  }, { passive: false });
}

function showOverlay() {
  overlay.style.display = 'flex';
  setMobileUI(false);
  const menu = mode === 'menu';
  $('menu').style.display = menu ? 'block' : 'none';
  $('pause').style.display = menu ? 'none' : 'block';
  $('pausemsg').textContent = netError || AGI.endMsg || (isMobile ? 'Pausa — pulsa Continuar' : 'Juego en pausa');
  $('btnResume').style.display = netError ? 'none' : 'inline-block';
  $('roominfo').style.display = (mode === 'mp' && roomCode && !netError) ? 'block' : 'none';
  if (!menu) renderMuteList();
  $('roomcode').textContent = roomCode;
  // sincronizar controles de opciones
  const sr = $('sensrange'), sv = $('sensval'), vr = $('volrange'), vv = $('volval');
  if (sr) { sr.value = Math.round(sensMult * 100); if (sv) sv.textContent = sr.value + '%'; }
  if (vr) { vr.value = Math.round(masterVol * 100); if (vv) vv.textContent = vr.value + '%'; }
  if ($('gfxsel')) $('gfxsel').value = String(gfxQuality);
}

function startSoloNow() {
  try {
    // limpiar bots de una partida anterior
    for (const b of bots) {
      scene.remove(b.g);
      rayTargets = rayTargets.filter(o => o.userData.bot !== b);
    }
    bots.length = 0;
    loadMap($('mapsel').value);
    resetKeys();
    initAudio();
    mode = 'solo';
    // myTeam ya elegido
    if (myTeam !== 0 && myTeam !== 1) myTeam = 0;
    updateRoomInfo();
    placePlayer();
    for (let i = 0; i < CFG.bots; i++) spawnBot(makeBot(i, 1));
    for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
    reviveLocal();
    for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
    spawnMedkits();
    showGun();
    updateHud();
    lockGame();
  } catch (err) {
    console.error('startSolo', err);
    say('Error al iniciar: ' + (err && err.message ? err.message : err), 4);
  }
}

function startPracticeNow() {
  loadMap($('mapsel').value);
  resetKeys();
  initAudio();
  mode = 'practice';
  // myTeam ya elegido en team select (si no, Bravo)
  if (myTeam !== 0 && myTeam !== 1) myTeam = MATCH.attackerTeam;
  updateRoomInfo();
  // spawns del equipo atacante
  if (MAP.teamSpawns && MAP.teamSpawns[myTeam]) {
    const s = MAP.teamSpawns[myTeam][0];
    player.pos.set(s[0], 0, s[1]);
    player.yaw = s[1] > 0 ? Math.PI : 0;
  } else {
    placePlayer();
  }
  spawnMedkits();
  // limpiar bots viejos
  for (const b of bots) {
    scene.remove(b.g);
    rayTargets = rayTargets.filter(o => o.userData.bot !== b);
  }
  bots.length = 0;
  // 3 defensores (Alpha) + 2 compañeros (Bravo)
  for (let i = 0; i < 3; i++) spawnBot(makeBot(i, MATCH.defenderTeam));
  for (let i = 0; i < 2; i++) spawnBot(makeBot(3 + i, MATCH.attackerTeam));
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  reviveLocal();
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  bombState = {
    state: 'carried', carrier: 'local', plantProg: 0, defuseProg: 0,
    x: 0, z: 0, site: null, explodesAt: 0
  };
  practiceResetT = 0;
  showGun();
  updateHud();
  updateBombVisual();
  say('Práctica: eres Bravo. Planta en A/B (E). Los azules defienden.', 4);
  lockGame();
}

try { $('name').value = localStorage.getItem('bs_name') || ''; } catch (e) { /* sin almacenamiento */ }
$('btnSolo').addEventListener('click', () => openTeamSelect({ type: 'solo' }));
$('btnPractice')?.addEventListener('click', () => openTeamSelect({ type: 'practice' }));
$('btnTeam0')?.addEventListener('click', () => confirmTeam(0));
$('btnTeam1')?.addEventListener('click', () => confirmTeam(1));
$('btnTeamAuto')?.addEventListener('click', () => confirmTeam(-1));
$('btnTeamCancel')?.addEventListener('click', () => { closeTeamSelect(); pendingStart = null; });

$('btnTutorial')?.addEventListener('click', () => openTutorial(true));
$('btnTutPause')?.addEventListener('click', () => { openTutorial(true); });
$('tNext')?.addEventListener('click', tutorialNext);
$('tSkip')?.addEventListener('click', () => closeTutorial(true));
$('mapsel').addEventListener('change', () => loadMap($('mapsel').value));

/* ---------- Selector de mapas con plano real ---------- */
const MAP_DESC = {
  dust: 'Arena abierta con contenedores, cajas y plataformas.',
  almacen: 'Pasillos industriales, estantes y pasarela elevada.',
  cruce: 'Cuatro edificios en las esquinas y fuente central.',
  agi: 'Complejo de concreto con suelo de baldosas. Mapa de Operación AGI: 3 nodos y el Núcleo.',
};
let pendingMapKey = 'dust';

function drawMapPreview(canvas, key) {
  const map = MAPS[key];
  if (!map || !canvas) return;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const ground = map.ground || 0x888888;
  const sky = map.sky || 0x88aacc;
  ctx.fillStyle = '#' + new THREE.Color(sky).getHexString();
  ctx.fillRect(0, 0, W, H * 0.22);
  ctx.fillStyle = '#' + new THREE.Color(ground).getHexString();
  ctx.fillRect(0, H * 0.22, W, H);
  const scale = Math.min(W, H) / 68;
  const ox = W / 2, oy = H / 2 + H * 0.06;
  const boxes = map.boxes || [];
  const sorted = boxes.slice().sort((a, b) => (a[1] + (a[6] || 0)) - (b[1] + (b[6] || 0)));
  for (const box of sorted) {
    const [cx, cz, w, d, h, color, y0 = 0] = box;
    const x = ox + (cx - w / 2) * scale;
    const y = oy + (cz - d / 2) * scale;
    const bw = Math.max(1, w * scale);
    const bd = Math.max(1, d * scale);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 1.5, y + 1.5, bw, bd);
    const col = new THREE.Color(color);
    if (h > 3) col.offsetHSL(0, 0, 0.06);
    else if (y0 > 0) col.offsetHSL(0, 0, 0.04);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(x, y, bw, bd);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x, y, bw, bd);
  }
  if (map.sites) {
    for (const [name, arr] of Object.entries(map.sites)) {
      const [sx, sz] = arr;
      const x = ox + sx * scale, y = oy + sz * scale;
      ctx.fillStyle = name === 'A' ? '#3b82f6' : '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x, y);
    }
  }
}

function buildMapBrowser() {
  const grid = $('mapGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const key of Object.keys(MAPS)) {
    const map = MAPS[key];
    const card = document.createElement('div');
    card.className = 'mcard' + (key === pendingMapKey ? ' on' : '');
    card.dataset.map = key;
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 300;
    drawMapPreview(cv, key);
    const lab = document.createElement('div');
    lab.className = 'lab';
    lab.textContent = map.name;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = MAP_DESC[key] || '';
    card.appendChild(cv);
    card.appendChild(lab);
    card.appendChild(desc);
    card.addEventListener('click', () => {
      pendingMapKey = key;
      grid.querySelectorAll('.mcard').forEach(c => c.classList.toggle('on', c === card));
      $('mapsel').value = key;
      loadMap(key);
    });
    grid.appendChild(card);
  }
}

function openMapBrowser() {
  pendingMapKey = $('mapsel')?.value || 'dust';
  buildMapBrowser();
  const el = $('mapBrowser');
  if (el) el.classList.add('open');
  loadMap(pendingMapKey);
}

function closeMapBrowser(apply) {
  const el = $('mapBrowser');
  if (el) el.classList.remove('open');
  if (apply) {
    $('mapsel').value = pendingMapKey;
    loadMap(pendingMapKey);
    const lab = $('mapLabel');
    if (lab) lab.textContent = MAPS[pendingMapKey]?.name || pendingMapKey;
  } else {
    // restaurar el mapa que estaba elegido antes
    const cur = $('mapsel')?.value || 'dust';
    loadMap(cur);
  }
}

$('btnMaps')?.addEventListener('click', openMapBrowser);
$('btnMapOk')?.addEventListener('click', () => closeMapBrowser(true));
$('btnMapBack')?.addEventListener('click', () => closeMapBrowser(false));
if ($('mapLabel')) $('mapLabel').textContent = MAPS[$('mapsel')?.value || 'dust']?.name || 'Dust Blocks';

/* ---------- Inventario (cara / pelo / ropa / pantalones / piel) ---------- */
const INV_CATS = {
  face: [
    { id: 0, name: 'Lentes', color: '#66ccff' },
    { id: 1, name: 'Enojado', color: '#c45a3a' },
    { id: 2, name: 'Agresivo', color: '#d01818' },
    { id: 3, name: 'Sonriente', color: '#f0c060' },
  ],
  hair: [
    { id: 0, name: 'Calvo', color: '#e0ac69' },
    { id: 1, name: 'Corto', color: '#1a1a1a' },
    { id: 2, name: 'Medio', color: '#3b2a1a' },
    { id: 3, name: 'Largo', color: '#6b4423' },
    { id: 4, name: 'Mohawk', color: '#1a1a1a' },
    { id: 5, name: 'Rizado', color: '#3b2a1a' },
  ],
  shirt: [
    { id: 0, name: 'Soldado', color: '#3b82f6' },
    { id: 1, name: 'Instituto', color: '#1d4ea0' },
    { id: 2, name: 'Negro', color: '#1a1a1e' },
    { id: 3, name: 'Rojo', color: '#8b1a1a' },
    { id: 4, name: 'Brasil 🇧🇷', color: '#ffe066' },
    { id: 5, name: 'Argentina 🇦🇷', color: '#6ec8f0' },
    { id: 6, name: 'Francia 🇫🇷', color: '#1e3a8a' },
    { id: 7, name: 'España 🇪🇸', color: '#c0392b' },
    { id: 8, name: 'Alemania 🇩🇪', color: '#f5f5f5' },
    { id: 9, name: 'Inglaterra 🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#ffffff' },
    { id: 10, name: 'Portugal 🇵🇹', color: '#b01030' },
    { id: 11, name: 'Países Bajos 🇳🇱', color: '#ff6b1a' },
    { id: 12, name: 'México 🇲🇽', color: '#1b7a3d' },
    { id: 13, name: 'Perú 🇵🇪', color: '#ffffff' },
  ],
  pants: [
    { id: 0, name: 'Militar', color: '#2f3444' },
    { id: 1, name: 'Azul', color: '#1e3a6e' },
    { id: 2, name: 'Camo', color: '#3a4a30' },
    { id: 3, name: 'Negro', color: '#1a1a1e' },
    { id: 4, name: 'Gris sport', color: '#3d3d45' },
    { id: 5, name: 'Teal sport', color: '#1aa6a0' },
    { id: 6, name: 'Azul sport', color: '#2e6db0' },
    { id: 7, name: 'Rojo sport', color: '#c0392b' },
    { id: 8, name: 'Verde sport', color: '#2d6a3e' },
    { id: 9, name: 'Morado sport', color: '#6b3fa0' },
  ],
  tone: [
    { id: 0, name: 'Claro', color: '#f0c9a0' },
    { id: 1, name: 'Medio-claro', color: '#e0ac69' },
    { id: 2, name: 'Medio', color: '#c68642' },
    { id: 3, name: 'Oscuro', color: '#8d5524' },
    { id: 4, name: 'Muy oscuro', color: '#5c3317' },
  ],
};
let invTab = 'face';
let invDraft = { face: cosFace, shirt: cosShirt, pants: cosPants, tone: cosTone, hair: cosHair };

function hexCss(n) {
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}
function drawInvPreview() {
  const cv = $('invCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  // fondo con gradiente
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#151a24'); bg.addColorStop(1, '#0a0c10');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const kit = WORLD_KITS[invDraft.shirt | 0] || null;
  const skin = INV_CATS.tone[invDraft.tone]?.color || '#e0ac69';
  const shirt = kit ? hexCss(kit.shirt) : (INV_CATS.shirt[invDraft.shirt]?.color || '#3b82f6');
  const accent = kit ? hexCss(kit.accent) : '#ffffff';
  const numCol = kit ? hexCss(kit.num) : '#ffffff';
  const pants = kit ? hexCss(kit.shorts) : (INV_CATS.pants[invDraft.pants]?.color || '#2f3444');
  const sock = kit ? hexCss(kit.sock || 0xffffff) : '#1c1c20';
  const boot = kit ? '#e8e8ec' : '#1c1c20';
  const hair = invDraft.hair | 0;
  const face = invDraft.face | 0;
  const cx = W / 2;

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, H - 12, 40, 8, 0, 0, Math.PI * 2); ctx.fill();

  if (kit) {
    // botas
    ctx.fillStyle = boot;
    ctx.fillRect(cx - 30, H - 26, 24, 12); ctx.fillRect(cx + 6, H - 26, 24, 12);
    // medias
    ctx.fillStyle = sock;
    ctx.fillRect(cx - 26, H - 70, 18, 46); ctx.fillRect(cx + 8, H - 70, 18, 46);
    // shorts (cortos)
    ctx.fillStyle = pants;
    ctx.fillRect(cx - 30, H - 108, 26, 42); ctx.fillRect(cx + 4, H - 108, 26, 42);
    // franja short
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 30, H - 108, 5, 42); ctx.fillRect(cx + 25, H - 108, 5, 42);
  } else {
    ctx.fillStyle = boot;
    ctx.fillRect(cx - 28, H - 28, 22, 14); ctx.fillRect(cx + 6, H - 28, 22, 14);
    ctx.fillStyle = pants;
    ctx.fillRect(cx - 26, H - 100, 22, 74); ctx.fillRect(cx + 4, H - 100, 22, 74);
  }

  // torso
  const torsoY = kit ? H - 175 : H - 165;
  const torsoH = kit ? 72 : 68;
  ctx.fillStyle = shirt;
  ctx.fillRect(cx - 34, torsoY, 68, torsoH);
  // brazos
  ctx.fillRect(cx - 50, torsoY + 6, 16, 52); ctx.fillRect(cx + 34, torsoY + 6, 16, 52);
  // franjas del kit
  if (kit) {
    if (kit.stripe === 'h') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 34, torsoY + 18, 68, 10);
      ctx.fillRect(cx - 34, torsoY + 42, 68, 8);
    } else if (kit.stripe === 'v') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 18, torsoY + 4, 10, torsoH - 8);
      ctx.fillRect(cx + 8, torsoY + 4, 10, torsoH - 8);
    } else if (kit.stripe === 'diag') {
      ctx.save();
      ctx.translate(cx, torsoY + torsoH / 2);
      ctx.rotate(0.5);
      ctx.fillStyle = accent;
      ctx.fillRect(-8, -torsoH / 2 + 4, 14, torsoH - 8);
      ctx.restore();
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 34, torsoY + torsoH - 12, 68, 10);
    }
    // escudo
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 28, torsoY + 12, 14, 16);
    ctx.fillStyle = numCol;
    ctx.fillRect(cx - 25, torsoY + 15, 8, 10);
    // número 10 grande en pecho
    ctx.fillStyle = numCol;
    ctx.font = 'bold 28px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('10', cx + 8, torsoY + 52);
    // banda cintura
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 34, torsoY + torsoH - 4, 68, 6);
  }

  // cuello + cabeza
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 10, torsoY - 12, 20, 14);
  ctx.fillRect(cx - 22, torsoY - 56, 44, 46);

  // pelo
  const hairCol = hair === 0 ? null : (invDraft.tone <= 1 ? '#6b4423' : invDraft.tone <= 2 ? '#3b2a1a' : '#1a1a1a');
  if (hairCol) {
    ctx.fillStyle = hairCol;
    if (hair === 1) { ctx.fillRect(cx - 24, torsoY - 62, 48, 12); ctx.fillRect(cx - 24, torsoY - 50, 48, 8); }
    else if (hair === 2) { ctx.fillRect(cx - 26, torsoY - 64, 52, 16); ctx.fillRect(cx - 28, torsoY - 48, 12, 20); ctx.fillRect(cx + 16, torsoY - 48, 12, 20); }
    else if (hair === 3) { ctx.fillRect(cx - 26, torsoY - 66, 52, 18); ctx.fillRect(cx - 30, torsoY - 48, 14, 28); ctx.fillRect(cx + 16, torsoY - 48, 14, 28); }
    else if (hair === 4) { ctx.fillRect(cx - 8, torsoY - 78, 16, 28); } // mohawk
    else if (hair === 5) { ctx.fillRect(cx - 28, torsoY - 68, 56, 22); ctx.fillRect(cx - 30, torsoY - 58, 14, 14); ctx.fillRect(cx + 16, torsoY - 58, 14, 14); }
  }

  // cara
  if (face === 0) {
    ctx.fillStyle = '#15151a'; ctx.fillRect(cx - 18, torsoY - 36, 36, 8);
    ctx.fillStyle = '#66ccff'; ctx.fillRect(cx - 14, torsoY - 34, 10, 6); ctx.fillRect(cx + 4, torsoY - 34, 10, 6);
  } else {
    ctx.fillStyle = face === 2 ? '#ffffff' : '#fafafa';
    ctx.fillRect(cx - 14, torsoY - 38, 10, 8); ctx.fillRect(cx + 4, torsoY - 38, 10, 8);
    ctx.fillStyle = face === 2 ? '#d01818' : '#111';
    ctx.fillRect(cx - 11, torsoY - 36, 4, 5); ctx.fillRect(cx + 7, torsoY - 36, 4, 5);
    if (face === 3) { ctx.fillStyle = '#5a1d1d'; ctx.fillRect(cx - 10, torsoY - 20, 20, 4); }
    else if (face === 1) { ctx.fillStyle = '#5a1d1d'; ctx.fillRect(cx - 8, torsoY - 18, 16, 4); }
    else { ctx.fillStyle = '#f4f0e6'; ctx.fillRect(cx - 12, torsoY - 22, 24, 8); }
  }

  // nombre kit
  const pn = $('invPname');
  if (pn) {
    const parts = [
      INV_CATS.hair[invDraft.hair]?.name,
      INV_CATS.face[invDraft.face]?.name,
      kit ? (kit.name + ' #10') : INV_CATS.shirt[invDraft.shirt]?.name,
      kit ? 'Shorts' : INV_CATS.pants[invDraft.pants]?.name,
    ].filter(Boolean);
    pn.textContent = parts.join(' · ');
  }
}

function renderInvGrid() {
  const grid = $('invGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const list = INV_CATS[invTab] || [];
  const cur = invDraft[invTab];
  for (const it of list) {
    const el = document.createElement('div');
    el.className = 'item' + (it.id === cur ? ' on' : '');
    el.innerHTML = '<div class="swatch" style="background:' + it.color + '"></div><div>' + it.name + '</div>';
    el.addEventListener('click', () => {
      invDraft[invTab] = it.id;
      renderInvGrid();
      drawInvPreview();
    });
    grid.appendChild(el);
  }
}

function openInventory() {
  invDraft = { face: cosFace, shirt: cosShirt, pants: cosPants, tone: cosTone, hair: cosHair };
  invTab = 'face';
  document.querySelectorAll('#invTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === invTab));
  renderInvGrid();
  drawInvPreview();
  $('invBrowser')?.classList.add('open');
}

function closeInventory(apply) {
  $('invBrowser')?.classList.remove('open');
  if (apply) {
    cosFace = invDraft.face;
    cosShirt = invDraft.shirt;
    cosPants = invDraft.pants;
    cosTone = invDraft.tone;
    cosHair = invDraft.hair ?? 1;
    saveCos('bs_face', cosFace);
    saveCos('bs_skin', cosShirt);
    saveCos('bs_pants', cosPants);
    saveCos('bs_tone', cosTone);
    saveCos('bs_hair', cosHair);
    syncCosSelects();
    // forzar reconstrucción del personaje en 3ª persona
    selfSkin = -1;
  }
}

$('btnInv')?.addEventListener('click', openInventory);
$('btnInvOk')?.addEventListener('click', () => closeInventory(true));
$('btnInvBack')?.addEventListener('click', () => closeInventory(false));
document.querySelectorAll('#invTabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    invTab = btn.dataset.tab;
    document.querySelectorAll('#invTabs button').forEach(b => b.classList.toggle('on', b === btn));
    renderInvGrid();
  });
});

const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
$('btnCreate').addEventListener('click', () => startMulti(true));
$('btnJoin').addEventListener('click', () => startMulti(false));
$('code').addEventListener('input', () => { $('code').value = cleanCode($('code').value); });
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') startMulti(false); });
// enlace para amigos: https://.../?sala=ABCD deja el código escrito en el menú
try { const q = new URLSearchParams(location.search).get('sala'); if (q) $('code').value = cleanCode(q); } catch (e) { /* sin parámetros */ }
$('btnCopy').addEventListener('click', async () => {
  const link = location.origin + '/?sala=' + roomCode;
  try { await navigator.clipboard.writeText(link); $('btnCopy').textContent = '¡Enlace copiado!'; }
  catch (e) { $('btnCopy').textContent = link; }
  setTimeout(() => { $('btnCopy').textContent = 'Copiar enlace para amigos'; }, 3000);
});
$('btnResume').addEventListener('click', () => lockGame());
$('btnExit').addEventListener('click', () => location.reload());
$('btnOpts')?.addEventListener('click', () => {
  const o = $('opts');
  if (!o) return;
  o.style.display = o.style.display === 'block' ? 'none' : 'block';
});
$('sensrange')?.addEventListener('input', () => {
  const v = parseInt($('sensrange').value, 10);
  sensMult = Math.max(0.2, Math.min(2, v / 100));
  if ($('sensval')) $('sensval').textContent = Math.round(sensMult * 100) + '%';
  try { localStorage.setItem('bs_sens', String(Math.round(sensMult * 100))); } catch (e) {}
});
$('volrange')?.addEventListener('input', () => {
  const v = parseInt($('volrange').value, 10);
  masterVol = Math.max(0, Math.min(1, v / 100));
  if ($('volval')) $('volval').textContent = Math.round(masterVol * 100) + '%';
  try { localStorage.setItem('bs_vol', String(Math.round(masterVol * 100))); } catch (e) {}
});
$('gfxsel')?.addEventListener('change', () => {
  const q = parseInt($('gfxsel').value, 10);
  if (q === 0 || q === 1 || q === 2) applyGfxQuality(q);
});

addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;   // escribiendo en el menú o en el chat
  // tienda abierta: se puede cerrar aunque no haya pointer lock
  if (buyOpen) {
    if (e.code === 'KeyB' || e.code === 'Escape') {
      e.preventDefault();
      closeBuy(true);
    }
    return;
  }
  if (e.code === 'Tab' && mode !== 'menu') { e.preventDefault(); if (locked) showBoard(true); return; }
  keys[e.code] = true;
  if (e.code === 'Space' || e.key === ' ') {
    keys.Space = true;
    e.preventDefault();
  }
  if (!locked) return;
  // espectador: Espacio o flechas para cambiar de jugador
  if (player.dead && mode === 'mp') {
    if (e.code === 'Space' || e.code === 'KeyQ' || e.code === 'ArrowRight') { e.preventDefault(); nextSpectator(1); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyE') { e.preventDefault(); nextSpectator(-1); return; }
    return;
  }
  if (e.code === 'Enter' && mode === 'mp' && mpReady) { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyB') toggleBuy();
  if (e.code === 'KeyV' && (offlineMode() || (mode === 'mp' && mpReady)) && !player.dead) { thirdP = !thirdP; say(thirdP ? 'Tercera persona (V para volver)' : 'Primera persona', 1.2); }
  if (e.code === 'KeyE') bombHold = true;
  if (e.code === 'Digit1') selectWeapon(0); // cuchillo
  if (e.code === 'Digit2') selectWeapon(1); // pistola
  if (e.code === 'Digit3') selectWeapon(2); // smg
  if (e.code === 'Digit4') selectWeapon(3); // rifle
  if (e.code === 'Digit5') selectWeapon(4); // escopeta
  if (e.code === 'Digit6') selectWeapon(5); // sniper
  if (e.code === 'Digit7') selectWeapon(6); // HE
  if (e.code === 'Digit8') selectWeapon(7); // flash
  if (e.code === 'Digit9') selectWeapon(8); // smoke
  if (e.code === 'KeyG') { // ciclar granadas
    const order = [6, 7, 8];
    const has = order.filter(i => owned[i] && ammo[i] > 0);
    if (has.length) {
      const idx = has.indexOf(cur);
      selectWeapon(has[(idx + 1) % has.length]);
    } else say('Sin granadas — cómpralas con B', 1.5);
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space' || e.key === ' ') keys.Space = false;
  if (e.code === 'Tab') showBoard(false);
  if (e.code === 'KeyE') { bombHold = false; if (mode === 'mp') netSend({ t: 'bombact', act: 'stop' }); }
});

document.addEventListener('pointerlockchange', () => {
  if (isMobile) return;
  const hasLock = document.pointerLockElement === canvas;
  if (hasLock) {
    locked = true;
    overlay.style.display = 'none';
  } else {
    // Esc / pérdida de foco: pausa solo si ya estabas en partida
    closeChat();
    showBoard(false);
    resetKeys();
    if (mode !== 'menu' && !buyOpen) {
      locked = false;
      showOverlay();
    }
  }
});

// Clic en el canvas para recuperar el ratón si no hay pointer lock
canvas.addEventListener('click', () => {
  if (isMobile) return;
  if (mode === 'menu' || buyOpen) return;
  if (document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock(); } catch (e) {}
  }
});
document.addEventListener('mousemove', e => {
  if (!locked || isMobile) return;
  const base = 0.0022 * sensMult;
  if (player.dead && mode === 'mp') {
    // en espectador el ratón gira la cámara libre
    const sens = base * 1.1;
    specYaw -= e.movementX * sens;
    specPitch -= e.movementY * sens;
    specPitch = Math.max(-0.8, Math.min(1.2, specPitch));
    return;
  }
  if (player.dead) return;
  const sens = zoomed ? base / (WEAPONS[cur].zoom || 1) : base;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});
let zoomed = false;
document.addEventListener('contextmenu', e => { if (locked) e.preventDefault(); });
document.addEventListener('mousedown', e => {
  if (locked && player.dead && mode === 'mp' && e.button === 0) { nextSpectator(1); return; }
  if (locked && e.button === 0) { mouseDown = true; trigger = true; }
  if (locked && e.button === 2 && WEAPONS[cur].zoom && !player.dead) zoomed = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) zoomed = false;
});

initMobileControls();

/* ---------- Actualización del jugador ---------- */
function updatePlayer(dt) {
  const p = player.pos;
  if (mode === 'mp' && !mpReady) return;

  if (player.dead) {
    player.respawnT -= dt;
    if (offlineMode()) {
      deathTxt.textContent = player.killer ? ('Te eliminó ' + player.killer) : 'Eliminado';
      updateCountdownDisplay();
      camera.position.y += ((p.y + 0.3) - camera.position.y) * Math.min(1, dt * 3);
      camera.rotation.z += (0.9 - camera.rotation.z) * Math.min(1, dt * 3);
      // un frame de "GO" y luego revive
      if (player.respawnT <= -0.35) respawnPlayer();
    } else {
      updateSpectator(dt);
      if ((player.respawnT * 10 | 0) % 5 === 0) updateDeathTxt();
    }
    return;
  }

  // Freeze time: no te puedes mover
  if (mode === 'mp' && phase.ph === 'freeze') {
    player.vx = player.vz = 0;
    placeCamera(p);
    return;
  }

  // Si por cualquier motivo quedaste dentro de un muro, empujar a posición libre
  if (hits(p.x, p.y, p.z)) {
    const [sx, sy, sz] = findSafePos(p.x, p.z, p.y);
    p.set(sx, sy, sz);
    player.vx = player.vy = player.vz = 0;
    player.onGround = true;
  }

  // teclado + joystick móvil
  let fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  let str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (isMobile && locked) {
    fw += mobile.ly;
    str += mobile.lx;
    if (Math.abs(fw) < 0.15) fw = 0;
    if (Math.abs(str) < 0.15) str = 0;
    // mirar con stick derecho (además de la zona táctil)
    if (mobile.lookId != null && (Math.abs(mobile.rx) > 0.12 || Math.abs(mobile.ry) > 0.12)) {
      const sens = 2.2 * sensMult * Math.min(dt, 0.05);
      player.yaw -= mobile.rx * sens;
      player.pitch -= mobile.ry * sens;
      player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
    }
  }
  const sp = (keys.ShiftLeft || keys.ShiftRight) ? CFG.walkSpeed : CFG.speed;

  let mx = 0, mz = 0;
  if (fw || str) {
    const len = Math.hypot(fw, str);
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    mx = (-sy * fw + cy * str) / len * sp;
    mz = (-cy * fw - sy * str) / len * sp;
  }
  // más snappy en suelo; en el aire control de dirección más vivo (permite correr + saltar con W+Espacio)
  const k = Math.min(1, dt * (player.onGround ? 16 : 11));
  player.vx += (mx - player.vx) * k;
  player.vz += (mz - player.vz) * k;

  slide(player, 'x', player.vx * dt);
  slide(player, 'z', player.vz * dt);

  // Coyote + buffer: W + Espacio a la vez (correr y saltar)
  if (!player._coyote) player._coyote = 0;
  if (!player._jumpBuf) player._jumpBuf = 0;
  if (player.onGround) player._coyote = 0.18;
  else player._coyote = Math.max(0, player._coyote - dt);
  // Space o ' ' (por si el navegador reporta distinto)
  const jumpHeld = !!(keys.Space || keys[' ']);
  if (jumpHeld) player._jumpBuf = 0.2;
  else player._jumpBuf = Math.max(0, player._jumpBuf - dt);

  if (player._jumpBuf > 0 && (player.onGround || player._coyote > 0) && player.vy <= 0.35) {
    player.vy = CFG.jump;
    player.onGround = false;
    player._coyote = 0;
    player._jumpBuf = 0;
    // Al saltar con dirección: velocidad de carrera completa (W+Espacio)
    if (fw || str) {
      player.vx = mx;
      player.vz = mz;
    } else {
      // sin teclas de movimiento: conserva momentum horizontal
      const hs = Math.hypot(player.vx, player.vz);
      if (hs > 0.01 && hs < CFG.speed) {
        const f = CFG.speed / hs;
        player.vx *= f;
        player.vz *= f;
      }
    }
  }
  gravityStep(player, dt);

  // En el aire, si mantienes W, no frenes: empuja hacia la dirección deseada
  if (!player.onGround && (fw || str)) {
    player.vx += (mx - player.vx) * Math.min(1, dt * 6);
    player.vz += (mz - player.vz) * Math.min(1, dt * 6);
  }

  // pasos (con Shift caminas en silencio)
  const spd = Math.hypot(player.vx, player.vz);
  if (player.onGround && spd > 1.5 && !(keys.ShiftLeft || keys.ShiftRight)) {
    stepAcc += spd * dt;
    if (stepAcc > 2.3) { stepAcc = 0; sfxStep(0.06); }
  }

  // disparo
  const w = WEAPONS[cur];
  fireCd -= dt;
  const wantFire = w.auto ? mouseDown : trigger;
  if (wantFire && fireCd <= 0 && !reloading) {
    if (w.melee || ammo[cur] > 0) shoot();
    else reload();
  }
  trigger = false;

  if (reloading) {
    reloadT -= dt;
    if (reloadT <= 0) { reloading = false; finishReload(w); updateHud(); sfxReloadEnd(); }
  }

  placeCamera(p);
}

let walkSwayT = 0;
function updateGun(dt) {
  gunKick = Math.max(0, gunKick - dt * 14);
  drawT = Math.max(0, drawT - dt * 5);
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) guns[cur].flash.visible = false; }
  let dip = 0;
  if (reloading) dip = Math.sin((1 - reloadT / WEAPONS[cur].reload) * Math.PI);
  const g = guns[cur].group;
  const spd = Math.hypot(player.vx, player.vz);
  // Sin sway/bob del arma (también reduce mareo)
  walkSwayT = 0;
  const sway = 0, bobY = 0;
  g.position.z = -0.48 + gunKick * 0.04;
  g.position.y = -0.18 - dip * 0.12 - drawT * 0.35;
  g.position.x = 0.24;
  g.rotation.x = gunKick * 0.05 - dip * 0.5;
  g.rotation.y = sway * 0.5;
  g.rotation.z = sway * 0.3;
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.textContent = ''; }
}

/* ---------- Escudo, rondas, minimapa y silenciar (v0.8) ---------- */
let shieldUntil = 0;
let phase = { ph: 'wait', round: 0, rounds: 5, endsAt: 0 };
let bannerTimer = 0, lastBar = '';

function onPhase(m) {
  phase = { ph: m.ph, round: m.round, rounds: m.rounds, endsAt: Date.now() + (m.left || 0) * 1000 };
  if (m.teamScore) teamScore = m.teamScore;
  const b = $('banner');
  clearTimeout(bannerTimer);
  let h = '';
  const teamLabel = (t) => TEAMS[t] ? TEAMS[t].name : '?';
  if (m.ph === 'break') {
    h = '<h2>Ronda ' + m.round + ' — Gana <span style="color:' + (TEAMS[m.winnerTeam]?.hex || '#fff') + '">' + esc(m.winnerName || teamLabel(m.winnerTeam)) + '</span></h2>'
      + (m.reason ? '<p style="opacity:.8">' + esc(m.reason) + '</p>' : '')
      + '<p style="opacity:.8">Marcador: Alpha ' + (m.teamScore?.[0] ?? teamScore[0]) + ' — ' + (m.teamScore?.[1] ?? teamScore[1]) + ' Bravo</p>'
      + '<table><tr><th>Nombre</th><th>Eq</th><th>Bajas</th><th>Muertes</th></tr>'
      + (m.rows || []).map(r => '<tr><td>' + esc(r[0]) + '</td><td style="color:' + (TEAMS[r[1]]?.hex || '#fff') + '">' + teamLabel(r[1]) + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>').join('') + '</table>'
      + '<p style="margin-top:8px;opacity:.7">Pulsa <b>B</b> para comprar armas</p>';
  } else if (m.ph === 'final') {
    h = '<h2>¡Fin de la partida!</h2><p>Ganador: <b style="color:' + (TEAMS[m.winnerTeam]?.hex || '#fff') + '">' + esc(m.winnerName || '') + '</b></p>'
      + '<p>Marcador final: ' + (m.teamScore?.[0] ?? 0) + ' — ' + (m.teamScore?.[1] ?? 0) + '</p>'
      + '<table><tr><th>Nombre</th><th>Eq</th><th>Rondas</th><th>Bajas</th><th>Muertes</th></tr>'
      + (m.rows || []).map(r => '<tr><td>' + esc(r[0]) + '</td><td style="color:' + (TEAMS[r[1]]?.hex || '#fff') + '">' + teamLabel(r[1]) + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td></tr>').join('') + '</table>';
  } else if (m.ph === 'freeze') {
    h = '<h2>Ronda ' + m.round + ' de ' + m.rounds + '</h2><p>¡Freeze! Prepara tu compra (B)</p>';
    bannerTimer = setTimeout(() => { b.style.display = 'none'; }, 2500);
  } else if (m.ph === 'play' && m.round > 0) {
    h = '<h2>¡A jugar!</h2>';
    bannerTimer = setTimeout(() => { b.style.display = 'none'; }, 1500);
  }
  b.innerHTML = h;
  b.style.display = h ? 'block' : 'none';
  updateHud();
}

function updateRoundBar() {
  const el = $('roundbar');
  if (mode !== 'mp' || !mpReady) { el.style.display = 'none'; return; }
  const left = Math.max(0, Math.ceil((phase.endsAt - Date.now()) / 1000));
  const t = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  const sc = ' · <span style="color:#3b82f6">' + teamScore[0] + '</span>-<span style="color:#ef4444">' + teamScore[1] + '</span>';
  let bombTxt = '';
  if (phase.ph === 'play' && bombState) {
    if (bombState.state === 'planted' || bombState.state === 'defusing') {
      const bl = Math.max(0, Math.ceil((bombState.explodesAt - Date.now()) / 1000));
      bombTxt = ' · <span style="color:#ff4444">BOMBA ' + bl + 's</span>';
    } else if (bombState.state === 'carried' && bombState.carrier === myId) bombTxt = ' · <span style="color:#f5a623">LLEVAS LA BOMBA</span>';
    else if (bombState.state === 'dropped') bombTxt = ' · <span style="color:#f5a623">BOMBA EN EL SUELO</span>';
  }
  const txt = phase.ph === 'wait' ? 'Esperando jugadores (mínimo 2)'
    : phase.ph === 'freeze' ? 'FREEZE · Ronda ' + phase.round + '/' + phase.rounds + ' · ' + left + 's' + sc
    : phase.ph === 'play' ? 'Ronda ' + phase.round + '/' + phase.rounds + ' · ' + t + sc + bombTxt
    : phase.ph === 'break' ? 'Descanso · ' + left + 's' + sc
    : 'Nueva partida en ' + left;
  if (txt !== lastBar) { lastBar = txt; el.innerHTML = txt; }
  el.style.display = 'block';
}

const mmEl = $('minimap'), mmc = mmEl.getContext('2d');
const hex6 = n => '#' + n.toString(16).padStart(6, '0');
function drawMinimap() {
  if (mode === 'menu') { mmEl.style.display = 'none'; return; }
  if (mode === 'agi') { drawMinimapAgi(); return; }
  mmEl.style.display = 'block';
  const W = mmEl.width, s = W / 62, X = x => (x + 31) * s, Z = z => (z + 31) * s;
  mmc.clearRect(0, 0, W, W);
  mmc.fillStyle = 'rgba(0,0,0,.5)'; mmc.fillRect(0, 0, W, W);
  for (const [cx, cz, w, d, , col, y0 = 0] of MAP.boxes) {
    mmc.globalAlpha = y0 > 0 ? 0.55 : 0.9;
    mmc.fillStyle = hex6(col);
    mmc.fillRect(X(cx - w / 2), Z(cz - d / 2), w * s, d * s);
  }
  mmc.globalAlpha = 1;
  // radar estilo CS: aliados siempre (azul), enemigos solo cerca (rojo)
  const px = player.pos.x, pz = player.pos.z, RANGE = 22;
  const dot = (x, z, color, always) => {
    if (!always && Math.hypot(x - px, z - pz) > RANGE) return;
    mmc.fillStyle = color;
    mmc.beginPath(); mmc.arc(X(x), Z(z), 3, 0, 6.2832); mmc.fill();
  };
  if (mode === 'mp') {
    for (const r of remotes.values()) {
      if (!r.alive) continue;
      const ally = r.team === myTeam;
      dot(r.g.position.x, r.g.position.z, ally ? '#3b82f6' : '#ef4444', ally);
    }
  } else {
    for (const b of bots) { if (b.alive) dot(b.pos.x, b.pos.z, '#ef4444', false); }
  }
  // tú: triángulo que apunta hacia donde miras
  const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw), cx = X(px), cz = Z(pz);
  mmc.fillStyle = '#ffffff';
  mmc.beginPath();
  mmc.moveTo(cx + dx * 7, cz + dz * 7);
  mmc.lineTo(cx - dx * 4 - dz * 4, cz - dz * 4 + dx * 4);
  mmc.lineTo(cx - dx * 4 + dz * 4, cz - dz * 4 - dx * 4);
  mmc.closePath(); mmc.fill();
}

function renderMuteList() {
  const box = $('mutelist');
  box.textContent = '';
  if (mode !== 'mp' || !remotes.size) return;
  const lbl = document.createElement('div');
  lbl.textContent = 'Silenciar en el chat:';
  box.appendChild(lbl);
  for (const r of remotes.values()) {
    const b = document.createElement('button');
    b.className = 'ghost';
    const paint = () => { b.textContent = (muted.has(r.name) ? '🔇 ' : '🔊 ') + r.name; };
    paint();
    b.addEventListener('click', () => { if (muted.has(r.name)) muted.delete(r.name); else muted.add(r.name); paint(); });
    box.appendChild(b);
  }
}

/* ---------- Bucle principal ---------- */
/* =====================================================
   OPERACIÓN AGI  (cooperativo contra robots)
   Tú + 3 aliados humanos contra los robots que fabrica el Núcleo.
   Destruye los 3 nodos y luego el Núcleo antes de que la IA se compile al 100 %.
   Todo el modo vive en esta sección; el resto del juego solo la llama en unos pocos puntos.
   ===================================================== */
function offlineMode() { return mode === 'solo' || mode === 'practice' || mode === 'agi'; }

const ROBOT_PREFIX = ['AX', 'Z', 'VIPER', 'KX', 'RX'];
const ALLY_NAMES = ['Kai', 'Vega', 'Nova', 'Atlas'];
const _v1 = new THREE.Vector3();
const ammoGeo = new THREE.BoxGeometry(0.42, 0.24, 0.3);
const ammoStripGeo = new THREE.BoxGeometry(0.44, 0.06, 0.1);

function agiMat(color, emissive = 0x000000, ei = 1, metal = 0.5, rough = 0.5) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });
}
const agiRate = () => Math.max(3, AGI_CFG.prodRate - AGI_CFG.prodDrop * AGI.nodesDown);

/* ---------- Limpieza al cambiar de mapa ---------- */
function agiResetWorld() {
  AGI.active = false;
  for (const o of AGI.objs) {
    scene.remove(o.group);
    const mats = new Set();
    o.group.traverse(m => { if (m.isMesh) { m.geometry.dispose(); mats.add(m.material); } });
    mats.forEach(m => m.dispose());
  }
  AGI.objs.length = 0;
  for (const d of AGI.drops) scene.remove(d.g);
  AGI.drops.length = 0;
  AGI.nav = null;
}

/* ---------- Objetivos: Núcleo Principal y nodos ---------- */
function agiBuildObjective(def, core, id) {
  const g = new THREE.Group();
  g.position.set(def.x, 0, def.z);
  const o = {
    id, name: core ? 'Núcleo Principal' : def.name, x: def.x, z: def.z, hp: def.hp, max: def.hp,
    alive: true, core, shielded: core, group: g, meshes: [], spin: [], glow: [], shield: null, orb: null,
    pulse: 0, markerY: core ? 6.6 : 4.1, solid: null,
  };
  const part = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.obj = o;
    g.add(m); o.meshes.push(m);
    return m;
  };
  const dark = agiMat(0x23272e, 0, 1, 0.7, 0.45), plate = agiMat(0x434a55, 0, 1, 0.6, 0.5);
  if (core) {
    part(new THREE.BoxGeometry(7, 0.4, 7), plate, 0, 0.2, 0);
    part(new THREE.BoxGeometry(4.2, 2.6, 4.2), dark, 0, 1.7, 0);
    part(new THREE.BoxGeometry(4.6, 0.25, 4.6), plate, 0, 3.1, 0);
    const strip = agiMat(0x2a0a3a, 0xc060ff, 1.8, 0.2, 0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      part(new THREE.BoxGeometry(0.5, 3.6, 0.5), dark, sx * 3, 2.2, sz * 3);
      part(new THREE.BoxGeometry(0.12, 3.0, 0.12), strip, sx * 3 + sx * 0.27, 2.2, sz * 3);
    }
    const gm = agiMat(0x2a0a3a, 0xb35cff, 1.8, 0.2, 0.25);
    o.orb = part(new THREE.SphereGeometry(1.05, 20, 14), gm, 0, 4.5, 0);
    const ring = part(new THREE.TorusGeometry(1.9, 0.14, 8, 28), gm, 0, 4.5, 0);
    ring.rotation.x = Math.PI / 2.6;
    o.glow.push(gm, strip); o.spin.push(ring);
    const sh = new THREE.Mesh(
      new THREE.SphereGeometry(4.6, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x4cc3ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })
    );
    sh.position.set(0, 2.6, 0);
    sh.userData.obj = o; sh.userData.shield = true;
    g.add(sh); o.shield = sh; o.meshes.push(sh);
    o.solid = { x0: def.x - 2.2, x1: def.x + 2.2, y0: 0, y1: 3.4, z0: def.z - 2.2, z1: def.z + 2.2, obj: true };
  } else {
    part(new THREE.BoxGeometry(3.4, 0.3, 3.4), plate, 0, 0.15, 0);
    part(new THREE.BoxGeometry(1.5, 1.4, 1.5), dark, 0, 1.0, 0);
    part(new THREE.BoxGeometry(1.9, 0.14, 1.9), plate, 0, 1.75, 0);
    const gm = agiMat(0x3a1c00, 0xff8c1a, 1.7, 0.2, 0.3);
    const crystal = part(new THREE.OctahedronGeometry(0.8), gm, 0, 2.7, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      part(new THREE.BoxGeometry(0.16, 2.4, 0.16), dark, sx * 1.5, 1.2, sz * 1.5);
      part(new THREE.BoxGeometry(0.2, 0.2, 0.2), gm, sx * 1.5, 2.5, sz * 1.5);
    }
    o.glow.push(gm); o.spin.push(crystal);
    o.solid = { x0: def.x - 0.85, x1: def.x + 0.85, y0: 0, y1: 3, z0: def.z - 0.85, z1: def.z + 0.85, obj: true };
  }
  scene.add(g);
  for (const m of o.meshes) rayTargets.push(m);
  solids.push(o.solid);
  AGI.objs.push(o);
  return o;
}

function agiEvent(text, t = 3) {
  const el = $('agiEvent');
  if (el) el.textContent = text;
  AGI.eventT = t;
  beep(420, 0.08, 0.12); setTimeout(() => beep(560, 0.08, 0.12), 110);
}

function agiDropShield() {
  const c = AGI.objs.find(x => x.core);
  if (!c || !c.shielded) return;
  c.shielded = false;
  if (c.shield) {
    c.group.remove(c.shield);
    c.shield.material.dispose(); c.shield.geometry.dispose();
    rayTargets = rayTargets.filter(m => m !== c.shield);
    c.meshes = c.meshes.filter(m => m !== c.shield);
    c.shield = null;
  }
  agiEvent('ESCUDO DEL NÚCLEO CAÍDO — ¡DESTRÚYELO!', 4.5);
  say('¡Destruye el Núcleo Principal!', 3);
}

function agiObjDestroyed(o) {
  o.alive = false; o.hp = 0; o.shielded = false;
  const pt = new THREE.Vector3(o.x, o.markerY * 0.45, o.z);
  puff(pt, 0xff8a1a, 30, 2.4); puff(pt, 0xffdd88, 20, 1.6); puff(pt, 0x2a2a2a, 16, 1.8);
  beep(55, 0.5, 0.35); setTimeout(() => beep(90, 0.3, 0.25), 120);
  for (const gm of o.glow) { gm.emissive.setHex(0x000000); gm.emissiveIntensity = 0; }
  if (o.orb) o.orb.visible = false;
  for (const sp of o.spin) sp.visible = false;
  const mats = new Set();
  o.group.traverse(m => { if (m.isMesh && !m.userData.shield) mats.add(m.material); });
  mats.forEach(m => { if (m.color) m.color.multiplyScalar(0.5); });
  rayTargets = rayTargets.filter(m => m.userData.obj !== o);
  if (o.core) { feed('✦ Núcleo Principal destruido'); agiEnd(true); return; }
  AGI.nodesDown++;
  AGI.compileRate *= AGI_CFG.nodeSlow;
  feed('✦ ' + o.name + ' destruido');
  say(o.name.toUpperCase() + ' DESTRUIDO', 2.4);
  if (AGI.nodesDown >= 3) agiDropShield();
  else agiEvent('PRODUCCIÓN ROBÓTICA REDUCIDA', 3);
}

function agiDamageObj(o, dmg, who) {
  if (!o.alive || AGI.over) return false;
  if (o.shielded) {
    o.pulse = Math.max(o.pulse, 0.7);
    if (who === 'player' && AGI.shieldMsgT <= 0) { AGI.shieldMsgT = 1.3; say('Núcleo protegido — destruye primero los 3 nodos', 1.5); }
    return false;
  }
  o.hp = Math.max(0, o.hp - dmg);
  o.pulse = 1;
  if (o.hp <= 0) agiObjDestroyed(o);
  return true;
}

function agiUpdateObjectives(dt) {
  const tm = performance.now() * 0.001;
  for (const o of AGI.objs) {
    o.pulse = Math.max(0, o.pulse - dt * 3);
    if (!o.alive) continue;
    for (const sp of o.spin) sp.rotation.y += dt * (o.core ? 0.9 : 1.6);
    if (o.orb) o.orb.scale.setScalar(1 + Math.sin(tm * 2) * 0.04);
    const ei = 1.7 + o.pulse * 2.2 + Math.sin(tm * 3 + o.x) * 0.15;
    for (const gm of o.glow) gm.emissiveIntensity = ei;
    if (o.shield) o.shield.material.opacity = 0.12 + o.pulse * 0.35 + Math.sin(tm * 2) * 0.02;
  }
}

/* ---------- Navegación: puntos del mapa unidos si se puede caminar entre ellos ---------- */
function agiWalkClear(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  const nx = dx / d, nz = dz / d, px = -nz, pz = nx;
  for (const off of [-0.4, 0, 0.4]) {
    const ox = ax + px * off, oz = az + pz * off;
    for (const y of [0.7, 1.5]) {
      for (const s of solids) {
        const t = rayAABB(ox, y, oz, nx, 0, nz, s);
        if (t >= 0 && t < d) return false;
      }
    }
  }
  return true;
}
function agiLos(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  const nx = dx / d, ny = dy / d, nz = dz / d;
  for (const s of solids) {
    if (s.obj) continue;      // los nodos y el Núcleo no tapan la vista
    const t = rayAABB(ax, ay, az, nx, ny, nz, s);
    if (t >= 0 && t < d - 0.15) return false;
  }
  return true;
}
function agiBuildNav() {
  const P = MAP.waypoints || [], adj = P.map(() => []);
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
    if (d < 26 && agiWalkClear(P[i][0], P[i][1], P[j][0], P[j][1])) { adj[i].push([j, d]); adj[j].push([i, d]); }
  }
  AGI.nav = { pts: P, adj };
}
function agiNearestWp(x, z) {
  const P = AGI.nav.pts;
  const order = P.map((p, i) => [Math.hypot(p[0] - x, p[1] - z), i]).sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < Math.min(6, order.length); k++) {
    const i = order[k][1];
    if (agiWalkClear(x, z, P[i][0], P[i][1])) return i;
  }
  return order[0][1];
}
function agiPathTo(sx, sz, tx, tz) {
  const nav = AGI.nav;
  if (!nav || !nav.pts.length) return null;
  const P = nav.pts, n = P.length;
  const s = agiNearestWp(sx, sz), t = agiNearestWp(tx, tz);
  if (s === t) return [];
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[s] = 0;
  for (let it = 0; it < n; it++) {
    let a = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (a < 0 || dist[i] < dist[a])) a = i;
    if (a < 0 || dist[a] === Infinity) break;
    done[a] = true;
    if (a === t) break;
    for (const [b, w] of nav.adj[a]) if (dist[a] + w < dist[b]) { dist[b] = dist[a] + w; prev[b] = a; }
  }
  if (prev[t] < 0) return null;
  const path = [];
  for (let c = t; c >= 0; c = prev[c]) path.push(P[c]);
  path.reverse();
  return path;
}

// Camina hacia (tx,tz) por el camino de puntos (o directo si no hay obstáculos)
function agiGoto(u, tx, tz, speed, dt) {
  const p = u.pos, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 1.0) { steer(u, 0, 0, 0, dt); return; }
  u.pathT -= dt;
  if (u.pathT <= 0 || Math.hypot(tx - u.gx, tz - u.gz) > 6) {
    u.pathT = 0.8 + Math.random() * 0.5; u.gx = tx; u.gz = tz;
    u.direct = agiWalkClear(p.x, p.z, tx, tz);
    u.path = u.direct ? null : agiPathTo(p.x, p.z, tx, tz);
    u.pi = 0;
    if (u.path && u.path.length > 1 && agiWalkClear(p.x, p.z, u.path[1][0], u.path[1][1])) u.pi = 1;
  }
  let sx = dx, sz = dz;
  if (!u.direct && u.path) {
    while (u.pi < u.path.length && Math.hypot(u.path[u.pi][0] - p.x, u.path[u.pi][1] - p.z) < 1.8) u.pi++;
    if (u.pi < u.path.length) { sx = u.path[u.pi][0] - p.x; sz = u.path[u.pi][1] - p.z; }
  }
  steer(u, sx, sz, speed, dt);
  faceMove(u, dt);
}

/* ---------- Modelos: robot enemigo ---------- */
function makeRobotModel(idx) {
  const g = new THREE.Group();
  const anim = { t: 0, legsL: [], legsR: [], armsL: [], armsR: [] };
  g.userData.anim = anim;
  const accent = [0xd9822b, 0x39b6d6, 0xc94b4b, 0x8a6bd1][idx % 4];
  const mBody = agiMat(0x2d333b, 0, 1, 0.75, 0.38);
  const mPlate = agiMat(0x59616d, 0, 1, 0.7, 0.4);
  const mDark = agiMat(0x14171b, 0, 1, 0.6, 0.5);
  const mAcc = agiMat(accent, 0, 1, 0.5, 0.45);
  const mEye = agiMat(0x2a0505, 0xff2a1a, 2.4, 0.2, 0.3);
  const add = (name, w, h, d, x, y, z, mat, side, eye) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.part = name; m.userData.baseY = y; m.userData.baseZ = z;
    if (eye) m.userData.eye = true;
    g.add(m);
    if (side === 'L') { if (name === 'legs') anim.legsL.push(m); if (name === 'arm') anim.armsL.push(m); }
    else if (side === 'R') { if (name === 'legs') anim.legsR.push(m); if (name === 'arm') anim.armsR.push(m); }
    return m;
  };
  add('legs', 0.2, 0.78, 0.24, -0.17, 0.4, 0, mBody, 'L');
  add('legs', 0.2, 0.78, 0.24, 0.17, 0.4, 0, mBody, 'R');
  add('body', 0.5, 0.22, 0.3, 0, 0.9, 0, mDark);
  add('body', 0.66, 0.66, 0.4, 0, 1.28, 0, mBody);
  add('body', 0.72, 0.18, 0.44, 0, 1.54, 0, mPlate);
  add('body', 0.24, 0.14, 0.03, 0, 1.3, 0.21, mAcc);
  add('body', 0.14, 0.09, 0.03, 0, 1.3, 0.225, mEye, null, true);
  add('body', 0.2, 0.2, 0.3, -0.46, 1.52, 0, mPlate);
  add('body', 0.2, 0.2, 0.3, 0.46, 1.52, 0, mPlate);
  add('head', 0.34, 0.3, 0.32, 0, 1.78, 0.02, mPlate);
  add('head', 0.28, 0.07, 0.04, 0, 1.8, 0.2, mEye, null, true);
  add('head', 0.04, 0.22, 0.04, 0.12, 2.0, -0.05, mDark);
  add('arm', 0.13, 0.55, 0.13, -0.47, 1.18, 0, mBody, 'L');
  add('arm', 0.13, 0.55, 0.13, 0.47, 1.18, 0.1, mBody, 'R');
  add('gun', 0.09, 0.12, 0.55, 0.47, 1.05, 0.4, mDark);
  return g;
}

/* ---------- Unidades (robots y aliados comparten esta estructura) ---------- */
function agiNewUnit(kind, name, g, hp) {
  const u = {
    agi: true, kind, name, g, pos: g.position, team: kind === 'ally' ? 0 : 1,
    vx: 0, vy: 0, vz: 0, onGround: true, hp, maxHp: hp, alive: false, yaw: 0, fall: 0, respawn: 0,
    flash: 0, lit: false, meshes: [], sees: false, seeT: Math.random() * 0.3, tgt: null, objTgt: null,
    react: 0, fireCd: 0.5, strafe: 1, strafeT: 0, side: Math.random() < 0.5 ? 1 : -1,
    wp: null, wantsMove: false, stuckT: 1, stuckPos: new THREE.Vector3(),
    path: null, pi: 0, pathT: 0, gx: 1e9, gz: 1e9, direct: false,
  };
  g.traverse(o => {
    if (o.isMesh) { o.userData.bot = u; if (!o.userData.eye) u.meshes.push(o); rayTargets.push(o); }
  });
  g.visible = false;
  scene.add(g);
  bots.push(u);
  return u;
}

function agiSpawnUnit(u, x, z) {
  u.pos.set(x, 0, z);
  u.vx = u.vy = u.vz = 0; u.onGround = true;
  u.hp = u.maxHp; u.alive = true; u.fall = 0; u.flash = 0;
  u.sees = false; u.tgt = null; u.objTgt = null; u.path = null; u.wp = null; u.pathT = 0;
  u.fireCd = 0.5 + Math.random() * 0.6; u.react = 0;
  u.yaw = u.kind === 'robot' ? 0 : Math.PI;      // robots miran al sur, aliados al norte
  u.g.rotation.set(0, u.yaw, 0);
  u.g.visible = true;
  setLit(u, false);
  if (u.kind === 'robot') {
    u.name = 'BOT ' + ROBOT_PREFIX[Math.floor(Math.random() * ROBOT_PREFIX.length)] + '-' + String(10 + Math.floor(Math.random() * 989)).padStart(3, '0');
    puff(_v1.set(x, 1, z), 0xff3b2f, 10, 1.1);
  }
}

function agiSpawnRobot() {
  let u = AGI.robots.find(r => !r.alive && r.respawn <= 0);
  if (!u) {
    if (AGI.robots.length >= AGI_CFG.poolMax) return null;
    u = agiNewUnit('robot', 'BOT AX-000', makeRobotModel(AGI.robots.length), AGI_CFG.robotHp);
    AGI.robots.push(u);
  }
  const list = MAP.robotSpawns || MAP.teamSpawns[1];
  let best = null, bd = -1;
  for (let k = 0; k < 6; k++) {
    const s = list[Math.floor(Math.random() * list.length)];
    if (AGI.robots.some(o => o.alive && Math.hypot(o.pos.x - s[0], o.pos.z - s[1]) < 2)) continue;
    const d = Math.min(Math.hypot(s[0] - player.pos.x, s[1] - player.pos.z), 99);
    if (d > bd) { bd = d; best = s; }
  }
  if (!best) best = list[0];
  agiSpawnUnit(u, best[0], best[1]);
  return u;
}

function agiSpawnAlly(u) {
  const list = MAP.teamSpawns[0];
  const s = list[Math.floor(Math.random() * list.length)];
  agiSpawnUnit(u, s[0], s[1]);
}

function agiPlacePlayer() {
  const list = MAP.teamSpawns[0];
  let best = list[0], bd = -1;
  for (const s of list) {
    let md = 1e9;
    for (const u of bots) if (u.alive) md = Math.min(md, Math.hypot(s[0] - u.pos.x, s[1] - u.pos.z));
    if (md > bd) { bd = md; best = s; }
  }
  const [sx, sy, sz] = findSafePos(best[0], best[1], 0);
  player.pos.set(sx, sy, sz);
  player.vx = player.vy = player.vz = 0;
  player.onGround = true;
  player.yaw = 0; player.pitch = 0;
}

function agiRefillReserve() {
  for (let i = 1; i <= 5; i++) reserve[i] = Math.max(reserve[i] | 0, WEAPONS[i].mag * (AGI.t < 1 ? 5 : 3));
}
function finishReload(w) {
  if (mode === 'agi' && !w.melee) {
    const take = Math.min(w.mag - ammo[cur], reserve[cur] | 0);
    ammo[cur] += take; reserve[cur] -= take;
  } else ammo[cur] = w.mag;
}

/* ---------- Cajas de munición (las sueltan algunos robots) ---------- */
function agiDropAmmo(x, z) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ammoGeo, new THREE.MeshStandardMaterial({ color: 0x3f5a35, roughness: 0.6, metalness: 0.2 })));
  const strip = new THREE.Mesh(ammoStripGeo, new THREE.MeshStandardMaterial({ color: 0xf0c040, emissive: 0x6a5000, roughness: 0.5 }));
  strip.position.set(0, 0.05, 0.1);
  g.add(strip);
  g.position.set(x, 0.3, z);
  scene.add(g);
  AGI.drops.push({ g, x, z, life: 30 });
}
function agiUpdateDrops(dt) {
  for (let i = AGI.drops.length - 1; i >= 0; i--) {
    const d = AGI.drops[i];
    d.life -= dt;
    d.g.rotation.y += dt * 1.5;
    d.g.position.y = 0.3 + Math.sin(performance.now() * 0.004 + i) * 0.05;
    const take = !player.dead && Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 1.4;
    if (take) {
      for (let k = 1; k <= 5; k++) reserve[k] = Math.min(WEAPONS[k].mag * 8, (reserve[k] | 0) + WEAPONS[k].mag * (k === cur ? 2 : 1));
      say('Munición recogida', 1.4); beep(600, 0.06, 0.12);
      updateHud();
    }
    if (take || d.life <= 0) {
      scene.remove(d.g);
      d.g.traverse(m => { if (m.isMesh) m.material.dispose(); });
      AGI.drops.splice(i, 1);
    }
  }
}

/* ---------- Daño y bajas ---------- */
function agiKillUnit(u, killer, weapon) {
  if (!u.alive) return;
  u.alive = false; u.fall = 0; u.hp = 0; u.sees = false; u.tgt = null;
  u.respawn = u.kind === 'ally' ? AGI_CFG.allyRespawn : 2.5;
  feed(killer + '  ➜  ' + weapon + '  ➜  ' + u.name);
  if (u.kind === 'robot') {
    AGI.kills++;
    if (!AGI.over) AGI.compile = Math.max(0, AGI.compile - AGI_CFG.killSetback);
    if (Math.random() < AGI_CFG.ammoDropChance) agiDropAmmo(u.pos.x, u.pos.z);
    puff(_v1.set(u.pos.x, 1, u.pos.z), 0xffb347, 6, 0.8);
  }
}
function agiHurt(u, dmg, killer, weapon) {
  if (!u.alive) return;
  u.hp -= dmg; u.flash = 0.08;
  if (u.hp <= 0) agiKillUnit(u, killer, weapon);
}
// disparos del jugador contra una unidad (llamado desde damageBot)
function agiDamageUnit(b, part, w, dist) {
  if (b.kind === 'ally' || !b.alive) return false;     // sin fuego amigo
  let dmg = w.damage * (part === 'head' ? w.head : 1);
  if (w.pellets > 1) dmg *= Math.max(0.25, 1 - dist / 20);
  b.hp -= dmg; b.flash = 0.08;
  if (b.hp > 0) return false;
  player.kills++;
  agiKillUnit(b, 'Jugador', w.name || 'Granada');
  updateHud();
  return true;
}

/* ---------- IA ---------- */
function agiTargetsFor(u) {
  const out = [];
  if (u.kind === 'robot') {
    if (!player.dead) out.push({ pos: player.pos, isPlayer: true, y: 1.2 });
    for (const a of AGI.allies) if (a.alive) out.push({ pos: a.pos, unit: a, y: 1.2 });
  } else {
    for (const r of AGI.robots) if (r.alive) out.push({ pos: r.pos, unit: r, y: 1.3 });
  }
  return out;
}
function agiAcquire(u) {
  const robot = u.kind === 'robot', maxR = robot ? 48 : 40;
  let best = null, bd = 1e9, vis = null, vd = 1e9;
  for (const t of agiTargetsFor(u)) {
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (d < bd) { bd = d; best = t; }
    if (d < maxR && d < vd && agiLos(u.pos.x, u.pos.y + 1.55, u.pos.z, t.pos.x, t.pos.y + t.y, t.pos.z)) { vd = d; vis = t; }
  }
  const was = u.sees;
  if (vis) { u.tgt = vis; u.sees = true; if (!was) u.react = 0.45 + Math.random() * 0.5; }
  else { u.sees = false; u.tgt = (robot && best && bd < 80) ? best : null; }
}
function agiAllyObjective(u) {
  let best = null, bd = 1e9;
  for (const o of AGI.objs) {
    if (!o.alive || o.shielded) continue;
    const d = Math.hypot(o.x - u.pos.x, o.z - u.pos.z);
    if (d < 30 && d < bd && agiLos(u.pos.x, u.pos.y + 1.55, u.pos.z, o.x, 2.2, o.z)) { bd = d; best = o; }
  }
  return best;
}
function agiShoot(u, t, dist) {
  gunWorld(u.pos, u.yaw, _mz);
  const robot = u.kind === 'robot';
  let chance = robot ? Math.max(0.12, Math.min(0.55, 0.62 - dist * 0.014)) : Math.max(0.25, Math.min(0.68, 0.74 - dist * 0.012));
  if (t.isPlayer && Math.hypot(player.vx, player.vz) > 2.5) chance *= 0.7;
  const hit = Math.random() < chance;
  _e.set(t.pos.x, t.pos.y + t.y, t.pos.z);
  if (!hit) _e.add(_v1.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
  tracer(_mz.clone(), _e.clone(), robot ? 0xff5a44 : 0xffe9a0);
  puff(_mz, robot ? 0xff7755 : 0xffdd66, 2);
  if (dist < 40) sfxShot(0.26 / (1 + dist * 0.1), robot ? 0.8 : 1.1);
  if (!hit) return;
  if (t.isPlayer) damagePlayer(AGI_CFG.robotDamage, u);
  else if (robot) agiHurt(t.unit, AGI_CFG.robotDamageAlly, u.name, 'RIFLE');
  else agiHurt(t.unit, AGI_CFG.allyDamage * (Math.random() < 0.15 ? 2 : 1), u.name, 'M4A1');
}
function agiCombat(u, dt, speed) {
  const t = u.tgt, robot = u.kind === 'robot';
  const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, dist = Math.hypot(dx, dz) || 0.01;
  turnTo(u, Math.atan2(dx, dz), dt, 10);
  u.strafeT -= dt;
  if (u.strafeT <= 0) { u.strafeT = 1 + Math.random() * 1.6; u.strafe = Math.random() < 0.5 ? -1 : 1; }
  const nx = dx / dist, nz = dz / dist, near = robot ? 8 : 6, far = robot ? 15 : 13;
  let mx = 0, mz = 0;
  if (dist > far) { mx = nx; mz = nz; } else if (dist < near) { mx = -nx; mz = -nz; }
  mx += -nz * u.strafe * 0.8; mz += nx * u.strafe * 0.8;
  steer(u, mx, mz, speed * 0.8, dt);
  u.react -= dt; u.fireCd -= dt;
  if (u.react <= 0 && u.fireCd <= 0) {
    agiShoot(u, t, dist);
    u.fireCd = (robot ? AGI_CFG.robotFire : AGI_CFG.allyFire) * (0.8 + Math.random() * 0.6);
  }
}
function agiAllyShootObj(u, dt) {
  const o = u.objTgt, dx = o.x - u.pos.x, dz = o.z - u.pos.z, dist = Math.hypot(dx, dz);
  turnTo(u, Math.atan2(dx, dz), dt, 8);
  steer(u, 0, 0, 0, dt);
  u.fireCd -= dt;
  if (u.fireCd > 0) return;
  u.fireCd = AGI_CFG.allyFire * (0.9 + Math.random() * 0.3);
  gunWorld(u.pos, u.yaw, _mz);
  _e.set(o.x + (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.5, o.z + (Math.random() - 0.5) * 1.2);
  tracer(_mz.clone(), _e.clone());
  puff(_mz, 0xffdd66, 2);
  if (dist < 40) sfxShot(0.16 / (1 + dist * 0.1), 1.1);
  agiDamageObj(o, AGI_CFG.allyObjDamage, 'ally');
  puff(_e, 0xffaa44, 3);
}
function agiAllyFollow(u, dt) {
  if (!player.dead) {
    const k = AGI.allies.indexOf(u), ang = player.yaw + (k - 1) * 0.9;     // detrás del jugador, en abanico
    const gx = player.pos.x + Math.sin(ang) * 3.6, gz = player.pos.z + Math.cos(ang) * 3.6;
    const d = Math.hypot(gx - u.pos.x, gz - u.pos.z);
    if (d > 2.2) agiGoto(u, gx, gz, d > 9 ? CFG.botSpeed * 1.5 : CFG.botSpeed, dt);
    else { steer(u, 0, 0, 0, dt); turnTo(u, player.yaw + Math.PI, dt, 3); }
    return;
  }
  // jugador muerto: avanzan hacia el objetivo más cercano
  let best = null, bd = 1e9;
  for (const o of AGI.objs) {
    if (!o.alive || o.shielded) continue;
    const d = Math.hypot(o.x - u.pos.x, o.z - u.pos.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd > 14) agiGoto(u, best.x, best.z + 8, CFG.botSpeed, dt); else steer(u, 0, 0, 0, dt);
}
function agiHunt(u, dt, speed) {
  const t = u.tgt;
  if (t) { agiGoto(u, t.pos.x, t.pos.z, speed * 1.1, dt); return; }
  if (!u.wp || Math.hypot(u.wp[0] - u.pos.x, u.wp[1] - u.pos.z) < 2) u.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)];
  agiGoto(u, u.wp[0], u.wp[1], speed, dt);
}

function agiUpdateUnit(u, dt) {
  const p = u.pos;
  if (!u.alive) {
    if (!u.g.visible) return;
    u.fall = Math.min(1, u.fall + dt * 4);
    u.g.rotation.x = -Math.PI / 2 * u.fall;
    p.y = 0.2 * u.fall;
    if (u.flash > 0) u.flash -= dt;
    setLit(u, u.flash > 0);
    u.respawn -= dt;
    if (u.respawn <= 0) {
      if (u.kind === 'ally' && !AGI.over) agiSpawnAlly(u);
      else u.g.visible = false;
    }
    return;
  }
  u.wantsMove = false;
  const robot = u.kind === 'robot';
  const speed = robot ? AGI_CFG.robotSpeed : CFG.botSpeed;
  if (AGI.over && robot) {
    steer(u, 0, 0, 0, dt);
  } else {
    u.seeT -= dt;
    if (u.seeT <= 0) {
      u.seeT = 0.22 + Math.random() * 0.12;
      agiAcquire(u);
      if (!robot) u.objTgt = u.sees ? null : agiAllyObjective(u);
    }
    // el objetivo pudo morir entre una revisión y otra
    if (u.tgt && ((u.tgt.unit && !u.tgt.unit.alive) || (u.tgt.isPlayer && player.dead))) { u.tgt = null; u.sees = false; }
    if (u.sees && u.tgt) agiCombat(u, dt, speed);
    else if (!robot && u.objTgt && u.objTgt.alive && !u.objTgt.shielded && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 30) agiAllyShootObj(u, dt);
    else if (robot) agiHunt(u, dt, speed);
    else agiAllyFollow(u, dt);
  }
  gravityStep(u, dt);
  u.stuckT -= dt;
  if (u.stuckT <= 0) {
    u.stuckT = 1;
    if (u.wantsMove && Math.hypot(p.x - u.stuckPos.x, p.z - u.stuckPos.z) < 0.4) { u.side *= -1; u.strafe *= -1; u.wp = null; u.pathT = 0; }
    u.stuckPos.copy(p);
  }
  u.g.rotation.y = u.yaw;
  animateCharacter(u.g, Math.hypot(u.vx, u.vz), dt, !u.onGround);
  if (u.g.userData.anim) u.g.position.y = u.pos.y + (u.g.userData.anim.bob || 0);
  if (u.flash > 0) u.flash -= dt;
  setLit(u, u.flash > 0);
}

/* ---------- Director: la IA se compila, el Núcleo fabrica robots, llegan refuerzos ---------- */
function agiDirector(dt) {
  AGI.compile += (100 / AGI_CFG.compileSeconds) * AGI.compileRate * dt;
  if (AGI.compile >= 100) { AGI.compile = 100; agiEnd(false); return; }
  const alive = AGI.robots.reduce((n, r) => n + (r.alive ? 1 : 0), 0);
  const cap = Math.max(3, Math.min(AGI_CFG.capMax, Math.floor(AGI_CFG.baseCap + (AGI.t / 60) * AGI_CFG.capPerMin) - 2 * AGI.nodesDown));
  AGI.prodT -= dt;
  if (AGI.prodT <= 0) { AGI.prodT = 60 / agiRate(); if (alive < cap) agiSpawnRobot(); }
  AGI.reinforceT -= dt;
  if (AGI.reinforceT <= 0) {
    AGI.reinforceT = AGI_CFG.reinforceEvery;
    let n = 0;
    for (let i = 0; i < AGI_CFG.reinforceCount; i++) if (agiSpawnRobot()) n++;
    if (n) agiEvent('REFUERZOS ROBÓTICOS: +' + n, 3.2);
  }
}

function agiEnd(win) {
  if (AGI.over) return;
  AGI.over = true; AGI.win = win; AGI.endT = 7;
  const mins = Math.floor(AGI.t / 60), secs = String(Math.floor(AGI.t % 60)).padStart(2, '0');
  const stats = 'Tiempo ' + mins + ':' + secs + ' · Robots destruidos ' + AGI.kills + ' · Tus bajas ' + player.kills;
  const el = $('agiEnd');
  if (el) {
    el.innerHTML = '<h2 class="' + (win ? 'win' : 'lose') + '">' + (win ? 'VICTORIA' : 'DERROTA') + '</h2>'
      + '<p>' + (win ? 'El Núcleo fue destruido: la IA no pudo compilarse.' : 'La IA terminó de compilarse al 100 %.') + '</p>'
      + '<p class="st">' + stats + '</p>';
    el.style.display = 'block';
  }
  AGI.endMsg = (win ? '¡Victoria! ' : 'Derrota. ') + stats;
  if (win) {                                   // al caer el Núcleo los robots se apagan
    for (const r of AGI.robots) if (r.alive) { r.alive = false; r.fall = 0; r.respawn = 5; puff(_v1.set(r.pos.x, 1, r.pos.z), 0x66ccff, 8, 1); }
  }
  beep(win ? 660 : 160, 0.25, 0.25); setTimeout(() => beep(win ? 880 : 120, 0.35, 0.25), 220);
}
function agiLeave() {      // al terminar se abre el menú de pausa (Salir al menú)
  if (mode !== 'agi') return;
  if (isMobile) unlockGame();
  else { try { document.exitPointerLock(); } catch (e) {} }
}

function updateAgi(dt) {
  if (!AGI.active) return;
  AGI.t += dt;
  AGI.shieldMsgT = Math.max(0, AGI.shieldMsgT - dt);
  if (AGI.eventT > 0) AGI.eventT -= dt;
  if (!AGI.over) agiDirector(dt);
  for (const u of bots) if (u.agi) agiUpdateUnit(u, dt);
  agiUpdateObjectives(dt);
  agiUpdateDrops(dt);
  if (AGI.over && AGI.endT > 0) { AGI.endT -= dt; if (AGI.endT <= 0) agiLeave(); }
}

/* ---------- HUD estilo video: panel de objetivos, barra superior, marcadores y minimapa ---------- */
function agiBuildHud() {
  const order = [...AGI.objs.filter(o => o.core), ...AGI.objs.filter(o => !o.core)];
  const rows = $('agiObjRows');
  rows.innerHTML = ''; AGI.rowEls = {};
  for (const o of order) {
    const row = document.createElement('div');
    row.className = 'orow' + (o.core ? ' core' : '');
    row.innerHTML = '<span class="ico"></span><b>' + o.name + '</b><em>' + o.hp + '</em><i><u></u></i>' + (o.core ? '<small></small>' : '');
    rows.appendChild(row);
    AGI.rowEls[o.id] = { row, hp: row.querySelector('em'), fill: row.querySelector('u'), sub: row.querySelector('small') };
  }
  const w = $('agiWps');
  w.innerHTML = ''; AGI.wpEls = [];
  for (const o of order) {
    const el = document.createElement('div');
    el.className = 'wp' + (o.core ? ' core' : '');
    el.innerHTML = '<i></i><span></span>';
    w.appendChild(el);
    AGI.wpEls.push({ o, el, txt: el.querySelector('span'), last: -1 });
  }
  const hb = $('agiHumBars');
  hb.innerHTML = ''; AGI.humEls = [];
  // Tú + aliados con barra de vida real
  const makeHum = (label, self) => {
    const el = document.createElement('div');
    el.className = 'hum' + (self ? ' self' : '');
    el.innerHTML = '<span>' + label + '</span><i><u></u></i>';
    hb.appendChild(el);
    AGI.humEls.push({ el, fill: el.querySelector('u'), name: el.querySelector('span') });
  };
  makeHum('TÚ', true);
  for (let i = 0; i < AGI_CFG.allies; i++) makeHum('ALIADO ' + (i + 1), false);
  const end = $('agiEnd'); if (end) { end.style.display = 'none'; end.innerHTML = ''; }
  const ev = $('agiEvent'); if (ev) ev.textContent = '';
}

function agiHud(dt) {
  const root = $('agiHud');
  if (!root) return;
  const on = AGI.active && mode === 'agi';
  const want = on ? 'block' : 'none';
  if (root.style.display !== want) root.style.display = want;
  if (!on) return;
  // marcadores con distancia (se mueven cada frame)
  for (const m of AGI.wpEls) {
    const o = m.o;
    if (!o.alive || player.dead) { m.el.style.display = 'none'; continue; }
    _v1.set(o.x, o.markerY, o.z).project(camera);
    if (_v1.z > 1 || Math.abs(_v1.x) > 1.05 || Math.abs(_v1.y) > 1.05) { m.el.style.display = 'none'; continue; }
    m.el.style.display = 'block';
    m.el.style.transform = 'translate(' + ((_v1.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px,' + ((-_v1.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px)';
    const dist = Math.round(Math.hypot(o.x - player.pos.x, o.z - player.pos.z));
    if (m.last !== dist) { m.last = dist; m.txt.textContent = dist + ' m'; }
  }
  AGI.hudT -= dt;
  if (AGI.hudT > 0) return;
  AGI.hudT = 0.15;
  const pct = Math.floor(AGI.compile);
  $('agiPct').textContent = pct + '%';
  $('agiCompPct').textContent = pct + '%';
  $('agiCompFill').style.width = AGI.compile.toFixed(1) + '%';
  $('agiKills').textContent = AGI.kills;
  // Vida de compañeros (TÚ + aliados)
  if (AGI.humEls[0]) {
    const h = AGI.humEls[0];
    h.el.classList.toggle('dead', !!player.dead);
    const pct = player.dead ? 0 : Math.max(0, Math.min(100, (player.hp / (player.maxHp || 100)) * 100));
    h.fill.style.width = pct.toFixed(0) + '%';
    h.fill.style.background = pct > 50 ? '#3b82f6' : pct > 25 ? '#f5c542' : '#e5483b';
  }
  AGI.allies.forEach((a, i) => {
    const h = AGI.humEls[i + 1];
    if (!h) return;
    h.el.classList.toggle('dead', !a.alive);
    if (a.name) h.name.textContent = (a.name || 'ALIADO').slice(0, 8);
    const pct = !a.alive ? 0 : Math.max(0, Math.min(100, (a.hp / (a.maxHp || AGI_CFG.allyHp)) * 100));
    h.fill.style.width = pct.toFixed(0) + '%';
    h.fill.style.background = pct > 50 ? '#3b82f6' : pct > 25 ? '#f5c542' : '#e5483b';
  });
  let up = 0;
  for (const o of AGI.objs) {
    if (o.alive) up++;
    const r = AGI.rowEls[o.id];
    if (!r) continue;
    r.hp.textContent = Math.ceil(o.hp);
    r.fill.style.width = (o.hp / o.max * 100).toFixed(1) + '%';
    r.row.classList.toggle('dead', !o.alive);
    if (r.sub) r.sub.textContent = !o.alive ? 'DESTRUIDO' : 'FABRICANDO ROBOTS: +' + agiRate() + (o.shielded ? ' · ESCUDO ACTIVO' : '');
  }
  $('agiObjCount').textContent = up + '/' + AGI.objs.length + ' EN PIE';
  $('agiEvent').style.opacity = AGI.eventT > 0 ? '1' : '0';
}

function drawMinimapAgi() {
  mmEl.style.display = 'block';
  const W = mmEl.width, half = MAP.half || 40, s = W / (half * 2), X = x => (x + half) * s, Z = z => (z + half) * s;
  mmc.clearRect(0, 0, W, W);
  mmc.fillStyle = 'rgba(8,12,18,.78)'; mmc.fillRect(0, 0, W, W);
  for (const [cx, cz, w, d, h, , y0 = 0] of MAP.boxes) {
    if (y0 > 0) continue;
    mmc.fillStyle = h >= 2.5 ? '#b4bcc7' : '#69727e';
    mmc.fillRect(X(cx - w / 2), Z(cz - d / 2), Math.max(1, w * s), Math.max(1, d * s));
  }
  const px = player.pos.x, pz = player.pos.z;
  const dot = (x, z, color, r = 3) => { mmc.fillStyle = color; mmc.beginPath(); mmc.arc(X(x), Z(z), r, 0, 6.2832); mmc.fill(); };
  for (const o of AGI.objs) {
    const sz = o.core ? 9 : 6;
    mmc.fillStyle = !o.alive ? '#4b5058' : o.core ? '#b35cff' : '#ff9a2e';
    mmc.fillRect(X(o.x) - sz / 2, Z(o.z) - sz / 2, sz, sz);
  }
  for (const a of AGI.allies) if (a.alive) dot(a.pos.x, a.pos.z, '#3b82f6');
  for (const r of AGI.robots) if (r.alive && Math.hypot(r.pos.x - px, r.pos.z - pz) < 28) dot(r.pos.x, r.pos.z, '#ef4444');
  const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw), cx = X(px), cz = Z(pz);
  mmc.fillStyle = '#ffffff';
  mmc.beginPath();
  mmc.moveTo(cx + dx * 7, cz + dz * 7);
  mmc.lineTo(cx - dx * 4 - dz * 4, cz - dz * 4 + dx * 4);
  mmc.lineTo(cx - dx * 4 + dz * 4, cz - dz * 4 - dx * 4);
  mmc.closePath(); mmc.fill();
}

/* ---------- Brazos y manos en la vista en primera persona (estilo CS: se ve quién sostiene el arma) ---------- */
function addViewArms() {
  armSkinMat = new THREE.MeshStandardMaterial({ color: SKIN_TONES[cosTone] ?? SKIN_TONES[0], roughness: 0.55, metalness: 0.02 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f3a2e, roughness: 0.88, metalness: 0 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x1a1c18, roughness: 0.7, metalness: 0.05 });
  const limb = (group, A, B, thick, mat) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L = Math.hypot(dx, dy, dz) || 0.01;
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, L), mat);
    m.position.set((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.asin(Math.max(-1, Math.min(1, dy / L))), Math.atan2(dx, dz), 0);
    group.add(m);
    return m;
  };
  const arm = (group, H, elbowDx, elbowDz) => {
    // hombro → codo (manga) → antebrazo (piel) → mano (guante)
    const E = [H[0] + elbowDx, H[1] - 0.28, H[2] + elbowDz];
    const M = [(E[0] + H[0]) * 0.5, (E[1] + H[1]) * 0.5, (E[2] + H[2]) * 0.5];
    limb(group, E, M, 0.11, sleeve);
    limb(group, M, H, 0.085, armSkinMat);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.12), glove);
    hand.position.set(H[0], H[1], H[2]);
    group.add(hand);
    // dedos simples para que se note el agarre
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.06), glove);
    fingers.position.set(H[0], H[1] - 0.02, H[2] - 0.07);
    group.add(fingers);
  };
  const SPEC = {
    0: { rh: [0.0, -0.01, 0.18] },
    1: { rh: [0.0, -0.13, 0.08] },
    2: { rh: [0.0, -0.13, 0.15], lh: [0.0, -0.075, -0.15] },
    3: { rh: [0.0, -0.14, 0.12], lh: [0.0, -0.05, -0.28] },
    4: { rh: [0.0, -0.12, 0.18], lh: [0.0, -0.07, -0.15] },
    5: { rh: [0.0, -0.10, 0.10], lh: [0.0, -0.05, -0.25] },
    6: { rh: [0.04, -0.06, 0.02] }, 7: { rh: [0.04, -0.06, 0.02] }, 8: { rh: [0.04, -0.06, 0.02] },
  };
  for (const k of Object.keys(SPEC)) {
    const g = guns[k].group, sp = SPEC[k];
    if (sp.rh) arm(g, sp.rh, 0.14, 0.45);
    if (sp.lh) arm(g, sp.lh, -0.22, 0.5);
  }
}
addViewArms();
showGun();

/* ---------- Empezar la partida ---------- */
function startAgiNow() {
  try {
    for (const b of bots) scene.remove(b.g);
    bots.length = 0;
    loadMap('agi');
    resetKeys();
    initAudio();
    mode = 'agi';
    // myTeam ya elegido en team select
    updateRoomInfo();
    Object.assign(AGI, {
      over: false, win: false, t: 0, compile: 0, compileRate: 1, kills: 0, nodesDown: 0,
      prodT: 3, reinforceT: 25, eventT: 0, shieldMsgT: 0, endT: 0, endMsg: '',
    });
    AGI.robots.length = 0; AGI.allies.length = 0;
    for (let i = 0; i < WEAPONS.length; i++) owned[i] = true;
    guns[cur].group.visible = false;
    cur = 3;                                         // arranca con el M4A1
    agiPlacePlayer();
    // objetivos, navegación y unidades
    const def = MAP.agi;
    agiBuildObjective(def.core, true, 'core');
    for (const n of def.nodes) agiBuildObjective(n, false, n.id);
    agiBuildNav();
    for (let i = 0; i < AGI_CFG.allies; i++) {
      const nm = ALLY_NAMES[i % ALLY_NAMES.length];
      const g = makeCharacter(randomOp(0).id);
      g.add(makeTag('BOT ' + nm));
      const u = agiNewUnit('ally', 'BOT ' + nm, g, AGI_CFG.allyHp);
      AGI.allies.push(u);
      const s = def.spawnAllies ? def.spawnAllies[i] : MAP.teamSpawns[0][1 + i];
      agiSpawnUnit(u, s[0], s[1]);
    }
    for (let i = 0; i < AGI_CFG.startRobots; i++) agiSpawnRobot();
    AGI.active = true;
    reviveLocal();
    spawnMedkits();
    showGun();
    agiBuildHud();
    updateHud();
    agiEvent('OPERACIÓN AGI — DESTRUYE LOS 3 NODOS', 4);
    say('Destruye los 3 nodos y luego el Núcleo antes de que la IA se compile', 6);
    lockGame();
  } catch (err) {
    console.error('startAgi', err);
    say('Error al iniciar: ' + (err && err.message ? err.message : err), 5);
  }
}
$('btnAgi')?.addEventListener('click', () => openTeamSelect({ type: 'agi' }));

let last = performance.now(), menuT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (mode === 'menu') {                         // cámara cinemática de vista previa (estilo Krunker)
    menuT += dt * 0.08;
    const r = 20, h = 7.5 + Math.sin(menuT * 0.6) * 1.2;
    camera.position.set(Math.sin(menuT) * r, h, Math.cos(menuT) * r);
    camera.lookAt(0, 1.5, 0);
  } else if (locked) {
    updatePlayer(dt);
    if (mode === 'solo' || mode === 'practice') updateBots(dt);
    else if (mode === 'agi') updateAgi(dt);
  }
  updateRemotes(dt);
  netTick(dt);
  updateGun(dt);
  tickBombHold(dt);
  updateBombVisual();
  tickBombBeep(dt);
  updateNades(dt);
  tickPractice(dt);
  updateGroundGuns(dt);
  updateMedkits(dt);
  // Recuperación de recoil
  {
    const w = WEAPONS[cur];
    const rc = RECOIL[w?.id] || { recover: 5 };
    const k = Math.min(1, dt * rc.recover);
    recoilPitch *= (1 - k);
    recoilYaw *= (1 - k);
  }
  // Prompt de bomba
  {
    const pr = bombPrompt();
    if (pr) { msgEl.textContent = pr; msgT = 0.3; }
  }
  {
    const z = zoomed && WEAPONS[cur].zoom && mode !== 'menu' ? WEAPONS[cur].zoom : 1;
    const target = 75 / z;
    if (Math.abs(camera.fov - target) > 0.05) {
      camera.fov += (target - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
    $('scope').style.display = z > 1 ? 'block' : 'none';
    $('cross').style.display = z > 1 ? 'none' : 'block';
    for (let i = 0; i < guns.length; i++) if (i === cur) guns[i].group.visible = z === 1 && !player.dead && mode !== 'menu';
  }
  updateFx(dt);
  drawMinimap();
  agiHud(dt);
  updateRoundBar();
  $('shield').style.display = (performance.now() < shieldUntil && !player.dead && mode !== 'menu') ? 'block' : 'none';
  dmgFlash = Math.max(0, dmgFlash - dt * 1.4);
  dmgEl.style.opacity = dmgFlash;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
