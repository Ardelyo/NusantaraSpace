// Kerusakan fisik: modul habitat dan kapal bisa penyok, bocor, terbakar, kehilangan bagian (menjadi puing berfisika), atau meledak.
import * as THREE from 'three';
import { MOD_DEFS, MOD_STRENGTH, ROOF_LOAD, shellPoint, dentMesh, type Habitat, type PlacedMod, type Dent } from './modules';
import { DebrisField, FxLights, type Frame } from './effects';
import type { GameAudio } from './audio';
import type { ShipRig } from './shipModel';
import type { Body } from './body';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const Y = new THREE.Vector3(0, 1, 0);

export interface FrameInfo { p: Body | null; att: boolean; vel: THREE.Vector3 }

export interface DmgCtx {
  debris: DebrisField;
  lights: FxLights;
  audio: GameAudio;
  origin: THREE.Vector3;
  toast(msg: string, kind?: 'info' | 'warn' | 'discover'): void;
  shake(v: number): void;
  frameOfHab(h: Habitat): FrameInfo;
  frameOfShip(): FrameInfo;
  shipPose(): { pos: THREE.Vector3; quat: THREE.Quaternion };
  upAt(pos: THREE.Vector3): THREE.Vector3;
  listener(): THREE.Vector3;
  playerIn(): { h: Habitat; key: string | null } | null;
  killPlayer(why: string): void;
  changed(h: Habitat): void;
}

// material puing: cache per warna
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const mat = (c: number) => {
  let m = matCache.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.55 }); matCache.set(c, m); }
  return m;
};

/** potongan pelat/batang/gumpalan acak untuk puing */
function chunk(kind: 'plate' | 'bar' | 'lump', scale: number, color: number): { obj: THREE.Object3D; radius: number } {
  let geo: THREE.BufferGeometry;
  if (kind === 'plate') geo = new THREE.BoxGeometry(rnd(0.5, 1.8) * scale, rnd(0.04, 0.1) * scale, rnd(0.4, 1.4) * scale);
  else if (kind === 'bar') geo = new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, rnd(0.8, 2.4) * scale, 6);
  else geo = new THREE.BoxGeometry(rnd(0.25, 0.7) * scale, rnd(0.2, 0.6) * scale, rnd(0.25, 0.7) * scale);
  const me = new THREE.Mesh(geo, mat(color));
  me.userData.ownGeo = true;
  me.frustumCulled = false;
  geo.computeBoundingSphere();
  return { obj: me, radius: Math.max(0.15, geo.boundingSphere!.radius * 0.8) };
}

/** peluncuran puing dari titik dunia absolut */
export function launchDebris(c: DmgCtx, obj: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion, kick: THREE.Vector3, radius: number, fi: FrameInfo, opts: { hot?: number; life?: number; ang?: number; mass?: number } = {}) {
  const sp = opts.ang ?? 3;
  c.debris.add({
    obj, pos: pos.clone(), quat: quat.clone(), vel: fi.vel.clone().add(kick), ang: new THREE.Vector3(rnd(-sp, sp), rnd(-sp, sp), rnd(-sp, sp)), radius,
    fr: { p: fi.p, att: fi.att } as Frame, att: fi.att, life: opts.life ?? 80, hot: opts.hot ?? 0, mass: opts.mass ?? Math.max(20, radius * radius * 400),
  });
}

export class DamageSystem {
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tq = new THREE.Quaternion();
  private tq2 = new THREE.Quaternion();
  private spreadT = 0;
  private zapT = 0;
  constructor(private c: DmgCtx) {}

  // ------------------------------------------------------------ util
  habToWorld(h: Habitat, local: THREE.Vector3, out = new THREE.Vector3()) { return out.copy(local).applyQuaternion(h.quat).add(h.pos); }
  modCenter(h: Habitat, m: PlacedMod, out = new THREE.Vector3()) { h.localOf(m, 0, 0, out); out.y = 1.5; return out; }
  private modLocalToHab(h: Habitat, m: PlacedMod, p: THREE.Vector3, out = new THREE.Vector3()) { h.localOf(m, p.x, p.z, out); out.y = p.y; return out; }
  private volFor(dist: number, range = 400) { return clamp(1 - dist / range) ** 1.4; }
  private inSame(h: Habitat) { const pi = this.c.playerIn(); return !!pi && pi.h === h; }

  launch(obj: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion, kick: THREE.Vector3, radius: number, fi: FrameInfo, opts: { hot?: number; life?: number; ang?: number; mass?: number } = {}) {
    launchDebris(this.c, obj, pos, quat, kick, radius, fi, opts);
  }

  frameShip(): FrameInfo { return this.c.frameOfShip(); }

  /** semburan pecahan dari titik dunia absolut */
  burstAt(wp: THREE.Vector3, fi: FrameInfo, n: number, speed: number, scale: number, color: number, hot: number, dirWorld?: THREE.Vector3) {
    const up = this.c.upAt(wp);
    for (let i = 0; i < n; i++) {
      const k = Math.random();
      const { obj, radius } = chunk(k < 0.5 ? 'plate' : k < 0.8 ? 'bar' : 'lump', scale, [0xd7dce2, 0x4b535e, color, 0xa4adb8][Math.floor(Math.random() * 4)]);
      const kick = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.4, 1));
      if (dirWorld) kick.addScaledVector(dirWorld, speed * 0.7);
      kick.addScaledVector(up, speed * 0.25);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)));
      this.launch(obj, wp.clone().addScaledVector(kick, 0.02), q, kick, radius, fi, { hot, life: rnd(50, 90) });
    }
  }

  fragments(h: Habitat, hablocal: THREE.Vector3, n: number, speed: number, scale: number, color: number, hot: number, dirHab?: THREE.Vector3) {
    this.burstAt(this.habToWorld(h, hablocal), this.c.frameOfHab(h), n, speed, scale, color, hot, dirHab ? dirHab.clone().applyQuaternion(h.quat) : undefined);
  }

  // ------------------------------------------------------------ modul
  /** energi (J) menimpa modul; from = arah dunia dari modul menuju sumber (satuan) */
  hitModule(h: Habitat, key: string, energy: number, from: THREE.Vector3, why: string, opt: { fire?: number; sparks?: boolean; quiet?: boolean } = {}) {
    const m = h.mods.get(key);
    if (!m) return;
    const d = h.getDmg(key);
    const cap = MOD_STRENGTH[m.type];
    const dmg = energy / cap;
    if (dmg < 0.0008) return;
    const before = d.hp;
    d.hp = Math.max(0, d.hp - dmg);
    // titik tumbukan pada cangkang
    const qInv = this.tq.copy(h.quat).invert();
    const dirHab = this.tv.copy(from).applyQuaternion(qInv).normalize();
    const th = -(m.rot * Math.PI) / 2;
    const dirMod = dirHab.clone().applyAxisAngle(Y, -th);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    shellPoint(m.type, dirMod, p, n);
    const hole = dmg > 0.045 && Math.random() < clamp(dmg * 6, 0.25, 1);
    if (dmg > 0.003) {
      const r = clamp(Math.sqrt(energy) / 1700, 0.1, 0.85);
      const t: Dent = { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z], r, burn: clamp(dmg * 5), hole };
      h.addDent(key, t);
    }
    const hp = this.modLocalToHab(h, m, p);
    const nh = n.clone().applyAxisAngle(Y, th);
    const fx = h.ensureFx();
    fx.sparkBurst(hp.x, hp.y, hp.z, Math.floor(8 + dmg * 160), 4 + dmg * 22, undefined, undefined);
    if (dmg > 0.02) for (let i = 0; i < 4; i++) fx.smokePuff(hp.x, hp.y, hp.z, nh, 1.0 + dmg * 2, 4);
    const wp = this.habToWorld(h, hp);
    const dist = wp.distanceTo(this.c.listener());
    if (dmg > 0.006 && !opt.quiet) this.c.audio.impact(clamp(dmg * 8), this.volFor(dist) * (this.inSame(h) ? 1 : 0.6));
    if (dmg > 0.02) this.c.lights.flash(this.tv2.copy(wp).sub(this.c.origin), 0xffa860, 120 * clamp(dmg * 4, 0.2, 2), 0.35, 120);
    if (dmg > 0.01) this.fragments(h, hp, Math.min(8, Math.floor(dmg * 60) + 1), 2 + dmg * 14, 0.4, MOD_DEFS[m.type].color, dmg > 0.05 ? 4 : 0, nh);
    if (dmg > 0.015) this.c.shake(clamp(dmg * 2, 0.02, 0.35) * (this.inSame(h) ? 1 : clamp(1 - dist / 200)));
    // bagian lepas
    const nLose = dmg > 0.2 ? 2 : dmg > 0.05 ? 1 : Math.random() < dmg * 12 ? 1 : 0;
    for (let i = 0; i < nLose; i++) this.breakPart(h, key, p, nh);
    // api
    const fireAdd = (opt.fire ?? 0) + (dmg > 0.06 ? 0.25 : 0);
    if (fireAdd > 0 && h.pressure > 0.25) d.fire = Math.min(1, d.fire + fireAdd);
    if (hole && h.totalLeak > 0 && before > 0) this.c.toast(`Lambung ${MOD_DEFS[m.type].name} bocor! (${why})`, 'warn');
    else if (!opt.quiet && dmg > 0.03) this.c.toast(`${MOD_DEFS[m.type].name} rusak −${Math.round(dmg * 100)}% (${why})`, 'warn');
    if (d.hp <= 0) this.destroyModule(h, key, why);
    this.c.changed(h);
  }

  breakPart(h: Habitat, key: string, nearMod: THREE.Vector3, dirHab: THREE.Vector3, id?: string, speed: [number, number] = [1.5, 5], why = ''): boolean {
    const m = h.mods.get(key);
    if (!m) return false;
    const got = h.takePart(key, id, nearMod);
    if (!got) return false;
    const th = -(m.rot * Math.PI) / 2;
    const hl = this.modLocalToHab(h, m, got.center);
    const fi = this.c.frameOfHab(h);
    const wp = this.habToWorld(h, hl);
    const q = new THREE.Quaternion().copy(h.quat).multiply(this.tq2.setFromAxisAngle(Y, th));
    const up = this.c.upAt(wp);
    const kick = dirHab.clone().applyQuaternion(h.quat).multiplyScalar(rnd(speed[0], speed[1])).addScaledVector(up, rnd(1, 3)).add(this.tv2.set(rnd(-2, 2), rnd(-1, 2), rnd(-2, 2)));
    this.launch(got.obj, wp, q, kick, got.radius, fi, { hot: 6, ang: 2 });
    const fx = h.ensureFx();
    fx.sparkBurst(hl.x, hl.y, hl.z, 24, 9);
    this.c.audio.tear(this.volFor(wp.distanceTo(this.c.listener())));
    this.c.toast(`${MOD_DEFS[m.type].name}: ${this.partName(got.id)} terlepas${why ? ' (' + why + ')' : ''}`, 'warn');
    return true;
  }
  partName(id: string) {
    return ({ panelL: 'panel surya kiri', panelR: 'panel surya kanan', dish: 'parabola', mast: 'tiang antena', antenna: 'antena', arms: 'lengan sandar', roof: 'panel atap', sensor: 'sensor', tank: 'tangki', glass: 'kubah kaca', cargo: 'peti kargo' } as Record<string, string>)[id] ?? id;
  }

  destroyModule(h: Habitat, key: string, why: string) {
    const m = h.mods.get(key);
    if (!m) return;
    const d = h.getDmg(key);
    const name = MOD_DEFS[m.type].name;
    if (h.coreKey() === key) {
      d.hp = 0.04; d.fire = 1;
      this.c.toast(`${name} nyaris runtuh! Padamkan api & perbaiki segera`, 'warn');
      return;
    }
    const center = this.modCenter(h, m);
    const wp = this.habToWorld(h, center);
    const dist = wp.distanceTo(this.c.listener());
    const fx = h.ensureFx();
    fx.explode(center.x, center.y, center.z, 2.8);
    const fxi = this.inSame(h) ? h.ensureFxInt() : null;
    fxi?.explode(center.x, center.y, center.z, 1.6);
    this.c.lights.flash(this.tv2.copy(wp).sub(this.c.origin), 0xffb060, 900, 0.9, 400);
    this.c.audio.explosion(1.2, this.volFor(dist, 1500));
    this.c.shake(clamp(0.5 - dist / 800, 0.05, 0.5));
    // semua bagian tersisa + pecahan badan
    const dirOut = new THREE.Vector3(m.ix, 0.3, m.iz); if (dirOut.lengthSq() < 0.01) dirOut.set(0.4, 1, 0.2); dirOut.normalize();
    let guard = 6;
    while (guard-- > 0 && h.partsLeft(key) > 0) this.breakPart(h, key, center, dirOut);
    this.fragments(h, center, 16, 14, 1.0, MOD_DEFS[m.type].color, 18, dirOut);
    // pemain di dalam modul
    const pi = this.c.playerIn();
    if (pi && pi.h === h && pi.key === key) this.c.killPlayer(`${name} meledak`);
    // modul tetangga ikut terdampak ledakan
    for (let s = 0; s < 4; s++) {
      const nb = h.neighbor(m, s);
      if (!nb) continue;
      const nc = this.modCenter(h, nb);
      const dir = this.habToWorld(h, nc).sub(wp).normalize().multiplyScalar(-1);
      this.hitModule(h, nb.key, MOD_STRENGTH[nb.type] * rnd(0.12, 0.3), dir, 'ledakan modul sebelah', { fire: 0.5, quiet: true });
    }
    h.detach(key, true);
    this.c.toast(`${name} hancur (${why})!`, 'warn');
    this.c.changed(h);
  }

  /** pemadam: kurangi api pada modul, mengembalikan sisa */
  extinguish(h: Habitat, key: string, amount = 0.5) {
    const d = h.dmg.get(key);
    if (!d || d.fire <= 0) return 0;
    d.fire = Math.max(0, d.fire - amount);
    const m = h.mods.get(key);
    if (m) {
      const c = this.modCenter(h, m);
      const fx = h.ensureFxInt();
      for (let i = 0; i < 14; i++) fx.gas.spawn({ x: c.x + rnd(-1.4, 1.4), y: rnd(0.8, 2.2), z: c.z + rnd(-1.4, 1.4), vx: rnd(-1.5, 1.5), vy: rnd(0.2, 1.5), vz: rnd(-1.5, 1.5), life: rnd(0.6, 1.4), s0: 0.3, s1: 1.5, c0: [1, 1, 1, 0.55], c1: [1, 1, 1, 0], drag: 1.2 });
    }
    this.c.audio.foam(0.9);
    return d.fire;
  }

  /** perbaikan modul; mengembalikan ongkos kredit */
  repairCost(h: Habitat, key: string) {
    const d = h.dmg.get(key);
    const m = h.mods.get(key);
    if (!d || !m) return 0;
    return Math.ceil(MOD_DEFS[m.type].cost * (0.12 + 0.55 * (1 - d.hp)) + d.lost.length * 12 + d.dents.length * 2 + d.dust * 4);
  }

  // ------------------------------------------------------------ simulasi per bingkai
  /** o2Out: atmosfer luar mengandung oksigen. rho: kerapatan udara luar. powered: daya cukup */
  tickHab(h: Habitat, dt: number, o2Out: boolean, rho: number) {
    if (!h.mods.size) return;
    let leak = 0;
    let anyFire = false;
    let alarm = 0;
    const pi = this.c.playerIn();
    this.spreadT += dt;
    const fx = h.fx;
    for (const [key, m] of h.mods) {
      const d = h.dmg.get(key);
      if (!d) continue;
      const cap = MOD_STRENGTH[m.type];
      const center = this.modCenter(h, m);
      // bocor
      for (const t of d.dents) {
        if (!t.hole) continue;
        leak += t.r * t.r * 3;
        const hp = this.modLocalToHab(h, m, this.tv.set(t.p[0], t.p[1], t.p[2]));
        const nh = this.tv2.set(t.n[0], t.n[1], t.n[2]).applyAxisAngle(Y, -(m.rot * Math.PI) / 2);
        if (h.pressure > 0.08 && Math.random() < dt * 26 * h.pressure) h.ensureFx().vent(hp.x, hp.y, hp.z, nh, 0.6 + t.r);
        if (pi && pi.h === h && h.pressure > 0.08 && Math.random() < dt * 12) {
          // udara tersedot ke lubang di dalam ruangan
          const fi = h.ensureFxInt();
          fi.gas.spawn({ x: center.x + rnd(-1.6, 1.6), y: rnd(0.5, 2.5), z: center.z + rnd(-1.6, 1.6), vx: -nh.x * 6, vy: -nh.y * 6, vz: -nh.z * 6, life: 0.5, s0: 0.08, s1: 0.4, c0: [0.9, 0.95, 1, 0.35], c1: [0.9, 0.95, 1, 0], drag: 0.3 });
        }
      }
      // api
      if (d.fire > 0.001) {
        anyFire = true;
        const oxy = h.pressure > 0.3;
        if (!oxy) d.fire = Math.max(0, d.fire - 0.35 * dt);
        else d.fire = Math.min(1, d.fire + 0.016 * dt);
        if (h.powerRatio > 0.7 && h.powerUse > 0) d.fire = Math.max(0, d.fire - 0.01 * dt); // sprinkler pasif
        if (d.fire > 0) {
          d.hp = Math.max(0, d.hp - d.fire * 0.0045 * dt);
          alarm = Math.max(alarm, d.fire);
          // api & asap interior
          const fi = h.ensureFxInt();
          const n = d.fire * dt * 38;
          for (let i = 0; i < n || (i === 0 && Math.random() < n); i++) {
            fi.flame(center.x + rnd(-1.8, 1.8), rnd(0.1, 1.3), center.z + rnd(-1.8, 1.8), Y, 0.55 + d.fire * 0.8);
            if (Math.random() < 0.55) fi.smokePuff(center.x + rnd(-1.5, 1.5), rnd(1.6, 2.6), center.z + rnd(-1.5, 1.5), Y, 1.1, 5);
          }
          // lidah api di luar lewat lubang / atap
          const ex = h.ensureFx();
          const nOut = d.fire * dt * 14;
          const holes = d.dents.filter((t) => t.hole);
          for (let i = 0; i < nOut || (i === 0 && Math.random() < nOut); i++) {
            const t = holes.length ? holes[Math.floor(Math.random() * holes.length)] : null;
            if (t) {
              const hp = this.modLocalToHab(h, m, this.tv.set(t.p[0], t.p[1], t.p[2]));
              const nh = this.tv2.set(t.n[0], t.n[1], t.n[2]).applyAxisAngle(Y, -(m.rot * Math.PI) / 2);
              ex.flame(hp.x, hp.y, hp.z, nh, 0.8 + d.fire * 0.9);
              ex.smokePuff(hp.x, hp.y, hp.z, nh, 1.4, 6);
            } else if (d.fire > 0.55 && (o2Out || h.pressure > 0.5)) {
              ex.smokePuff(center.x + rnd(-1.5, 1.5), 3.1, center.z + rnd(-1.5, 1.5), Y, 1.3, 6);
            }
          }
          // penyebaran lewat pintu terbuka
          if (d.fire > 0.5 && this.spreadT > 1) {
            for (let s = 0; s < 4; s++) {
              const nb = h.neighbor(m, s);
              if (nb && Math.random() < 0.07 * d.fire) { const nd = h.getDmg(nb.key); if (nd.fire < 0.12) nd.fire = 0.12; }
            }
          }
          if (d.hp <= 0) { this.destroyModule(h, key, 'kebakaran'); return; }
        }
      }
      // percikan listrik pada modul rusak parah
      if (d.hp < 0.45 && h.powerRatio > 0.2 && Math.random() < dt * (0.45 - d.hp) * 1.4) {
        const fi = h.ensureFxInt();
        const px = center.x + rnd(-2, 2), pz = center.z + rnd(-2, 2);
        fi.sparkBurst(px, rnd(0.8, 2.6), pz, 14, 5);
        if (pi && pi.h === h) { this.c.audio.zap(0.35); this.zapT = 0.25; }
        if (d.hp < 0.3 && h.pressure > 0.3 && Math.random() < 0.1) d.fire = Math.max(d.fire, 0.15);
      }
      // beban abu dan debu
      if (d.ash > 0) {
        const sh = ROOF_LOAD[m.type];
        const rounded = m.type === 'hub' || m.type === 'corridor' || m.type === 'airlock' || m.type === 'dock' || m.type === 'comms';
        d.ash = Math.max(0, d.ash - (rounded ? 0.004 : 0.0008) * d.ash * dt * 10);
        if (d.ash > sh) {
          d.hp = Math.max(0, d.hp - ((d.ash / sh - 1) * 0.02 + 0.004) * dt);
          if (Math.random() < dt * 0.6) { this.c.audio.creak(this.inSame(h) ? 1 : 0.4); h.ensureFxInt().smokePuff(center.x + rnd(-2, 2), 2.7, center.z + rnd(-2, 2), Y, 1.0, 3); }
          if (d.hp <= 0) { this.destroyModule(h, key, 'atap runtuh karena abu'); return; }
        }
      }
      if (d.dust > 0) d.dust = Math.max(0, d.dust - 0.0015 * dt);
      void cap;
    }
    // tekanan
    if (leak > 0) h.pressure = Math.max(0, h.pressure * Math.exp(-leak * 0.06 * dt));
    else h.pressure = Math.min(1, h.pressure + (h.powerRatio > 0.3 ? 0.06 : 0.01) * dt);
    h.alarm = Math.max(anyFire ? 0.8 : 0, leak > 0 && h.pressure < 0.9 ? 1 : 0, alarm);
    void fx; void rho;
    if (this.zapT > 0) this.zapT -= dt;
  }

  // ------------------------------------------------------------ bagian yang terpengaruh angin / benda lain
  /** tekanan dinamis q (Pa) pada habitat: panel surya & antena patah bila melebihi kekuatannya */
  windLoad(h: Habitat, q: number, windDirWorld: THREE.Vector3, dt: number) {
    if (q < 250) return;
    for (const [key, m] of h.mods) {
      const parts = h.partGroups.get(key);
      if (!parts) continue;
      const d = h.getDmg(key);
      for (const id of parts.keys()) {
        if (d.lost.includes(id)) continue;
        // kekuatan lepas (Pa): panel besar lemah, antena kuat
        const strength = ({ panelL: 1500, panelR: 1500, roof: 2600, glass: 1800, dish: 3200, mast: 2300, antenna: 3000, arms: 4200, sensor: 3500, tank: 6000, cargo: 3800 } as Record<string, number>)[id] ?? 4000;
        if (q > strength * 0.7 && Math.random() < dt * 0.45 * (q / strength - 0.6)) {
          const dirHab = windDirWorld.clone().applyQuaternion(this.tq.copy(h.quat).invert());
          this.breakPart(h, key, this.modCenter(h, m), dirHab, id, [6, 14], 'diterbangkan angin');
          return;
        }
      }
    }
  }
}

// ====================================================================== KAPAL
export class ShipDamage {
  lost = new Set<string>();
  private crackCv: HTMLCanvasElement;
  private crackTex: THREE.CanvasTexture;
  private crackMesh: THREE.Mesh;
  private dents: THREE.Group[] = [];
  private smokeT = 0;
  private sparkT = 0;
  private nCracks = 0;
  burning = 0;
  emerg = 0; // 0..1 intensitas lampu darurat merah di kokpit
  private tv = new THREE.Vector3();
  localFx: import('./effects').FxSet;

  constructor(private rig: ShipRig, private c: DmgCtx, localFx: import('./effects').FxSet) {
    this.localFx = localFx;
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 420;
    this.crackCv = cv;
    this.crackTex = new THREE.CanvasTexture(cv);
    this.crackTex.colorSpace = THREE.SRGBColorSpace;
    this.crackMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.5), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.crackMesh.position.set(0, 1.85, -5.045);
    this.crackMesh.renderOrder = 3;
    this.crackMesh.visible = false;
    rig.group.add(this.crackMesh);
  }

  alive(prefix: string) { let n = 0; for (const id of this.rig.parts.keys()) if (id.startsWith(prefix) && !this.lost.has(id)) n++; return n; }
  total(prefix: string) { let n = 0; for (const id of this.rig.parts.keys()) if (id.startsWith(prefix)) n++; return n; }

  private partCenter(id: string, out: THREE.Vector3) {
    const objs = this.rig.parts.get(id)!;
    out.set(0, 0, 0);
    for (const o of objs) out.add(o.position);
    return out.multiplyScalar(1 / objs.length);
  }

  /** gambar retakan kaca kokpit */
  addCrack(severity: number) {
    const x = this.crackCv.getContext('2d')!;
    const w = this.crackCv.width, hgt = this.crackCv.height;
    const cx = rnd(0.15, 0.85) * w, cy = rnd(0.15, 0.85) * hgt;
    x.strokeStyle = 'rgba(235,245,255,0.85)';
    x.lineCap = 'round';
    const rays = 5 + Math.floor(severity * 9);
    for (let i = 0; i < rays; i++) {
      let a = (i / rays) * Math.PI * 2 + rnd(-0.3, 0.3);
      let px = cx, py = cy;
      const len = rnd(60, 80 + severity * 360);
      let t = 0;
      x.lineWidth = rnd(1.2, 2.6);
      x.beginPath(); x.moveTo(px, py);
      while (t < len) {
        const st = rnd(12, 34);
        a += rnd(-0.35, 0.35);
        px += Math.cos(a) * st; py += Math.sin(a) * st; t += st;
        x.lineTo(px, py);
        if (Math.random() < 0.18) { // cabang
          const bx = px + Math.cos(a + 0.9) * rnd(20, 70), by = py + Math.sin(a + 0.9) * rnd(20, 70);
          x.moveTo(px, py); x.lineTo(bx, by); x.moveTo(px, py);
        }
      }
      x.stroke();
    }
    // titik benturan
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.beginPath(); x.arc(cx, cy, 6 + severity * 10, 0, Math.PI * 2); x.fill();
    this.crackTex.needsUpdate = true;
    this.crackMesh.visible = true;
    this.nCracks++;
  }

  /** benturan: frac = fraksi kerusakan lambung; dir = arah lokal-kapal dari pusat menuju sumber */
  hit(frac: number, dir: THREE.Vector3, why: string) {
    if (frac < 0.004) return;
    const d = dir.clone().normalize();
    const AX = 2.2, AY = 1.5, AZ = 7;
    const k = 1 / Math.sqrt((d.x / AX) ** 2 + (d.y / AY) ** 2 + (d.z / AZ) ** 2);
    const p = new THREE.Vector3(d.x * k, 0.9 + d.y * k, 0.5 + d.z * k);
    const n = new THREE.Vector3(d.x * k / (AX * AX), d.y * k / (AY * AY), d.z * k / (AZ * AZ)).normalize();
    // penyok pada kulit
    if (frac > 0.012) {
      const t: Dent = { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z], r: clamp(0.15 + frac * 1.4, 0.15, 0.9), burn: clamp(frac * 4), hole: false };
      const m = dentMesh(t);
      this.rig.group.add(m);
      this.dents.push(m);
      if (this.dents.length > 10) { const o = this.dents.shift()!; o.removeFromParent(); o.traverse((q) => { const me = q as THREE.Mesh; if (me.isMesh) me.geometry.dispose(); }); }
    }
    const fx = this.localFx;
    fx.sparkBurst(p.x, p.y, p.z, Math.floor(10 + frac * 140), 3 + frac * 14);
    if (frac > 0.03) for (let i = 0; i < 3; i++) fx.smokePuff(p.x, p.y, p.z, n, 1.4, 4);
    if (frac > 0.025) this.addCrack(clamp(frac * 3));
    this.c.audio.impact(clamp(frac * 6));
    // bagian lepas: terdekat dari titik tumbukan
    const nLose = frac > 0.45 ? 3 : frac > 0.22 ? 2 : frac > 0.09 ? 1 : Math.random() < frac * 7 ? 1 : 0;
    const wantLegs = dir.y < -0.35;
    for (let i = 0; i < nLose; i++) {
      const cand: { id: string; d: number }[] = [];
      for (const id of this.rig.parts.keys()) {
        if (this.lost.has(id)) continue;
        const c = this.partCenter(id, this.tv);
        let dd = c.distanceTo(p);
        if (wantLegs && id.startsWith('leg')) dd *= 0.35;
        cand.push({ id, d: dd });
      }
      cand.sort((a, b) => a.d - b.d);
      if (cand.length) this.breakPart(cand[0].id, n, why);
    }
  }

  breakPart(id: string, outward: THREE.Vector3, why = '') {
    const objs = this.rig.parts.get(id);
    if (!objs || this.lost.has(id)) return;
    this.lost.add(id);
    const cen = new THREE.Vector3();
    for (const o of objs) cen.add(o.position);
    cen.multiplyScalar(1 / objs.length);
    const pivot = new THREE.Group();
    let radius = 0.4;
    for (const o of objs) {
      const cl = o.clone(true);
      cl.visible = true;
      cl.position.sub(cen);
      pivot.add(cl);
      radius = Math.max(radius, cl.position.length() + 0.4);
      o.visible = false;
    }
    const { pos, quat } = this.c.shipPose();
    const wp = cen.clone().applyQuaternion(quat).add(pos);
    const fi = this.c.frameOfShip();
    const up = this.c.upAt(wp);
    const kick = outward.clone().applyQuaternion(quat).multiplyScalar(rnd(2, 6)).addScaledVector(up, rnd(0.5, 3));
    launchDebris(this.c, pivot, wp, quat, kick, Math.min(radius, 2.2), fi, { hot: 7, ang: 2.5, mass: 600 });
    this.localFx.sparkBurst(cen.x, cen.y, cen.z, 30, 10);
    this.c.audio.tear(1);
    this.c.toast(`${this.partLabel(id)} terlepas dari kapal${why ? ' (' + why + ')' : ''}!`, 'warn');
  }
  partLabel(id: string) {
    if (id.startsWith('leg')) return 'Kaki pendarat';
    if (id.startsWith('wing')) return id === 'wingL' ? 'Sayap kiri' : 'Sayap kanan';
    if (id.startsWith('engine')) return 'Mesin ' + (Number(id.slice(6)) + 1);
    if (id === 'dish') return 'Parabola';
    if (id === 'fin') return 'Sirip ekor';
    return id;
  }

  repairAll() {
    for (const objs of this.rig.parts.values()) for (const o of objs) o.visible = true;
    this.lost.clear();
    for (const d of this.dents) { d.removeFromParent(); d.traverse((q) => { const me = q as THREE.Mesh; if (me.isMesh) me.geometry.dispose(); }); }
    this.dents.length = 0;
    const x = this.crackCv.getContext('2d')!;
    x.clearRect(0, 0, this.crackCv.width, this.crackCv.height);
    this.crackTex.needsUpdate = true;
    this.crackMesh.visible = false;
    this.nCracks = 0;
  }

  /** faktor kemampuan mesin/kaki dari bagian yang tersisa */
  get engineFactor() { const t = this.total('engine'); return t ? 0.3 + 0.7 * (this.alive('engine') / t) : 1; }
  get legFactor() { const t = this.total('leg'); return t ? Math.max(0.15, this.alive('leg') / t) : 1; }
  get wingFactor() { const t = this.total('wing'); return t ? 0.5 + 0.5 * (this.alive('wing') / t) : 1; }

  /** efek berkelanjutan sesuai kondisi lambung; dipanggil tiap bingkai */
  tick(dt: number, hull: number, inCockpit: boolean) {
    const sev = clamp((0.55 - hull) / 0.55);
    this.burning = sev;
    this.emerg = 0;
    if (sev <= 0) return;
    const fx = this.localFx;
    this.smokeT -= dt;
    this.sparkT -= dt;
    // asap dari mesin / sayap yang rusak (di ruang dunia, tertinggal di belakang kapal)
    if (this.smokeT <= 0) {
      this.smokeT = 0.1 / (0.3 + sev);
      const engs = [...this.rig.parts.keys()].filter((i) => i.startsWith('engine'));
      const id = engs[Math.floor(Math.random() * engs.length)];
      const base = id && this.lost.has(id) ? new THREE.Vector3(rnd(-1, 1), 1, 7.4) : new THREE.Vector3(rnd(-3, 3), 0.8, rnd(1, 7));
      const { pos, quat } = this.c.shipPose();
      const wp = base.clone().applyQuaternion(quat).add(pos);
      const fi = this.c.frameOfShip();
      const up = this.c.upAt(wp);
      const dfx = this.c.debris.fx;
      dfx.withFrame(() => ({ p: fi.p, att: fi.att }), fi.att, () => {
        dfx.smokePuff(wp.x, wp.y, wp.z, new THREE.Vector3().copy(up).multiplyScalar(0.3), 1.6 + sev * 1.6, 5, { vx: fi.vel.x, vy: fi.vel.y, vz: fi.vel.z });
        if (sev > 0.45 && Math.random() < 0.5) dfx.flame(wp.x, wp.y, wp.z, new THREE.Vector3().copy(up).multiplyScalar(0.2), 1.0 + sev, { vx: fi.vel.x, vy: fi.vel.y, vz: fi.vel.z, life: 0.5 });
      });
    }
    // kokpit: percikan & asap
    if (inCockpit && this.sparkT <= 0 && sev > 0.25) {
      this.sparkT = rnd(0.4, 2.5) / sev;
      const px = rnd(-1.6, 1.6), pz = rnd(-4.5, -2.2);
      fx.sparkBurst(px, rnd(0.8, 2.2), pz, 16, 4);
      this.c.audio.zap(0.4 * sev);
      if (sev > 0.6) fx.smokePuff(px, 1.8, pz, new THREE.Vector3(0, 1, 0), 1.0, 4);
    }
    // kebakaran di kokpit pada kerusakan parah
    if (inCockpit && sev > 0.75) {
      if (Math.random() < dt * 14 * (sev - 0.6)) fx.flame(rnd(-1.6, 1.6), rnd(0.3, 1.0), rnd(-4.4, -2.4), new THREE.Vector3(0, 1, 0), 0.5);
      if (Math.random() < dt * 6) fx.smokePuff(rnd(-1.6, 1.6), 2.5, rnd(-4.4, -1.0), new THREE.Vector3(0, 0.2, 0), 1.1, 4);
    }
    // lampu darurat berkedip
    if (inCockpit && sev > 0.4) this.emerg = Math.sin(performance.now() * 0.009) > 0 ? 1 : 0.25;
  }
}
