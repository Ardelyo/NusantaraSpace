// Model kapal: kokpit, kabin, airlock, ruang mesin, eksterior — semua detail interior
import * as THREE from 'three';

export const GEAR_H = 1.3; // tinggi roda pendarat di bawah lantai
export const PILOT_EYE = new THREE.Vector3(-0.8, 1.3, -3.15);
export const AIRLOCK_IN = new THREE.Vector3(1.0, 1.65, 4.9);
export const WALK_START = new THREE.Vector3(0.2, 1.65, 0.3);
export const SEAT_POS = new THREE.Vector3(-0.8, 0, -2.9);
export const HATCH_OUT = new THREE.Vector3(3.4, 1.0, 4.9);

export interface Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface ShipRig {
  group: THREE.Group;
  screens: { radar: Screen; nav: Screen; status: Screen; map: Screen };
  throttleLever: THREE.Group;
  yoke: THREE.Group;
  holo: THREE.Group;
  holoPlanets: Map<string, THREE.Mesh>;
  holoShip: THREE.Mesh;
  blinkers: { mesh: THREE.Mesh; phase: number; speed: number }[];
  engineGlows: THREE.Mesh[];
  engineLight: THREE.PointLight;
  hatch: THREE.Mesh;
  hatchLamp: THREE.Mesh;
  lights: { cockpit: THREE.PointLight; cabin: THREE.PointLight; airlock: THREE.PointLight; hemi: THREE.HemisphereLight };
  sun: THREE.DirectionalLight;
  colliders: Rect[];
  legs: THREE.Group[];
  fans: THREE.Mesh[];
  reactor: THREE.Mesh;
  exteriorOnly: THREE.Object3D[];
  /** bagian eksterior yang dapat lepas/rusak: id → objek-objeknya */
  parts: Map<string, THREE.Object3D[]>;
}

function makeScreen(w = 256, h = 160): Screen {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#021016';
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, tex };
}

export function buildShip(): ShipRig {
  const g = new THREE.Group();
  const L = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const E = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const hull = L(0xb4bcc6), hullD = L(0x4a525c), dark = L(0x1c2026), accent = L(0xd9692a), floorM = L(0x2f343b), fabric = L(0x2c3a52), fabricB = L(0x7a2f2f);
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.8, roughness: 0.35 });
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const cyan = E(0x45e3ff), amber = E(0xffb030), green = E(0x40ff90), red = E(0xff3a30), white = E(0xf4f8ff);
  const colliders: Rect[] = [];
  const blinkers: ShipRig['blinkers'] = [];
  const exteriorOnly: THREE.Object3D[] = [];
  const parts = new Map<string, THREE.Object3D[]>();

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, p: THREE.Object3D = g) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    p.add(me);
    return me;
  };
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, m: THREE.Material, rot: [number, number, number] = [0, 0, 0], p: THREE.Object3D = g, seg = 14) => {
    const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    me.position.set(x, y, z);
    me.rotation.set(rot[0], rot[1], rot[2]);
    p.add(me);
    return me;
  };
  const sph = (r: number, x: number, y: number, z: number, m: THREE.Material, p: THREE.Object3D = g, s = 12) => {
    const me = new THREE.Mesh(new THREE.SphereGeometry(r, s, s), m);
    me.position.set(x, y, z);
    p.add(me);
    return me;
  };
  const blink = (x: number, y: number, z: number, m: THREE.Material, sp = 1, r = 0.025, p: THREE.Object3D = g) => {
    const me = sph(r, x, y, z, m.clone(), p, 8);
    blinkers.push({ mesh: me, phase: Math.random() * 6, speed: sp * (0.6 + Math.random()) });
    return me;
  };
  const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => colliders.push({ minX, maxX, minZ, maxZ });

  // ====== LANTAI / LANGIT-LANGIT / DINDING ======
  box(4.3, 0.14, 12.4, 0, -0.07, 1, floorM);
  box(4.5, 0.5, 11.6, 0, -0.45, 1.3, hullD);
  box(4.3, 0.14, 12.4, 0, 2.77, 1, hull);
  // alur lantai
  for (let z = -4.5; z < 6.2; z += 0.9) box(3.9, 0.012, 0.03, 0, 0.005, z, dark);
  for (const x of [-1.3, 1.3]) box(0.04, 0.012, 11, x, 0.006, 1, amber);
  // dinding samping
  for (const s of [-1, 1]) {
    const X = s * 2.05;
    box(0.12, 1.15, 12.4, X, 0.575, 1, hull); // bawah
    box(0.12, 0.35, 12.4, X, 2.58, 1, hull); // atas
    box(0.12, 1.2, 0.45, X, 1.75, -4.8, hull); // pilar kokpit depan
    box(0.12, 1.2, 0.5, X, 1.75, -1.3, hull);
    box(0.12, 1.2, 0.35, X, 1.75, 0.45, hull); // porthole
    box(0.12, 1.2, 0.3, X, 1.75, 1.5, hull);
    box(0.12, 1.2, 5.2, X, 1.75, 4.55, hull);
    box(0.12, 1.2, 1.7, X, 1.75, -2.95 - 0.0, glass);
    box(0.12, 0.8, 0.8, X, 1.8, 1.0, glass);
    // frame berwarna
    box(0.14, 0.05, 12.4, X, 1.15, 1, accent);
    box(0.14, 0.04, 12.4, X, 2.4, 1, hullD);
    // panel jahitan
    for (let z = -4; z < 7; z += 1.1) box(0.14, 2.7, 0.025, X * 0.999, 1.35, z, hullD);
  }
  // sisi dalam kokpit: panel samping
  for (const s of [-1, 1]) {
    const X = s * 1.93;
    const pnl = box(0.1, 0.75, 1.9, X, 1.0, -3.0, dark);
    pnl.rotation.z = s * 0.15;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(0.03, 0.06, 0.12, s * 1.86, 0.78 + j * 0.16, -3.8 + i * 0.32, [cyan, amber, green, red][(i + j * 2) % 4]);
    box(0.06, 0.2, 1.5, s * 1.88, 1.42, -3.1, L(0x1d242c));
  }
  // dinding depan kokpit (z=-5)
  box(4.3, 1.1, 0.14, 0, 0.55, -5.0, hull);
  box(4.3, 0.28, 0.14, 0, 2.62, -5.0, hull);
  for (const x of [-1.95, 1.95]) box(0.35, 1.7, 0.14, x, 1.9, -5.0, hull);
  box(0.12, 1.5, 0.14, 0, 1.85, -5.0, hullD);
  box(0.06, 1.45, 0.06, -0.98, 1.85, -5.0, hullD);
  box(0.06, 1.45, 0.06, 0.98, 1.85, -5.0, hullD);
  const ws = box(3.7, 1.5, 0.02, 0, 1.85, -5.02, glass);
  ws.name = 'windshield';
  // dinding belakang
  box(4.3, 2.8, 0.14, 0, 1.35, 7.1, hull);

  // ====== BULKHEAD KOKPIT/KABIN z=-1 ======
  for (const s of [-1, 1]) {
    box(1.4, 2.7, 0.14, s * 1.3, 1.35, -1.0, hull);
    box(0.05, 2.1, 0.17, s * 0.62, 1.05, -1.0, hullD);
    sph(0.03, s * 0.6, 2.0, -0.9, amber, g, 6);
    rect(s > 0 ? 0.6 : -2, s > 0 ? 2 : -0.6, -1.12, -0.88);
  }
  box(1.3, 0.62, 0.14, 0, 2.4, -1.0, hull);
  box(1.34, 0.07, 0.17, 0, 2.11, -1.0, hullD);

  // layar peta di bulkhead sisi kabin
  const mapScr = makeScreen(320, 200);
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshBasicMaterial({ map: mapScr.tex, toneMapped: false }));
  mapMesh.position.set(1.3, 1.5, -0.91);
  mapMesh.rotation.y = 0;
  g.add(mapMesh);
  box(1.08, 0.7, 0.04, 1.3, 1.5, -0.935, dark);
  box(1.0, 0.06, 0.06, -1.3, 1.9, -0.91, L(0x333840));
  // poster / emblem
  const em = makeScreen(128, 128);
  em.ctx.fillStyle = '#10151c'; em.ctx.fillRect(0, 0, 128, 128);
  em.ctx.strokeStyle = '#ff9a3c'; em.ctx.lineWidth = 3; em.ctx.beginPath(); em.ctx.arc(64, 64, 44, 0, 7); em.ctx.stroke();
  em.ctx.fillStyle = '#ff9a3c'; em.ctx.font = 'bold 16px sans-serif'; em.ctx.textAlign = 'center'; em.ctx.fillText('NUSANTARA', 64, 62); em.ctx.font = '12px sans-serif'; em.ctx.fillText('EKSPEDISI 7', 64, 80);
  em.tex.needsUpdate = true;
  const emM = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: em.tex }));
  emM.position.set(-1.3, 1.5, -0.91);
  g.add(emM);

  // ====== DASBOR ======
  const dash = box(3.9, 0.55, 0.95, 0, 0.78, -4.45, dark);
  dash.rotation.x = -0.3;
  box(3.95, 0.08, 1.0, 0, 1.08, -4.55, hullD).rotation.x = -0.3;
  box(3.9, 0.04, 0.05, 0, 1.12, -4.1, accent);
  const radar = makeScreen(), nav = makeScreen(), status = makeScreen();
  const scrMat = (s: Screen) => new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false });
  const scrDefs: [Screen, number, number][] = [[radar, -1.35, 0.7], [nav, -0.62, 0.9], [status, 0.62, 0.9]];
  for (const [s, x, w] of scrDefs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), scrMat(s));
    m.position.set(x, 1.0, -4.12);
    m.rotation.x = -1.0;
    m.position.y = 1.08;
    g.add(m);
    const fr = box(w + 0.08, w * 0.62 + 0.08, 0.03, x, 1.075, -4.145, hullD);
    fr.rotation.x = -1.0;
  }
  const s4 = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38), scrMat(mapScr));
  s4.position.set(1.45, 1.08, -4.12);
  s4.rotation.x = -1.0;
  g.add(s4);
  box(0.7, 0.46, 0.03, 1.45, 1.075, -4.145, hullD).rotation.x = -1.0;
  // tombol dan saklar di dasbor
  for (let i = 0; i < 18; i++) {
    const x = -1.9 + i * 0.22;
    const b = box(0.07, 0.05, 0.07, x, 0.97, -3.84, [cyan, amber, green, red, white][i % 5].clone());
    b.rotation.x = -0.3;
    if (i % 3 === 0) blinkers.push({ mesh: b, phase: i, speed: 0.4 + (i % 4) * 0.3 });
  }
  for (let i = 0; i < 6; i++) {
    cyl(0.012, 0.012, 0.09, 0.05 + i * 0.15 - 0.45, 1.0, -3.76, metal, [-0.3, 0, 0]);
    sph(0.022, 0.05 + i * 0.15 - 0.45, 1.04, -3.775, [red, amber, green][i % 3], g, 8);
  }
  // atap dasbor (visor)
  box(4.0, 0.06, 0.5, 0, 2.55, -4.75, hullD);
  // panel atas
  box(2.4, 0.14, 0.9, 0, 2.62, -3.3, dark);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) {
    const m = box(0.06, 0.03, 0.06, -1.05 + i * 0.19, 2.53, -3.65 + r * 0.28, [cyan, amber, green, white, red][(i + r) % 5].clone());
    if ((i + r) % 4 === 0) blinkers.push({ mesh: m, phase: i * r, speed: 0.5 + (i % 3) * 0.4 });
  }
  box(0.5, 0.04, 0.3, -0.6, 2.54, -3.0, hullD);
  // konsol tengah + tuas gas
  box(0.42, 0.45, 1.5, 0, 0.22, -3.0, dark);
  rect(-0.25, 0.25, -3.8, -2.2);
  box(0.36, 0.03, 1.4, 0, 0.465, -3.0, hullD);
  for (let i = 0; i < 8; i++) box(0.04, 0.02, 0.08, -0.12 + (i % 4) * 0.08, 0.485, -3.5 + Math.floor(i / 4) * 0.15, [cyan, amber][i % 2]);
  const throttleLever = new THREE.Group();
  throttleLever.position.set(0, 0.5, -2.65);
  box(0.28, 0.02, 0.5, 0, 0.0, -0.1, E(0x0a1218), throttleLever);
  box(0.02, 0.01, 0.46, 0, 0.012, -0.1, cyan, throttleLever);
  const lev = new THREE.Group();
  cyl(0.014, 0.014, 0.28, 0, 0.14, 0, metal, [0, 0, 0], lev);
  box(0.07, 0.08, 0.06, 0, 0.3, 0, accent, lev);
  throttleLever.add(lev);
  g.add(throttleLever);
  // yoke
  const yoke = new THREE.Group();
  yoke.position.set(-0.8, 0.82, -3.95);
  cyl(0.03, 0.04, 0.5, 0, -0.1, 0.18, metal, [1.2, 0, 0], yoke);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24, Math.PI * 1.5), L(0x15181d));
  ring.position.set(0, 0.1, 0.35);
  ring.rotation.set(-0.3, 0, Math.PI * 0.75);
  yoke.add(ring);
  for (const s of [-1, 1]) box(0.05, 0.1, 0.05, s * 0.17, 0.1, 0.35, accent, yoke).rotation.x = -0.3;
  g.add(yoke);

  // ====== KURSI ======
  const seat = (x: number, z: number, fab: THREE.Material) => {
    box(0.62, 0.22, 0.65, x, 0.38, z, fab);
    box(0.62, 0.95, 0.16, x, 0.95, z + 0.36, fab).rotation.x = 0.12;
    box(0.4, 0.25, 0.12, x, 1.55, z + 0.4, fab);
    for (const s of [-1, 1]) {
      box(0.08, 0.1, 0.5, x + s * 0.36, 0.7, z, hullD);
      box(0.06, 0.22, 0.06, x + s * 0.36, 0.5, z + 0.1, metal);
    }
    cyl(0.07, 0.12, 0.2, x, 0.14, z, metal);
    box(0.62, 0.015, 0.1, x, 0.5, z - 0.15, accent);
    rect(x - 0.38, x + 0.38, z - 0.4, z + 0.5);
  };
  seat(-0.8, -2.9, fabric);
  seat(0.8, -2.9, fabricB);

  // ====== KABIN ======
  // meja holo
  const tbl = new THREE.Group();
  tbl.position.set(0, 0, 1.25);
  cyl(0.5, 0.58, 0.12, 0, 0.06, 0, hullD, [0, 0, 0], tbl, 24);
  cyl(0.18, 0.28, 0.7, 0, 0.45, 0, metal, [0, 0, 0], tbl, 16);
  cyl(0.6, 0.45, 0.1, 0, 0.84, 0, dark, [0, 0, 0], tbl, 32);
  cyl(0.5, 0.5, 0.012, 0, 0.895, 0, cyan, [0, 0, 0], tbl, 32).material = new THREE.MeshBasicMaterial({ color: 0x1a8fa8, toneMapped: false, transparent: true, opacity: 0.55 });
  g.add(tbl);
  rect(-0.65, 0.65, 0.55, 1.95);
  const holo = new THREE.Group();
  holo.position.set(0, 1.12, 1.25);
  g.add(holo);
  const holoMat = new THREE.MeshBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false });
  const holoPlanets = new Map<string, THREE.Mesh>();
  holo.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), E(0xffc060)));
  const ringMat = new THREE.LineBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.35 });
  for (let i = 1; i <= 6; i++) {
    const pts: THREE.Vector3[] = [];
    const r = 0.06 + i * 0.07;
    for (let a = 0; a <= 64; a++) pts.push(new THREE.Vector3(Math.cos((a / 64) * 6.2832) * r, 0, Math.sin((a / 64) * 6.2832) * r));
    holo.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }
  const holoShip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 4), E(0xffffff));
  holo.add(holoShip);
  void holoMat;
  for (const id of ['merkurius', 'venus', 'bumi', 'mars', 'jupiter', 'saturnus', 'uranus', 'neptunus', 'pluto']) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(id === 'jupiter' || id === 'saturnus' ? 0.02 : 0.012, 8, 8), E(0x9be8ff));
    holo.add(m);
    holoPlanets.set(id, m);
  }
  // bunk: rangka dengan 4 tiang, dua kasur bersusun, rel pengaman dan tangga
  {
    const bx = -1.5, z0 = 1.85, z1 = 3.85, zc = (z0 + z1) / 2;
    for (const px of [bx - 0.46, bx + 0.46]) for (const pz of [z0 + 0.03, z1 - 0.03]) box(0.06, 2.0, 0.06, px, 1.0, pz, metal);
    for (let k = 0; k < 2; k++) {
      const y = 0.38 + k * 0.95; // permukaan rangka
      box(0.98, 0.07, 2.0, bx, y, zc, hullD);
      box(0.9, 0.13, 1.92, bx, y + 0.1, zc, k ? L(0x9fb1c6) : L(0xc9ccd2));
      box(0.86, 0.06, 1.0, bx, y + 0.18, z1 - 0.55, k ? fabricB : fabric);
      box(0.5, 0.09, 0.3, bx, y + 0.2, z0 + 0.28, L(0xeeeeee));
      box(0.04, 0.16, 1.9, bx - 0.47, y + 0.14, zc, hullD); // rel sisi dinding
      if (k) box(0.03, 0.2, 1.2, bx + 0.47, y + 0.2, z1 - 0.65, metal); // rel pengaman sisi lorong
      box(0.9, 0.02, 0.03, bx, y + 0.34, z0 + 0.02, k ? amber : cyan); // lampu baca
    }
    // tangga di ujung depan kasur
    for (const dz of [-0.17, 0.17]) box(0.03, 1.55, 0.03, bx + 0.46, 0.8, z0 - 0.3 + dz, metal);
    for (let i = 0; i < 5; i++) box(0.03, 0.03, 0.36, bx + 0.46, 0.25 + i * 0.3, z0 - 0.3, metal);
    blink(bx - 0.42, 1.9, z0 + 0.05, cyan, 0.5);
  }
  rect(-1.98, -0.98, 1.8, 3.9);
  // loker atas
  for (let i = 0; i < 4; i++) {
    box(0.4, 0.55, 0.5, -1.75, 2.35, 1.9 + i * 0.52, i % 2 ? hull : hullD);
    box(0.02, 0.1, 0.1, -1.54, 2.35, 1.95 + i * 0.52, amber);
  }
  // galley
  box(0.7, 0.9, 2.0, 1.65, 0.45, -0.1 + 0.8, hull);
  box(0.72, 0.05, 2.02, 1.65, 0.92, 0.7, dark);
  box(0.3, 0.1, 0.4, 1.65, 0.93, 0.2, metal);
  cyl(0.02, 0.02, 0.2, 1.65, 1.05, 0.12, metal);
  for (const z of [0.9, 1.2]) cyl(0.12, 0.12, 0.02, 1.62, 0.955, z, L(0x222), [0, 0, 0], g, 20);
  for (let i = 0; i < 3; i++) box(0.12, 0.12, 0.12, 1.65, 0.99, 1.45 + i * 0.15, [accent, fabric, fabricB][i]);
  box(0.7, 1.9, 0.6, 1.65, 0.95, 2.3, L(0xdfe4ea));
  box(0.02, 0.8, 0.04, 1.3, 1.1, 2.05, metal);
  box(0.02, 0.22, 0.03, 1.3, 1.5, 2.06, amber);
  box(0.4, 0.5, 1.6, 1.8, 2.35, 0.7, hullD);
  box(0.02, 0.1, 0.1, 1.59, 2.35, 0.2, cyan);
  rect(1.28, 2.0, -0.6, 1.75);
  rect(1.28, 2.0, 1.98, 2.62);
  // pipa langit-langit
  for (const [x, y, r] of [[-1.7, 2.62, 0.05], [-1.55, 2.64, 0.035], [1.7, 2.62, 0.05], [0, 2.68, 0.04]] as [number, number, number][]) {
    cyl(r, r, 12, x, y, 1, metal, [Math.PI / 2, 0, 0]);
    for (let z = -4; z < 7; z += 2.2) cyl(r * 1.4, r * 1.4, 0.1, x, y, z, hullD, [Math.PI / 2, 0, 0]);
  }
  for (let z = -3.5; z < 7; z += 2.3) {
    box(0.3, 0.04, 1.2, 0, 2.7, z, white);
  }
  // kabinet kontrol kabin kiri belakang + rak
  box(0.35, 2.0, 1.0, -1.75, 1.0, 4.5, dark);
  rect(-2, -1.4, 4.0, 5.0);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) box(0.02, 0.05, 0.1, -1.56, 0.4 + i * 0.3, 4.2 + j * 0.3, [cyan, amber, green][(i + j) % 3]);
  // peti kargo
  box(0.6, 0.6, 0.6, -1.5, 0.3, 5.2, accent);
  box(0.62, 0.05, 0.62, -1.5, 0.62, 5.2, hullD);
  box(0.5, 0.5, 0.5, -1.55, 0.85, 5.2, L(0x56606b));
  rect(-1.82, -1.18, 4.9, 5.55);

  // ====== AIRLOCK ======
  for (const s of [-1, 1]) {
    box(0.9, 2.7, 0.14, s * 1.55, 1.35, 4.05, hull);
    rect(s > 0 ? 0.6 : -2, s > 0 ? 2 : -0.6, 3.93, 4.17);
  }
  box(1.3, 0.62, 0.14, 0, 2.4, 4.05, hull);
  box(1.34, 0.07, 0.17, 0, 2.11, 4.05, hullD);
  sph(0.04, 0, 2.06, 3.95, red.clone(), g, 6);
  for (const sx of [-1, 1]) {
    box(0.05, 2.1, 0.17, sx * 0.62, 1.05, 4.05, hullD);
    sph(0.03, sx * 0.6, 2.0, 3.95, amber, g, 6);
  }
  // dinding pembatas ruang mesin z=5.95 dengan jendela
  box(4.3, 0.9, 0.14, 0, 0.45, 5.95, hull);
  box(4.3, 0.55, 0.14, 0, 2.43, 5.95, hull);
  for (const x of [-1.9, 1.9]) box(0.5, 1.4, 0.14, x, 1.6, 5.95, hull);
  box(3.3, 1.3, 0.04, 0, 1.6, 5.95, new THREE.MeshBasicMaterial({ color: 0x77bbff, transparent: true, opacity: 0.12, depthWrite: false }));
  box(0.05, 1.3, 0.06, 0, 1.6, 5.95, hullD);
  for (let i = 0; i < 6; i++) box(0.4, 0.04, 0.05, -1.4 + i * 0.56, 0.96, 5.88, i % 2 ? amber : hullD);
  // panel airlock + hatch
  const hatch = box(0.14, 2.15, 1.5, 2.04, 1.08, 4.9, hullD);
  box(0.16, 1.9, 1.3, 2.045, 1.08, 4.9, hull).position.x = 2.0;
  hatch.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x1a2a40, transparent: true, opacity: 0.8 })));
  hatch.children[0].position.set(-0.05, 0.4, 0);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), accent);
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(-0.1, -0.2, 0);
  hatch.add(wheel);
  for (let i = 0; i < 3; i++) {
    const sp = box(0.03, 0.03, 0.4, -0.1, -0.2, 0, accent, hatch);
    sp.rotation.x = (i * Math.PI) / 3;
  }
  box(0.2, 2.2, 0.06, 1.97, 1.08, 4.1, hullD);
  const hatchLamp = sph(0.07, 1.9, 2.3, 4.2, red.clone(), g, 10);
  box(0.12, 0.34, 0.24, 1.92, 1.35, 4.2, dark);
  for (let i = 0; i < 3; i++) box(0.03, 0.04, 0.04, 1.85, 1.28 + i * 0.1, 4.2, [green, amber, red][i]);
  box(0.4, 0.04, 1.3, 1.5, 0.02, 4.9, amber);
  // helm & baju
  for (const [x, z, c] of [[-1.7, 4.9, 0xffffff], [-1.7, 5.3, 0xf2f2f2]] as [number, number, number][]) {
    box(0.4, 0.62, 0.3, x - 0.02, 1.3, z, L(c));
    box(0.34, 0.5, 0.26, x - 0.02, 0.7, z, L(c));
    box(0.12, 0.5, 0.12, x - 0.02, 0.2, z - 0.07, L(c));
    box(0.12, 0.5, 0.12, x - 0.02, 0.2, z + 0.07, L(c));
    sph(0.19, x - 0.02, 1.8, z, L(0xf5f5f5), g, 14);
    const vz = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xcf8a1e, metalness: 1, roughness: 0.1 }));
    vz.position.set(x + 0.08, 1.8, z);
    vz.rotation.z = -Math.PI / 2;
    g.add(vz);
    box(0.04, 0.4, 0.3, x - 0.2, 1.4, z, accent);
  }
  rect(-2, -1.5, 4.7, 5.55);
  for (let i = 0; i < 4; i++) blink(1.0 + i * 0.1 - 0.15, 2.58, 4.4, [amber, red, amber, red][i], 2);

  // ====== RUANG MESIN (terlihat lewat jendela) ======
  const reactor = cyl(0.42, 0.42, 1.9, 0, 1.1, 6.55, new THREE.MeshBasicMaterial({ color: 0x3aa8ff, toneMapped: false, transparent: true, opacity: 0.8 }), [0, 0, 0], g, 20);
  cyl(0.5, 0.5, 0.1, 0, 0.12, 6.55, hullD, [0, 0, 0], g, 20);
  cyl(0.5, 0.5, 0.1, 0, 2.1, 6.55, hullD, [0, 0, 0], g, 20);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283;
    cyl(0.04, 0.04, 2, Math.cos(a) * 0.62, 1.1, 6.55 + Math.sin(a) * 0.62, metal);
  }
  const fans: THREE.Mesh[] = [];
  for (const x of [-1.3, 1.3]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 6, 20), metal);
    f.position.set(x, 1.3, 6.45);
    g.add(f);
    for (let i = 0; i < 4; i++) {
      const bl = box(0.7, 0.04, 0.08, 0, 0, 0, hullD, f);
      bl.rotation.z = (i * Math.PI) / 4;
    }
    fans.push(f);
  }
  box(3.8, 0.1, 0.8, 0, 0.12, 6.7, dark);
  // ====== EKSTERIOR ======
  // hidung
  const nose = box(3.8, 0.12, 3.2, 0, 0.55, -6.5, hull);
  nose.rotation.x = 0.18;
  box(2.6, 0.12, 3.0, 0, 0.35, -6.6, hullD).rotation.x = 0.28;
  box(1.0, 0.25, 2.0, 0, 0.6, -7.4, accent).rotation.x = 0.2;
  cyl(0.05, 0.05, 1.6, 0, 0.9, -7.5, metal, [Math.PI / 2, 0, 0]);
  box(4.2, 0.1, 0.3, 0, 1.06, -5.4, hullD);
  // sayap
  for (const s of [-1, 1]) {
    const n0 = g.children.length;
    const w = box(4.2, 0.16, 3.2, s * 4.0, 0.7, 3.6, hull);
    w.rotation.z = s * -0.05;
    w.rotation.y = s * 0.12;
    box(1.2, 0.5, 2.2, s * 6.2, 0.78, 3.9, accent).scale.set(0.35, 0.5, 1);
    box(0.08, 1.2, 0.9, s * 6.0, 1.3, 4.9, hull);
    box(0.5, 0.05, 2.4, s * 3.9, 0.82, 3.2, hullD);
    cyl(0.3, 0.3, 2.8, s * 3.0, 0.58, 5.2, hull, [Math.PI / 2, 0, 0], g, 16);
    cyl(0.22, 0.22, 0.3, s * 3.0, 0.58, 6.7, dark, [Math.PI / 2, 0, 0], g, 16);
    cyl(0.12, 0.12, 0.05, s * 3.0, 0.58, 6.86, amber, [Math.PI / 2, 0, 0], g, 16);
    blink(s * 6.1, 0.82, 4.2, s < 0 ? red : green, 1.2, 0.07);
    parts.set(s < 0 ? 'wingL' : 'wingR', g.children.slice(n0));
  }
  // sirip ekor + antena + parabola
  const nFin = g.children.length;
  box(0.12, 1.6, 1.6, 0, 3.5, 6.0, hull);
  box(0.14, 0.3, 1.0, 0, 4.3, 6.2, accent);
  blink(0, 4.5, 6.5, white, 1.5, 0.07);
  parts.set('fin', g.children.slice(nFin));
  const nDish = g.children.length;
  cyl(0.02, 0.02, 1.3, 0.6, 3.4, 0.8, metal);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), metal);
  dish.position.set(-0.8, 3.0, 1.5);
  dish.rotation.x = -0.8;
  g.add(dish);
  cyl(0.03, 0.03, 0.4, -0.8, 2.85, 1.5, metal);
  parts.set('dish', g.children.slice(nDish));
  box(2.2, 0.1, 5.2, 0, 2.86, 1.2, hullD);
  for (let i = 0; i < 6; i++) box(0.5, 0.03, 0.2, -0.9 + (i % 3) * 0.9, 2.93, 0.2 + Math.floor(i / 3) * 3.4, i % 2 ? accent : metal);
  // nama kapal
  const nm = makeScreen(512, 96);
  nm.ctx.clearRect(0, 0, 512, 96);
  nm.ctx.fillStyle = '#b4bcc6'; nm.ctx.fillRect(0, 0, 512, 96);
  nm.ctx.fillStyle = '#d9692a'; nm.ctx.font = 'bold 54px sans-serif'; nm.ctx.textAlign = 'center'; nm.ctx.fillText('NUSANTARA-7', 256, 66);
  nm.tex.needsUpdate = true;
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.56), new THREE.MeshBasicMaterial({ map: nm.tex }));
    m.position.set(s * 2.125, 1.8, -0.9);
    m.rotation.y = s * Math.PI / 2;
    // letakkan di sisi luar bawah jendela
    m.position.set(s * 2.13, 0.62, 4.0);
    g.add(m);
    exteriorOnly.push(m);
  }
  // roda pendarat
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-1.6, -3.5], [1.6, -3.5], [-1.7, 4.7], [1.7, 4.7]] as [number, number][]) {
    const lg = new THREE.Group();
    lg.position.set(x, -0.2, z);
    cyl(0.07, 0.05, 1.1, 0, -0.5, 0, metal, [0, 0, 0], lg);
    cyl(0.03, 0.03, 0.9, x > 0 ? -0.2 : 0.2, -0.35, 0, hullD, [0, 0, x > 0 ? -0.5 : 0.5], lg);
    cyl(0.28, 0.32, 0.08, 0, -1.08, 0, hullD, [0, 0, 0], lg, 16);
    cyl(0.1, 0.1, 0.03, 0, -1.04, 0, amber, [0, 0, 0], lg, 10);
    g.add(lg);
    legs.push(lg);
  }
  legs.forEach((l, i) => parts.set('leg' + i, [l]));
  // mesin utama + nyala
  const engineGlows: THREE.Mesh[] = [];
  let engI = 0;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const [x, y] of [[0, 1.3], [-0.9, 0.8], [0.9, 0.8]] as [number, number][]) {
    const nEng = g.children.length;
    cyl(0.32, 0.45, 0.6, x, y, 7.4, dark, [Math.PI / 2, 0, 0], g, 16);
    cyl(0.4, 0.4, 0.04, x, y, 7.7, hullD, [Math.PI / 2, 0, 0], g, 16);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 3.0, 14, 1, true), glowMat.clone());
    cone.position.set(x, y, 9.2);
    cone.rotation.x = Math.PI / 2;
    g.add(cone);
    engineGlows.push(cone);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.position.set(x, y, 8.4);
    core.rotation.x = Math.PI / 2;
    g.add(core);
    engineGlows.push(core);
    parts.set('engine' + engI++, g.children.slice(nEng));
  }
  // sensor, lampu depan
  for (const s of [-1, 1]) {
    cyl(0.12, 0.2, 0.3, s * 1.0, 0.55, -8.0, dark, [Math.PI / 2, 0, 0]);
    cyl(0.1, 0.1, 0.02, s * 1.0, 0.55, -8.17, white, [Math.PI / 2, 0, 0]);
  }

  // ====== LAMPU (adegan interior) ======
  const cockpitL = new THREE.PointLight(0x88ccff, 3.4, 0, 1);
  cockpitL.position.set(0, 2.3, -3.2);
  g.add(cockpitL);
  const cabinL = new THREE.PointLight(0xfff0dd, 5.2, 0, 1);
  cabinL.position.set(0, 2.4, 1.0);
  g.add(cabinL);
  const airL = new THREE.PointLight(0xffffff, 3.5, 0, 1);
  airL.position.set(0.3, 2.4, 4.9);
  g.add(airL);
  const engineLight = new THREE.PointLight(0x66b8ff, 0, 40, 1.5);
  engineLight.position.set(0, 1.2, 10);
  g.add(engineLight);
  const hemi = new THREE.HemisphereLight(0x9fb4d0, 0x1a1a22, 2.1);
  g.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dd, 3.4);
  sun.position.set(100, 100, 100);

  return {
    group: g,
    screens: { radar, nav, status, map: mapScr },
    throttleLever: lev,
    yoke, holo, holoPlanets, holoShip, blinkers, engineGlows, engineLight,
    hatch, hatchLamp,
    lights: { cockpit: cockpitL, cabin: cabinL, airlock: airL, hemi },
    sun, colliders, legs, fans, reactor, exteriorOnly, parts,
  };
}
