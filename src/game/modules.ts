// Sistem habitat modular: modul yang bisa dipasang/dilepas, interior & eksterior dibangun dari definisi yang sama.
// Dipakai untuk Basecamp (di permukaan planet) dan Stasiun Antariksa (di orbit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Body } from './body';
import { FxSet } from './effects';

export const CELL = 6; // sel modul 6 m x 6 m
export const DOCK_GAP = 5.45; // jarak hatch kapal dari kerah dermaga saat tersandar (pipa teleskopik)
export const MOD_H = 3; // tinggi lantai-langit
const BODY_HALF = 2.5; // setengah lebar badan eksterior
const DOOR_W = 1.7;

// Sisi: 0=U(-z) 1=T(+x) 2=S(+z) 3=B(-x)
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const opp = (s: number) => (s + 2) % 4;
export const SIDE_NAMES = ['Utara', 'Timur', 'Selatan', 'Barat'];

export type ModType = 'hub' | 'corridor' | 'airlock' | 'dock' | 'hab' | 'lab' | 'greenhouse' | 'power' | 'storage' | 'garage' | 'comms';

export interface ModDef {
  type: ModType;
  name: string;
  ports: [boolean, boolean, boolean, boolean]; // port lokal U,T,S,B
  cost: number;
  use: number; // konsumsi daya
  gen: number; // pembangkitan daya (konstan)
  solar: number; // pembangkitan surya (dipengaruhi jarak Matahari & badai)
  color: number;
  icon: string;
  desc: string;
}

export const MOD_DEFS: Record<ModType, ModDef> = {
  hub: { type: 'hub', name: 'Hub Inti', ports: [true, true, true, true], cost: 100, use: 2, gen: 0, solar: 0, color: 0x45e3ff, icon: '⬢', desc: 'Simpul 4 arah dengan Konsol Modul untuk membangun/melepas.' },
  corridor: { type: 'corridor', name: 'Koridor', ports: [true, false, true, false], cost: 30, use: 0.5, gen: 0, solar: 0, color: 0xb4bcc6, icon: '═', desc: 'Lorong penghubung lurus antar modul.' },
  airlock: { type: 'airlock', name: 'Airlock', ports: [false, false, true, false], cost: 60, use: 1, gen: 0, solar: 0, color: 0xff6a40, icon: '⇥', desc: 'Pintu keluar-masuk EVA dengan loker baju antariksa.' },
  dock: { type: 'dock', name: 'Dermaga Sandar', ports: [false, false, true, false], cost: 110, use: 1, gen: 0, solar: 0, color: 0xffb030, icon: '⏏', desc: 'Kerah sandar untuk kapal; tembus langsung ke kapal Anda.' },
  hab: { type: 'hab', name: 'Hunian', ports: [true, false, true, false], cost: 120, use: 2, gen: 0, solar: 0, color: 0x7aa2ff, icon: '▭', desc: 'Kamar tidur kru. Istirahat memulihkan baju & oksigen.' },
  lab: { type: 'lab', name: 'Laboratorium', ports: [true, false, true, true], cost: 150, use: 4, gen: 0, solar: 0, color: 0x40ff90, icon: '⚗', desc: 'Menganalisis sampel batuan, es, dan kehidupan.' },
  greenhouse: { type: 'greenhouse', name: 'Rumah Kaca', ports: [true, false, true, false], cost: 140, use: 3, gen: 0, solar: 0, color: 0xc060ff, icon: '❀', desc: 'Menumbuhkan tanaman; menyegarkan udara & menambah kredit.' },
  power: { type: 'power', name: 'Pembangkit Daya', ports: [false, false, true, false], cost: 100, use: 0, gen: 4, solar: 9, color: 0xffd060, icon: '⚡', desc: 'Reaktor mini + panel surya. Daya surya turun saat badai debu & jauh dari Matahari.' },
  storage: { type: 'storage', name: 'Gudang', ports: [true, false, true, false], cost: 60, use: 0.5, gen: 0, solar: 0, color: 0xd9692a, icon: '▦', desc: 'Perbekalan; isi ulang oksigen & baju.' },
  garage: { type: 'garage', name: 'Garasi Rover', ports: [false, false, true, false], cost: 130, use: 2, gen: 0, solar: 0, color: 0xff9a3c, icon: '⛟', desc: 'Menyimpan Rover Jelajah dan memanggilnya keluar.' },
  comms: { type: 'comms', name: 'Komunikasi', ports: [false, false, true, false], cost: 90, use: 2, gen: 0, solar: 0, color: 0x66b8ff, icon: '📡', desc: 'Antena jarak jauh; terhubung ke Pusat Misi.' },
};
export const BUILD_ORDER: ModType[] = ['corridor', 'hub', 'airlock', 'dock', 'hab', 'lab', 'greenhouse', 'power', 'storage', 'garage', 'comms'];

export interface PlacedMod { key: string; ix: number; iz: number; type: ModType; rot: number }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface InterSpot { x: number; z: number; r: number; text: string; action: string }
export interface Interact { text: string; action: string; mod: PlacedMod }
export interface AttachSlot { anchor: string; side: number; ix: number; iz: number }

export const keyOf = (ix: number, iz: number) => `${ix},${iz}`;

// ------------------------------------------------------------------ material & batch
const matCache = new Map<string, THREE.Material>();
const L = (c: number) => {
  const k = 'L' + c;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); matCache.set(k, m); }
  return m;
};
const E = (c: number, op = 1) => {
  const k = 'E' + c + '_' + op;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: op < 1, opacity: op, depthWrite: op >= 1 }); matCache.set(k, m); }
  return m;
};
const ST = (c: number, metal = 0.5, rough = 0.5, emissive = 0) => {
  const k = 'S' + c + '_' + metal + '_' + rough + '_' + emissive;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, emissive }); matCache.set(k, m); }
  return m;
};
const GLASS_I = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
const GLASS_E = new THREE.MeshStandardMaterial({ color: 0x9fe0c0, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });

class Batch {
  private map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmp = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private push(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, r?: [number, number, number], sc?: [number, number, number]) {
    this.e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    if (sc) this.s.set(sc[0], sc[1], sc[2]); else this.s.set(1, 1, 1);
    this.tmp.compose(this.p, this.q, this.s);
    g.applyMatrix4(this.tmp);
    let a = this.map.get(m);
    if (!a) { a = []; this.map.set(m, a); }
    a.push(g);
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, r?: [number, number, number]) {
    this.push(new THREE.BoxGeometry(w, h, d), m, x, y, z, r);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, m: THREE.Material, r?: [number, number, number], seg = 12) {
    this.push(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, r);
  }
  sph(rad: number, x: number, y: number, z: number, m: THREE.Material, seg = 10, sc?: [number, number, number]) {
    this.push(new THREE.SphereGeometry(rad, seg, Math.max(6, seg - 2)), m, x, y, z, undefined, sc);
  }
  dome(rad: number, x: number, y: number, z: number, m: THREE.Material, seg = 16, sc?: [number, number, number]) {
    this.push(new THREE.SphereGeometry(rad, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z, undefined, sc);
  }
  plane(w: number, h: number, x: number, y: number, z: number, ry: number, m: THREE.Material) {
    this.push(new THREE.PlaneGeometry(w, h), m, x, y, z, [0, ry, 0]);
  }
  torus(rad: number, tube: number, x: number, y: number, z: number, m: THREE.Material, r?: [number, number, number], seg = 20) {
    this.push(new THREE.TorusGeometry(rad, tube, 8, seg), m, x, y, z, r);
  }
  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [m, geos] of this.map) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const me = new THREE.Mesh(merged, m);
      if ((m as THREE.MeshBasicMaterial).transparent) me.renderOrder = 2;
      me.frustumCulled = false;
      g.add(me);
      if (geos.length > 1) for (const x of geos) x.dispose();
    }
    return g;
  }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry) m.geometry.dispose();
  });
}

// ------------------------------------------------------------------ builder: INTERIOR
interface IntOut { group: THREE.Group; rects: Rect[]; spots: InterSpot[] }

// lokasi di dinding sisi s (lokal), lateral lat, tinggi y, kedalaman ke dalam
function wallPos(s: number, lat: number, y: number, depth: number): [number, number, number] {
  switch (s) {
    case 0: return [lat, y, -2.9 + depth];
    case 1: return [2.9 - depth, y, lat];
    case 2: return [lat, y, 2.9 - depth];
    default: return [-2.9 + depth, y, lat];
  }
}
const wallRotY = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function buildInterior(type: ModType, openL: boolean[], portL: boolean[]): IntOut {
  const def = MOD_DEFS[type];
  const b = new Batch();
  const rects: Rect[] = [];
  const spots: InterSpot[] = [];
  const acc = def.color;
  const hull = L(0xc3cad2), hullD = L(0x4b535e), dark = L(0x1b2027), floorM = L(0x2d333b), fab = L(0x2c3a52), fabB = L(0x7a2f2f);
  const accM = E(acc), accL = L(acc), metal = ST(0x8f98a3, 0.8, 0.35), white = E(0xf4f8ff), cyan = E(0x45e3ff), amber = E(0xffb030), green = E(0x40ff90), red = E(0xff3a30);
  const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => rects.push({ minX, maxX, minZ, maxZ });
  const spot = (x: number, z: number, r: number, text: string, action: string) => spots.push({ x, z, r, text, action });

  // lantai & langit-langit
  b.box(CELL, 0.1, CELL, 0, -0.05, 0, floorM);
  b.box(CELL, 0.1, CELL, 0, MOD_H + 0.05, 0, hull);
  for (let z = -2.5; z <= 2.6; z += 1) b.box(5.6, 0.012, 0.03, 0, 0.006, z, dark);
  b.box(0.05, 0.012, 5.6, -1.2, 0.007, 0, accM);
  b.box(0.05, 0.012, 5.6, 1.2, 0.007, 0, accM);
  // panel lampu langit-langit
  b.box(1.5, 0.04, 0.5, 0, MOD_H - 0.01, 0, white);
  b.box(0.5, 0.04, 1.5, 0, MOD_H - 0.012, 0, white);
  b.box(5.2, 0.04, 0.06, 0, MOD_H - 0.01, -2.6, accM);
  b.box(5.2, 0.04, 0.06, 0, MOD_H - 0.01, 2.6, accM);

  // dinding 4 sisi
  const windowSides = type === 'hab' || type === 'lab' || type === 'greenhouse' || type === 'storage' || type === 'hub' ? [1, 3] : type === 'comms' ? [1, 3] : [];
  for (let s = 0; s < 4; s++) {
    const door = openL[s];
    const sealedPort = portL[s] && !door;
    const t = 0.1, off = 2.95;
    const put = (lat: number, y: number, w: number, h: number, d: number, m: THREE.Material) => {
      switch (s) {
        case 0: b.box(w, h, d, lat, y, -off, m); break;
        case 1: b.box(d, h, w, off, y, lat, m); break;
        case 2: b.box(w, h, d, lat, y, off, m); break;
        default: b.box(d, h, w, -off, y, lat, m); break;
      }
    };
    const garageBig = type === 'garage' && s === 0;
    if (door) {
      const seg = (CELL - DOOR_W) / 2;
      for (const sg of [-1, 1]) put(sg * (DOOR_W / 2 + seg / 2), 1.2, seg, 2.4, t, hull);
      put(0, 2.7, CELL, 0.6, t, hull);
      // bingkai tipis + strip lampu + daun pintu geser yang terbuka separuh
      for (const sg of [-1, 1]) {
        put(sg * (DOOR_W / 2 + 0.03), 1.2, 0.06, 2.4, t + 0.04, dark);
        put(sg * DOOR_W / 2, 1.2, 0.015, 2.34, t + 0.055, accM);
        put(sg * (DOOR_W / 2 - 0.13), 1.15, 0.26, 2.25, 0.05, L(0x39414c));
      }
      put(0, 2.43, DOOR_W + 0.12, 0.08, t + 0.04, dark);
      put(0, 2.39, DOOR_W, 0.015, t + 0.055, accM);
    } else {
      put(0, 0.45, CELL, 0.9, t, hull);
      put(0, 2.7, CELL, 0.6, t, hull);
      const win = windowSides.includes(s) && !sealedPort;
      if (win) {
        for (const sg of [-1, 1]) put(sg * 2.7, 1.65, 0.6, 1.5, t, hull);
        put(0, 1.65, 5.2, 1.5, 0.03, GLASS_I);
        put(0, 1.65, 0.06, 1.5, 0.05, hullD);
        put(0, 0.92, 5.2, 0.05, 0.12, accM);
      } else {
        put(0, 1.65, CELL, 1.5, t, hull);
        for (let lat = -2.4; lat <= 2.5; lat += 1.2) put(lat, 1.65, 0.025, 1.5, t + 0.02, hullD);
        put(0, 0.92, CELL, 0.04, t + 0.04, accM);
      }
    }
    if (sealedPort && !garageBig) {
      const [hx, hy, hz] = wallPos(s, 0, 1.2, 0.07);
      const rot: [number, number, number] = s % 2 === 0 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
      b.cyl(0.78, 0.78, 0.06, hx, hy, hz, hullD, rot, 20);
      b.cyl(0.62, 0.62, 0.08, hx, hy, hz, L(0x39414c), rot, 20);
      b.torus(0.7, 0.04, hx, hy, hz, accM, s % 2 === 0 ? [0, 0, 0] : [0, Math.PI / 2, 0], 20);
      const [lx, ly, lz] = wallPos(s, 0.98, 1.9, 0.08);
      b.sph(0.05, lx, ly, lz, red, 6);
    }
  }
  // sisi interior dinding: strip aksen
  b.box(CELL, 0.03, 0.03, 0, 2.4, 2.92, accM);

  // ---------------------------------------------------------------- isi per tipe
  const crate = (x: number, z: number, w: number, c: number, y0 = 0) => b.box(w, w, w, x, y0 + w / 2, z, L(c));
  const screen = (s: number, lat: number, y: number, w: number, h: number, color: number) => {
    const [x, yy, z] = wallPos(s, lat, y, 0.06);
    b.plane(w, h, x, yy, z, wallRotY[s], E(color, 0.9));
    b.plane(w + 0.1, h + 0.1, ...(wallPos(s, lat, y, 0.045) as [number, number, number]), wallRotY[s], E(0x0a1218));
  };
  const suit = (x: number, z: number) => {
    b.box(0.4, 0.62, 0.3, x, 1.3, z, L(0xffffff));
    b.box(0.34, 0.5, 0.26, x, 0.7, z, L(0xf2f2f2));
    b.box(0.12, 0.5, 0.12, x, 0.2, z - 0.07, L(0xf2f2f2));
    b.box(0.12, 0.5, 0.12, x, 0.2, z + 0.07, L(0xf2f2f2));
    b.sph(0.19, x, 1.8, z, L(0xf5f5f5), 10);
    b.dome(0.15, x + 0.08, 1.8, z, ST(0xcf8a1e, 1, 0.1), 10);
    b.box(0.04, 0.4, 0.3, x - 0.2, 1.4, z, L(0xd9692a));
  };

  switch (type) {
    case 'hub': {
      b.cyl(0.95, 1.05, 0.12, 0, 0.06, 0, hullD, undefined, 24);
      b.cyl(0.22, 0.32, 0.75, 0, 0.5, 0, metal, undefined, 16);
      b.cyl(1.0, 0.75, 0.1, 0, 0.92, 0, dark, undefined, 28);
      b.cyl(0.88, 0.88, 0.012, 0, 0.985, 0, E(0x1a8fa8, 0.6), undefined, 28);
      b.sph(0.05, 0, 1.3, 0, E(0xffc060), 8);
      for (let i = 1; i <= 3; i++) {
        const pts = 40;
        for (let a = 0; a < pts; a++) {
          const ang = (a / pts) * Math.PI * 2;
          b.box(0.02, 0.01, 0.02, Math.cos(ang) * 0.18 * i, 1.3, Math.sin(ang) * 0.18 * i, cyan);
        }
      }
      rect(-1.05, 1.05, -1.05, 1.05);
      for (const [cx, cz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]] as [number, number][]) {
        b.box(0.85, 1.0, 0.85, cx, 0.5, cz, dark);
        b.box(0.7, 0.04, 0.7, cx, 1.02, cz, hullD);
        for (let i = 0; i < 4; i++) b.box(0.05, 0.04, 0.05, cx - 0.2 + i * 0.13, 1.06, cz, [cyan, amber, green, red][i]);
        rect(cx - 0.45, cx + 0.45, cz - 0.45, cz + 0.45);
      }
      for (const [sx, sz] of [[-1.5, 0], [1.5, 0]] as [number, number][]) b.cyl(0.18, 0.18, 0.45, sx, 0.225, sz, fab);
      b.torus(1.5, 0.04, 0, MOD_H - 0.04, 0, accM, [Math.PI / 2, 0, 0], 40);
      spot(0, 0, 1.7, 'Konsol Modul · Bangun / Lepas', 'build');
      break;
    }
    case 'corridor': {
      for (const sx of [-1, 1]) {
        b.box(0.1, MOD_H, CELL, sx * 1.35, MOD_H / 2, 0, hull);
        b.box(0.12, 0.06, CELL, sx * 1.33, 1.15, 0, accM);
        b.box(0.12, 0.04, CELL, sx * 1.33, 2.4, 0, hullD);
        for (let z = -2.4; z <= 2.5; z += 1.2) b.box(0.13, 2.7, 0.03, sx * 1.33, 1.35, z, hullD);
        rect(sx > 0 ? 1.3 : -3, sx > 0 ? 3 : -1.3, -3, 3);
      }
      for (const x of [-0.5, 0.5]) b.cyl(0.05, 0.05, CELL, x, 2.8, 0, metal, [Math.PI / 2, 0, 0]);
      for (let z = -2.4; z <= 2.5; z += 1.2) b.box(0.3, 0.04, 0.5, 0, 2.95, z, white);
      break;
    }
    case 'airlock': {
      // hatch luar besar (dinding utara)
      const hx = 0, hy = 1.2, hz = -2.84;
      b.cyl(0.95, 0.95, 0.12, hx, hy, hz, hullD, [Math.PI / 2, 0, 0], 24);
      b.cyl(0.8, 0.8, 0.14, hx, hy, hz + 0.02, L(0x39414c), [Math.PI / 2, 0, 0], 24);
      b.torus(0.9, 0.05, hx, hy, hz + 0.08, accM, [0, 0, 0], 28);
      b.torus(0.26, 0.04, hx, hy, hz + 0.12, accM, [0, 0, 0], 16);
      for (let i = 0; i < 3; i++) b.box(0.03, 0.62, 0.04, hx, hy, hz + 0.12, accM, [0, 0, (i * Math.PI) / 3]);
      b.sph(0.08, 0.95, 2.4, -2.8, amber, 8);
      for (let i = 0; i < 3; i++) b.box(0.04, 0.05, 0.04, 1.25, 1.2 + i * 0.12, -2.82, [green, amber, red][i]);
      for (let x = -0.95; x <= 0.95; x += 0.38) b.box(0.19, 0.012, 1.0, x, 0.007, -2.2, (Math.round((x + 1) / 0.38) % 2) ? amber : dark);
      suit(-2.45, -0.7); suit(-2.45, 0.1);
      b.box(0.5, 2.0, 1.9, -2.7, 1.0, -0.3, dark);
      b.box(0.5, 0.45, 2.4, 2.65, 0.225, -0.2, hullD);
      b.box(0.52, 0.05, 2.4, 2.65, 0.47, -0.2, accL);
      rect(-3, -2.2, -1.4, 0.7);
      rect(2.35, 3, -1.45, 1.05);
      spot(0, -1.9, 1.35, 'Keluar (EVA)', 'out');
      break;
    }
    case 'dock': {
      b.cyl(1.15, 1.15, 0.2, 0, 1.3, -2.8, hullD, [Math.PI / 2, 0, 0], 28);
      b.cyl(0.95, 0.95, 0.24, 0, 1.3, -2.8, L(0x39414c), [Math.PI / 2, 0, 0], 28);
      b.torus(1.08, 0.06, 0, 1.3, -2.7, accM, undefined, 32);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.sph(0.05, Math.cos(a) * 1.08, 1.3 + Math.sin(a) * 1.08, -2.62, i % 2 ? amber : cyan, 6);
      }
      b.box(1.2, 0.06, 0.9, 2.3, 1.0, -1.6, dark);
      b.box(0.9, 1.0, 0.7, 2.35, 0.5, -1.6, dark);
      screen(1, -1.6, 1.4, 0.9, 0.5, 0x1a8fa8);
      for (let i = 0; i < 5; i++) b.box(0.05, 0.04, 0.05, 2.0, 1.05, -1.9 + i * 0.15, [cyan, amber, green, red, white][i]);
      rect(1.85, 3, -2.1, -1.0);
      for (const sx of [-1, 1]) b.box(0.4, 0.9, 1.0, sx * 2.5, 0.45, 1.2, sx > 0 ? fabB : fab);
      rect(-3, -2.1, 0.6, 1.8); rect(2.1, 3, 0.6, 1.8);
      spot(0, -1.8, 1.45, 'Naik ke kapal', 'ship');
      break;
    }
    case 'hab': {
      for (const [bx, bz, k] of [[-2.2, -1.3, 0], [-2.2, 1.3, 1]] as [number, number, number][]) {
        for (const lx of [-0.45, 0.45]) for (const lz of [-0.93, 0.93]) b.box(0.06, 0.36, 0.06, bx + lx, 0.18, bz + lz, metal);
        b.box(1.0, 0.08, 2.0, bx, 0.4, bz, hullD);
        b.box(0.94, 0.14, 1.92, bx, 0.51, bz, k ? L(0x9fb1c6) : L(0xc9ccd2));
        b.box(0.9, 0.06, 1.1, bx, 0.61, bz + 0.45, k ? fabB : fab);
        b.box(0.5, 0.09, 0.3, bx, 0.62, bz - 0.7, L(0xeeeeee));
        b.box(1.0, 0.55, 0.06, bx, 0.65, bz + (k ? 1.0 : -1.0), hullD);
        b.box(0.04, 0.02, 1.9, bx + 0.5, 0.58, bz, k ? amber : cyan);
        rect(bx - 0.55, bx + 0.55, bz - 1.05, bz + 1.05);
      }
      b.box(0.5, 0.05, 1.6, 2.55, 0.85, -0.6, hullD);
      b.box(0.1, 0.85, 0.1, 2.75, 0.425, -1.3, metal); b.box(0.1, 0.85, 0.1, 2.75, 0.425, 0.1, metal);
      b.box(0.34, 0.06, 0.34, 2.0, 0.52, -0.6, fab);
      b.box(0.05, 0.4, 0.34, 1.83, 0.75, -0.6, fab);
      b.box(0.5, 1.9, 0.7, 2.6, 0.95, 1.6, dark);
      for (let i = 0; i < 4; i++) b.box(0.02, 0.05, 0.12, 2.33, 0.5 + i * 0.35, 1.6, [cyan, amber, green, white][i]);
      rect(2.25, 3, -1.45, 0.25); rect(2.25, 3, 1.2, 2.0);
      b.box(1.4, 0.015, 2.2, 0, 0.012, -0.2, L(0x4a2f2f));
      spot(-1.3, 0, 1.7, 'Istirahat (pulihkan baju & O₂)', 'rest');
      break;
    }
    case 'lab': {
      b.box(0.9, 0.9, 4.2, 2.35, 0.45, 0, hullD);
      b.box(0.94, 0.05, 4.24, 2.35, 0.92, 0, dark);
      b.cyl(0.18, 0.18, 0.35, 2.3, 1.12, -1.3, metal, undefined, 12);
      b.cyl(0.1, 0.1, 0.5, 2.4, 1.18, -0.3, ST(0xcfd5dc, 0.6, 0.4), undefined, 8);
      b.box(0.3, 0.24, 0.2, 2.25, 1.06, 0.7, dark);
      b.cyl(0.05, 0.05, 0.3, 2.25, 1.3, 0.7, metal, [0.5, 0, 0]);
      for (let i = 0; i < 4; i++) b.cyl(0.05, 0.05, 0.2, 2.4, 1.06, 1.1 + i * 0.22, [accM, cyan, green, amber][i] as THREE.Material, undefined, 8);
      rect(1.85, 3, -2.15, 2.15);
      screen(1, 0, 1.7, 3.0, 0.7, 0x103a50);
      b.box(0.8, 2.0, 0.8, -2.5, 1.0, -2.45, L(0xdfe4ea));
      b.box(0.04, 0.8, 0.04, -2.1, 1.2, -2.1, metal);
      rect(-3, -2.05, -2.9, -2.0);
      b.box(0.9, 0.9, 0.9, -2.5, 0.45, 2.45, dark);
      b.cyl(0.35, 0.35, 0.12, -2.5, 0.96, 2.45, metal, undefined, 20);
      rect(-3, -2.0, 2.0, 2.9);
      spot(1.0, 0, 1.9, 'Analisis Sampel', 'lab');
      break;
    }
    case 'greenhouse': {
      for (const sx of [-1, 1]) {
        b.box(1.2, 0.5, 4.6, sx * 2.0, 0.25, 0, hullD);
        b.box(1.1, 0.12, 4.5, sx * 2.0, 0.54, 0, L(0x3a2a1f));
        for (let i = 0; i < 18; i++) {
          const pz = -2.0 + (i % 6) * 0.8, px = sx * 2.0 + (Math.floor(i / 6) - 1) * 0.36;
          b.cyl(0.015, 0.02, 0.35, px, 0.78, pz, L(0x2e6b2a), undefined, 5);
          b.sph(0.13 + (i % 3) * 0.03, px, 1.0 + (i % 4) * 0.06, pz, L([0x3f9a3a, 0x58b84a, 0x2f8a46][i % 3]), 7, [1, 0.8, 1]);
          if (i % 5 === 0) b.sph(0.05, px + 0.08, 1.1, pz, L(0xff5a5a), 5);
        }
        b.box(0.1, 0.03, 4.4, sx * 2.0, 2.4, 0, E(0xff40d0));
        b.box(1.0, 0.05, 4.2, sx * 2.0, 2.45, 0, hullD);
        rect(sx > 0 ? 1.35 : -3, sx > 0 ? 3 : -1.35, -2.4, 2.4);
      }
      b.cyl(0.3, 0.3, 0.9, 0, 0.45, 0, E(0x3a90c0, 0.5), undefined, 14);
      b.cyl(0.33, 0.33, 0.06, 0, 0.92, 0, metal, undefined, 14);
      rect(-0.4, 0.4, -0.4, 0.4);
      spot(0, 0, 1.75, 'Panen & segarkan udara', 'harvest');
      break;
    }
    case 'power': {
      b.cyl(0.7, 0.7, 2.6, 0, 1.3, -0.4, E(0x3aa8ff, 0.75), undefined, 20);
      b.cyl(0.8, 0.8, 0.12, 0, 0.1, -0.4, hullD, undefined, 20);
      b.cyl(0.8, 0.8, 0.12, 0, 2.7, -0.4, hullD, undefined, 20);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.cyl(0.05, 0.05, 2.6, Math.cos(a) * 0.95, 1.3, -0.4 + Math.sin(a) * 0.95, metal, undefined, 6); }
      rect(-1.1, 1.1, -1.5, 0.7);
      for (const sx of [-1, 1]) {
        b.box(0.5, 1.2, 1.4, sx * 2.5, 0.6, -1.4, dark);
        b.box(0.05, 0.3, 0.9, sx * 2.23, 0.9, -1.4, [cyan, amber][sx > 0 ? 0 : 1]);
        rect(sx > 0 ? 2.2 : -3, sx > 0 ? 3 : -2.2, -2.2, -0.6);
      }
      for (const x of [-0.8, 0.8]) b.cyl(0.07, 0.07, 3, x, 2.8, 0.5, metal, [Math.PI / 2, 0, 0]);
      spot(0, 1.3, 1.6, 'Pantau Daya', 'power');
      break;
    }
    case 'storage': {
      for (const sx of [-1, 1]) {
        for (let lv = 0; lv < 3; lv++) b.box(0.7, 0.05, 4.4, sx * 2.45, 0.35 + lv * 0.75, 0, metal);
        for (const z of [-2.1, 0, 2.1]) b.box(0.05, 2.4, 0.05, sx * 2.45 + sx * 0.3, 1.2, z, metal);
        for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 4; i++) {
          if ((i + lv + (sx > 0 ? 1 : 0)) % 3 === 2) continue;
          b.box(0.55, 0.45, 0.8, sx * 2.45, 0.6 + lv * 0.75, -1.65 + i * 1.1, L([0xd9692a, 0x56606b, 0x2c5a82, 0xa0a8b2][(i + lv) % 4]));
        }
        rect(sx > 0 ? 2.05 : -3, sx > 0 ? 3 : -2.05, -2.3, 2.3);
      }
      crate(0.6, 1.9, 0.7, 0xd9692a); crate(-0.1, 2.0, 0.5, 0x56606b); crate(0.6, 1.9, 0.6, 0xa0a8b2, 0.7);
      rect(-0.5, 1.0, 1.4, 2.4);
      spot(0, -0.3, 1.8, 'Isi ulang O₂ & baju', 'supply');
      break;
    }
    case 'garage': {
      // pintu gulung besar dinding utara
      b.box(4.2, 2.6, 0.12, 0, 1.3, -2.86, L(0x56606b));
      for (let i = 0; i < 9; i++) b.box(4.2, 0.03, 0.14, 0, 0.2 + i * 0.28, -2.84, hullD);
      b.box(4.4, 0.12, 0.2, 0, 2.62, -2.84, accM);
      for (const sx of [-1, 1]) b.box(0.12, 2.6, 0.2, sx * 2.16, 1.3, -2.84, accM);
      b.box(4.0, 0.012, 2.6, 0, 0.007, -0.4, L(0x40454c));
      for (let i = 0; i < 6; i++) b.box(0.3, 0.012, 0.12, -1.4 + i * 0.56, 0.008, -2.4, i % 2 ? amber : dark);
      b.box(0.5, 1.5, 0.9, 2.6, 0.75, 1.2, dark);
      b.box(0.5, 0.9, 0.9, -2.6, 0.45, 1.2, L(0xd9692a));
      rect(2.3, 3, 0.7, 1.7); rect(-3, -2.3, 0.7, 1.7);
      spot(0, -0.9, 2.3, 'Siapkan Rover', 'rover');
      break;
    }
    case 'comms': {
      b.box(3.6, 0.9, 1.0, 0, 0.45, -1.6, dark);
      b.box(3.6, 0.05, 1.04, 0, 0.92, -1.6, hullD);
      screen(0, -1.0, 1.7, 1.3, 0.8, 0x103a50);
      screen(0, 0.5, 1.7, 1.3, 0.8, 0x2a1030);
      screen(0, 1.9, 1.7, 1.0, 0.8, 0x103a30);
      for (let i = 0; i < 12; i++) b.box(0.07, 0.03, 0.07, -1.5 + i * 0.27, 0.96, -1.3, [cyan, amber, green, red][i % 4]);
      rect(-1.9, 1.9, -2.15, -1.05);
      b.cyl(0.25, 0.3, 0.08, 0, 0.04, 0.4, hullD, undefined, 14);
      b.cyl(0.05, 0.05, 0.45, 0, 0.3, 0.4, metal, undefined, 8);
      b.box(0.5, 0.1, 0.5, 0, 0.55, 0.4, fab);
      b.box(0.5, 0.6, 0.1, 0, 0.9, 0.62, fab);
      rect(-0.4, 0.4, 0.0, 0.8);
      b.cyl(0.05, 0.05, 2.5, 2.7, 1.25, 2.4, metal, undefined, 6);
      b.dome(0.4, 2.7, 2.55, 2.4, metal, 10);
      spot(0, -0.4, 1.7, 'Hubungi Pusat Misi', 'comms');
      break;
    }
  }
  return { group: b.build(), rects, spots };
}

// ------------------------------------------------------------------ builder: EKSTERIOR
interface ExtOut { group: THREE.Group; blinkers: THREE.Mesh[]; parts: Map<string, THREE.Group> }

const REACH: Record<ModType, number> = { hub: 2.5, corridor: 3, airlock: 2.9, dock: 2.8, hab: 2.5, lab: 2.5, greenhouse: 2.5, power: 2.2, storage: 2.5, garage: 2.7, comms: 1.9 };

function buildExterior(type: ModType, openL: boolean[], portL: boolean[], foundation: boolean): ExtOut {
  const def = MOD_DEFS[type];
  const b = new Batch();
  const blink: THREE.Mesh[] = [];
  const hull = ST(0xd7dce2, 0.45, 0.5), hullD = ST(0x4b535e, 0.5, 0.55), dark = ST(0x20262d, 0.5, 0.6), accent = ST(def.color, 0.3, 0.5), metal = ST(0xa4adb8, 0.8, 0.35);
  const win = E(0xffe9a8), glow = E(def.color), red = E(0xff3a30), white = E(0xffffff);
  const panelM = ST(0x1a3a7a, 0.7, 0.3, 0x0a1a3a);
  const H = MOD_H;
  const bw = BODY_HALF * 2;
  // bagian yang bisa lepas (diganti puing berfisika saat rusak)
  const parts = new Map<string, THREE.Group>();
  const part = (id: string, fn: (pb: Batch) => void) => {
    const pb = new Batch();
    fn(pb);
    const gr = pb.build();
    gr.name = 'part:' + id;
    gr.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(gr);
    const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    gr.userData.center = [c.x, c.y, c.z];
    gr.userData.radius = Math.max(0.2, Math.max(sz.x, sz.y, sz.z) / 2);
    parts.set(id, gr);
  };

  // badan utama
  switch (type) {
    case 'hub': {
      b.cyl(BODY_HALF, BODY_HALF, H, 0, H / 2, 0, hull, undefined, 28);
      b.cyl(BODY_HALF + 0.08, BODY_HALF + 0.08, 0.12, 0, 0.6, 0, accent, undefined, 28);
      b.cyl(BODY_HALF + 0.08, BODY_HALF + 0.08, 0.12, 0, H - 0.2, 0, hullD, undefined, 28);
      b.dome(1.4, 0, H, 0, hull, 18, [1, 0.5, 1]);
      part('antenna', (pb) => pb.cyl(0.04, 0.04, 1.4, 0, H + 0.9, 0, metal, undefined, 6));
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.box(0.5, 0.5, 0.06, Math.cos(a) * 2.5, 1.7, Math.sin(a) * 2.5, win, [0, -a + Math.PI / 2, 0]); }
      break;
    }
    case 'corridor': {
      b.cyl(1.3, 1.3, CELL, 0, H / 2, 0, hull, [Math.PI / 2, 0, 0], 20);
      for (let z = -2.4; z <= 2.5; z += 1.2) b.torus(1.32, 0.05, 0, H / 2, z, hullD, undefined, 20);
      b.box(0.06, 0.3, CELL - 1, 1.31, H / 2 + 0.2, 0, win);
      b.box(0.06, 0.3, CELL - 1, -1.31, H / 2 + 0.2, 0, win);
      break;
    }
    case 'airlock': {
      b.cyl(1.55, 1.55, 4.4, 0, H / 2, 0.7, hull, [Math.PI / 2, 0, 0], 22);
      b.torus(1.57, 0.07, 0, H / 2, -1.4, accent, undefined, 22);
      b.torus(1.57, 0.07, 0, H / 2, 2.8, hullD, undefined, 22);
      // hatch luar
      b.cyl(1.0, 1.0, 0.18, 0, H / 2, -1.55, dark, [Math.PI / 2, 0, 0], 22);
      b.torus(0.92, 0.05, 0, H / 2, -1.66, accent, undefined, 24);
      b.box(0.24, 0.24, 0.1, 1.1, 2.4, -1.55, red);
      for (let i = 0; i < 3; i++) b.box(0.06, 0.06, 0.12, -1.1, 1.8 + i * 0.12, -1.5, [E(0x40ff90), E(0xffb030), red][i]);
      b.box(1.6, 0.08, 1.2, 0, 0.06, -2.2, hullD);
      break;
    }
    case 'dock': {
      b.cyl(1.7, 1.7, 3.6, 0, H / 2, 1.0, hull, [Math.PI / 2, 0, 0], 22);
      b.cyl(2.0, 1.1, 1.2, 0, H / 2, -1.9, hullD, [Math.PI / 2, 0, 0], 22);
      b.torus(1.12, 0.12, 0, H / 2, -2.5, accent, undefined, 28);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), (i % 2 ? E(0xffb030) : E(0x45e3ff)).clone()); m.position.set(Math.cos(a) * 1.4, H / 2 + Math.sin(a) * 1.4, -2.55); blink.push(m); }
      part('arms', (pb) => { for (const sx of [-1, 1]) {
        pb.box(0.1, 0.1, 1.8, sx * 1.2, H / 2 + 1.7, -2.9, accent, [0, 0, 0]);
        pb.box(0.1, 1.8, 0.1, sx * 1.2, H / 2 + 0.9, -3.8, accent);
      } });
      b.box(2.6, 0.08, 1.4, 0, 0.05, 2.6, hullD);
      break;
    }
    case 'hab': {
      b.box(bw, H, bw, 0, H / 2, 0, hull);
      b.box(bw + 0.1, 0.14, bw + 0.1, 0, 0.55, 0, accent);
      b.box(bw + 0.06, 0.1, bw + 0.06, 0, H - 0.1, 0, hullD);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
        b.box(0.06, 0.55, 0.8, sx * 2.52, 1.7, -1.4 + i * 1.4, win);
        b.box(0.8, 0.55, 0.06, -1.4 + i * 1.4, 1.7, sx * 2.52, win);
      }
      part('roof', (pb) => pb.box(2.4, 0.08, 1.2, 0, H + 0.04, 0, ST(0x1a3a7a, 0.7, 0.3, 0x0a1a3a)));
      break;
    }
    case 'lab': {
      b.box(bw, H, bw, 0, H / 2, 0, hull);
      b.box(bw + 0.1, 0.14, bw + 0.1, 0, 0.55, 0, accent);
      b.box(bw + 0.06, 0.1, bw + 0.06, 0, H - 0.1, 0, hullD);
      b.box(0.06, 0.9, 3.4, 2.52, 1.7, 0, E(0x7affd0));
      b.box(3.4, 0.9, 0.06, 0, 1.7, 2.52, E(0x7affd0));
      part('sensor', (pb) => { pb.cyl(0.04, 0.04, 0.9, 1.0, H + 0.45, 1.0, metal, undefined, 6); pb.dome(0.55, 1.0, H + 0.9, 1.0, metal, 14); });
      part('tank', (pb) => { pb.cyl(0.18, 0.18, 0.7, -1.2, H + 0.35, -1.0, hullD, undefined, 10); pb.box(1.0, 0.2, 1.0, -1.2, H + 0.1, -1.0, hullD); });
      break;
    }
    case 'greenhouse': {
      b.box(bw, 0.9, bw, 0, 0.45, 0, hull);
      b.box(bw + 0.08, 0.1, bw + 0.08, 0, 0.9, 0, accent);
      part('glass', (pb) => {
        pb.cyl(BODY_HALF * 0.98, BODY_HALF * 0.98, bw, 0, 0.9, 0, GLASS_E, [Math.PI / 2, 0, 0], 20);
        for (let z = -2.2; z <= 2.3; z += 1.1) pb.torus(BODY_HALF * 0.98, 0.04, 0, 0.9, z, metal, undefined, 20);
      });
      b.cyl(0.04, 0.04, bw, 0, 3.4, 0, metal, [Math.PI / 2, 0, 0], 6);
      for (let i = 0; i < 9; i++) b.sph(0.18, -1.7 + (i % 3) * 1.7, 1.3, -1.8 + Math.floor(i / 3) * 1.8, E(0x6cff6c, 0.55), 6);
      b.box(bw - 0.4, 0.08, bw - 0.4, 0, 0.98, 0, E(0xc060ff, 0.5));
      break;
    }
    case 'power': {
      b.box(bw - 0.6, H, bw - 0.6, 0, H / 2, 0, hull);
      b.box(bw - 0.5, 0.14, bw - 0.5, 0, 0.55, 0, accent);
      b.cyl(0.6, 0.6, 1.0, 0, H + 0.5, 0, hullD, undefined, 14);
      b.sph(0.35, 0, H + 1.2, 0, E(0x3aa8ff), 10);
      // lengan panel surya
      b.box(0.14, 0.14, 7.0, 0, 2.2, 0, metal, [0, Math.PI / 2, 0]);
      for (const sx of [-1, 1]) part(sx < 0 ? 'panelL' : 'panelR', (pb) => {
        pb.box(3.3, 0.06, 2.4, sx * 2.6, 2.2, -0.6, panelM, [0.0, 0, 0]);
        pb.box(3.3, 0.06, 2.4, sx * 2.6, 2.2, 1.8, panelM, [0.0, 0, 0]);
        pb.box(3.4, 0.03, 0.04, sx * 2.6, 2.24, 0.6, metal);
      });
      for (const sx of [-1, 1]) b.box(0.05, 1.8, 1.2, sx * 1.75, 1.6, -1.9, ST(0xe8ecf0, 0.5, 0.6));
      break;
    }
    case 'storage': {
      b.box(bw, H, bw, 0, H / 2, 0, ST(0xb4bcc6, 0.45, 0.55));
      for (let z = -2; z <= 2.1; z += 1) b.box(bw + 0.08, H, 0.06, 0, H / 2, z, hullD);
      b.box(bw + 0.1, 0.14, bw + 0.1, 0, 0.55, 0, accent);
      part('cargo', (pb) => { for (let i = 0; i < 3; i++) pb.box(1.3, 0.9, 1.3, -1.4 + i * 1.4, H + 0.45, (i % 2) * 0.8 - 0.4, ST([0xd9692a, 0x2c5a82, 0xa0a8b2][i], 0.3, 0.6)); });
      break;
    }
    case 'garage': {
      b.box(bw, H, bw + 0.4, 0, H / 2, 0.2, hull);
      b.box(bw + 0.1, 0.14, bw + 0.5, 0, 0.55, 0.2, accent);
      b.box(4.2, 2.6, 0.12, 0, 1.3, -2.55, ST(0x56606b, 0.4, 0.6));
      for (let i = 0; i < 9; i++) b.box(4.2, 0.03, 0.14, 0, 0.2 + i * 0.28, -2.55, hullD);
      b.box(4.4, 0.14, 0.2, 0, 2.7, -2.55, accent);
      b.box(3.6, 0.06, 2.4, 0, 0.04, -3.9, hullD, [0.08, 0, 0]);
      for (let i = 0; i < 4; i++) b.box(0.25, 0.08, 0.1, -1.1 + i * 0.75, 3.05, -2.45, i % 2 ? E(0xffb030) : red);
      break;
    }
    case 'comms': {
      b.cyl(1.7, 1.9, 1.4, 0, 0.7, 0, hull, undefined, 18);
      b.cyl(1.8, 1.8, 0.14, 0, 0.9, 0, accent, undefined, 18);
      b.cyl(0.08, 0.14, 4.4, 0, 3.6, 0, metal, undefined, 8);
      part('dish', (pb) => pb.dome(1.25, 0, 3.0, 0, ST(0xe8ecf0, 0.6, 0.4), 22, [1, 1.1, 1]));
      part('mast', (pb) => {
        pb.cyl(0.04, 0.04, 1.0, 0, 6.2, 0, metal, undefined, 6);
        for (let i = 0; i < 3; i++) pb.cyl(0.02, 0.02, 1.5, Math.cos(i * 2.1) * 0.5, 4.6, Math.sin(i * 2.1) * 0.5, metal, undefined, 4);
        pb.box(1.6, 0.12, 0.12, 0, 5.6, 0, red);
      });
      break;
    }
  }

  // penghubung antar-modul & penutup port
  for (let s = 0; s < 4; s++) {
    const [dx, dz] = DIRS[s];
    if (!portL[s]) continue;
    const ry: [number, number, number] = s % 2 === 0 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
    const reach = REACH[type];
    const n = (CELL / 2 - reach);
    const cx = dx * (reach + Math.max(n, 0) / 2), cz = dz * (reach + Math.max(n, 0) / 2);
    if (openL[s]) {
      if (n > 0.02) b.cyl(0.95, 0.95, n, cx, H / 2, cz, hullD, ry, 14);
      b.torus(1.0, 0.07, dx * (CELL / 2 - 0.06), H / 2, dz * (CELL / 2 - 0.06), accent, s % 2 === 0 ? [0, 0, 0] : [0, Math.PI / 2, 0], 16);
    } else {
      const px = dx * (Math.max(reach, 0) + 0.04), pz = dz * (Math.max(reach, 0) + 0.04);
      b.cyl(0.9, 0.9, 0.12, px, H / 2, pz, hullD, ry, 16);
      b.cyl(0.55, 0.55, 0.14, px, H / 2, pz, dark, ry, 12);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), E(0xff3a30).clone());
      l.position.set(px + dx * 0.1 - dz * 0.0, H / 2 + 0.75, pz + dz * 0.1);
      blink.push(l);
    }
  }
  // fondasi (basecamp di permukaan) — tiang tertanam
  if (foundation) {
    b.box(bw + 0.4, 0.3, bw + 0.4, 0, -0.15, 0, hullD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.14, 0.2, 7, sx * 2.2, -3.5, sz * 2.2, dark, undefined, 6);
  } else {
    // stasiun: rangka & pendorong kendali sikap
    b.box(0.12, 0.12, bw, -2.3, -0.2, 0, hullD);
    b.box(0.12, 0.12, bw, 2.3, -0.2, 0, hullD);
    b.box(bw, 0.12, 0.12, 0, -0.2, -2.3, hullD);
    b.box(bw, 0.12, 0.12, 0, -0.2, 2.3, hullD);
    b.cyl(0.07, 0.1, 0.25, 2.3, -0.5, 2.3, metal, undefined, 6);
    b.cyl(0.07, 0.1, 0.25, -2.3, -0.5, -2.3, metal, undefined, 6);
  }

  const g = b.build();
  for (const m of blink) g.add(m);
  for (const gr of parts.values()) g.add(gr);
  void glow; void white;
  return { group: g, blinkers: blink, parts };
}


// ------------------------------------------------------------------ kerusakan struktur
export interface Dent { p: [number, number, number]; n: [number, number, number]; r: number; burn: number; hole: boolean }
export interface ModDamage { hp: number; fire: number; dents: Dent[]; lost: string[]; dust: number; ash: number }
export interface DmgSave { key: string; hp: number; fire: number; dents: Dent[]; lost: string[] }

/** energi (J) yang dapat diserap tiap jenis modul sebelum hancur */
export const MOD_STRENGTH: Record<ModType, number> = {
  hub: 9e6, corridor: 3.5e6, airlock: 6e6, dock: 6e6, hab: 6e6, lab: 5e6, greenhouse: 2.6e6, power: 5e6, storage: 4.5e6, garage: 6e6, comms: 3e6,
};
/** beban atap (kg/m²) sebelum runtuh: modul berkubah/bertabung lebih kuat daripada pelat datar */
export const ROOF_LOAD: Record<ModType, number> = {
  hub: 520, corridor: 600, airlock: 600, dock: 520, hab: 380, lab: 380, greenhouse: 140, power: 300, storage: 380, garage: 380, comms: 520,
};
/** bentuk cangkang untuk menempatkan penyok tepat di permukaan */
const SHELL: Record<ModType, { k: 'box' | 'vcyl' | 'zcyl'; a: number; h: number; zc?: number; zl?: number }> = {
  hub: { k: 'vcyl', a: 2.5, h: 3 }, corridor: { k: 'zcyl', a: 1.3, h: 3, zc: 0, zl: 3 }, airlock: { k: 'zcyl', a: 1.55, h: 3, zc: 0.7, zl: 2.2 },
  dock: { k: 'zcyl', a: 1.7, h: 3, zc: 1.0, zl: 1.8 }, hab: { k: 'box', a: 2.5, h: 3 }, lab: { k: 'box', a: 2.5, h: 3 }, greenhouse: { k: 'box', a: 2.5, h: 1.8 },
  power: { k: 'box', a: 1.9, h: 3 }, storage: { k: 'box', a: 2.5, h: 3 }, garage: { k: 'box', a: 2.5, h: 3 }, comms: { k: 'vcyl', a: 1.7, h: 1.4 },
};

/** titik pada cangkang modul (koordinat lokal modul) untuk arah d dari pusat; mengisi n dengan normal luar */
export function shellPoint(type: ModType, d: THREE.Vector3, p: THREE.Vector3, n: THREE.Vector3) {
  const sh = SHELL[type];
  const dir = d.clone().normalize();
  const cy = sh.h / 2;
  if (sh.k === 'box') {
    const tx = Math.abs(dir.x) > 1e-6 ? sh.a / Math.abs(dir.x) : 1e9;
    const tz = Math.abs(dir.z) > 1e-6 ? sh.a / Math.abs(dir.z) : 1e9;
    const ty = dir.y > 1e-6 ? (sh.h - cy) / dir.y : dir.y < -1e-6 ? cy / -dir.y : 1e9;
    const t = Math.min(tx, tz, ty);
    p.set(dir.x * t, cy + dir.y * t, dir.z * t);
    if (t === ty) n.set(0, Math.sign(dir.y) || 1, 0); else if (t === tx) n.set(Math.sign(dir.x), 0, 0); else n.set(0, 0, Math.sign(dir.z));
  } else if (sh.k === 'vcyl') {
    const hz = Math.hypot(dir.x, dir.z);
    const ts = hz > 1e-6 ? sh.a / hz : 1e9;
    const ty = dir.y > 1e-6 ? (sh.h - cy) / dir.y : dir.y < -1e-6 ? cy / -dir.y : 1e9;
    const t = Math.min(ts, ty);
    p.set(dir.x * t, cy + dir.y * t, dir.z * t);
    if (t === ty) n.set(0, Math.sign(dir.y) || 1, 0); else n.set(dir.x / hz, 0, dir.z / hz);
  } else {
    const hr = Math.hypot(dir.x, dir.y);
    const ts = hr > 1e-6 ? sh.a / hr : 1e9;
    const half = (sh.zl ?? 3) / 2;
    const tz = Math.abs(dir.z) > 1e-6 ? half / Math.abs(dir.z) : 1e9;
    const cz = sh.zc ?? 0;
    // arah dari pusat (0, 1.5, cz)
    if (ts <= tz) { p.set(dir.x * ts, 1.5 + dir.y * ts, cz + dir.z * ts); n.set(dir.x / hr, dir.y / hr, 0); }
    else { p.set(dir.x * tz, 1.5 + dir.y * tz, cz + dir.z * tz); n.set(0, 0, Math.sign(dir.z) || 1); }
  }
}

const DENT_Y = new THREE.Vector3(0, 1, 0);
const dentMats = {
  scorch: new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  funnel: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.7, roughness: 0.75, side: THREE.DoubleSide }),
  rim: new THREE.MeshStandardMaterial({ color: 0x8c939c, metalness: 0.75, roughness: 0.45 }),
  hole: new THREE.MeshBasicMaterial({ color: 0x020203 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false }),
};
export function dentMesh(d: Dent): THREE.Group {
  const g = new THREE.Group();
  // acak deterministik dari posisi agar bentuk tak berubah saat dirangkai ulang
  const rr = (k: number) => { const v = Math.sin(d.p[0] * 12.9898 + d.p[1] * 78.233 + d.p[2] * 37.719 + k * 4.1) * 43758.5453; return v - Math.floor(v); };
  g.position.set(d.p[0], d.p[1], d.p[2]);
  g.quaternion.setFromUnitVectors(DENT_Y, new THREE.Vector3(d.n[0], d.n[1], d.n[2]));
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(d.r * (2.0 + d.burn * 1.6), 22), dentMats.scorch);
  scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.012;
  g.add(scorch);
  const depth = d.r * (d.hole ? 1.4 : 0.65);
  const fun = new THREE.Mesh(new THREE.ConeGeometry(d.r, depth, 14, 1, true), dentMats.funnel);
  fun.rotation.x = Math.PI; fun.position.y = -depth / 2 + 0.02;
  g.add(fun);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(d.r * 1.02, d.r * 0.14, 6, 16), dentMats.rim);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.025; rim.scale.set(1, 1, 1.3 + rr(1) * 0.5);
  g.add(rim);
  if (d.hole) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.82, 14), dentMats.hole);
    hole.rotation.x = -Math.PI / 2; hole.position.y = -depth * 0.9;
    g.add(hole);
    const glow = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.86, d.r * 1.05, 16), dentMats.glow);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03;
    g.add(glow);
  }
  // pecahan runcing di tepi
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rr(2 + i);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(d.r * 0.12, d.r * 0.7, 4), dentMats.rim);
    sp.position.set(Math.cos(a) * d.r * 1.05, d.r * 0.2, Math.sin(a) * d.r * 1.05);
    sp.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(sp);
  }
  g.name = 'dent';
  return g;
}
function holeInside(d: Dent): THREE.Group {
  const g = new THREE.Group();
  const n = new THREE.Vector3(d.n[0], d.n[1], d.n[2]);
  g.position.set(d.p[0] - n.x * 0.34, d.p[1] - n.y * 0.34, d.p[2] - n.z * 0.34);
  g.quaternion.setFromUnitVectors(DENT_Y, n.clone().negate());
  const dk = new THREE.Mesh(new THREE.CircleGeometry(d.r * 1.1, 16), dentMats.hole);
  dk.rotation.x = -Math.PI / 2;
  g.add(dk);
  const rg = new THREE.Mesh(new THREE.RingGeometry(d.r * 1.1, d.r * 1.45, 16), dentMats.glow);
  rg.rotation.x = -Math.PI / 2; rg.position.y = 0.01;
  g.add(rg);
  g.name = 'dent';
  return g;
}

// ------------------------------------------------------------------ Habitat
export interface HabSave {
  id: string; name: string; kind: 'station' | 'base'; bodyId?: string; dir?: [number, number, number]; yaw?: number;
  mods: { ix: number; iz: number; type: ModType; rot: number }[];
  dmg?: DmgSave[];
}

export class Habitat {
  id: string;
  name: string;
  kind: 'station' | 'base';
  body: Body | null = null;
  dirL = new THREE.Vector3(0, 1, 0);
  yaw = 0;
  stOffset = new THREE.Vector3(); // posisi awal relatif pusat Bumi (menentukan jari-jari & bidang orbit)
  vel = new THREE.Vector3(); // kecepatan inersia (m/s)
  private orbE1 = new THREE.Vector3(1, 0, 0);
  private orbE2 = new THREE.Vector3(0, 0, 1);
  private orbBasis = new THREE.Matrix4();
  mods = new Map<string, PlacedMod>();
  pos = new THREE.Vector3();
  quat = new THREE.Quaternion();
  localPos = new THREE.Vector3();
  localQuat = new THREE.Quaternion();
  ext = new THREE.Group();
  int = new THREE.Group();
  extMods = new Map<string, THREE.Group>();
  intMods = new Map<string, THREE.Group>();
  rects = new Map<string, Rect[]>();
  spots = new Map<string, InterSpot[]>();
  blinkers: THREE.Mesh[] = [];
  beacon: THREE.Sprite;
  anim = new Map<string, number>();
  ghosts: { g: THREE.Group; v: THREE.Vector3; w: THREE.Vector3; t: number }[] = [];
  ghostRoot = new THREE.Group();
  dmg = new Map<string, ModDamage>();
  partGroups = new Map<string, Map<string, THREE.Group>>();
  pressure = 1; // tekanan udara habitat 0..1 (bocor lewat lubang)
  fx: FxSet | null = null; // partikel di ruang koordinat habitat (eksterior)
  fxInt: FxSet | null = null; // partikel interior
  alarm = 0;
  powerGen = 0;
  powerUse = 0;
  powerRatio = 1;
  solarFactor = 1;
  sunFactor = 1;
  version = 0;
  dockTarget = 0;
  dockExt = 0;
  private tube: THREE.Mesh | null = null;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  constructor(id: string, name: string, kind: 'station' | 'base') {
    this.id = id; this.name = name; this.kind = kind;
    this.ext.add(this.ghostRoot);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,200,120,0.95)'); g.addColorStop(0.3, 'rgba(255,170,70,0.5)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
    this.beacon.frustumCulled = false;
  }

  // ----- struktur
  getMod(ix: number, iz: number) { return this.mods.get(keyOf(ix, iz)); }
  worldPorts(m: PlacedMod): boolean[] {
    const p = MOD_DEFS[m.type].ports;
    const out = [false, false, false, false];
    for (let i = 0; i < 4; i++) if (p[i]) out[(i + m.rot) % 4] = true;
    return out;
  }
  neighbor(m: PlacedMod, side: number): PlacedMod | null {
    if (!this.worldPorts(m)[side]) return null;
    const [dx, dz] = DIRS[side];
    const n = this.getMod(m.ix + dx, m.iz + dz);
    if (!n) return null;
    return this.worldPorts(n)[opp(side)] ? n : null;
  }
  openWorld(m: PlacedMod): boolean[] { return [0, 1, 2, 3].map((s) => !!this.neighbor(m, s)); }

  slots(type?: ModType): AttachSlot[] {
    const out: AttachSlot[] = [];
    const seen = new Set<string>();
    for (const m of this.mods.values()) {
      const wp = this.worldPorts(m);
      for (let s = 0; s < 4; s++) {
        if (!wp[s]) continue;
        const [dx, dz] = DIRS[s];
        const ix = m.ix + dx, iz = m.iz + dz;
        const k = keyOf(ix, iz);
        if (this.mods.has(k) || seen.has(m.key + s)) continue;
        if (type && this.pickRot(type, opp(s)) < 0) continue;
        seen.add(m.key + s);
        out.push({ anchor: m.key, side: s, ix, iz });
      }
    }
    return out;
  }
  private pickRot(type: ModType, needSide: number): number {
    const p = MOD_DEFS[type].ports;
    for (let r = 0; r < 4; r++) if (p[(needSide - r + 4) % 4]) return r;
    return -1;
  }
  coreKey() { for (const m of this.mods.values()) if (m.type === 'hub') return m.key; return this.mods.keys().next().value as string | undefined; }

  canAttach(type: ModType, anchorKey: string, side: number): string | null {
    const a = this.mods.get(anchorKey);
    if (!a) return 'Modul jangkar tidak ada';
    if (!this.worldPorts(a)[side]) return 'Port tidak tersedia di sisi itu';
    const [dx, dz] = DIRS[side];
    if (this.getMod(a.ix + dx, a.iz + dz)) return 'Sel sudah terisi';
    if (this.pickRot(type, opp(side)) < 0) return 'Modul tidak punya port yang cocok';
    if (this.mods.size >= 16) return 'Batas 16 modul tercapai';
    return null;
  }
  attach(type: ModType, anchorKey: string, side: number): PlacedMod | null {
    if (this.canAttach(type, anchorKey, side)) return null;
    const a = this.mods.get(anchorKey)!;
    const [dx, dz] = DIRS[side];
    const ix = a.ix + dx, iz = a.iz + dz;
    const m: PlacedMod = { key: keyOf(ix, iz), ix, iz, type, rot: this.pickRot(type, opp(side)) };
    this.mods.set(m.key, m);
    this.rebuild();
    this.anim.set(m.key, 0);
    return m;
  }
  place(type: ModType, ix: number, iz: number, rot: number) {
    const m: PlacedMod = { key: keyOf(ix, iz), ix, iz, type, rot };
    this.mods.set(m.key, m);
    return m;
  }
  // lepas modul + semua modul yang jadi terputus dari inti; kembalikan yang dilepas
  detach(key: string, destroyed = false): PlacedMod[] {
    const core = this.coreKey();
    if (!core || key === core) return [];
    const target = this.mods.get(key);
    if (!target) return [];
    this.mods.delete(key);
    const reach = new Set<string>();
    const stack = [core];
    reach.add(core);
    while (stack.length) {
      const cur = this.mods.get(stack.pop()!)!;
      for (let s = 0; s < 4; s++) {
        const n = this.neighbor(cur, s);
        if (n && !reach.has(n.key)) { reach.add(n.key); stack.push(n.key); }
      }
    }
    const removed: PlacedMod[] = [target];
    for (const m of [...this.mods.values()]) if (!reach.has(m.key)) { removed.push(m); this.mods.delete(m.key); }
    // jadikan hantu: lepas melayang
    for (const m of removed) {
      const eg = this.extMods.get(m.key);
      const dm = this.dmg.get(m.key);
      if (destroyed && m === target) { this.dmg.delete(m.key); if (eg) { this.extMods.delete(m.key); this.ext.remove(eg); disposeTree(eg); } continue; }
      if (dm) this.dmg.delete(m.key);
      if (eg) {
        this.extMods.delete(m.key);
        this.ext.remove(eg);
        const tmpDir = new THREE.Vector3(m.ix, 0.25, m.iz);
        if (tmpDir.x === 0 && tmpDir.z === 0) tmpDir.set(0.5, 0.3, 0.5);
        this.ghosts.push({ g: eg, v: tmpDir.normalize().multiplyScalar(this.kind === 'station' ? 2.2 : 3.0), w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.3), t: 0 });
        this.ghostRoot.add(eg);
      }
    }
    this.rebuild();
    return removed;
  }

  // ----- bangun ulang mesh
  rebuild() {
    for (const g of this.extMods.values()) { this.ext.remove(g); disposeTree(g); }
    for (const g of this.intMods.values()) { this.int.remove(g); disposeTree(g); }
    this.extMods.clear(); this.intMods.clear(); this.rects.clear(); this.spots.clear();
    this.blinkers = [];
    for (const m of this.mods.values()) {
      const openW = this.openWorld(m);
      const wp = this.worldPorts(m);
      // dari dunia → lokal: lokal i → dunia (i+rot)
      const openL = [0, 1, 2, 3].map((i) => openW[(i + m.rot) % 4]);
      const portL = [...MOD_DEFS[m.type].ports] as boolean[];
      void wp;
      const rotY = -(m.rot * Math.PI) / 2;
      const cx = m.ix * CELL, cz = m.iz * CELL;
      const ex = buildExterior(m.type, openL, portL, this.kind === 'base');
      ex.group.position.set(cx, 0, cz);
      ex.group.rotation.y = rotY;
      this.ext.add(ex.group);
      this.extMods.set(m.key, ex.group);
      this.partGroups.set(m.key, ex.parts);
      for (const bl of ex.blinkers) this.blinkers.push(bl);
      const ix = buildInterior(m.type, openL, portL);
      ix.group.position.set(cx, 0, cz);
      ix.group.rotation.y = rotY;
      this.int.add(ix.group);
      this.intMods.set(m.key, ix.group);
      this.applyDamageVisuals(m.key);
      this.rects.set(m.key, ix.rects);
      this.spots.set(m.key, ix.spots);
    }
    if (this.tube) { this.ext.remove(this.tube); this.tube.geometry.dispose(); this.tube = null; }
    if (this.has('dock')) {
      this.tube = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1, 16), ST(0xaab2bc, 0.6, 0.45));
      this.tube.frustumCulled = false;
      this.ext.add(this.tube);
    }
    this.version++;
    this.computePower();
  }

  // ----- kerusakan
  getDmg(key: string): ModDamage {
    let d = this.dmg.get(key);
    if (!d) { d = { hp: 1, fire: 0, dents: [], lost: [], dust: 0, ash: 0 }; this.dmg.set(key, d); }
    return d;
  }
  hpOf(key: string) { return this.dmg.get(key)?.hp ?? 1; }
  get worstHp() { let w = 1; for (const k of this.mods.keys()) w = Math.min(w, this.hpOf(k)); return w; }
  get totalLeak() {
    let leak = 0;
    for (const [k, d] of this.dmg) if (this.mods.has(k)) for (const t of d.dents) if (t.hole) leak += t.r * t.r * 3;
    return leak;
  }
  get onFire() { for (const [k, d] of this.dmg) if (this.mods.has(k) && d.fire > 0.03) return true; return false; }

  private applyDamageVisuals(key: string) {
    const d = this.dmg.get(key);
    const eg = this.extMods.get(key);
    const ig = this.intMods.get(key);
    const parts = this.partGroups.get(key);
    if (!d || !eg) return;
    if (parts) for (const id of d.lost) { const g = parts.get(id); if (g) g.visible = false; }
    for (const t of d.dents) { eg.add(dentMesh(t)); if (t.hole && ig) ig.add(holeInside(t)); }
  }

  addDent(key: string, t: Dent) {
    const d = this.getDmg(key);
    if (d.dents.length >= 12) d.dents.shift();
    d.dents.push(t);
    const eg = this.extMods.get(key), ig = this.intMods.get(key);
    if (eg) {
      // rangkai ulang agar penyok tertua yang terbuang ikut hilang
      for (const c of [...eg.children]) if (c.name === 'dent') { eg.remove(c); disposeTree(c); }
      if (ig) for (const c of [...ig.children]) if (c.name === 'dent') { ig.remove(c); disposeTree(c); }
      for (const x of d.dents) { eg.add(dentMesh(x)); if (x.hole && ig) ig.add(holeInside(x)); }
    }
  }

  /** lepaskan bagian bernama; mengembalikan salinan berpusat di titik beratnya (koordinat lokal modul) untuk dijadikan puing */
  takePart(key: string, id?: string, near?: THREE.Vector3): { obj: THREE.Object3D; id: string; center: THREE.Vector3; radius: number } | null {
    const parts = this.partGroups.get(key);
    const d = this.getDmg(key);
    if (!parts) return null;
    const avail = [...parts.keys()].filter((k) => !d.lost.includes(k));
    if (!avail.length) return null;
    let pick = id && avail.includes(id) ? id : '';
    if (!pick) {
      if (near) {
        let bd = 1e9;
        for (const k of avail) { const c = parts.get(k)!.userData.center as number[]; const dd = Math.hypot(c[0] - near.x, c[1] - near.y, c[2] - near.z); if (dd < bd) { bd = dd; pick = k; } }
      } else pick = avail[Math.floor(Math.random() * avail.length)];
    }
    const g = parts.get(pick)!;
    const c = g.userData.center as number[];
    const clone = g.clone(true);
    clone.position.set(-c[0], -c[1], -c[2]);
    const pivot = new THREE.Group();
    pivot.add(clone);
    g.visible = false;
    d.lost.push(pick);
    return { obj: pivot, id: pick, center: new THREE.Vector3(c[0], c[1], c[2]), radius: g.userData.radius as number };
  }

  partsLeft(key: string) { const parts = this.partGroups.get(key); const d = this.dmg.get(key); return parts ? parts.size - (d?.lost.length ?? 0) : 0; }

  repairModule(key: string) {
    const d = this.dmg.get(key);
    if (!d) return;
    d.hp = 1; d.fire = 0; d.dust = 0; d.ash = 0; d.dents.length = 0; d.lost.length = 0;
    const eg = this.extMods.get(key), ig = this.intMods.get(key);
    if (eg) { for (const c of [...eg.children]) if (c.name === 'dent') { eg.remove(c); disposeTree(c); } }
    if (ig) { for (const c of [...ig.children]) if (c.name === 'dent') { ig.remove(c); disposeTree(c); } }
    const parts = this.partGroups.get(key);
    if (parts) for (const g of parts.values()) g.visible = true;
  }

  ensureFx(): FxSet { if (!this.fx) this.fx = new FxSet(this.ext, false, 300); return this.fx; }
  ensureFxInt(): FxSet { if (!this.fxInt) this.fxInt = new FxSet(this.int, false, 220); return this.fxInt; }

  /** kerusakan dari semua modul yang masih ada */
  damagedKeys(): string[] { const out: string[] = []; for (const k of this.mods.keys()) { const d = this.dmg.get(k); if (d && (d.hp < 0.995 || d.dents.length || d.lost.length || d.fire > 0)) out.push(k); } return out; }

  computePower(solar = this.solarFactor) {
    this.solarFactor = solar;
    let gen = 0, use = 0;
    for (const m of this.mods.values()) {
      const d = MOD_DEFS[m.type];
      const dm = this.dmg.get(m.key);
      const hp = dm ? dm.hp : 1;
      if (m.type === 'power') {
        const panels = dm ? (dm.lost.includes('panelL') ? 0 : 0.5) + (dm.lost.includes('panelR') ? 0 : 0.5) : 1;
        const dust = dm ? 1 - 0.75 * Math.min(1, dm.dust) : 1;
        gen += d.gen * (hp > 0.25 ? 1 : 0) + d.solar * solar * panels * dust * Math.min(1, hp * 1.4);
      } else gen += d.gen + d.solar * solar;
      use += d.use * (hp < 0.15 ? 0.3 : 1);
    }
    this.powerGen = gen; this.powerUse = use;
    this.powerRatio = use <= 0 ? 1 : Math.max(0.15, Math.min(1, gen / use));
  }

  // ----- geometri
  /** koordinat habitat → koordinat lokal modul (kebalikan localOf) */
  toModuleLocal(m: PlacedMod, v: THREE.Vector3, out = new THREE.Vector3()) {
    const th = -(m.rot * Math.PI) / 2, c = Math.cos(th), s = Math.sin(th);
    const dx = v.x - m.ix * CELL, dz = v.z - m.iz * CELL;
    return out.set(dx * c - dz * s, v.y, dx * s + dz * c);
  }
  localOf(m: PlacedMod, lx: number, lz: number, out = new THREE.Vector3()) {
    const th = -(m.rot * Math.PI) / 2, c = Math.cos(th), s = Math.sin(th);
    return out.set(m.ix * CELL + lx * c + lz * s, 0, m.iz * CELL - lx * s + lz * c);
  }
  hatchLocal(m: PlacedMod, out = new THREE.Vector3()) {
    // posisi hatch luar (di sisi "keluar" modul = berlawanan port); y=1.2
    const portLocal = MOD_DEFS[m.type].ports.indexOf(true);
    const outLocal = (portLocal + 2) % 4;
    const [dx, dz] = DIRS[outLocal];
    this.localOf(m, dx * 3.4, dz * 3.4, out);
    out.y = 1.2;
    return out;
  }
  hatchDirLocal(m: PlacedMod, out = new THREE.Vector3()) {
    const p = MOD_DEFS[m.type].ports.indexOf(true);
    const o = (p + 2) % 4;
    const [dx, dz] = DIRS[o];
    const th = -(m.rot * Math.PI) / 2, c = Math.cos(th), s = Math.sin(th);
    return out.set(dx * c + dz * s, 0, -dx * s + dz * c);
  }
  moduleCenterWorld(m: PlacedMod, out = new THREE.Vector3()) {
    out.set(m.ix * CELL, 1.2, m.iz * CELL);
    return out.applyQuaternion(this.quat).add(this.pos);
  }
  hatchWorld(m: PlacedMod, out = new THREE.Vector3()) {
    this.hatchLocal(m, out);
    return out.applyQuaternion(this.quat).add(this.pos);
  }
  toWorld(v: THREE.Vector3, out = new THREE.Vector3()) { return out.copy(v).applyQuaternion(this.quat).add(this.pos); }
  toLocalPoint(w: THREE.Vector3, out = new THREE.Vector3()) {
    this.tmpQ.copy(this.quat).invert();
    return out.copy(w).sub(this.pos).applyQuaternion(this.tmpQ);
  }
  modulesOf(type: ModType) { return [...this.mods.values()].filter((m) => m.type === type); }
  has(type: ModType) { return this.modulesOf(type).length > 0; }

  blocked(x: number, z: number, r = 0.28): boolean {
    const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
    const m = this.getMod(ix, iz);
    if (!m) return true;
    const lx = x - ix * CELL, lz = z - iz * CELL;
    const open = this.openWorld(m);
    const lim = 2.9 - r;
    if (lz < -lim && !(open[0] && Math.abs(lx) < DOOR_W / 2 - 0.1)) return true;
    if (lx > lim && !(open[1] && Math.abs(lz) < DOOR_W / 2 - 0.1)) return true;
    if (lz > lim && !(open[2] && Math.abs(lx) < DOOR_W / 2 - 0.1)) return true;
    if (lx < -lim && !(open[3] && Math.abs(lz) < DOOR_W / 2 - 0.1)) return true;
    // ke koordinat lokal-modul
    const ph = (m.rot * Math.PI) / 2, c = Math.cos(ph), s = Math.sin(ph);
    const px = lx * c + lz * s, pz = -lx * s + lz * c;
    const rs = this.rects.get(m.key);
    if (rs) for (const q of rs) if (px > q.minX - r && px < q.maxX + r && pz > q.minZ - r && pz < q.maxZ + r) return true;
    return false;
  }
  interactionAt(x: number, z: number): Interact | null {
    const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
    const m = this.getMod(ix, iz);
    if (!m) return null;
    const lx = x - ix * CELL, lz = z - iz * CELL;
    const ph = (m.rot * Math.PI) / 2, c = Math.cos(ph), s = Math.sin(ph);
    const px = lx * c + lz * s, pz = -lx * s + lz * c;
    const sp = this.spots.get(m.key);
    if (!sp) return null;
    let best: InterSpot | null = null, bd = 1e9;
    for (const p of sp) {
      const d = Math.hypot(px - p.x, pz - p.z);
      if (d < p.r && d < bd) { bd = d; best = p; }
    }
    return best ? { text: best.text, action: best.action, mod: m } : null;
  }
  // titik tengah modul tempat pemain berada (untuk cahaya)
  cellCenterAt(x: number, z: number, out: THREE.Vector3) {
    return out.set(Math.round(x / CELL) * CELL, 2.4, Math.round(z / CELL) * CELL);
  }
  spawnPoint(): THREE.Vector3 {
    const core = this.coreKey();
    const m = core ? this.mods.get(core) : undefined;
    return new THREE.Vector3((m?.ix ?? 0) * CELL, 1.65, ((m?.iz ?? 0) * CELL) + 2.0);
  }
  // titik masuk interior (di dalam hatch) untuk modul airlock/dock
  entryPoint(m: PlacedMod): { pos: THREE.Vector3; yaw: number } {
    const portLocal = MOD_DEFS[m.type].ports.indexOf(true);
    const outLocal = (portLocal + 2) % 4; // arah hatch
    const [dx, dz] = DIRS[outLocal];
    const v = this.localOf(m, -dx * 1.2, -dz * 1.2);
    v.y = 1.65;
    // menghadap kembali ke dalam (jauh dari hatch)
    const wdir = new THREE.Vector3(-dx, 0, -dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -(m.rot * Math.PI) / 2);
    return { pos: v, yaw: Math.atan2(-wdir.x, -wdir.z) };
  }

  // ----- pose dunia
  updatePose(origin: THREE.Vector3, bumi: Body | null, sunPos: THREE.Vector3, time = 0) {
    if (this.kind === 'base' && this.body) {
      this.localPos.copy(this.dirL).multiplyScalar(this.body.surfaceRadius(this.dirL) - 0.05);
      this.localQuat.setFromUnitVectors(this.tmpV.set(0, 1, 0), this.dirL);
      this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 1, 0), this.yaw);
      this.localQuat.multiply(this.tmpQ);
      this.pos.copy(this.localPos).applyQuaternion(this.body.quat).add(this.body.pos);
      this.quat.copy(this.body.quat).multiply(this.localQuat);
    } else if (bumi) {
      // orbit lingkaran Kepler mengelilingi Bumi: ω = √(μ/r³); orientasi LVLH (lantai menghadap Bumi)
      const r = this.stOffset.length();
      if (r > 0) {
        this.orbE1.copy(this.stOffset).divideScalar(r);
        this.orbE2.set(0.12, 1, 0.02).normalize().cross(this.orbE1).normalize();
        const w = Math.sqrt(bumi.mu / (r * r * r));
        const th = w * time;
        const c = Math.cos(th), sn = Math.sin(th);
        const radial = this.tmpV.copy(this.orbE1).multiplyScalar(c).addScaledVector(this.orbE2, sn);
        this.pos.copy(bumi.pos).addScaledVector(radial, r);
        const tang = new THREE.Vector3().copy(this.orbE1).multiplyScalar(-sn).addScaledVector(this.orbE2, c);
        this.vel.copy(bumi.vel).addScaledVector(tang, r * w);
        const z = new THREE.Vector3().copy(tang).cross(radial).normalize();
        this.orbBasis.makeBasis(tang, radial, z);
        this.quat.setFromRotationMatrix(this.orbBasis);
      }
    }
    if (this.kind === 'base' && this.body) this.vel.copy(this.body.vel).add(this.tmpV.copy(this.body.omegaVec).cross(this.tmpV2.copy(this.pos).sub(this.body.pos)));
    if (this.kind === 'base') { this.ext.position.copy(this.localPos); this.ext.quaternion.copy(this.localQuat); }
    const d = this.pos.distanceTo(sunPos);
    this.sunFactor = Math.min(2.5, Math.max(0.04, Math.pow(9.5e6 / Math.max(d, 1e6), 2)));
    void origin;
  }

  syncRender(origin: THREE.Vector3) {
    if (this.kind === 'station') { this.ext.position.copy(this.pos).sub(origin); this.ext.quaternion.copy(this.quat); }
    this.beacon.position.copy(this.pos).sub(origin);
    this.int.position.copy(this.pos).sub(origin);
    this.int.quaternion.copy(this.quat);
  }

  // atur grup eksterior: base → anak spinG; stasiun → anak adegan dunia (posisi diatur engine)
  attachExterior(world: THREE.Scene) {
    if (this.kind === 'base' && this.body) this.body.spinG.add(this.ext);
    else world.add(this.ext);
    world.add(this.beacon);
  }

  // dipanggil tiap frame
  update(dt: number, time: number, camDist: number) {
    for (const [k, t] of this.anim) {
      const nt = t + dt;
      const g = this.extMods.get(k);
      const m = this.mods.get(k);
      if (!g || !m) { this.anim.delete(k); continue; }
      const f = Math.min(1, nt / 1.4);
      const e = 1 - Math.pow(1 - f, 3);
      // meluncur masuk dari sisi luar
      const out = new THREE.Vector3(m.ix, 0, m.iz);
      if (out.lengthSq() > 0) out.normalize();
      const bx = m.ix * CELL, bz = m.iz * CELL;
      g.position.set(bx + out.x * (1 - e) * 14, (1 - e) * 4, bz + out.z * (1 - e) * 14);
      g.scale.setScalar(0.4 + 0.6 * e);
      if (f >= 1) { g.position.set(bx, 0, bz); g.scale.setScalar(1); this.anim.delete(k); } else this.anim.set(k, nt);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.t += dt;
      gh.g.position.addScaledVector(gh.v, dt);
      gh.g.rotation.x += gh.w.x * dt; gh.g.rotation.y += gh.w.y * dt; gh.g.rotation.z += gh.w.z * dt;
      const f = gh.t / 6;
      gh.g.scale.setScalar(Math.max(0.01, 1 - f * f));
      if (gh.t > 6) { this.ghostRoot.remove(gh.g); disposeTree(gh.g); this.ghosts.splice(i, 1); }
    }
    // pipa sandar teleskopik
    this.dockExt += (this.dockTarget - this.dockExt) * (1 - Math.exp(-1.6 * dt));
    if (this.tube) {
      const dock = this.modulesOf('dock')[0];
      const len = (3.4 + DOCK_GAP - 3.0) * this.dockExt;
      if (dock && len > 0.08) {
        const dir = this.hatchDirLocal(dock, this.tmpV);
        const c = this.localOf(dock, 0, 0, new THREE.Vector3());
        this.tube.visible = true;
        this.tube.position.set(c.x + dir.x * (3.0 + len / 2), MOD_H / 2, c.z + dir.z * (3.0 + len / 2));
        this.tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.tube.scale.set(1, len, 1);
      } else this.tube.visible = false;
    }
    for (let i = 0; i < this.blinkers.length; i++) {
      const bl = this.blinkers[i];
      bl.visible = Math.floor(time * 1.4 + i * 0.37) % 2 === 0;
    }
    if (this.fx) this.fx.update(dt);
    if (this.fxInt) this.fxInt.update(dt);
    // suar jarak jauh
    const k = Math.min(6e4, Math.max(2.5, camDist * 0.012));
    this.beacon.scale.setScalar(k);
    (this.beacon.material as THREE.SpriteMaterial).opacity = camDist < 40 ? 0 : Math.min(1, (camDist - 40) / 400) * (0.6 + 0.4 * Math.sin(time * 3));
  }

  // ----- simpan/muat
  toJSON(): HabSave {
    return {
      id: this.id, name: this.name, kind: this.kind, bodyId: this.body?.id,
      dir: this.kind === 'base' ? [this.dirL.x, this.dirL.y, this.dirL.z] : undefined, yaw: this.yaw,
      mods: [...this.mods.values()].map((m) => ({ ix: m.ix, iz: m.iz, type: m.type, rot: m.rot })),
      dmg: [...this.dmg.entries()].filter(([k, d]) => this.mods.has(k) && (d.hp < 0.999 || d.dents.length || d.lost.length)).map(([key, d]) => ({ key, hp: d.hp, fire: 0, dents: d.dents, lost: d.lost })),
    };
  }
}

export const BASE_KIT: { type: ModType; ix: number; iz: number; rot: number }[] = [
  { type: 'hub', ix: 0, iz: 0, rot: 0 },
  { type: 'airlock', ix: 0, iz: -1, rot: 0 },
  { type: 'hab', ix: 0, iz: 1, rot: 0 },
  { type: 'power', ix: 1, iz: 0, rot: 1 },
];

export const STATION_LAYOUT: { type: ModType; ix: number; iz: number; rot: number }[] = [
  { type: 'hub', ix: 0, iz: 0, rot: 0 },
  { type: 'dock', ix: 0, iz: -1, rot: 0 },
  { type: 'airlock', ix: -1, iz: 0, rot: 3 },
  { type: 'hab', ix: 0, iz: 1, rot: 0 },
  { type: 'power', ix: 1, iz: 0, rot: 1 },
];
