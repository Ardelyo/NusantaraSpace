// Kehidupan di planet: pepohonan (flora) dan satwa (fauna) yang dibangkitkan prosedural di sekitar pemain
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Body } from './body';
import type { LifeProfile } from './hazards';
import { hash3, clamp } from './noise';

const FACES: { n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }[] = [
  { n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0) },
  { n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0) },
  { n: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },
  { n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
  { n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  { n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
];

type Kind = 'tree' | 'cone' | 'bush' | 'deer' | 'bird' | 'critter';
interface Item {
  key: string;
  kind: Kind;
  dir: THREE.Vector3; // arah lokal-benda (jangkar)
  rad: number; // jari-jari permukaan di jangkar
  s: number;
  hue: number;
  w: number; // fase
  rho: number; // radius gerak
  speed: number;
  h: number; // tinggi terbang
  e1: THREE.Vector3;
  e2: THREE.Vector3;
}

export interface LifeSpot { key: string; kind: 'fauna' | 'flora'; name: string; pos: THREE.Vector3; dist: number }

const CELL_M = 22;
const RANGE = 140;

function mergeParts(parts: { g: THREE.BufferGeometry; x: number; y: number; z: number; sx?: number; sy?: number; sz?: number; rx?: number }[]) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const out: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    e.set(p.rx || 0, 0, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    g.applyMatrix4(m);
    // hapus uv agar seragam
    g.deleteAttribute('uv');
    out.push(g);
  }
  return mergeGeometries(out, false)!;
}

export class LifeField {
  private scene: THREE.Scene;
  private cache = new Map<string, Item | null>();
  private active: Item[] = [];
  private lastPos = new THREE.Vector3(1e12, 0, 0);
  private bodyId = '';
  private profile: LifeProfile | null = null;
  trunk: THREE.InstancedMesh;
  ball: THREE.InstancedMesh;
  cone: THREE.InstancedMesh;
  bush: THREE.InstancedMesh;
  deer: THREE.InstancedMesh;
  bird: THREE.InstancedMesh;
  critter: THREE.InstancedMesh;
  private canopyLam = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private canopyGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  scanned = new Set<string>();
  spots: LifeSpot[] = [];
  private m4 = new THREE.Matrix4();
  private col = new THREE.Color();
  private qa = new THREE.Quaternion();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private v5 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private count = { trunk: 0, ball: 0, cone: 0, bush: 0, deer: 0, bird: 0, critter: 0 };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const trunkG = new THREE.CylinderGeometry(0.16, 0.28, 2.6, 6);
    trunkG.translate(0, 1.3, 0);
    this.trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a3d26 }), 320);
    const ballG = new THREE.IcosahedronGeometry(1.7, 1);
    ballG.scale(1, 0.85, 1);
    ballG.translate(0, 3.6, 0);
    this.ball = new THREE.InstancedMesh(ballG, this.canopyLam, 320);
    const coneG = new THREE.ConeGeometry(1.5, 5.2, 7);
    coneG.translate(0, 4.4, 0);
    this.cone = new THREE.InstancedMesh(coneG, this.canopyLam, 320);
    const bushG = new THREE.IcosahedronGeometry(0.7, 1);
    bushG.scale(1, 0.7, 1);
    bushG.translate(0, 0.4, 0);
    this.bush = new THREE.InstancedMesh(bushG, this.canopyLam, 320);

    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const deerG = mergeParts([
      { g: box(0.55, 0.6, 1.4), x: 0, y: 1.05, z: 0 },
      { g: box(0.22, 0.65, 0.22), x: 0, y: 1.5, z: -0.7, rx: 0.6 },
      { g: box(0.25, 0.26, 0.5), x: 0, y: 1.85, z: -0.95 },
      { g: box(0.08, 0.5, 0.08), x: -0.08, y: 2.2, z: -0.9 },
      { g: box(0.08, 0.5, 0.08), x: 0.08, y: 2.2, z: -0.9 },
      { g: box(0.12, 0.8, 0.12), x: -0.2, y: 0.4, z: -0.5 },
      { g: box(0.12, 0.8, 0.12), x: 0.2, y: 0.4, z: -0.5 },
      { g: box(0.12, 0.8, 0.12), x: -0.2, y: 0.4, z: 0.5 },
      { g: box(0.12, 0.8, 0.12), x: 0.2, y: 0.4, z: 0.5 },
      { g: box(0.1, 0.2, 0.3), x: 0, y: 1.3, z: 0.75, rx: -0.5 },
    ]);
    this.deer = new THREE.InstancedMesh(deerG, new THREE.MeshLambertMaterial({ color: 0xffffff }), 40);
    const birdG = mergeParts([
      { g: box(0.18, 0.16, 0.6), x: 0, y: 0, z: 0 },
      { g: box(1.5, 0.03, 0.35), x: 0, y: 0.02, z: 0.02 },
      { g: box(0.1, 0.1, 0.18), x: 0, y: 0.05, z: -0.38 },
      { g: box(0.2, 0.03, 0.3), x: 0, y: 0, z: 0.42 },
    ]);
    this.bird = new THREE.InstancedMesh(birdG, new THREE.MeshLambertMaterial({ color: 0xffffff }), 40);
    const critG = mergeParts([
      { g: new THREE.SphereGeometry(0.55, 8, 6), x: 0, y: 0.7, z: 0, sy: 0.7, sz: 1.5 },
      { g: new THREE.SphereGeometry(0.3, 6, 5), x: 0, y: 0.85, z: -0.9 },
      { g: box(0.06, 0.6, 0.06), x: -0.4, y: 0.3, z: -0.5 },
      { g: box(0.06, 0.6, 0.06), x: 0.4, y: 0.3, z: -0.5 },
      { g: box(0.06, 0.6, 0.06), x: -0.4, y: 0.3, z: 0.1 },
      { g: box(0.06, 0.6, 0.06), x: 0.4, y: 0.3, z: 0.1 },
      { g: box(0.06, 0.6, 0.06), x: -0.4, y: 0.3, z: 0.7 },
      { g: box(0.06, 0.6, 0.06), x: 0.4, y: 0.3, z: 0.7 },
      { g: box(0.04, 0.5, 0.04), x: -0.1, y: 1.3, z: -1.0 },
      { g: box(0.04, 0.5, 0.04), x: 0.1, y: 1.3, z: -1.0 },
    ]);
    this.critter = new THREE.InstancedMesh(critG, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 40);
    for (const im of [this.trunk, this.ball, this.cone, this.bush, this.deer, this.bird, this.critter]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // buat instanceColor
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(im);
    }
  }

  private gen(body: Body, p: LifeProfile, f: number, i: number, j: number, key: string): Item | null {
    const delta = CELL_M / body.R;
    const seed = body.def.seed;
    const a = (i + hash3(i, j, f, seed + 1)) * delta, b = (j + hash3(i, j, f, seed + 2)) * delta;
    if (Math.abs(a) > Math.PI / 4 || Math.abs(b) > Math.PI / 4) return null;
    const F = FACES[f];
    const d = new THREE.Vector3().copy(F.n).addScaledVector(F.u, Math.tan(a)).addScaledVector(F.v, Math.tan(b)).normalize();
    const rad = body.surfaceRadius(d);
    const s = body.tmpS;
    if (s.water) return null;
    const lat = s.lat, el = s.e, moist = s.m, tn = s.tn;
    const r1 = hash3(i, j, f, seed + 3), r2 = hash3(i, j, f, seed + 4), r3 = hash3(i, j, f, seed + 5), r4 = hash3(i, j, f, seed + 6);
    // suhu relatif (0 beku … 1 hangat): lintang, ketinggian (laju lapse), dan suhu dasar dunia
    const base = p.T0 !== undefined ? clamp((p.T0 - 255) / 45) : 0.7;
    const temp = base - lat * 1.18 * (0.55 + 0.45 * base) - Math.max(el, 0) * 0.55 + tn * 0.18;
    const earth = !p.alien;
    // kemiringan: tumbuhan tak tumbuh di tebing, hewan menghindari lereng curam
    const st = 7 / body.R;
    const e1s = new THREE.Vector3().copy(d).cross(Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const e2s = new THREE.Vector3().copy(d).cross(e1s).normalize();
    const ra = body.surfaceRadius(new THREE.Vector3().copy(d).addScaledVector(e1s, st).normalize());
    const rb = body.surfaceRadius(new THREE.Vector3().copy(d).addScaledVector(e2s, st).normalize());
    const slope = Math.hypot(ra - rad, rb - rad) / 7; // tan(sudut)
    // kepadatan patch: hutan & padang membentuk gerombol, bukan kisi
    const patch = hash3(Math.floor(i / 7), Math.floor(j / 7), f, seed + 9) * 0.65 + hash3(Math.floor(i / 3), Math.floor(j / 3), f, seed + 10) * 0.35;
    const fed = clamp((moist - 0.22) * 2.2) * clamp(temp * 1.8); // pakan: tumbuhan butuh air & suhu
    let kind: Kind | null = null;
    let sc = 0.7 + r2 * 0.9;
    if (p.fauna && slope < 0.36 && temp > 0.18 && fed > 0.12 && r4 < (earth ? 0.055 : 0.075) * (0.4 + fed) && el < 0.5) { kind = earth ? 'deer' : 'critter'; sc = 0.8 + r2 * 0.5; }
    else if (p.fauna && r4 > 0.965 && earth) { kind = 'bird'; sc = 0.9 + r2 * 0.4; }
    else if (p.flora && slope < 0.55) {
      let dens: number;
      if (earth) dens = clamp((moist - 0.28) * 1.7) * clamp(temp * 1.6) * (el < 0.012 || el > 0.5 ? 0 : 1);
      else dens = 0.7 * fed * (el < 0.01 || el > 0.6 ? 0 : 1) * (0.25 + 0.75 * patch);
      dens *= 0.4 + 0.9 * patch;
      if (r1 < dens) kind = earth ? (temp < 0.42 ? 'cone' : r3 < 0.85 ? 'tree' : 'bush') : (r3 < 0.4 ? 'cone' : r3 < 0.8 ? 'tree' : 'bush');
      else if (r1 < dens + 0.15 && dens > 0.1) kind = 'bush';
    }
    if (!kind) return null;
    // basis tangen
    const e1 = new THREE.Vector3().copy(d).cross(Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const e2 = new THREE.Vector3().copy(d).cross(e1).normalize();
    const hue = (earth ? (temp > 0.7 ? 0.28 : 0.33) : p.hue + (r3 - 0.5) * 0.25) + (r4 - 0.5) * 0.04;
    let rho = 0, speed = 0, h = 0;
    if (kind === 'deer') { rho = 6 + r3 * 14; speed = 0.5 + r2 * 0.9; }
    else if (kind === 'critter') { rho = 5 + r3 * 10; speed = 0.4 + r2 * 0.8; }
    else if (kind === 'bird') { rho = 25 + r3 * 40; speed = 7 + r2 * 4; h = 14 + r1 * 24; }
    return { key, kind, dir: d, rad, s: sc, hue, w: r2 * 6.283, rho, speed, h, e1, e2 };
  }

  private rebuildActive(body: Body, p: LifeProfile, localPos: THREE.Vector3) {
    this.active.length = 0;
    const R = body.R;
    const delta = CELL_M / R;
    const K = Math.ceil(RANGE / CELL_M);
    const dirP = this.v1.copy(localPos).normalize();
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const dn = dirP.dot(F.n);
      if (dn < 0.5) continue;
      const a = Math.atan(dirP.dot(F.u) / dn), b = Math.atan(dirP.dot(F.v) / dn);
      const ia = Math.floor(a / delta), ib = Math.floor(b / delta);
      for (let i = ia - K; i <= ia + K; i++) for (let j = ib - K; j <= ib + K; j++) {
        const key = `${f}:${i}:${j}`;
        let it = this.cache.get(key);
        if (it === undefined) { it = this.gen(body, p, f, i, j, key); this.cache.set(key, it); }
        if (it) {
          const ang = it.dir.angleTo(dirP);
          if (ang * R < RANGE + it.rho) this.active.push(it);
        }
      }
    }
    if (this.cache.size > 6000) this.cache.clear();
  }

  // body: benda terdekat bertanah; playerW: posisi pemain di dunia; origin: pusat render
  update(body: Body | null, profile: LifeProfile | null, playerW: THREE.Vector3, origin: THREE.Vector3, time: number, alt: number) {
    const on = !!body && !!profile && alt < 700 && body.isTerrain;
    if (!on || !body || !profile) {
      for (const im of [this.trunk, this.ball, this.cone, this.bush, this.deer, this.bird, this.critter]) im.count = 0;
      this.spots.length = 0;
      return;
    }
    if (this.bodyId !== body.id) { this.cache.clear(); this.bodyId = body.id; this.lastPos.set(1e12, 0, 0); }
    if (this.profile !== profile) {
      this.profile = profile;
      const mat = profile.glow ? this.canopyGlow : this.canopyLam;
      this.ball.material = mat; this.cone.material = mat; this.bush.material = mat;
    }
    const local = body.toLocal(this.v2.copy(playerW).sub(body.pos), this.v3);
    // refresh daftar aktif saat bergerak (di koordinat lokal-benda, tidak terpengaruh rotasi)
    if (this.lastPos.distanceTo(local) > 6) { this.lastPos.copy(local); this.rebuildActive(body, profile, local); }
    const q = body.quat;
    const c = this.count;
    c.trunk = c.ball = c.cone = c.bush = c.deer = c.bird = c.critter = 0;
    this.spots.length = 0;
    const qa = this.qa, m4 = this.m4, col = this.col;
    const pw = playerW;
    for (const it of this.active) {
      const d = it.dir;
      let wp: THREE.Vector3;
      let fwd: THREE.Vector3 | null = null;
      let rad = it.rad;
      let dirU = d;
      if (it.rho > 0) {
        const ph = it.w + (time * it.speed) / it.rho;
        const ox = Math.cos(ph) * it.rho, oz = Math.sin(ph) * it.rho;
        rad = 0;
        // hewan darat menghindari air: bila jalurnya masuk laut/danau, jarak dari jangkar dikurangi sampai di darat
        for (const kf of it.h > 0 ? [1] : [1, 0.55, 0.25, 0]) {
          dirU = this.v4.copy(d).addScaledVector(it.e1, (ox * kf) / body.R).addScaledVector(it.e2, (oz * kf) / body.R).normalize();
          rad = body.surfaceRadius(dirU);
          if (it.h > 0 || !body.tmpS.water) break;
        }
        rad += it.h * (1 + 0.25 * Math.sin(time * 0.7 + it.w));
        const tx = -Math.sin(ph), tz = Math.cos(ph);
        fwd = this.v5.copy(it.e1).multiplyScalar(tx).addScaledVector(it.e2, tz);
        // ke dunia
        fwd.applyQuaternion(q);
      }
      wp = this.v2.copy(dirU).multiplyScalar(rad).applyQuaternion(q).add(body.pos);
      const dist = wp.distanceTo(pw);
      if (dist > RANGE + 20) continue;
      const nrm = this.v3.copy(dirU).applyQuaternion(q);
      let mesh: THREE.InstancedMesh;
      let idx: number;
      switch (it.kind) {
        case 'tree': mesh = this.ball; idx = c.ball++; break;
        case 'cone': mesh = this.cone; idx = c.cone++; break;
        case 'bush': mesh = this.bush; idx = c.bush++; break;
        case 'deer': mesh = this.deer; idx = c.deer++; break;
        case 'bird': mesh = this.bird; idx = c.bird++; break;
        default: mesh = this.critter; idx = c.critter++; break;
      }
      if (idx >= 320 || ((it.kind === 'deer' || it.kind === 'bird' || it.kind === 'critter') && idx >= 40)) continue;
      const px = wp.x - origin.x, py = wp.y - origin.y, pz = wp.z - origin.z;
      if (fwd) {
        const right = this.v1.copy(fwd).cross(nrm).normalize();
        const z = fwd.clone().negate();
        const upv = z.clone().cross(right).normalize();
        m4.makeBasis(right, upv, z);
        m4.scale(this.v4.set(it.s, it.s, it.s));
        m4.setPosition(px, py, pz);
        if (it.kind === 'bird') {
          // gulingkan saat berbelok
          // sudut guling dari gaya sentripetal: tan φ = v²/(g·r)
          m4.multiply(new THREE.Matrix4().makeRotationZ(Math.atan((it.speed * it.speed) / (9.8 * it.rho))));
        }
      } else {
        qa.setFromUnitVectors(this.up, nrm);
        const yaw = new THREE.Quaternion().setFromAxisAngle(this.up, it.w);
        qa.multiply(yaw);
        m4.compose(this.v4.set(px, py, pz), qa, this.v5.set(it.s, it.s * (it.kind === 'cone' ? 1.2 : 1), it.s));
        if (it.kind !== 'bush') {
          // batang
          const ti = c.trunk++;
          if (ti < 320) { this.trunk.setMatrixAt(ti, m4); }
        }
      }
      mesh.setMatrixAt(idx, m4);
      // warna
      if (it.kind === 'deer') col.setHSL(0.08 + (it.s - 0.8) * 0.05, 0.5, 0.42);
      else if (it.kind === 'bird') col.setHSL(0.6, 0.1, 0.9);
      else if (it.kind === 'critter') col.setHSL(it.hue, 0.9, profile.glow ? 0.6 : 0.5);
      else if (profile.alien) col.setHSL((it.hue + 1) % 1, 0.65, profile.glow ? 0.58 : 0.4 + (it.s - 0.7) * 0.1);
      else col.setHSL(it.hue, 0.55, 0.22 + (it.s - 0.7) * 0.08 + (it.kind === 'bush' ? 0.06 : 0));
      mesh.setColorAt(idx, col);
      // titik pindai
      if ((it.kind === 'deer' || it.kind === 'critter' || it.kind === 'bird') ? dist < 60 : (it.kind === 'tree' || it.kind === 'cone') && dist < 25) {
        const fauna = it.kind === 'deer' || it.kind === 'critter' || it.kind === 'bird';
        this.spots.push({
          key: it.key, kind: fauna ? 'fauna' : 'flora', dist,
          name: this.nameOf(it.kind, profile),
          pos: wp.clone(),
        });
      }
    }
    for (const [im, n] of [[this.trunk, c.trunk], [this.ball, c.ball], [this.cone, c.cone], [this.bush, c.bush], [this.deer, c.deer], [this.bird, c.bird], [this.critter, c.critter]] as [THREE.InstancedMesh, number][]) {
      im.count = Math.min(n, im === this.deer || im === this.bird || im === this.critter ? 40 : 320);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.spots.sort((a, b2) => a.dist - b2.dist);
  }

  nameOf(kind: Kind, p: LifeProfile) {
    if (!p.alien) {
      switch (kind) {
        case 'deer': return 'Kijang Nusantara';
        case 'bird': return 'Burung Camar';
        case 'tree': return 'Pohon Jati';
        case 'cone': return 'Pinus Gunung';
        default: return 'Semak';
      }
    }
    switch (kind) {
      case 'critter': return p.glow ? 'Ulat Cahaya' : 'Makhluk Berkaki Enam';
      case 'tree': return p.glow ? 'Pohon Pendar' : 'Pohon Asing';
      case 'cone': return p.glow ? 'Menara Kristal' : 'Pohon Spiral';
      default: return 'Semak Asing';
    }
  }

  // terdekat yang belum dipindai
  nearest(kind: 'fauna' | 'flora', maxDist: number): LifeSpot | null {
    for (const s of this.spots) if (s.kind === kind && s.dist <= maxDist) return s;
    return null;
  }

  dispose() {
    for (const im of [this.trunk, this.ball, this.cone, this.bush, this.deer, this.bird, this.critter]) {
      this.scene.remove(im);
      im.geometry.dispose();
      im.dispose();
    }
  }
}
