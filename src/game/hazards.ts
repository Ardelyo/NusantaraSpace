// Cuaca ekstrem & bencana planet: badai debu Mars, hujan asam Venus, badai petir Bumi, letusan Io, hujan meteor, gempa, semburan surya
import * as THREE from 'three';
import { mulberry32 } from './noise';

export type HazardType = 'dust' | 'acid' | 'storm' | 'ash' | 'methane' | 'meteor' | 'quake' | 'flare';

export interface HazardInfo {
  label: string;
  icon: string;
  desc: string;
  color: [number, number, number]; // warna partikel
  fog: [number, number, number]; // warna kabut saat badai
  fogMul: number;
  wind: number; // m/s
  fall: number; // m/s jatuh
  suit: number; // kerusakan baju per detik @ k=1
  solar: number; // pengurangan daya surya @ k=1
  ramp: number;
  dur: [number, number];
  gap: [number, number];
}

export const HAZARDS: Record<HazardType, HazardInfo> = {
  dust: { label: 'Badai Debu', icon: '🌪', desc: 'Angin 80 km/jam menerbangkan debu halus; jarak pandang nyaris nol dan daya surya anjlok. Berlindunglah di basecamp.', color: [0.95, 0.62, 0.36], fog: [0.82, 0.5, 0.3], fogMul: 45, wind: 24, fall: 0, suit: 0.004, solar: 0.85, ramp: 14, dur: [75, 120], gap: [90, 170] },
  acid: { label: 'Hujan Asam', icon: '☣', desc: 'Tetesan asam sulfat dari dek awan menggerogoti baju antariksa. Jangan keluar lama.', color: [0.78, 1, 0.32], fog: [0.85, 0.7, 0.22], fogMul: 14, wind: 9, fall: 7, suit: 0.03, solar: 0.3, ramp: 10, dur: [60, 100], gap: [70, 140] },
  storm: { label: 'Badai Petir', icon: '⛈', desc: 'Hujan deras dan sambaran petir. Waspada tersambar saat berdiri di tempat terbuka.', color: [0.75, 0.86, 1], fog: [0.35, 0.4, 0.5], fogMul: 14, wind: 14, fall: 9, suit: 0, solar: 0.55, ramp: 10, dur: [60, 95], gap: [110, 200] },
  ash: { label: 'Letusan Vulkanik', icon: '🌋', desc: 'Gunung berapi meletus: abu panas menghujani area dan tanah bergetar.', color: [0.55, 0.5, 0.48], fog: [0.35, 0.28, 0.24], fogMul: 28, wind: 7, fall: 6, suit: 0.012, solar: 0.65, ramp: 8, dur: [50, 80], gap: [70, 130] },
  methane: { label: 'Hujan Metana', icon: '☔', desc: 'Hujan metana cair membasahi kabut oranye Titan. Dingin ekstrem menekan baju.', color: [1, 0.62, 0.22], fog: [0.78, 0.45, 0.14], fogMul: 12, wind: 8, fall: 3, suit: 0.005, solar: 0.3, ramp: 10, dur: [70, 110], gap: [100, 170] },
  meteor: { label: 'Hujan Meteor', icon: '☄', desc: 'Pecahan batu angkasa menghantam permukaan tanpa penyaring atmosfer. Berlindung atau menjauh dari titik tumbukan!', color: [1, 0.85, 0.6], fog: [0, 0, 0], fogMul: 1, wind: 0, fall: 0, suit: 0, solar: 0, ramp: 6, dur: [35, 55], gap: [80, 170] },
  quake: { label: 'Gempa', icon: '〰', desc: 'Getaran kuat mengguncang permukaan. Debu beterbangan; tetap waspada.', color: [0.8, 0.75, 0.7], fog: [0, 0, 0], fogMul: 3, wind: 0, fall: 0, suit: 0, solar: 0, ramp: 3, dur: [14, 26], gap: [90, 200] },
  flare: { label: 'Semburan Surya', icon: '☀', desc: 'Lontaran massa korona: radiasi tinggi. Layar berderau, baju antariksa rusak bila di luar. Berlindung di kapal atau habitat.', color: [1, 0.9, 0.7], fog: [0, 0, 0], fogMul: 1, wind: 0, fall: 0, suit: 0.022, solar: 0.0, ramp: 8, dur: [32, 48], gap: [260, 420] },
};

// profil bencana per benda (id → jenis); dunia generatif ditentukan oleh seed
const PROFILE: Record<string, HazardType[]> = {
  mars: ['dust', 'dust', 'quake'],
  venus: ['acid'],
  bumi: ['storm'],
  io: ['ash', 'quake'],
  titan: ['methane'],
  bulan: ['meteor', 'quake'],
  merkurius: ['meteor'],
  ceres: ['meteor'],
  phobos: ['meteor'],
  deimos: ['meteor'],
  callisto: ['meteor'],
  ganymede: ['meteor', 'quake'],
  europa: ['quake', 'meteor'],
  enceladus: ['ash'],
  triton: ['quake'],
  pluto: ['meteor'],
};

export interface LifeProfile { flora: boolean; fauna: boolean; alien: boolean; glow: boolean; hue: number; label: string }

// kehidupan: Bumi punya flora & fauna; sebagian dunia generatif punya kehidupan asing
export function lifeOf(id: string, genSeed?: number, hasAtm = false, hasSea = false): LifeProfile | null {
  if (id === 'bumi') return { flora: true, fauna: true, alien: false, glow: false, hue: 0.3, label: 'Biosfer Bumi' };
  if (genSeed === undefined) return null;
  const r = mulberry32(genSeed * 31 + 7);
  const a = r(), b = r(), c = r(), d = r();
  const habitable = hasAtm && (hasSea || a < 0.55);
  if (!habitable || b < 0.15) return null;
  return { flora: true, fauna: c < 0.8, alien: true, glow: d < 0.55, hue: r(), label: 'Biosfer asing' };
}

export function hazardsOf(id: string, genSeed?: number, hasAtm = false, hasSea = false): HazardType[] {
  if (PROFILE[id]) return PROFILE[id];
  if (genSeed === undefined) return [];
  const life = lifeOf(id, genSeed, hasAtm, hasSea);
  const r = mulberry32(genSeed * 17 + 3);
  if (life && r() < 0.5) return []; // surga tenang
  if (hasAtm) return [(['dust', 'acid', 'storm', 'ash', 'methane', 'quake'] as HazardType[])[Math.floor(r() * 6)]];
  return ['meteor', 'quake'];
}

export interface ActiveHazard {
  type: HazardType;
  bodyId: string;
  t: number;
  dur: number;
  k: number;
  warned: boolean;
}

export interface Forecast { type: HazardType; label: string; icon: string; in: number; active: boolean; k: number }

export class HazardSystem {
  active: ActiveHazard | null = null;
  flare: ActiveHazard | null = null;
  private timers = new Map<string, { t: number; type: HazardType }>();
  private flareT = 160 + Math.random() * 120;
  private rnd = Math.random;
  profileCache = new Map<string, HazardType[]>();

  setProfile(id: string, list: HazardType[]) { this.profileCache.set(id, list); }

  private pick(list: HazardType[]) { return list[Math.floor(this.rnd() * list.length)]; }
  private dur(type: HazardType) { const h = HAZARDS[type]; return h.dur[0] + this.rnd() * (h.dur[1] - h.dur[0]); }
  private gap(type: HazardType) { const h = HAZARDS[type]; return h.gap[0] + this.rnd() * (h.gap[1] - h.gap[0]); }

  private envelope(a: ActiveHazard) {
    const ramp = HAZARDS[a.type].ramp;
    return Math.max(0, Math.min(1, a.t / ramp, (a.dur - a.t) / ramp));
  }

  // body: benda terdekat yang relevan (dekat permukaan/atmosfer), null bila di angkasa kosong
  update(dt: number, bodyId: string | null) {
    // ---- semburan surya (global)
    if (this.flare) {
      this.flare.t += dt;
      this.flare.k = this.envelope(this.flare);
      if (this.flare.t >= this.flare.dur) { this.flare = null; this.flareT = HAZARDS.flare.gap[0] + this.rnd() * (HAZARDS.flare.gap[1] - HAZARDS.flare.gap[0]); }
    } else {
      this.flareT -= dt;
      if (this.flareT <= 0) this.flare = { type: 'flare', bodyId: '*', t: 0, dur: this.dur('flare'), k: 0, warned: false };
    }

    // ---- bencana lokal
    if (this.active && this.active.bodyId !== bodyId) { this.active = null; }
    if (!bodyId) return;
    const prof = this.profileCache.get(bodyId);
    if (!prof || !prof.length) return;
    let tm = this.timers.get(bodyId);
    if (!tm) { const type = this.pick(prof); tm = { t: 30 + this.rnd() * 40, type }; this.timers.set(bodyId, tm); }
    if (this.active) {
      const a = this.active;
      a.t += dt;
      a.k = this.envelope(a);
      if (a.t >= a.dur) {
        this.active = null;
        const type = this.pick(prof);
        tm.type = type; tm.t = this.gap(type);
      }
    } else {
      tm.t -= dt;
      if (tm.t <= 0) this.active = { type: tm.type, bodyId, t: 0, dur: this.dur(tm.type), k: 0, warned: false };
    }
  }

  trigger(type: HazardType, bodyId: string) {
    if (type === 'flare') { this.flare = { type, bodyId: '*', t: 0, dur: this.dur(type), k: 0, warned: false }; return; }
    this.active = { type, bodyId, t: 0, dur: this.dur(type), k: 0, warned: false };
  }

  forecast(bodyId: string | null): Forecast | null {
    if (this.active && this.active.k >= 0.001) { const h = HAZARDS[this.active.type]; return { type: this.active.type, label: h.label, icon: h.icon, in: 0, active: true, k: this.active.k }; }
    if (this.active) { const h = HAZARDS[this.active.type]; return { type: this.active.type, label: h.label, icon: h.icon, in: 0, active: true, k: 0 }; }
    if (this.flare) { const h = HAZARDS.flare; return { type: 'flare', label: h.label, icon: h.icon, in: 0, active: true, k: this.flare.k }; }
    if (this.flareT < 25) { const h = HAZARDS.flare; return { type: 'flare', label: h.label, icon: h.icon, in: this.flareT, active: false, k: 0 }; }
    if (bodyId) {
      const tm = this.timers.get(bodyId);
      if (tm && tm.t < 35) { const h = HAZARDS[tm.type]; return { type: tm.type, label: h.label, icon: h.icon, in: tm.t, active: false, k: 0 }; }
    }
    return null;
  }

  // intensitas efektif dari jenis tertentu
  k(type: HazardType): number {
    if (type === 'flare') return this.flare ? this.flare.k : 0;
    return this.active && this.active.type === type ? this.active.k : 0;
  }
  get local(): ActiveHazard | null { return this.active; }
}

// ---------------------------------------------------------------- efek partikel cuaca
interface Meteor { p: THREE.Vector3; v: THREE.Vector3; life: number; alive: boolean }

export class WeatherFX {
  lines: THREE.LineSegments;
  meteorLines: THREE.LineSegments;
  flash: THREE.Sprite;
  n = 1100;
  size = 90;
  base: Float64Array;
  off = new THREE.Vector3();
  pos: Float32Array;
  mpos: Float32Array;
  meteors: Meteor[] = [];
  flashT = 0;
  private mat: THREE.LineBasicMaterial;
  private dir = new THREE.Vector3();
  onImpact: ((distance: number) => void) | null = null;
  private spawnT = 0;

  constructor(scene: THREE.Scene) {
    this.base = new Float64Array(this.n * 3);
    this.pos = new Float32Array(this.n * 6);
    const r = mulberry32(99);
    for (let i = 0; i < this.n * 3; i++) this.base[i] = r() * 100000;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    scene.add(this.lines);

    this.mpos = new Float32Array(8 * 6);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(this.mpos, 3));
    this.meteorLines = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.meteorLines.frustumCulled = false;
    scene.add(this.meteorLines);
    for (let i = 0; i < 8; i++) this.meteors.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, alive: false });

    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d')!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,80,0.5)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false, fog: false }));
    this.flash.frustumCulled = false;
    scene.add(this.flash);
  }

  // origin: titik pusat render (dunia), up: arah "atas" lokal, rel: posisi pemain di dunia
  update(dt: number, origin: THREE.Vector3, up: THREE.Vector3, type: HazardType | null, k: number, camPos: THREE.Vector3, density: number) {
    const mat = this.mat;
    const info = type ? HAZARDS[type] : null;
    const show = info && k > 0.02 && density > 0.02 && (info.wind > 0 || info.fall > 0 || type === 'quake');
    if (!show || !info || !type) {
      mat.opacity = 0;
      this.lines.visible = false;
    } else {
      this.lines.visible = true;
      // arah angin horizontal (tetap per jenis) pada bidang tangen
      const e1 = this.dir.set(0.8, 0.1, 0.6).cross(up).normalize();
      const wind = e1.clone().multiplyScalar(info.wind * k);
      const vel = wind.addScaledVector(up, -info.fall * k - (type === 'quake' ? 1.5 : 0) - (type === 'dust' ? 0.3 : 0));
      if (type === 'ash') vel.addScaledVector(up, -3 * k);
      this.off.addScaledVector(vel, dt);
      const S = this.size, H = S / 2;
      const len = type === 'dust' ? 4.0 : type === 'ash' ? 0.5 : type === 'quake' ? 0.3 : 1.7;
      const vl = vel.length() || 1;
      const sx = (vel.x / vl) * len * (0.4 + k), sy = (vel.y / vl) * len * (0.4 + k), sz = (vel.z / vl) * len * (0.4 + k);
      const b = this.base, p = this.pos;
      const cnt = Math.floor(this.n * (0.3 + 0.7 * k) * Math.min(1, density * 1.3 + 0.2));
      for (let i = 0; i < this.n; i++) {
        const o = i * 6;
        if (i >= cnt) { p[o] = p[o + 3] = 1e7; p[o + 1] = p[o + 4] = 1e7; p[o + 2] = p[o + 5] = 1e7; continue; }
        let x = (b[i * 3] + this.off.x - origin.x) % S, y = (b[i * 3 + 1] + this.off.y - origin.y) % S, z = (b[i * 3 + 2] + this.off.z - origin.z) % S;
        if (x < -H) x += S; if (x > H) x -= S;
        if (y < -H) y += S; if (y > H) y -= S;
        if (z < -H) z += S; if (z > H) z -= S;
        p[o] = x; p[o + 1] = y; p[o + 2] = z;
        p[o + 3] = x - sx; p[o + 4] = y - sy; p[o + 5] = z - sz;
      }
      (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      mat.color.setRGB(info.color[0], info.color[1], info.color[2]);
      mat.opacity = Math.min(0.9, (type === 'dust' ? 0.55 : type === 'ash' ? 0.8 : 0.5) * (0.35 + 0.65 * k) * Math.min(1, density * 1.5 + 0.3));
    }

    // meteor
    const mp = this.mpos;
    if (type === 'meteor' && k > 0.05) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.35 + Math.random() * 1.1 / Math.max(0.3, k);
        const m = this.meteors.find((q) => !q.alive);
        if (m) {
          const ang = Math.random() * Math.PI * 2, rr = 40 + Math.pow(Math.random(), 1.6) * 700;
          const t1 = new THREE.Vector3().copy(up).cross(new THREE.Vector3(0.3, 0.9, 0.2)).normalize();
          const t2 = new THREE.Vector3().copy(up).cross(t1).normalize();
          const ho = t1.multiplyScalar(Math.cos(ang) * rr).addScaledVector(t2, Math.sin(ang) * rr);
          m.p.copy(camPos).add(ho).addScaledVector(up, 900 + Math.random() * 300);
          m.v.copy(up).multiplyScalar(-330).addScaledVector(t1.normalize(), (Math.random() - 0.5) * 120).addScaledVector(t2, (Math.random() - 0.5) * 120);
          m.alive = true; m.life = 0;
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      const m = this.meteors[i];
      const o = i * 6;
      if (!m.alive) { mp[o] = mp[o + 3] = 1e7; mp[o + 1] = mp[o + 4] = 1e7; mp[o + 2] = mp[o + 5] = 1e7; continue; }
      m.p.addScaledVector(m.v, dt);
      m.life += dt;
      const h = m.p.clone().sub(camPos).dot(up);
      if (h < -1.8) {
        m.alive = false;
        const rel = m.p.clone().sub(camPos);
        const dist = rel.addScaledVector(up, -rel.dot(up)).length();
        this.flash.position.copy(m.p).sub(origin).addScaledVector(up, 2);
        this.flash.scale.setScalar(25 + 40 * Math.random());
        this.flashT = 0.5;
        if (this.onImpact) this.onImpact(dist);
        continue;
      }
      const tail = m.v.clone().multiplyScalar(-0.14);
      mp[o] = m.p.x - origin.x; mp[o + 1] = m.p.y - origin.y; mp[o + 2] = m.p.z - origin.z;
      mp[o + 3] = mp[o] + tail.x; mp[o + 4] = mp[o + 1] + tail.y; mp[o + 5] = mp[o + 2] + tail.z;
    }
    (this.meteorLines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.flashT = Math.max(0, this.flashT - dt);
    (this.flash.material as THREE.SpriteMaterial).opacity = this.flashT * 1.6;
  }
}
