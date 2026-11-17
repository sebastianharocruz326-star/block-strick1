// Datos compartidos entre el navegador (game.js) y el servidor (server.js).
// Así los dos usan EXACTAMENTE el mismo mapa y las mismas armas.

export const PLAYER = { radius: 0.4, height: 1.8, eye: 1.65, maxHp: 100, killHeal: 0, respawn: 0, step: 0.6 };
// killHeal 0 y respawn 0 = estilo CS: no curas al matar y no reapareces hasta la siguiente ronda

// Estadísticas de armas (estilo CS: preciso quieto, impreciso en movimiento)
// knife es el índice 0
export const WEAPONS = [
  { id: 'knife',   name: 'Cuchillo',     mag: 0,  rate: 0.50, auto: false, damage: 55, head: 1.7, pellets: 1, spread: 0,     reload: 0,   melee: true, price: 0 },
  { id: 'pistol',  name: 'Pistola',      mag: 12, rate: 0.18, auto: false, damage: 42, head: 2.3, pellets: 1, spread: 0.002, reload: 1.2, price: 0 },
  { id: 'smg',     name: 'Subfusil',     mag: 30, rate: 0.060,auto: true,  damage: 24, head: 2.0, pellets: 1, spread: 0.011, reload: 1.6, price: 1500 },
  { id: 'rifle',   name: 'M4A1',        mag: 30, rate: 0.090,auto: true,  damage: 36, head: 2.2, pellets: 1, spread: 0.003, reload: 1.9, price: 2700 },
  { id: 'shotgun', name: 'Escopeta',     mag: 7,  rate: 0.85, auto: false, damage: 20, head: 1.5, pellets: 9, spread: 0.052, reload: 2.4, price: 1800 },
  { id: 'sniper',  name: 'Francotirador',mag: 5,  rate: 1.30, auto: false, damage: 110,head: 2.2, pellets: 1, spread: 0.0005,reload: 2.9, price: 4750, zoom: 3.4 },
  // Granadas (se tiran, no se disparan)
  { id: 'he',      name: 'Granada HE',   mag: 1,  rate: 0.9,  auto: false, damage: 110,head: 1,   pellets: 1, spread: 0,     reload: 0,   grenade: true, gtype: 'he',    fuse: 1.6, radius: 6.0, price: 300 },
  { id: 'flash',   name: 'Flashbang',    mag: 1,  rate: 0.9,  auto: false, damage: 0,  head: 1,   pellets: 1, spread: 0,     reload: 0,   grenade: true, gtype: 'flash', fuse: 1.2, radius: 9,   price: 200 },
  { id: 'smoke',   name: 'Humo',         mag: 1,  rate: 0.9,  auto: false, damage: 0,  head: 1,   pellets: 1, spread: 0,     reload: 0,   grenade: true, gtype: 'smoke', fuse: 1.5, radius: 4.5, price: 300 },
];

// Economía estilo CS
export const ECO = {
  startMoney: 800,
  maxMoney: 16000,
  kill: 300,
  headshotBonus: 100,
  win: 3250,
  loss: 1400,
  lossStreakBonus: 500,   // +500 por derrota seguida (máx 3)
  plant: 300,
  defuse: 300,
  // Protección (tienda B)
  vestPrice: 650,         // chaleco → 100 de armadura
  helmetPrice: 350,       // casco → reduce headshots (requiere chaleco)
  vestHelmPrice: 1000,    // chaleco + casco juntos
  armorMax: 100,
};

// Partida: freeze + buy + play + break (estilo CS) + bomba
export const MATCH = {
  rounds: 12,             // mejor de 12 (como MR12 moderno)
  freezeSec: 6,           // freeze time (no te puedes mover)
  buySec: 12,             // tiempo de compra (incluye freeze)
  roundSec: 115,          // tiempo de ronda una vez empieza el combate
  breakSec: 7,
  finalSec: 12,
  // Bomba
  plantSec: 3.2,          // tiempo manteniendo E para plantar
  defuseSec: 5.0,         // tiempo manteniendo E para desactivar
  bombTimerSec: 40,       // cuenta atrás hasta la explosión
  bombRadius: 1.4,        // distancia al site / bomba para E
  attackerTeam: 1,        // Bravo planta (como T)
  defenderTeam: 0,        // Alpha defiende (como CT)
};

export const TEAMS = {
  0: { id: 0, name: 'Alfa',  color: 0x3b82f6, hex: '#3b82f6' }, // azul = defensores
  1: { id: 1, name: 'Bravo', color: 0xef4444, hex: '#ef4444' }, // rojo = atacantes (bomba)
};

// 8 operadores militares (0-3 Alfa, 4-7 Bravo). El jugador elige equipo; el personaje es aleatorio.
export const OPERATORS = [
  // === Equipo Alfa (moderno) ===
  { id: 0, team: 0, name: 'Sombra',   tag: 'SOM', primary: 0x0e0e12, accent: 0x1a1a20, detail: 0x2a2a30 },
  { id: 1, team: 0, name: 'Lince',    tag: 'LNX', primary: 0x3a5a3a, accent: 0x2a4a2a, detail: 0x1a2a1a },
  { id: 2, team: 0, name: 'Tormenta', tag: 'TRM', primary: 0x4a5a3a, accent: 0x6a7a4a, detail: 0x3a4a2a },
  { id: 3, team: 0, name: 'Roca',     tag: 'RCA', primary: 0x3a3e44, accent: 0x5a6068, detail: 0x2a2e34 },
  // === Equipo Bravo ===
  { id: 4, team: 1, name: 'Coronel Acero', tag: 'ACE', primary: 0x4a4a3a, accent: 0x6a6a4a, detail: 0xc9a84a },
  { id: 5, team: 1, name: 'Fantasma',      tag: 'FNT', primary: 0x5a6068, accent: 0x3a90c8, detail: 0x1a2a3a },
  { id: 6, team: 1, name: 'Víbora',        tag: 'VBR', primary: 0xb89a6a, accent: 0x8a6a3a, detail: 0x2a2a24 },
  { id: 7, team: 1, name: 'Cobra',         tag: 'CBR', primary: 0x6a1a1a, accent: 0xc03030, detail: 0x1a0a0a },
];
export function randomOp(team) {
  const pool = OPERATORS.filter(o => o.team === (team | 0));
  return pool[Math.floor(Math.random() * pool.length)] || OPERATORS[0];
}

// Recoil acumulativo por arma (estilo CS: sube al disparar seguido, se recupera al soltar)
// pattern = incremento de pitch por bala; recover = velocidad de recuperación /s
export const RECOIL = {
  knife:  { up: 0.00, side: 0.00, recover: 8 },
  pistol: { up: 0.028, side: 0.012, recover: 6 },
  smg:    { up: 0.018, side: 0.014, recover: 7 },
  rifle:  { up: 0.022, side: 0.010, recover: 5.5 },
  shotgun:{ up: 0.06,  side: 0.03,  recover: 4 },
  sniper: { up: 0.08,  side: 0.02,  recover: 3 },
  he:     { up: 0.00, side: 0.00, recover: 8 },
  flash:  { up: 0.00, side: 0.00, recover: 8 },
  smoke:  { up: 0.00, side: 0.00, recover: 8 },
};

const WALL = 0xc9b78d, CRATE = 0x9b6a3a, DARK = 0x6e6e6e, ROOF = 0x8a7a5a;
const CONC = 0x8d939b, SHELF = 0x4f6a86, ORANGE = 0xc27a2e, STEEL = 0x5a6068, YEL = 0xd4b02a;
const BRICK = 0xa65a47, STONE = 0xb4b0a6, PLAZA = 0xa89f91;
const BLUE = 0x2a6f9e, REDC = 0xa33a2a, GREENC = 0x3a7a4a, SAND = 0xc4a574;
const WHITE = 0xd8d4cc, BLACK = 0x2a2a2e, FENCE = 0x7a8088, CONE = 0xe07020;

function adder(b) { return (cx, cz, w, d, h, color, y0 = 0) => b.push([cx, cz, w, d, h, color, y0]); }
function perimeter(add, color, half = 58) {
  const span = half * 2 + 2;
  add(0, -half, span, 2.4, 8, color); add(0, half, span, 2.4, 8, color);
  add(-half, 0, 2.4, span - 4, 8, color); add(half, 0, 2.4, span - 4, 8, color);
}
/** Edificio hueco por el que se puede caminar. doors: 'n','s','e','w' o combinación 'ns' */
function openBuilding(add, cx, cz, w, d, h, color, doors = 's') {
  const t = 0.65;
  const gap = 2.4;
  const hw = w / 2, hd = d / 2;
  // suelo interior (alfombra / piso)
  add(cx, cz, w - t * 2, d - t * 2, 0.12, SAND);
  // techo
  add(cx, cz, w, d, 0.35, ROOF, h);
  // pared norte
  if (doors.includes('n')) {
    const side = (w - gap) / 2;
    add(cx - gap / 2 - side / 2, cz - hd + t / 2, side, t, h, color);
    add(cx + gap / 2 + side / 2, cz - hd + t / 2, side, t, h, color);
  } else {
    add(cx, cz - hd + t / 2, w, t, h, color);
  }
  // pared sur
  if (doors.includes('s')) {
    const side = (w - gap) / 2;
    add(cx - gap / 2 - side / 2, cz + hd - t / 2, side, t, h, color);
    add(cx + gap / 2 + side / 2, cz + hd - t / 2, side, t, h, color);
  } else {
    add(cx, cz + hd - t / 2, w, t, h, color);
  }
  // pared oeste
  if (doors.includes('w')) {
    const side = (d - gap) / 2;
    add(cx - hw + t / 2, cz - gap / 2 - side / 2, t, side, h, color);
    add(cx - hw + t / 2, cz + gap / 2 + side / 2, t, side, h, color);
  } else {
    add(cx - hw + t / 2, cz, t, d - t * 2, h, color);
  }
  // pared este
  if (doors.includes('e')) {
    const side = (d - gap) / 2;
    add(cx + hw - t / 2, cz - gap / 2 - side / 2, t, side, h, color);
    add(cx + hw - t / 2, cz + gap / 2 + side / 2, t, side, h, color);
  } else {
    add(cx + hw - t / 2, cz, t, d - t * 2, h, color);
  }
}
/** Base de equipo: plataforma + arcos + bandera de color */
function teamBase(add, cx, cz, teamColor, face = 1) {
  // plataforma
  add(cx, cz, 16, 12, 0.35, CONC);
  // muros laterales bajos
  add(cx - 7.5, cz, 0.6, 10, 1.6, teamColor);
  add(cx + 7.5, cz, 0.6, 10, 1.6, teamColor);
  // fondo
  add(cx, cz - face * 5.5, 16, 0.7, 2.2, teamColor);
  // torre / bandera
  add(cx, cz - face * 4.5, 0.5, 0.5, 5.5, STEEL);
  add(cx + 0.6, cz - face * 4.5, 1.4, 0.15, 0.9, teamColor, 4.2);
  // cajas de suministro
  crateStack(add, cx - 4, cz + face * 2, 2);
  crateStack(add, cx + 4, cz + face * 2, 2);
  // coberturas
  add(cx - 5, cz + face * 4, 3, 0.6, 1.3, DARK);
  add(cx + 5, cz + face * 4, 3, 0.6, 1.3, DARK);
}
// Contenedor de carga estilo Krunker
function container(add, cx, cz, color, rot = 0) {
  if (rot) {
    add(cx, cz, 2.6, 6.2, 2.6, color);
    add(cx, cz, 2.4, 6.0, 0.15, DARK, 2.6);
  } else {
    add(cx, cz, 6.2, 2.6, 2.6, color);
    add(cx, cz, 6.0, 2.4, 0.15, DARK, 2.6);
  }
}
// Pila de cajas
function crateStack(add, cx, cz, n = 2) {
  for (let i = 0; i < n; i++) add(cx + (i % 2) * 0.15, cz + (i % 2) * 0.1, 1.8, 1.8, 1.1, CRATE, i * 1.1);
}
// Cono de tráfico
function cone(add, cx, cz) {
  add(cx, cz, 0.35, 0.35, 0.7, CONE);
  add(cx, cz, 0.5, 0.5, 0.08, WHITE);
}

// cada caja: [centroX, centroZ, ancho, profundo, alto, color, y0]
function dustBoxes() {
  // Dust II inspirado: piedra beige, arcos, torres, sitios A/B con cajas
  const b = [], add = adder(b);
  const HALF = 72;
  const ST = STONE, SD = SAND, BR = BRICK, DK = DARK, CR = CRATE, RF = ROOF;
  const ST2 = 0xc8b898, ST3 = 0xa89070, ARCH = 0xb8a888;

  perimeter(add, ST, HALF);

  // ===== TORRES DE ESQUINA (estilo medina) =====
  for (const [tx, tz] of [[-60, -60], [60, -60], [-60, 60], [60, 60]]) {
    add(tx, tz, 5, 5, 9, ST);
    add(tx, tz, 5.4, 5.4, 0.5, RF, 9);
    // ventanas
    add(tx, tz + 2.3, 1.2, 0.3, 1.4, DK, 5);
    add(tx, tz - 2.3, 1.2, 0.3, 1.4, DK, 5);
  }

  // ===== BASE T (sur / Bravo) — spawn atacantes =====
  openBuilding(add, 0, -58, 22, 14, 4.5, ST, 'n');
  openBuilding(add, -18, -55, 12, 10, 4, ST2, 'ne');
  openBuilding(add, 18, -55, 12, 10, 4, ST2, 'nw');
  add(0, -50, 8, 0.8, 1.5, DK);
  crateStack(add, -8, -52, 2);
  crateStack(add, 8, -52, 2);

  // ===== BASE CT (norte / Alpha) — spawn defensores =====
  openBuilding(add, 0, 58, 22, 14, 4.5, ST, 's');
  openBuilding(add, -18, 55, 12, 10, 4, ST2, 'se');
  openBuilding(add, 18, 55, 12, 10, 4, ST2, 'sw');
  add(0, 50, 8, 0.8, 1.5, DK);

  // ===== MID — pasillo central largo con arcos =====
  // muros laterales del mid
  add(-8, 0, 1.2, 36, 4.2, ST);
  add(8, 0, 1.2, 36, 4.2, ST);
  // arcos / puentes sobre mid
  add(0, 12, 18, 2.2, 0.6, ARCH, 3.6);
  add(0, -12, 18, 2.2, 0.6, ARCH, 3.6);
  add(0, 0, 18, 2.2, 0.6, ARCH, 3.8);
  // pilares de los arcos
  for (const z of [-12, 0, 12]) {
    add(-8, z, 1.6, 1.6, 3.8, ST3);
    add(8, z, 1.6, 1.6, 3.8, ST3);
  }
  // cobertura mid
  add(0, 6, 3, 1.2, 1.3, DK);
  add(0, -6, 3, 1.2, 1.3, DK);
  crateStack(add, -4, 0, 2);
  crateStack(add, 4, 0, 2);

  // ===== LONG A (lado este hacia site A) =====
  openBuilding(add, 32, 8, 16, 12, 4.2, ST, 'ws');
  openBuilding(add, 38, -10, 14, 12, 4, ST2, 'wn');
  // muro largo
  add(48, 0, 1.4, 40, 4.5, ST);
  add(42, 20, 12, 1.4, 4, ST);
  // rampas / escalones hacia A
  for (let i = 0; i < 5; i++) add(28 + i * 1.2, 28, 1.4, 6, 0.35 * (i + 1), ST3);

  // ===== SITE A (NE) — plaza con cajas =====
  openBuilding(add, 42, 38, 18, 16, 4.5, ST, 'sw');
  // torre del site A
  add(50, 48, 6, 6, 10, ST);
  add(50, 48, 6.5, 6.5, 0.5, RF, 10);
  add(50, 48, 1.5, 1.5, 1.2, DK, 5.5); // ventana
  // plataforma del site
  add(42, 36, 10, 8, 0.25, SD);
  // cajas del bomb site
  crateStack(add, 38, 34, 3);
  crateStack(add, 44, 32, 2);
  crateStack(add, 40, 40, 2);
  crateStack(add, 46, 38, 2);
  add(42, 36, 2.2, 2.2, 1.1, CR);
  add(36, 38, 2.5, 1.4, 1.1, CR);
  // marca A (bloques rojos)
  add(42, 36, 1.8, 0.25, 0.08, REDC, 0.3);
  add(42, 36, 0.25, 1.8, 0.08, REDC, 0.3);

  // ===== LONG B / tunnels (lado oeste hacia site B) =====
  openBuilding(add, -32, -8, 16, 12, 4.2, ST, 'en');
  openBuilding(add, -38, 10, 14, 12, 4, ST2, 'es');
  add(-48, 0, 1.4, 40, 4.5, ST);
  add(-42, -20, 12, 1.4, 4, ST);
  for (let i = 0; i < 5; i++) add(-28 - i * 1.2, -28, 1.4, 6, 0.35 * (i + 1), ST3);

  // ===== SITE B (SO) =====
  openBuilding(add, -42, -38, 18, 16, 4.5, ST, 'ne');
  add(-50, -48, 6, 6, 10, ST);
  add(-50, -48, 6.5, 6.5, 0.5, RF, 10);
  add(-42, -36, 10, 8, 0.25, SD);
  crateStack(add, -38, -34, 3);
  crateStack(add, -44, -32, 2);
  crateStack(add, -40, -40, 2);
  crateStack(add, -46, -38, 2);
  add(-42, -36, 2.2, 2.2, 1.1, CR);
  add(-36, -38, 2.5, 1.4, 1.1, CR);
  add(-42, -36, 1.8, 0.25, 0.08, REDC, 0.3);
  add(-42, -36, 0.25, 1.8, 0.08, REDC, 0.3);

  // ===== EDIFICIOS LATERALES (casas de la medina) =====
  openBuilding(add, -22, 28, 12, 10, 4, ST2, 'se');
  openBuilding(add, 22, -28, 12, 10, 4, ST2, 'nw');
  openBuilding(add, -22, -20, 10, 10, 3.8, ST, 'ne');
  openBuilding(add, 22, 20, 10, 10, 3.8, ST, 'sw');

  // ===== CONTENEDORES Y COBERTURA =====
  container(add, 16, -40, 0xc45a2a);
  container(add, -16, 40, 0x3a6a4a);
  container(add, 0, 32, STEEL, 1);
  container(add, 0, -32, 0x2a5a8a, 1);
  container(add, 28, -48, ORANGE);
  container(add, -28, 48, BLUE);

  // muros bajos de cobertura
  add(-14, 16, 8, 0.8, 1.4, DK);
  add(14, -16, 8, 0.8, 1.4, DK);
  add(-30, 0, 0.8, 10, 1.4, DK);
  add(30, 0, 0.8, 10, 1.4, DK);

  // "palmeras" (troncos + copa bloque)
  for (const [px, pz] of [[-55, 20], [55, -20], [-50, -30], [50, 30], [-12, 48], [12, -48]]) {
    add(px, pz, 0.5, 0.5, 4.5, 0x5a3a18);
    add(px, pz, 2.2, 2.2, 1.2, 0x2d6a3e, 4.2);
  }

  // cajas sueltas mid
  crateStack(add, 12, 12, 2);
  crateStack(add, -12, -12, 2);
  crateStack(add, 20, 0, 2);
  crateStack(add, -20, 0, 2);

  return b;
}

// Almacén: estilo industrial Krunker
function warehouseBoxes() {
  // Office / industrial CS: concreto, metal, contenedores, pasarelas, escaleras
  const b = [], add = adder(b);
  const HALF = 52;
  const METAL = 0x6a7078, METAL2 = 0x4a5058, CONC2 = 0x9aa0a8, FLOOR = 0x7a8088;
  perimeter(add, CONC, HALF);

  // ===== Nave principal (pasillo central) =====
  // muros de chapa ondulada (bloques verticales)
  for (const x of [-14, 14]) {
    for (let z = -30; z <= 30; z += 4) {
      add(x, z, 0.5, 3.6, 5.5, METAL);
    }
  }
  // techo / vigas
  for (let z = -28; z <= 28; z += 8) {
    add(0, z, 30, 0.8, 0.5, METAL2, 5.5);
  }

  // ===== Contenedores rojos (como en CS) =====
  container(add, -22, -8, 0xb33a2a);
  container(add, -22, -12, 0xb33a2a);
  container(add, 22, 8, 0xb33a2a, 1);
  container(add, 22, 14, ORANGE, 1);
  container(add, 0, 18, STEEL);
  container(add, 0, -18, BLUE, 1);

  // ===== Pasarela elevada con "escalera" =====
  add(0, 28, 24, 5, 0.35, METAL2, 3.2);  // plataforma
  for (let i = 0; i < 8; i++) {
    add(-10 + i * 0.9, 24, 1.0, 3.5, 0.4 * (i + 1), CONC2);
  }
  // barandilla
  add(0, 30.2, 24, 0.25, 1.1, YEL, 3.2);
  add(-11.8, 28, 0.25, 5, 1.1, YEL, 3.2);
  add(11.8, 28, 0.25, 5, 1.1, YEL, 3.2);

  // pasarela sur
  add(0, -28, 24, 5, 0.35, METAL2, 3.2);
  for (let i = 0; i < 8; i++) {
    add(10 - i * 0.9, -24, 1.0, 3.5, 0.4 * (i + 1), CONC2);
  }
  add(0, -30.2, 24, 0.25, 1.1, YEL, 3.2);

  // ===== Oficinas / salas laterales =====
  openBuilding(add, -30, 20, 14, 12, 4, WHITE, 'e');
  openBuilding(add, 30, -20, 14, 12, 4, WHITE, 'w');
  openBuilding(add, -30, -20, 12, 10, 3.8, CONC2, 'e');
  openBuilding(add, 30, 20, 12, 10, 3.8, CONC2, 'w');

  // ventanas (bloques claros)
  add(-24, 20, 0.3, 2, 1.6, 0x88b8d8, 1.5);
  add(24, -20, 0.3, 2, 1.6, 0x88b8d8, 1.5);

  // ===== Estanterías industriales =====
  for (const sx of [-1, 1]) {
    add(sx * 8, 0, 1.2, 16, 3.5, SHELF);
    add(sx * 8, 0, 1.0, 15.5, 0.2, DARK, 3.5);
    add(sx * 8, 0, 1.0, 15.5, 0.15, DARK, 1.7);
  }

  // ===== Pilares =====
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(sx * 6, sz * 10, 1.4, 1.4, 6, CONC);
  }

  // ===== Cajas y cobertura =====
  crateStack(add, -16, 6, 3);
  crateStack(add, 16, -6, 3);
  crateStack(add, -10, -14, 2);
  crateStack(add, 10, 14, 2);
  crateStack(add, -26, 0, 2);
  crateStack(add, 26, 0, 2);
  add(0, 8, 4, 1.0, 1.3, DARK);
  add(0, -8, 4, 1.0, 1.3, DARK);
  add(10, 0, 1.0, 5, 1.3, DARK);
  add(-10, 0, 1.0, 5, 1.3, DARK);

  // props
  cone(add, -4, 4); cone(add, 4, -4); cone(add, 16, 16); cone(add, -16, -16);
  add(18, -28, 3.2, 1.5, 1.2, WHITE); // furgoneta

  return b;
}

function crossBoxes() {
  const b = [], add = adder(b);
  perimeter(add, PLAZA);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(sx * 19, sz * 19, 12, 12, 4, BRICK);
    for (let i = 0; i < 7; i++) add(sx * 16.5, sz * (6.5 + i), 3, 1, 0.5 * (i + 1), STONE);
    add(sx * 13.25, sz * 19, 0.5, 10, 1, DARK, 4);
    add(sx * 21.5, sz * 13.25, 5, 0.5, 1, DARK, 4);
    // antenas / AC en azotea
    add(sx * 19, sz * 19, 0.4, 0.4, 1.5, DARK, 4);
    add(sx * 17, sz * 21, 1.5, 1.0, 0.8, STEEL, 4);
  }
  // fuente central
  add(0, 0, 6, 6, 1, STONE); add(0, 0, 2, 2, 3, BRICK, 1);
  add(0, 0, 3.5, 3.5, 0.3, 0x4a90c8, 1); // agua
  // cajas y contenedores en calles
  crateStack(add, 8, 4, 2); crateStack(add, -8, -4, 2);
  crateStack(add, 4, -8, 2); crateStack(add, -4, 8, 2);
  container(add, 0, 14, BLUE); container(add, 0, -14, REDC);
  container(add, 14, 0, GREENC, 1); container(add, -14, 0, ORANGE, 1);
  // muros de cobertura en cruces
  add(0, 28, 10, 0.8, 1.5, DARK); add(0, -28, 10, 0.8, 1.5, DARK);
  add(28, 0, 0.8, 10, 1.5, DARK); add(-28, 0, 0.8, 10, 1.5, DARK);
  add(8, 8, 3, 0.6, 1.2, FENCE); add(-8, -8, 3, 0.6, 1.2, FENCE);
  cone(add, 10, 0); cone(add, -10, 0); cone(add, 0, 10); cone(add, 0, -10);
  // banco / props
  add(6, -6, 2.2, 0.6, 0.5, CRATE); add(-6, 6, 0.6, 2.2, 0.5, CRATE);
  return b;
}


// Complejo AGI: arena de concreto con baldosas. Sirve para todos los modos y es el mapa de «Operación AGI»
// (3 nodos + Núcleo Principal; los robots salen del norte, los humanos del sur).
const CONC_L = 0x9ba1a9, CONC_D = 0x6c727a, PILL = 0x7f858d, CONT_A = 0x4a5f78, CONT_B = 0x7a5646;
function agiBoxes() {
  // Complejo AGI ampliado: pasillos largos y edificios grandes (estilo CS)
  const b = [], add = adder(b);
  const mir = (cx, cz, w, d, h, c, y0 = 0) => { add(cx, cz, w, d, h, c, y0); if (cx !== 0) add(-cx, cz, w, d, h, c, y0); };
  const HALF = 70;
  perimeter(add, CONC_L, HALF);

  // ===== CÁMARA DEL NÚCLEO (norte, zona enemiga) =====
  // muro frontal con abertura
  mir(22, -42, 28, 1.4, 6, CONC_L);
  mir(12, -52, 2.2, 2.2, 7, PILL);
  mir(28, -56, 2.2, 2.2, 7, PILL);
  mir(8, -46, 4, 1.2, 1.5, CONC_D);
  mir(18, -62, 14, 1.4, 2.5, STEEL);
  // edificio largo del núcleo (cobertura lateral)
  openBuilding(add, 0, -55, 16, 14, 5, CONC_L, 's');
  mir(35, -50, 1.4, 18, 4, CONC_L);

  // ===== NODOS ALFA / BETA (flancos) =====
  mir(48, -18, 10, 1.4, 1.6, CONC_D);
  mir(40, -28, 1.4, 10, 1.6, CONC_D);
  openBuilding(add, -48, -22, 14, 12, 4.5, CONC_L, 'e');
  openBuilding(add, 48, -22, 14, 12, 4.5, CONC_L, 'w');
  mir(42, -8, 2, 2, 5.5, PILL);
  mir(55, -30, 2, 2, 5.5, PILL);

  // pasillo central largo (N-S)
  add(0, -28, 2.4, 2.4, 5.5, PILL);
  mir(10, -26, 2, 2, 5.5, PILL);
  add(0, -20, 6, 1, 1.4, CONC_D);
  mir(22, -14, 22, 1.4, 5, CONC_L);
  mir(8, -6, 1.4, 10, 1.5, CONC_D);

  // ===== ZONA CENTRAL (nodo Gamma) =====
  openBuilding(add, 0, 8, 18, 14, 4.2, CONC_L, 'ns');
  mir(12, 6, 1.4, 8, 1.5, CONC_D);
  container(add, -28, 8, CONT_A);
  container(add, 28, 6, CONT_B);
  mir(20, 16, 4, 4, 2.5, STEEL);
  mir(36, 18, 2, 2, 5.5, PILL);
  mir(48, 0, 1.4, 14, 1.5, CONC_D);

  // pasillos laterales largos
  mir(55, 10, 1.4, 24, 3.5, CONC_L);
  mir(30, 28, 20, 1.4, 3.5, CONC_L);
  openBuilding(add, -40, 20, 12, 10, 4, CONC_L, 'se');
  openBuilding(add, 40, 20, 12, 10, 4, CONC_L, 'sw');

  // ===== BASE HUMANA (sur) =====
  mir(22, 48, 1.4, 22, 4, CONC_L);
  mir(10, 38, 6, 1.2, 1.5, CONC_D);
  add(0, 32, 5, 1.2, 1.5, CONC_D);
  openBuilding(add, 0, 55, 20, 12, 4.5, CONC_L, 'n');
  openBuilding(add, -30, 50, 12, 10, 4, CONC_L, 'ne');
  openBuilding(add, 30, 50, 12, 10, 4, CONC_L, 'nw');
  container(add, -40, 42, CONT_B);
  container(add, 40, 42, CONT_A);
  crateStack(add, -16, 58, 2); crateStack(add, 16, 58, 2);
  crateStack(add, -8, 50, 2); crateStack(add, 8, 50, 2);

  // cobertura mid extra
  mir(18, -38, 3, 3, 1.8, STEEL);
  mir(25, 0, 1.2, 6, 1.4, CONC_D);
  return b;
}

export const MAPS = {
  dust: {
    name: 'Dust II Blocks', sky: 0xb8d4f0, ground: 0xc4a574,
    // Alpha CT = norte, Bravo T = sur — layout inspirado en Dust II
    teamSpawns: {
      0: [[0, 58], [-10, 55], [10, 55], [-18, 52], [18, 52], [0, 52]],
      1: [[0, -58], [-10, -55], [10, -55], [-18, -52], [18, -52], [0, -52]],
    },
    sites: { A: [42, 36, 5], B: [-42, -36, 5] },
    spawns: [[0, 58], [0, -58], [-18, 52], [18, -52], [40, 34], [-40, -34]],
    waypoints: [
      [0, 55], [0, -55], [0, 0], [0, 20], [0, -20],
      [32, 8], [-32, -8], [38, -10], [-38, 10],
      [42, 36], [-42, -36], [48, 0], [-48, 0],
      [22, 20], [-22, -20], [16, -40], [-16, 40],
      [12, 12], [-12, -12], [28, 28], [-28, -28],
    ],
    boxes: dustBoxes(),
  },
  almacen: {
    name: 'Office Blocks', sky: 0x8a9aa8, ground: 0x6a7078,
    teamSpawns: {
      0: [[-32, -36], [32, -36], [0, -28], [-22, -32], [22, -32], [0, -36]],
      1: [[-32, 36], [0, 36], [32, 36], [-22, 32], [22, 32], [0, 26]],
    },
    sites: { A: [0, -34, 4.5], B: [0, 16, 4] },
    spawns: [[-32, -36], [32, -36], [-32, 36], [0, 36], [32, 36], [0, -28]],
    waypoints: [
      [-32, -28], [32, -28], [-8, -26], [8, -26], [0, -18], [-18, -8], [18, -8], [-18, 0], [18, 0],
      [0, -6], [0, 6], [-18, 8], [18, 8], [0, 16], [-34, 14], [34, -14], [-34, 34], [0, 30],
      [34, 34], [-8, 28], [8, 28], [-34, -20], [34, 20], [0, -34],
    ],
    boxes: warehouseBoxes(),
  },
  cruce: {
    name: 'Plaza Cruz', sky: 0x90c0e8, ground: 0x9a8f78,
    teamSpawns: {
      0: [[0, 34], [34, 0], [36, 36], [-36, 36], [14, 34], [-14, 34]],
      1: [[0, -34], [-34, 0], [36, -36], [-36, -36], [14, -34], [-14, -34]],
    },
    sites: { A: [26, 26, 4], B: [-26, -26, 4] },
    spawns: [[0, 34], [0, -34], [34, 0], [-34, 0], [36, 36], [-36, -36]],
    waypoints: [
      [0, 28], [0, -28], [28, 0], [-28, 0], [0, 14], [0, -14], [14, 0], [-14, 0],
      [14, 14], [-14, -14], [14, -14], [-14, 14], [36, 28], [36, -28], [-36, 28], [-36, -28],
      [28, 36], [-28, 36], [28, -36], [-28, -36], [26, 26], [-26, -26],
    ],
    boxes: crossBoxes(),
  },
  agi: {
    name: 'Complejo AGI', sky: 0xbfd3e6, ground: 0xb7c3cf, style: 'concrete', floor: 'tiles', half: 70,
    // Alpha = humanos (sur, azul), Bravo = norte (rojo)
    teamSpawns: {
      0: [[0, 55], [-8, 52], [8, 52], [-16, 50], [16, 50], [0, 48]],
      1: [[-16, -55], [16, -55], [-36, -48], [36, -48], [0, -42], [-48, -38]],
    },
    sites: { A: [-36, -22, 5], B: [36, -22, 5] },
    spawns: [[0, 55], [-8, 52], [-16, -55], [16, -55], [-36, -48], [36, -48]],
    waypoints: [
      [0, 55], [-20, 50], [20, 50], [0, 40], [-30, 40], [30, 40],
      [0, 20], [-25, 20], [25, 20], [-40, 15], [40, 15],
      [0, 5], [-15, 5], [15, 5], [-40, 0], [40, 0],
      [0, -10], [-20, -12], [20, -12], [-45, -18], [45, -18],
      [0, -25], [-30, -28], [30, -28], [-48, -35], [48, -35],
      [0, -40], [-20, -45], [20, -45], [0, -52], [-35, -50], [35, -50],
    ],
    robotSpawns: [[-16, -55], [16, -55], [-36, -48], [36, -48], [-48, -38], [48, -38], [0, -42]],
    agi: {
      core: { x: 0, z: -52, hp: 6000 },
      nodes: [
        { id: 'alfa', name: 'Nodo Alfa', x: -48, z: -22, hp: 2000 },
        { id: 'beta', name: 'Nodo Beta', x: 48, z: -22, hp: 2000 },
        { id: 'gamma', name: 'Nodo Gamma', x: 0, z: 8, hp: 2000 },
      ],
    },
    boxes: agiBoxes(),
  },
};
export const MAP_KEYS = Object.keys(MAPS);

// list = [{ id, name, team, rk, rd, wins, kills, deaths, money }]
export function roundResult(list) {
  // Ahora se resuelve por equipos: gana el equipo que eliminó al otro o el que más kills de equipo tenga
  const teams = { 0: { kills: 0, alive: 0, players: [] }, 1: { kills: 0, alive: 0, players: [] } };
  for (const p of list) {
    if (p.team !== 0 && p.team !== 1) continue;
    teams[p.team].kills += p.rk;
    teams[p.team].players.push(p);
  }
  // alive se calcula en el servidor al final de ronda
  return { teams, rows: [...list].sort((a, b) => b.rk - a.rk || a.rd - b.rd) };
}

export function finalStandings(list) {
  return [...list].sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.deaths - b.deaths);
}

export function boxesToSolids(boxes) {
  return boxes.map(([cx, cz, w, d, h, , y0 = 0]) => (
    { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 }
  ));
}

// Rayo contra una caja alineada a los ejes. Devuelve la distancia o -1 si no la toca.
export function rayAABB(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// Elige el punto de aparición más lejos de los demás jugadores. others = [{x, z}]
export function pickSpawn(spawns, others) {
  let best = spawns[0], bestD = -1;
  for (const s of spawns) {
    let md = 1e9;
    for (const o of others) md = Math.min(md, Math.hypot(s[0] - o.x, s[1] - o.z));
    if (md > bestD) { bestD = md; best = s; }
  }
  return best;
}

export function pickTeamSpawn(mapKey, team, others) {
  const map = MAPS[mapKey];
  const list = (map.teamSpawns && map.teamSpawns[team]) || map.spawns;
  return pickSpawn(list, others);
}
