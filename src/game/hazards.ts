// Cuaca ekstrem & bencana planet: badai debu Mars, hujan asam Venus, badai petir Bumi, letusan Io, hujan meteor, gempa, semburan surya
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { Cloud } from './effects';

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
  alt?: [number, number]; // hanya terjadi pada rentang ketinggian ini (m) — mis. dek awan Venus
  air?: boolean; // butuh atmosfer cukup rapat di lokasi
}

export const HAZARDS: Record<HazardType, HazardInfo> = {
  dust: { label: 'Badai Debu', icon: '🌪', desc: 'Angin 80 km/jam menerbangkan pasir & debu halus; jarak pandang nyaris nol, panel surya tertutup debu. Di Mars udaranya tipis: tekanan angin lemah, bahayanya adalah debu dan abrasi.', color: [0.95, 0.62, 0.36], fog: [0.82, 0.5, 0.3], fogMul: 45, wind: 24, fall: 0, suit: 0.004, solar: 0.85, ramp: 14, dur: [75, 120], gap: [90, 170], air: true },
  acid: { label: 'Hujan Asam', icon: '☣', desc: 'Tetesan asam sulfat dari dek awan menggerogoti baju antariksa. Jangan keluar lama.', color: [0.78, 1, 0.32], fog: [0.85, 0.7, 0.22], fogMul: 14, wind: 9, fall: 7, suit: 0.03, solar: 0.3, ramp: 10, dur: [60, 100], gap: [70, 140], alt: [45000, 70000], air: true },
  storm: { label: 'Badai Petir', icon: '⛈', desc: 'Hujan deras dan sambaran petir. Waspada tersambar saat berdiri di tempat terbuka.', color: [0.75, 0.86, 1], fog: [0.35, 0.4, 0.5], fogMul: 14, wind: 14, fall: 9, suit: 0, solar: 0.55, ramp: 10, dur: [60, 95], gap: [110, 200], air: true },
  ash: { label: 'Letusan Vulkanik', icon: '🌋', desc: 'Gunung berapi meletus: abu panas menghujani area dan tanah bergetar.', color: [0.55, 0.5, 0.48], fog: [0.35, 0.28, 0.24], fogMul: 28, wind: 7, fall: 6, suit: 0.012, solar: 0.65, ramp: 8, dur: [50, 80], gap: [70, 130] },
  methane: { label: 'Hujan Metana', icon: '☔', desc: 'Hujan metana cair membasahi kabut oranye Titan. Dingin ekstrem menekan baju.', color: [1, 0.62, 0.22], fog: [0.78, 0.45, 0.14], fogMul: 12, wind: 8, fall: 3, suit: 0.005, solar: 0.3, ramp: 10, dur: [70, 110], gap: [100, 170], air: true },
  meteor: { label: 'Hujan Meteor', icon: '☄', desc: 'Pecahan batu angkasa menghantam permukaan tanpa penyaring atmosfer. Berlindung atau menjauh dari titik tumbukan!', color: [1, 0.85, 0.6], fog: [0, 0, 0], fogMul: 1, wind: 0, fall: 0, suit: 0, solar: 0, ramp: 6, dur: [35, 55], gap: [80, 170] },
  quake: { label: 'Gempa', icon: '〰', desc: 'Getaran kuat mengguncang permukaan. Debu beterbangan; tetap waspada.', color: [0.8, 0.75, 0.7], fog: [0, 0, 0], fogMul: 3, wind: 0, fall: 0, suit: 0, solar: 0, ramp: 3, dur: [14, 26], gap: [90, 200] },
  flare: { label: 'Semburan Surya', icon: '☀', desc: 'Lontaran massa korona: radiasi tinggi. Layar berderau, baju antariksa rusak bila di luar. Berlindung di kapal atau habitat.', color: [1, 0.9, 0.7], fog: [0, 0, 0], fogMul: 1, wind: 0, fall: 0, suit: 0.022, solar: 0.0, ramp: 8, dur: [32, 48], gap: [260, 420] },
};

// profil bencana per benda (id → jenis); dunia generatif ditentukan oleh seed
const PROFILE: Record<string, HazardType[]> = {
  mars: ['dust', 'dust', 'quake'],
  venus: ['acid', 'quake'],
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

export interface LifeProfile { flora: boolean; fauna: boolean; alien: boolean; glow: boolean; hue: number; label: string; T0?: number }

/** kondisi permukaan yang menentukan kelayakan hidup */
export interface SurfaceEnv { T0: number; pSurf: number }

// kehidupan: Bumi punya flora & fauna; sebagian dunia generatif punya kehidupan asing
// Syarat hidup "seperti yang kita kenal": air cair di permukaan (di atas titik tripel, 611 Pa),
// suhu permukaan 273–373 K, dan atmosfer. Tanpa semuanya itu tak ada biosfer.
export function lifeOf(id: string, genSeed?: number, hasAtm = false, hasSea = false, env?: SurfaceEnv): LifeProfile | null {
  if (id === 'bumi') return { flora: true, fauna: true, alien: false, glow: false, hue: 0.3, label: 'Biosfer Bumi', T0: 288 };
  if (genSeed === undefined) return null;
  const r = mulberry32(genSeed * 31 + 7);
  r();
  const b = r(), c = r(), d = r();
  const liquid = hasSea && !!env && env.T0 > 273 && env.T0 < 373 && env.pSurf > 611;
  if (!hasAtm || !liquid || b < 0.15) return null;
  return { flora: true, fauna: c < 0.8 && env!.T0 < 330, alien: true, glow: d < 0.55, hue: r(), label: 'Biosfer asing', T0: env!.T0 };
}

export function hazardsOf(id: string, genSeed?: number, hasAtm = false, hasSea = false, env?: SurfaceEnv): HazardType[] {
  if (PROFILE[id]) return PROFILE[id];
  if (genSeed === undefined) return [];
  const life = lifeOf(id, genSeed, hasAtm, hasSea, env);
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

  /** ketinggian maksimum yang masih relevan untuk bencana di benda ini (m), 0 bila tak ada batas khusus */
  maxAlt(bodyId: string): number {
    let m = 0;
    for (const t of this.profileCache.get(bodyId) || []) { const h = HAZARDS[t]; if (h.alt) m = Math.max(m, h.alt[1] * 1.05); }
    return m;
  }
  private allowed(type: HazardType, alt: number, rho: number) {
    const h = HAZARDS[type];
    if (h.alt && (alt < h.alt[0] || alt > h.alt[1])) return false;
    if (h.air && rho < 2e-4) return false;
    if (!h.alt && type !== 'meteor' && type !== 'quake' && type !== 'ash' && alt > 20000) return false;
    if ((type === 'quake' || type === 'ash') && alt > 12000) return false;
    return true;
  }

  // body: benda terdekat yang relevan (dekat permukaan/atmosfer), null bila di angkasa kosong
  // alt: ketinggian pemain di atas permukaan; rho: kerapatan udara di lokasi
  update(dt: number, bodyId: string | null, alt = 0, rho = 1) {
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
      // keluar dari lingkungan yang memungkinkan (mis. turun dari dek awan) → bencana cepat mereda
      const ok = this.allowed(a.type, alt, rho);
      a.t += dt * (ok ? 1 : 5);
      a.k = this.envelope(a);
      if (a.t >= a.dur) {
        this.active = null;
        const type = this.pick(prof);
        tm.type = type; tm.t = this.gap(type);
      }
    } else {
      tm.t -= dt;
      if (tm.t <= 0) {
        // pilih jenis yang mungkin di lokasi ini; bila tak ada, tunda
        const ok = prof.filter((t) => this.allowed(t, alt, rho));
        if (!ok.length) tm.t = 6;
        else {
          const type = ok.includes(tm.type) ? tm.type : this.pick(ok);
          this.active = { type, bodyId, t: 0, dur: this.dur(type), k: 0, warned: false };
        }
      }
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
interface Meteor { p: THREE.Vector3; v: THREE.Vector3; life: number; alive: boolean; hCut: number }

export interface WeatherCtx {
  light: number; // 0..1 kecerahan siang (mewarnai debu)
  groundDist: number; // jarak ke tanah di bawah kamera (m)
  targets: THREE.Vector3[]; // titik dunia (absolut) yang bisa dijadikan sasaran meteor
  gust: number; // pengali hembusan (≈1)
}

const mod = (x: number, m: number) => ((x % m) + m) % m;

export class WeatherFX {
  lines: THREE.LineSegments;
  meteorLines: THREE.LineSegments;
  flash: THREE.Sprite;
  banks: Cloud; // gumpalan debu/abu raksasa
  grains: Cloud; // butiran pasir yang melompat-lompat di dekat tanah
  bolt: THREE.LineSegments;
  private boltPos = new Float32Array(2 * 800 * 3);
  private boltAbs: number[] = [];
  private boltT = 0;
  n = 1100;
  size = 90;
  base: Float64Array;
  bbase: Float64Array;
  gbase: Float64Array;
  off = new THREE.Vector3();
  pos: Float32Array;
  mpos: Float32Array;
  meteors: Meteor[] = [];
  flashT = 0;
  private mat: THREE.LineBasicMaterial;
  private dir = new THREE.Vector3();
  private e1 = new THREE.Vector3();
  private e2 = new THREE.Vector3();
  onImpact: ((distance: number, p: THREE.Vector3, up: THREE.Vector3) => void) | null = null;
  private spawnT = 0;
  private nB = 110;
  private nG = 380;
  time = 0;

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

    this.banks = new Cloud(this.nB, false);
    this.grains = new Cloud(this.nG, false);
    this.bbase = new Float64Array(this.nB * 4);
    this.gbase = new Float64Array(this.nG * 4);
    const r2 = mulberry32(1234);
    for (let i = 0; i < this.nB; i++) { this.bbase[i * 4] = r2() * 1e5; this.bbase[i * 4 + 1] = r2() * 1e5; this.bbase[i * 4 + 2] = r2(); this.bbase[i * 4 + 3] = r2(); this.banks.size[i] = 24 + r2() * 40; }
    for (let i = 0; i < this.nG; i++) { this.gbase[i * 4] = r2() * 1e5; this.gbase[i * 4 + 1] = r2() * 1e5; this.gbase[i * 4 + 2] = r2(); this.gbase[i * 4 + 3] = r2() * 6.28; this.grains.size[i] = 0.07 + r2() * 0.1; }
    scene.add(this.banks.points, this.grains.points);

    this.mpos = new Float32Array(8 * 6);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(this.mpos, 3));
    this.meteorLines = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.meteorLines.frustumCulled = false;
    scene.add(this.meteorLines);
    for (let i = 0; i < 8; i++) this.meteors.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, alive: false, hCut: -1.8 });

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.boltPos, 3));
    this.bolt = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.bolt.frustumCulled = false;
    this.bolt.renderOrder = 7;
    this.bolt.visible = false;
    scene.add(this.bolt);

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

  /** petir bercabang dari awan ke titik sasaran (koordinat dunia absolut) */
  strike(from: THREE.Vector3, to: THREE.Vector3) {
    const out: number[] = [];
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    const split = (a: THREE.Vector3, b: THREE.Vector3, disp: number, depth: number) => {
      if (depth === 0) { segs.push([a, b]); return; }
      const m = a.clone().add(b).multiplyScalar(0.5);
      m.x += (Math.random() - 0.5) * disp; m.y += (Math.random() - 0.5) * disp * 0.4; m.z += (Math.random() - 0.5) * disp;
      split(a, m, disp * 0.55, depth - 1); split(m, b, disp * 0.55, depth - 1);
      if (depth > 2 && Math.random() < 0.3) { // cabang
        const e = m.clone().add(new THREE.Vector3((Math.random() - 0.5) * disp * 3, -Math.random() * disp * 2, (Math.random() - 0.5) * disp * 3));
        split(m, e, disp * 0.5, depth - 2);
      }
    };
    split(from.clone(), to.clone(), from.distanceTo(to) * 0.22, 6);
    // beberapa salinan bergeser tipis agar petir tampak tebal (garis WebGL selalu 1 px)
    const offs: [number, number, number][] = [[0, 0, 0], [0.14, 0, 0], [0, 0, 0.14], [-0.12, 0.04, -0.12], [0.07, 0, -0.1]];
    for (const [ox, oy, oz] of offs) for (const [a, b] of segs.slice(0, 160)) out.push(a.x + ox, a.y + oy, a.z + oz, b.x + ox, b.y + oy, b.z + oz);
    this.boltAbs = out;
    this.boltT = 0.28;
  }

  // origin: titik pusat render (dunia), up: arah "atas" lokal, camPos: posisi kamera di dunia (absolut)
  update(dt: number, origin: THREE.Vector3, up: THREE.Vector3, type: HazardType | null, k: number, camPos: THREE.Vector3, density: number, cx: WeatherCtx = { light: 1, groundDist: 5, targets: [], gust: 1 }) {
    this.time += dt;
    if (type === 'ash') density = Math.max(density, 0.7); // pluma vulkanik balistik: terlihat meski tanpa udara
    const mat = this.mat;
    const info = type ? HAZARDS[type] : null;
    const show = info && k > 0.02 && density > 0.02 && (info.wind > 0 || info.fall > 0 || type === 'quake');
    // ----- kilat petir
    if (this.boltT > 0) {
      this.boltT -= dt;
      const bp = this.boltPos, ba = this.boltAbs;
      const nv = Math.min(Math.floor(ba.length / 3), 1600);
      for (let i = 0; i < nv; i++) { bp[i * 3] = ba[i * 3] - origin.x; bp[i * 3 + 1] = ba[i * 3 + 1] - origin.y; bp[i * 3 + 2] = ba[i * 3 + 2] - origin.z; }
      this.bolt.geometry.setDrawRange(0, nv);
      (this.bolt.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.bolt.visible = true;
      (this.bolt.material as THREE.LineBasicMaterial).opacity = Math.max(0, this.boltT / 0.28) * (0.6 + 0.4 * Math.random());
    } else this.bolt.visible = false;

    if (!show || !info || !type) {
      mat.opacity = 0;
      this.lines.visible = false;
      this.banks.points.visible = false;
      this.grains.points.visible = false;
    } else {
      this.lines.visible = true;
      // arah angin horizontal (tetap per jenis) pada bidang tangen
      const e1 = this.e1.copy(this.dir.set(0.8, 0.1, 0.6).cross(up)).normalize();
      const e2 = this.e2.copy(up).cross(e1).normalize();
      const wsp = info.wind * k * cx.gust;
      const wind = e1.clone().multiplyScalar(wsp);
      const vel = wind.addScaledVector(up, -info.fall * k - (type === 'quake' ? 1.5 : 0) - (type === 'dust' ? 0.3 : 0));
      if (type === 'ash') vel.addScaledVector(up, -3 * k);
      this.off.addScaledVector(vel, dt);
      const S = this.size, H = S / 2;
      const len = type === 'dust' ? 5.5 : type === 'ash' ? 0.5 : type === 'quake' ? 0.3 : 1.7;
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
      const lc = 0.25 + 0.75 * cx.light;
      mat.color.setRGB(info.color[0] * lc, info.color[1] * lc, info.color[2] * lc);
      mat.opacity = Math.min(0.9, (type === 'dust' ? 0.4 : type === 'ash' ? 0.8 : 0.5) * (0.35 + 0.65 * k) * Math.min(1, density * 1.5 + 0.3));

      // ----- gumpalan debu/abu & butiran pasir (badai debu/abu)
      const sandy = type === 'dust' || type === 'ash';
      const rainy = type === 'storm' || type === 'acid' || type === 'methane';
      this.banks.points.visible = sandy;
      this.grains.points.visible = (type === 'dust' && cx.groundDist < 60) || (rainy && cx.groundDist < 40);
      if (rainy && this.grains.points.visible) {
        // percikan hujan di tanah: titik-titik kecil yang berdenyut di sekitar pemain
        const S3 = 38, H3 = S3 / 2;
        const gb = this.gbase, gp = this.grains.pos, gcc = this.grains.col, gs = this.grains.size;
        const gd = Math.max(0, cx.groundDist);
        const col = type === 'storm' ? [0.8, 0.88, 1] : type === 'acid' ? [0.8, 1, 0.4] : [1, 0.7, 0.35];
        const pe1 = camPos.x * e1.x + camPos.y * e1.y + camPos.z * e1.z, pe2 = camPos.x * e2.x + camPos.y * e2.y + camPos.z * e2.z;
        const cx0 = camPos.x - origin.x, cy0 = camPos.y - origin.y, cz0 = camPos.z - origin.z;
        const lt = 0.3 + 0.7 * cx.light;
        const nG = Math.floor(this.nG * (0.3 + 0.7 * k));
        for (let i = 0; i < this.nG; i++) {
          if (i >= nG) { gcc[i * 4 + 3] = 0; continue; }
          const a = mod(gb[i * 4] - pe1, S3) - H3, c = mod(gb[i * 4 + 1] - pe2, S3) - H3;
          const ph = Math.sin(this.time * (7 + gb[i * 4 + 2] * 6) + gb[i * 4 + 3]);
          const pulse = Math.max(0, ph) ** 3;
          const h = -gd + 0.04 + pulse * 0.15;
          gp[i * 3] = e1.x * a + e2.x * c + up.x * h + cx0; gp[i * 3 + 1] = e1.y * a + e2.y * c + up.y * h + cy0; gp[i * 3 + 2] = e1.z * a + e2.z * c + up.z * h + cz0;
          gs[i] = 0.18 + pulse * 0.5;
          gcc[i * 4] = col[0] * lt; gcc[i * 4 + 1] = col[1] * lt; gcc[i * 4 + 2] = col[2] * lt; gcc[i * 4 + 3] = 0.6 * k * pulse;
        }
        this.grains.commit();
      }
      if (sandy) {
        const S2 = 240, H2 = S2 / 2;
        const gd = Math.max(0, cx.groundDist);
        const tint = type === 'dust' ? [0.78, 0.5, 0.31] : [0.33, 0.3, 0.29];
        const lt = 0.25 + 0.75 * cx.light;
        const a0 = (type === 'dust' ? 0.3 : 0.4) * k;
        const bb = this.bbase, bp2 = this.banks.pos, bc = this.banks.col;
        const pe1 = camPos.x * e1.x + camPos.y * e1.y + camPos.z * e1.z, pe2 = camPos.x * e2.x + camPos.y * e2.y + camPos.z * e2.z;
        const cx0 = camPos.x - origin.x, cy0 = camPos.y - origin.y, cz0 = camPos.z - origin.z;
        for (let i = 0; i < this.nB; i++) {
          const a = mod(bb[i * 4] - pe1 + this.time * wsp * (0.6 + 0.3 * bb[i * 4 + 3]), S2) - H2;
          const c = mod(bb[i * 4 + 1] - pe2, S2) - H2;
          const h = -gd + 0.5 + bb[i * 4 + 2] * 70 + Math.sin(this.time * 0.4 + bb[i * 4 + 3] * 6.28) * 4;
          bp2[i * 3] = e1.x * a + e2.x * c + up.x * h + cx0;
          bp2[i * 3 + 1] = e1.y * a + e2.y * c + up.y * h + cy0;
          bp2[i * 3 + 2] = e1.z * a + e2.z * c + up.z * h + cz0;
          const f = 0.55 + 0.45 * bb[i * 4 + 3];
          bc[i * 4] = tint[0] * lt * f; bc[i * 4 + 1] = tint[1] * lt * f; bc[i * 4 + 2] = tint[2] * lt * f;
          bc[i * 4 + 3] = a0 * (0.5 + 0.5 * bb[i * 4 + 2]);
        }
        this.banks.commit();
        if (this.grains.points.visible) {
          const S3 = 46, H3 = S3 / 2;
          const gb = this.gbase, gp = this.grains.pos, gcc = this.grains.col;
          const nG = Math.floor(this.nG * (0.25 + 0.75 * k));
          for (let i = 0; i < this.nG; i++) {
            if (i >= nG) { gcc[i * 4 + 3] = 0; continue; }
            const sp = wsp * (0.45 + 0.35 * gb[i * 4 + 2]);
            const a = mod(gb[i * 4] - pe1 + this.time * sp, S3) - H3;
            const c = mod(gb[i * 4 + 1] - pe2, S3) - H3;
            const hop = Math.abs(Math.sin(this.time * (4 + gb[i * 4 + 2] * 4) + gb[i * 4 + 3])) * (0.25 + gb[i * 4 + 2] * 1.7) * (0.5 + k);
            const h = -gd + 0.05 + hop;
            gp[i * 3] = e1.x * a + e2.x * c + up.x * h + cx0;
            gp[i * 3 + 1] = e1.y * a + e2.y * c + up.y * h + cy0;
            gp[i * 3 + 2] = e1.z * a + e2.z * c + up.z * h + cz0;
            gcc[i * 4] = 0.93 * lt; gcc[i * 4 + 1] = 0.72 * lt; gcc[i * 4 + 2] = 0.5 * lt;
            gcc[i * 4 + 3] = 0.8 * k;
            this.grains.size[i] = 0.07 + ((i * 7919) % 100) / 100 * 0.1;
          }
          this.grains.commit();
        }
      }
    }

    // meteor
    const mp = this.mpos;
    if (type === 'meteor' && k > 0.05) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.35 + Math.random() * 1.1 / Math.max(0.3, k);
        const m = this.meteors.find((q) => !q.alive);
        if (m) {
          const t1 = new THREE.Vector3().copy(up).cross(new THREE.Vector3(0.3, 0.9, 0.2)).normalize();
          const t2 = new THREE.Vector3().copy(up).cross(t1).normalize();
          const tgt = cx.targets.length && Math.random() < 0.3 ? cx.targets[Math.floor(Math.random() * cx.targets.length)] : null;
          m.v.copy(up).multiplyScalar(-330).addScaledVector(t1, (Math.random() - 0.5) * 120).addScaledVector(t2, (Math.random() - 0.5) * 120);
          if (tgt) {
            // diarahkan ke sasaran dengan sebaran beberapa meter
            const hT = tgt.clone().sub(camPos).dot(up);
            const T = (900 + hT) / 330;
            const aim = tgt.clone().addScaledVector(t1, (Math.random() - 0.5) * 22).addScaledVector(t2, (Math.random() - 0.5) * 22);
            m.p.copy(aim).addScaledVector(m.v, -T);
            m.hCut = hT + 0.4;
          } else {
            const ang = Math.random() * Math.PI * 2, rr = 40 + Math.pow(Math.random(), 1.6) * 700;
            const ho = t1.clone().multiplyScalar(Math.cos(ang) * rr).addScaledVector(t2, Math.sin(ang) * rr);
            m.p.copy(camPos).add(ho).addScaledVector(up, 900 + Math.random() * 300);
            m.hCut = -1.8;
          }
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
      if (h < m.hCut) {
        m.alive = false;
        const rel = m.p.clone().sub(camPos);
        const dist = rel.addScaledVector(up, -rel.dot(up)).length();
        this.flash.position.copy(m.p).sub(origin).addScaledVector(up, 2);
        this.flash.scale.setScalar(25 + 40 * Math.random());
        this.flashT = 0.5;
        if (this.onImpact) this.onImpact(dist, m.p.clone(), up.clone());
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
