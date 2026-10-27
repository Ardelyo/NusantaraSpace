// Mesin efek: partikel titik berbayang lembut (api, asap, percikan, debu, ledakan) dan puing berfisika.
// Partikel "lokal" mengikuti induknya (modul/kapal); partikel "dunia" membawa koordinat absolut + bingkai acuan.
import * as THREE from 'three';
import type { Body } from './body';

export interface Frame { p: Body | null; att: boolean }
export type CarryFn = (pos: THREE.Vector3, vel: THREE.Vector3, fr: Frame, attached: boolean) => void;

const VS = /* glsl */ `
attribute float size;
attribute vec4 col;
uniform float vh;
varying vec4 vCol;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vCol = col;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 0.05);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * vh * 0.5 / d, 0.0, 300.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const FS = /* glsl */ `
varying vec4 vCol;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d * d);
  a *= a;
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

export function pointMaterial(additive: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { vh: { value: 800 } },
  });
}

/** awan titik statis: posisi/ukuran/warna diatur dari luar (mis. kabut debu, butiran pasir) */
export class Cloud {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  private vs = new THREE.Vector2();
  constructor(readonly n: number, additive = false) {
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = pointMaterial(additive);
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    this.points.visible = false;
    this.points.onBeforeRender = (r) => { r.getDrawingBufferSize(this.vs); mat.uniforms.vh.value = this.vs.y; };
  }
  commit() {
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.col as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }
}

export type RGBA = [number, number, number, number];
export interface PSpec {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number; s0: number; s1: number;
  c0: RGBA; c1?: RGBA;
  drag?: number;
  ax?: number; ay?: number; az?: number;
  fr?: Frame; att?: boolean;
}

const S = 20; // float per partikel di state
export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private st: Float32Array;
  private ap: Float64Array; // posisi absolut (mode dunia)
  private frames: (Frame | null)[];
  private attached: Uint8Array;
  private next = 0;
  alive = 0;
  /** pembuat bingkai per partikel (mode dunia) agar tiap partikel punya salinan sendiri */
  frameMaker: (() => Frame) | null = null;
  attFlag = false;
  private tp = new THREE.Vector3();
  private tv = new THREE.Vector3();
  private vs = new THREE.Vector2();

  constructor(n: number, additive: boolean, readonly world = false) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.st = new Float32Array(n * S);
    this.ap = new Float64Array(n * 3);
    this.frames = new Array(n).fill(null);
    this.attached = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.st[i * S] = 1e9; // mati
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = pointMaterial(additive);
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    this.points.onBeforeRender = (r) => { r.getDrawingBufferSize(this.vs); mat.uniforms.vh.value = this.vs.y; };
  }

  spawn(p: PSpec) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const o = i * S;
    const s = this.st;
    if (s[o] >= s[o + 1]) this.alive++;
    s[o] = 0; s[o + 1] = p.life; s[o + 2] = p.s0; s[o + 3] = p.s1;
    const c1 = p.c1 ?? [p.c0[0], p.c0[1], p.c0[2], 0];
    s[o + 4] = p.c0[0]; s[o + 5] = p.c0[1]; s[o + 6] = p.c0[2]; s[o + 7] = p.c0[3];
    s[o + 8] = c1[0]; s[o + 9] = c1[1]; s[o + 10] = c1[2]; s[o + 11] = c1[3];
    s[o + 12] = p.vx ?? 0; s[o + 13] = p.vy ?? 0; s[o + 14] = p.vz ?? 0;
    s[o + 15] = p.drag ?? 0;
    s[o + 16] = p.ax ?? 0; s[o + 17] = p.ay ?? 0; s[o + 18] = p.az ?? 0;
    this.ap[i * 3] = p.x; this.ap[i * 3 + 1] = p.y; this.ap[i * 3 + 2] = p.z;
    this.frames[i] = p.fr ?? (this.frameMaker ? this.frameMaker() : null);
    this.attached[i] = (p.att ?? this.attFlag) ? 1 : 0;
  }

  /** origin: titik asal render (hanya mode dunia); carry: pembawa bingkai (hanya mode dunia) */
  update(dt: number, origin?: THREE.Vector3, carry?: CarryFn) {
    const s = this.st, pos = this.pos, col = this.col, size = this.size, ap = this.ap;
    let alive = 0;
    const ox = origin ? origin.x : 0, oy = origin ? origin.y : 0, oz = origin ? origin.z : 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * S;
      const age = s[o] + dt;
      if (age >= s[o + 1]) {
        s[o] = 1e9; s[o + 1] = 0;
        size[i] = 0; col[i * 4 + 3] = 0;
        continue;
      }
      s[o] = age;
      alive++;
      const k = Math.exp(-s[o + 15] * dt);
      s[o + 12] = s[o + 12] * k + s[o + 16] * dt;
      s[o + 13] = s[o + 13] * k + s[o + 17] * dt;
      s[o + 14] = s[o + 14] * k + s[o + 18] * dt;
      const j = i * 3;
      ap[j] += s[o + 12] * dt; ap[j + 1] += s[o + 13] * dt; ap[j + 2] += s[o + 14] * dt;
      const fr = this.frames[i];
      if (this.world && carry && fr) {
        this.tp.set(ap[j], ap[j + 1], ap[j + 2]);
        this.tv.set(s[o + 12], s[o + 13], s[o + 14]);
        carry(this.tp, this.tv, fr, this.attached[i] === 1);
        ap[j] = this.tp.x; ap[j + 1] = this.tp.y; ap[j + 2] = this.tp.z;
        s[o + 12] = this.tv.x; s[o + 13] = this.tv.y; s[o + 14] = this.tv.z;
      }
      pos[j] = ap[j] - ox; pos[j + 1] = ap[j + 1] - oy; pos[j + 2] = ap[j + 2] - oz;
      const f = age / s[o + 1];
      size[i] = s[o + 2] + (s[o + 3] - s[o + 2]) * f;
      const c = i * 4;
      col[c] = s[o + 4] + (s[o + 8] - s[o + 4]) * f;
      col[c + 1] = s[o + 5] + (s[o + 9] - s[o + 5]) * f;
      col[c + 2] = s[o + 6] + (s[o + 10] - s[o + 6]) * f;
      col[c + 3] = s[o + 7] + (s[o + 11] - s[o + 7]) * f;
    }
    this.alive = alive;
    this.points.visible = alive > 0;
    if (alive > 0) {
      const g = this.points.geometry;
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.col as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------- palet
export const C_FIRE0: RGBA = [1, 0.82, 0.38, 0.9];
export const C_FIRE1: RGBA = [0.9, 0.18, 0.03, 0];
export const C_SMOKE0: RGBA = [0.22, 0.21, 0.2, 0.55];
export const C_SMOKE1: RGBA = [0.4, 0.39, 0.38, 0];
export const C_SPARK0: RGBA = [1, 0.85, 0.5, 1];
export const C_SPARK1: RGBA = [1, 0.3, 0.05, 0];
export const C_GAS0: RGBA = [0.9, 0.95, 1, 0.5];
export const C_GAS1: RGBA = [0.9, 0.95, 1, 0];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Satu set partikel (api + asap + percikan + gas/debu) di satu ruang koordinat */
export class FxSet {
  fire: Particles;
  smoke: Particles;
  spark: Particles;
  gas: Particles;
  constructor(parent: THREE.Object3D | null, readonly world: boolean, n = 260) {
    this.smoke = new Particles(n, false, world);
    this.gas = new Particles(Math.floor(n * 0.8), false, world);
    this.fire = new Particles(n, true, world);
    this.spark = new Particles(Math.floor(n * 0.8), true, world);
    if (parent) for (const p of [this.smoke, this.gas, this.fire, this.spark]) parent.add(p.points);
  }
  update(dt: number, origin?: THREE.Vector3, carry?: CarryFn) {
    this.smoke.update(dt, origin, carry); this.gas.update(dt, origin, carry); this.fire.update(dt, origin, carry); this.spark.update(dt, origin, carry);
  }
  /** jalankan fn dengan semua partikel baru dikaitkan ke bingkai (mode dunia) */
  withFrame(maker: () => Frame, att: boolean, fn: () => void) {
    for (const p of [this.smoke, this.gas, this.fire, this.spark]) { p.frameMaker = maker; p.attFlag = att; }
    fn();
    for (const p of [this.smoke, this.gas, this.fire, this.spark]) { p.frameMaker = null; p.attFlag = false; }
  }
  get alive() { return this.smoke.alive + this.gas.alive + this.fire.alive + this.spark.alive; }
  dispose() { this.smoke.dispose(); this.gas.dispose(); this.fire.dispose(); this.spark.dispose(); }

  // ----- pemancar
  flame(x: number, y: number, z: number, up: THREE.Vector3, size: number, extra?: Partial<PSpec>) {
    this.fire.spawn({
      x: x + rnd(-0.5, 0.5) * size * 0.4, y: y + rnd(0, 0.2) * size, z: z + rnd(-0.5, 0.5) * size * 0.4,
      vx: up.x * size * 1.4 + rnd(-0.3, 0.3), vy: up.y * size * 1.4 + rnd(-0.3, 0.3), vz: up.z * size * 1.4 + rnd(-0.3, 0.3),
      life: rnd(0.5, 1.1), s0: size * rnd(0.7, 1.1), s1: size * 0.2, c0: C_FIRE0, c1: C_FIRE1, drag: 0.8, ...extra,
    });
  }
  smokePuff(x: number, y: number, z: number, up: THREE.Vector3, size: number, life = 3.5, extra?: Partial<PSpec>) {
    this.smoke.spawn({
      x, y, z, vx: up.x * 1.4 + rnd(-0.5, 0.5), vy: up.y * 1.4 + rnd(-0.5, 0.5), vz: up.z * 1.4 + rnd(-0.5, 0.5),
      life: life * rnd(0.8, 1.2), s0: size * 0.5, s1: size * 2.4, c0: C_SMOKE0, c1: C_SMOKE1, drag: 0.35, ...extra,
    });
  }
  sparkBurst(x: number, y: number, z: number, n: number, speed: number, grav?: THREE.Vector3, base?: THREE.Vector3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(rnd(-1, 1)), v = speed * rnd(0.3, 1);
      this.spark.spawn({
        x, y, z, vx: (base?.x ?? 0) + Math.sin(b) * Math.cos(a) * v, vy: (base?.y ?? 0) + Math.cos(b) * v, vz: (base?.z ?? 0) + Math.sin(b) * Math.sin(a) * v,
        life: rnd(0.25, 0.9), s0: rnd(0.05, 0.14), s1: 0.02, c0: C_SPARK0, c1: C_SPARK1, drag: 0.6,
        ax: grav?.x ?? 0, ay: grav?.y ?? -3, az: grav?.z ?? 0,
      });
    }
  }
  /** bola api + gelombang asap + percikan */
  explode(x: number, y: number, z: number, radius: number, vel?: THREE.Vector3) {
    const bx = vel?.x ?? 0, by = vel?.y ?? 0, bz = vel?.z ?? 0;
    const nf = Math.min(70, Math.floor(18 + radius * 9));
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(rnd(-1, 1)), v = radius * rnd(0.6, 2.4);
      this.fire.spawn({
        x, y, z, vx: bx + Math.sin(b) * Math.cos(a) * v, vy: by + Math.cos(b) * v, vz: bz + Math.sin(b) * Math.sin(a) * v,
        life: rnd(0.5, 1.6), s0: radius * rnd(0.6, 1.2), s1: radius * rnd(1.6, 2.8), c0: C_FIRE0, c1: C_FIRE1, drag: 1.6,
      });
    }
    const ns = Math.min(40, Math.floor(10 + radius * 5));
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(rnd(-1, 1)), v = radius * rnd(0.3, 1.1);
      this.smoke.spawn({
        x, y, z, vx: bx + Math.sin(b) * Math.cos(a) * v, vy: by + Math.cos(b) * v, vz: bz + Math.sin(b) * Math.sin(a) * v,
        life: rnd(3, 7), s0: radius * 0.8, s1: radius * rnd(3, 5), c0: [0.12, 0.11, 0.1, 0.7], c1: C_SMOKE1, drag: 0.5,
      });
    }
    this.sparkBurst(x, y, z, Math.min(60, Math.floor(18 + radius * 8)), radius * 9, new THREE.Vector3(0, 0, 0), vel);
  }
  /** semburan gas (kebocoran udara) */
  vent(x: number, y: number, z: number, dir: THREE.Vector3, rate = 1) {
    this.gas.spawn({
      x, y, z, vx: dir.x * 9 * rate + rnd(-0.6, 0.6), vy: dir.y * 9 * rate + rnd(-0.6, 0.6), vz: dir.z * 9 * rate + rnd(-0.6, 0.6),
      life: rnd(0.5, 1.1), s0: 0.1, s1: 0.9 + rate * 0.6, c0: C_GAS0, c1: C_GAS1, drag: 1.1,
    });
  }
}

// ---------------------------------------------------------------- puing berfisika
export interface DebrisItem {
  obj: THREE.Object3D;
  pos: THREE.Vector3; // absolut
  vel: THREE.Vector3; // relatif bingkai
  quat: THREE.Quaternion;
  ang: THREE.Vector3;
  radius: number;
  fr: Frame;
  att: boolean;
  age: number;
  life: number;
  hot: number; // detik tersisa terbakar
  rest: boolean;
  mass: number;
}

export interface DebrisEnv {
  carry: CarryFn;
  /** percepatan gravitasi (m/s²) di titik */
  gravity: (pos: THREE.Vector3, fr: Frame, out: THREE.Vector3) => THREE.Vector3;
  /** ketinggian di atas medan (m) dan normal permukaan; null bila tak ada permukaan dekat */
  ground: (pos: THREE.Vector3, fr: Frame, n: THREE.Vector3) => number | null;
  rho: (pos: THREE.Vector3) => number;
  onGround?: (it: DebrisItem, speed: number) => void;
}

export class DebrisField {
  items: DebrisItem[] = [];
  root = new THREE.Group();
  private g = new THREE.Vector3();
  private n = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private trail: FxSet;
  max = 90;

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.trail = new FxSet(parent, true, 260);
  }
  get fx() { return this.trail; }

  add(it: Omit<DebrisItem, 'age' | 'rest'>) {
    if (this.items.length >= this.max) this.remove(0);
    this.root.add(it.obj);
    this.items.push({ ...it, age: 0, rest: false });
  }
  private remove(i: number) {
    const it = this.items[i];
    this.root.remove(it.obj);
    it.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m as any).userData.ownGeo) m.geometry.dispose(); });
    this.items.splice(i, 1);
  }
  clear() { while (this.items.length) this.remove(0); }

  update(dt: number, origin: THREE.Vector3, env: DebrisEnv) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age > it.life) { this.remove(i); continue; }
      if (!it.rest) {
        env.gravity(it.pos, it.fr, this.g);
        it.vel.addScaledVector(this.g, dt);
        const rho = env.rho(it.pos);
        if (rho > 1e-5) {
          const sp = it.vel.length();
          it.vel.multiplyScalar(Math.exp(-Math.min(5, (rho * sp * 0.6 * it.radius) / Math.max(it.mass, 1) * dt)));
          it.ang.multiplyScalar(Math.exp(-0.4 * rho * dt));
        }
        it.pos.addScaledVector(it.vel, dt);
        this.q.setFromAxisAngle(this.v.copy(it.ang).normalize(), it.ang.length() * dt);
        if (it.ang.lengthSq() > 1e-8) it.quat.premultiply(this.q);
        env.carry(it.pos, it.vel, it.fr, it.att);
        const h = env.ground(it.pos, it.fr, this.n);
        if (h !== null && h < it.radius) {
          it.pos.addScaledVector(this.n, it.radius - h);
          const vn = it.vel.dot(this.n);
          const sp = it.vel.length();
          if (vn < 0) {
            if (sp > 3 && env.onGround) env.onGround(it, sp);
            it.vel.addScaledVector(this.n, -vn * (1 + 0.32));
            it.vel.multiplyScalar(0.72);
            it.ang.multiplyScalar(0.7).add(this.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(sp * 0.2));
          }
          if (it.vel.length() < 0.6 + this.g.length() * 0.12) {
            // menetap: ikut berputar bersama benda
            it.rest = true; it.vel.set(0, 0, 0); it.ang.set(0, 0, 0);
            if (!it.att) { it.att = true; env.carry(it.pos, this.v.set(0, 0, 0), it.fr, true); }
          }
        }
      } else env.carry(it.pos, this.v.set(0, 0, 0), it.fr, true);
      if (it.hot > 0) {
        it.hot -= dt;
        const rate = it.rest ? 0.4 : 1;
        if (Math.random() < dt * 22 * rate) {
          this.trail.flame(it.pos.x, it.pos.y, it.pos.z, this.v.set(0, 0, 0), Math.max(0.2, it.radius * 0.7), { fr: it.fr, att: it.att, vx: it.vel.x, vy: it.vel.y, vz: it.vel.z, life: 0.5 });
          if (Math.random() < 0.5) this.trail.smokePuff(it.pos.x, it.pos.y, it.pos.z, this.v.set(0, 0, 0), Math.max(0.25, it.radius), 3, { fr: it.fr, att: it.att, vx: it.vel.x, vy: it.vel.y, vz: it.vel.z });
        }
      }
      it.obj.position.copy(it.pos).sub(origin);
      it.obj.quaternion.copy(it.quat);
      const fadeIn = it.life - it.age;
      it.obj.scale.setScalar(fadeIn < 4 ? Math.max(0.01, fadeIn / 4) : 1);
    }
    this.trail.update(dt, origin, env.carry);
  }
}

// ---------------------------------------------------------------- pencahayaan kilat (lampu tetap agar shader tidak dikompilasi ulang)
export class FxLights {
  lights: THREE.PointLight[] = [];
  private t: number[] = [];
  private amp: number[] = [];
  private dur: number[] = [];
  constructor(parent: THREE.Object3D, n = 2) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 300, 1.4);
      parent.add(l);
      this.lights.push(l); this.t.push(1e9); this.amp.push(0); this.dur.push(1);
    }
  }
  /** kilat sesaat di posisi relatif-asal */
  flash(pos: THREE.Vector3, color: number, intensity: number, dur: number, dist = 300) {
    let k = 0, best = -1;
    for (let i = 0; i < this.lights.length; i++) { if (this.t[i] > best) { best = this.t[i]; k = i; } }
    const l = this.lights[k];
    l.position.copy(pos); l.color.setHex(color); l.distance = dist;
    this.t[k] = 0; this.amp[k] = intensity; this.dur[k] = dur;
  }
  update(dt: number) {
    for (let i = 0; i < this.lights.length; i++) {
      this.t[i] += dt;
      const f = this.t[i] / this.dur[i];
      this.lights[i].intensity = f >= 1 ? 0 : this.amp[i] * (1 - f) * (1 - f) * (0.85 + 0.15 * Math.random());
    }
  }
}
