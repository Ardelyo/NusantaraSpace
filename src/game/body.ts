// Benda langit: terrain quadtree (LOD progresif), atmosfer, awan, raksasa gas, cincin, matahari
import * as THREE from 'three';
import { Noise3, craters, clamp, smooth, lerp } from './noise';
import type { BodyDef, RGB } from './bodies';
import { ATMOSPHERES, generatedAtmosphere, muOf, orbitalOmega, soiRadius, type AtmosphereData } from './physics';

const N = 20; // kuad per patch
const KTAB = [6, 5, 3.6, 2.6, 2.0, 1.6]; // jarak pemisahan (dalam ukuran patch) per level
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const lin = (c: RGB) => new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear();

// ---------- GLSL ----------
const NOISE_GLSL = `
float h13(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

const LOG_V_PARS = `#include <common>\n#include <logdepthbuf_pars_vertex>`;
const LOG_F_PARS = `#include <common>\n#include <logdepthbuf_pars_fragment>`;
const TONE_END = `#include <tonemapping_fragment>\n#include <colorspace_fragment>`;

// ---------- Node quadtree ----------
interface QNode {
  key: string;
  face: number;
  level: number;
  ix: number;
  iy: number;
  cdir: THREE.Vector3;
  size: number;
  angR: number;
  mesh: THREE.Mesh | null;
  lastUsed: number;
  children: QNode[] | null;
  queued: boolean;
}

interface Samp {
  raw: number; h: number; water: boolean; depth: number; e: number; m: number; tn: number; x: number; c: number; lat: number;
}

const CR_F = [3, 9, 28, 90, 280, 900, 2800];

const col = [0, 0, 0];
function mixc(o: number[], a: number[], b: number[], t: number) {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
}
const G = (v: number) => [v, v, v];

// palet biome
const C = {
  DEEP: [0.01, 0.06, 0.24], SHALLOW: [0.04, 0.42, 0.52], SAND: [0.82, 0.76, 0.52], DESERT: [0.8, 0.64, 0.38], SAV: [0.62, 0.57, 0.24],
  JUNGLE: [0.04, 0.27, 0.07], STEPPE: [0.55, 0.52, 0.3], GRASS: [0.27, 0.48, 0.13], FOREST: [0.06, 0.25, 0.09], TUNDRA: [0.5, 0.5, 0.43],
  TAIGA: [0.09, 0.24, 0.16], ROCK: [0.4, 0.37, 0.35], SNOW: [0.95, 0.97, 1.0],
};

export class Body {
  def: BodyDef;
  id: string;
  R: number;
  pos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  quat = new THREE.Quaternion();
  prevQuat = new THREE.Quaternion();
  root = new THREE.Group();
  spinG = new THREE.Group();
  noise: Noise3;
  nodes = new Map<string, QNode>();
  roots: QNode[] = [];
  terrainMat: THREE.MeshStandardMaterial | null = null;
  fogD = { value: 0 };
  fogC = { value: new THREE.Color(0.6, 0.7, 0.9) };
  pending: QNode[] = [];
  meshCount = 0;
  maxLevel = 8;
  isTerrain = false;
  isGas = false;
  isSun = false;
  atmMesh: THREE.Mesh | null = null;
  atmU: any = null;
  atmRa = 0;
  cloudMesh: THREE.Mesh | null = null;
  cloudU: any = null;
  gasMesh: THREE.Mesh | null = null;
  gasU: any = null;
  sunSprites: THREE.Sprite[] = [];
  ringMesh: THREE.Mesh | null = null;
  tmpS: Samp = { raw: 0, h: 0, water: false, depth: 0, e: 0, m: 0, tn: 0, x: 0, c: 0, lat: 0 };
  seaAbs = 0;
  hasSea = false;
  noiseOff = 0;
  discovered = false;
  visited = false;
  landedOn = false;
  flagged = false;
  group = new THREE.Group();
  private tq = new THREE.Quaternion();
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tv3 = new THREE.Vector3();
  frameNo = 0;
  atmThickness = 0;
  // --- fisika (lihat physics.ts)
  mu = 0; // parameter gravitasi g·R²
  soi = Infinity; // jari-jari bola pengaruh
  vel = new THREE.Vector3(); // kecepatan inersia (analitik)
  omegaVec = new THREE.Vector3(); // vektor kecepatan sudut spin (dunia)
  parentBody: Body | null = null;
  private lockedSet = false;
  phys: AtmosphereData | null = null; // atmosfer fisik (ρ₀, H, T)

  constructor(def: BodyDef, scene: THREE.Scene) {
    this.def = def;
    this.id = def.id;
    this.R = def.radius;
    this.noise = new Noise3(def.seed);
    this.noiseOff = (def.seed % 97) * 3.17;
    this.mu = muOf(def.g, def.radius);
    this.omegaVec.set(-Math.sin(def.tilt), Math.cos(def.tilt), 0).multiplyScalar(def.spin);
    this.phys = ATMOSPHERES[def.id] ?? (def.atm && def.fixedPos ? generatedAtmosphere(def.seed) : null);
    if (def.fixedPos) this.soi = def.radius * 25;
    this.root.add(this.spinG);
    scene.add(this.root);
    if (def.style === 'sun') this.buildSun();
    else if (def.style === 'gas') this.buildGas();
    else this.buildTerrain();
    if (def.atm) this.buildAtmosphere();
    if (def.clouds) this.buildClouds();
    if (def.rings) this.buildRings();
  }

  // ------------------------------------------------ orbit
  orbit(t: number, byId: Map<string, Body>) {
    this.prevPos.copy(this.pos);
    const d = this.def;
    if (d.fixedPos) { this.pos.set(d.fixedPos[0], d.fixedPos[1], d.fixedPos[2]); this.vel.set(0, 0, 0); }
    else if (!d.parent) { this.pos.set(0, 0, 0); this.vel.set(0, 0, 0); }
    else {
      const p = this.parentBody ?? (this.parentBody = byId.get(d.parent)!);
      // Kepler: ω = √(μ_induk / a³), orbit lingkaran berinklinasi
      const w = orbitalOmega(p.mu, d.dist);
      if (this.soi === Infinity) this.soi = Math.max(soiRadius(d.dist, this.mu, p.mu), this.R * 3);
      if (d.locked && !this.lockedSet) { this.lockedSet = true; d.spin = w; this.omegaVec.set(-Math.sin(d.tilt), Math.cos(d.tilt), 0).multiplyScalar(w); }
      const a = d.phase + w * t;
      const ca = Math.cos(a), sa = Math.sin(a), si = Math.sin(d.incl), ci = Math.cos(d.incl);
      this.pos.set(p.pos.x + ca * d.dist, p.pos.y + sa * si * d.dist, p.pos.z + sa * d.dist * ci);
      const sp = w * d.dist;
      this.vel.set(p.vel.x - sa * sp, p.vel.y + ca * si * sp, p.vel.z + ca * ci * sp);
    }
    this.prevQuat.copy(this.quat);
    this.tq.setFromAxisAngle(this.tv.set(0, 1, 0), d.spin * t + d.phase);
    this.quat.setFromAxisAngle(this.tv.set(0, 0, 1), d.tilt).multiply(this.tq);
  }

  syncRender(origin: THREE.Vector3) {
    this.root.position.set(this.pos.x - origin.x, this.pos.y - origin.y, this.pos.z - origin.z);
    this.spinG.quaternion.copy(this.quat);
  }

  /** kecepatan titik yang menempel pada permukaan (relatif pusat benda): Ω × r */
  surfaceVel(rel: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(this.omegaVec).cross(rel);
  }

  // dari vektor relatif-dunia (sumbu dunia) ke lokal-spin
  toLocal(v: THREE.Vector3, out: THREE.Vector3) {
    this.tq.copy(this.quat).invert();
    return out.copy(v).applyQuaternion(this.tq);
  }

  // ------------------------------------------------ tinggi medan
  sample(dx: number, dy: number, dz: number, maxOct: number, minCell: number, o: Samp) {
    const T = this.def.t!;
    const Nz = this.noise;
    const f = T.freq;
    const off = this.noiseOff;
    const px = dx * f + off, py = dy * f, pz = dz * f;
    const c = Nz.fbm(px * 0.5, py * 0.5, pz * 0.5, 4);
    let raw = T.cont * 0.8 * c;
    let m = 0;
    if (T.ridge > 0) {
      let r = Nz.ridged(px * 1.7 + 11.3, py * 1.7, pz * 1.7, 5);
      r = r * r;
      raw += T.ridge * r * smooth(-0.15, 0.4, c) * 0.9;
      m = r;
    }
    let det = 0, a = 1, fr = f * 5;
    for (let i = 0; i < maxOct; i++) {
      det += a * Nz.noise(dx * fr + off, dy * fr, dz * fr);
      a *= 0.5;
      fr *= 2.02;
    }
    raw += det * 0.16 * T.rough;
    raw *= T.amp;
    if (T.crater > 0) {
      for (let ci = 0; ci < CR_F.length; ci++) {
        const F = CR_F[ci];
        const cell = this.R / F;
        if (cell < minCell) break;
        raw += craters(dx * F + off, dy * F, dz * F, this.def.seed + ci * 17, 0.5) * cell * 0.1 * T.crater;
      }
    }
    o.x = 0;
    if (T.cracks) {
      const l1 = 1 - Math.abs(Nz.noise(px * 3.1 + 5, py * 3.1, pz * 3.1));
      const l2 = 1 - Math.abs(Nz.noise(px * 6.3, py * 6.3 + 9, pz * 6.3));
      o.x = Math.pow(Math.max(l1, l2 * 0.92), 16);
      raw -= o.x * T.amp * 0.12;
    }
    const st = this.def.style;
    o.m = st === 'earth' || st === 'alien' || st === 'titan' ? clamp(Nz.fbm(px * 1.3 + 40, py * 1.3, pz * 1.3, 3) * 0.75 + 0.5) : 0;
    o.tn = Nz.fbm(px * 2.2 + 7.7, py * 2.2, pz * 2.2, 2);
    o.c = c;
    o.lat = Math.abs(dy);
    o.raw = raw;
    if (T.sea !== null) {
      const sea = T.sea * T.amp;
      this.seaAbs = sea;
      if (raw < sea) {
        o.water = true;
        o.depth = (sea - raw) / T.amp;
        o.h = 0;
        o.e = 0;
      } else {
        o.water = false;
        o.depth = 0;
        o.h = raw - sea;
        o.e = o.h / T.amp;
      }
    } else {
      o.water = false;
      o.depth = 0;
      o.h = raw;
      o.e = raw / T.amp;
    }
    void m;
    return o;
  }

  // jari-jari permukaan pada arah lokal (m)
  surfaceRadius(dir: THREE.Vector3) {
    if (!this.isTerrain) return this.R;
    const s = this.sample(dir.x, dir.y, dir.z, 14, 0, this.tmpS);
    return this.R + s.h;
  }

  // ------------------------------------------------ warna biome
  colorize(o: Samp, slope: number, out: number[]) {
    const d = this.def;
    const st = d.style;
    const e = o.e, lat = o.lat, tn = o.tn;
    const c = col;
    switch (st) {
      case 'earth': {
        if (o.water) {
          mixc(c, C.SHALLOW, C.DEEP, smooth(0.0, 0.3, o.depth));
          if (lat > 0.87 + tn * 0.05) mixc(c, c, C.SNOW, smooth(0.87, 0.92, lat));
          break;
        }
        const temp = 1 - lat * 1.18 - Math.max(e, 0) * 0.55 + tn * 0.18;
        const mo = o.m;
        const hot = [0, 0, 0], tmp = [0, 0, 0], cold = [0, 0, 0];
        if (mo < 0.5) { mixc(hot, C.DESERT, C.SAV, mo * 2); mixc(tmp, C.STEPPE, C.GRASS, mo * 2); }
        else { mixc(hot, C.SAV, C.JUNGLE, (mo - 0.5) * 2); mixc(tmp, C.GRASS, C.FOREST, (mo - 0.5) * 2); }
        mixc(cold, C.TUNDRA, C.TAIGA, mo);
        mixc(c, cold, tmp, smooth(0.2, 0.5, temp));
        mixc(c, c, hot, smooth(0.62, 0.9, temp));
        if (e < 0.014) mixc(c, c, C.SAND, 1 - e / 0.014);
        const rk = clamp(smooth(0.07, 0.22, slope) + smooth(0.5, 0.85, e) * 0.6);
        mixc(c, c, C.ROCK, rk);
        const snowLine = 0.6 + temp * 0.45;
        let sn = smooth(snowLine, snowLine + 0.1, e);
        if (temp < 0.14) sn = Math.max(sn, smooth(0.14, 0.04, temp));
        mixc(c, c, C.SNOW, sn * (1 - rk * 0.45));
        break;
      }
      case 'alien': {
        const P = d.palette!;
        if (o.water) {
          mixc(c, P.seaColor2, P.liquid, smooth(0.0, 0.3, o.depth));
          break;
        }
        const mo = o.m;
        mixc(c, P.low, P.mid, clamp(mo * 0.8 + e * 0.9));
        if (e < 0.02) mixc(c, c, P.shore, 1 - e / 0.02);
        mixc(c, c, P.high, smooth(0.35, 0.8, e) * 0.9);
        mixc(c, c, P.high, smooth(0.08, 0.25, slope) * 0.5);
        const capL = 0.86 + tn * 0.05 - Math.max(e, 0) * 0.2;
        mixc(c, c, P.cap, smooth(capL, capL + 0.05, lat));
        break;
      }
      case 'mars': {
        const dust = [0.74, 0.46, 0.26], rust = [0.58, 0.27, 0.14], dark = [0.24, 0.14, 0.11];
        mixc(c, rust, dust, smooth(-0.4, 0.5, tn));
        mixc(c, c, dark, smooth(0.15, 0.55, -o.c) * 0.7 + smooth(0.1, 0.3, slope) * 0.35);
        mixc(c, c, [0.85, 0.65, 0.5], smooth(0.5, 0.95, e) * 0.5);
        mixc(c, c, C.SNOW, smooth(0.9 - tn * 0.03, 0.95, lat));
        break;
      }
      case 'moon': {
        const g = 0.5 + tn * 0.18;
        mixc(c, G(g), G(0.17 + tn * 0.05), smooth(0.05, -0.35, o.c));
        mixc(c, c, G(0.7), smooth(0.04, 0.2, slope) * 0.5);
        break;
      }
      case 'mercury': {
        mixc(c, [0.44, 0.4, 0.36], [0.28, 0.26, 0.25], smooth(-0.3, 0.4, tn));
        mixc(c, c, [0.7, 0.66, 0.6], smooth(0.05, 0.22, slope) * 0.5);
        break;
      }
      case 'venus': {
        mixc(c, [0.72, 0.46, 0.2], [0.36, 0.13, 0.08], smooth(0.1, 0.6, -o.c));
        mixc(c, c, [0.9, 0.7, 0.35], smooth(0.4, 0.9, e) * 0.8);
        mixc(c, c, [0.2, 0.08, 0.06], smooth(0.1, 0.3, slope) * 0.5);
        break;
      }
      case 'io': {
        mixc(c, [0.88, 0.78, 0.24], [0.86, 0.42, 0.1], smooth(-0.3, 0.5, tn));
        mixc(c, c, [0.92, 0.9, 0.8], smooth(0.3, 0.7, -o.c) * 0.7);
        mixc(c, c, [0.06, 0.04, 0.03], smooth(0.35, 0.6, o.m + tn * 0.5 + Math.max(0, -e) * 0.5 + smooth(0.0, 0.2, slope) * 0.5));
        break;
      }
      case 'europa': {
        mixc(c, [0.92, 0.9, 0.84], [0.82, 0.8, 0.76], smooth(-0.3, 0.4, tn));
        mixc(c, c, [0.55, 0.3, 0.18], clamp(o.x * 1.1 + smooth(0.1, 0.5, tn) * 0.15));
        break;
      }
      case 'ganymede': {
        mixc(c, [0.42, 0.37, 0.32], [0.7, 0.68, 0.64], smooth(-0.2, 0.5, tn));
        mixc(c, c, [0.82, 0.8, 0.76], o.x * 0.6);
        mixc(c, c, G(0.22), smooth(0.04, 0.2, slope) * 0.3);
        break;
      }
      case 'callisto': {
        mixc(c, [0.26, 0.22, 0.19], [0.36, 0.31, 0.27], smooth(-0.3, 0.4, tn));
        mixc(c, c, [0.85, 0.85, 0.85], smooth(0.07, 0.22, slope) * 0.6);
        break;
      }
      case 'titan': {
        if (o.water) { mixc(c, [0.05, 0.04, 0.03], [0.1, 0.07, 0.04], smooth(0.0, 0.3, o.depth)); break; }
        mixc(c, [0.62, 0.42, 0.16], [0.36, 0.22, 0.1], smooth(-0.3, 0.5, tn));
        mixc(c, c, [0.12, 0.08, 0.05], smooth(0.15, 0.5, o.m) * (1 - smooth(0.05, 0.4, e)) * 0.9);
        if (e < 0.02) mixc(c, c, [0.2, 0.14, 0.08], 1 - e / 0.02);
        mixc(c, c, [0.8, 0.62, 0.35], smooth(0.5, 0.9, e) * 0.5);
        break;
      }
      case 'enceladus': {
        mixc(c, [0.95, 0.97, 1.0], [0.85, 0.9, 0.96], smooth(-0.3, 0.5, tn));
        mixc(c, c, [0.45, 0.72, 0.95], o.x * 0.9);
        break;
      }
      case 'triton': {
        mixc(c, [0.88, 0.78, 0.74], [0.72, 0.62, 0.62], smooth(-0.3, 0.5, tn));
        mixc(c, c, [0.22, 0.17, 0.18], smooth(0.2, 0.45, tn * 1.2 - lat * 0.3) * 0.7);
        mixc(c, c, [0.95, 0.88, 0.9], smooth(0.8, 0.95, lat));
        break;
      }
      case 'pluto': {
        mixc(c, [0.55, 0.4, 0.3], [0.36, 0.2, 0.15], smooth(-0.2, 0.5, tn) * (1 - lat) + 0.0);
        mixc(c, c, [0.95, 0.9, 0.84], smooth(0.1, 0.22, o.c) * (1 - smooth(0.12, 0.4, slope)));
        mixc(c, c, [0.8, 0.78, 0.76], smooth(0.5, 0.9, e) * 0.5);
        break;
      }
      case 'ceres': {
        mixc(c, G(0.3), G(0.4), smooth(-0.3, 0.5, tn));
        mixc(c, c, G(0.95), smooth(0.55, 0.62, o.m + tn * 0.0 + (tn > 0.45 ? 0.3 : 0)) * 0.7);
        mixc(c, c, G(0.55), smooth(0.07, 0.22, slope) * 0.5);
        break;
      }
      default: {
        mixc(c, [0.34, 0.31, 0.29], [0.24, 0.22, 0.21], smooth(-0.3, 0.5, tn));
        mixc(c, c, [0.5, 0.46, 0.42], smooth(0.06, 0.22, slope) * 0.5);
      }
    }
    out[0] = Math.pow(c[0], 2.2);
    out[1] = Math.pow(c[1], 2.2);
    out[2] = Math.pow(c[2], 2.2);
  }

  // ------------------------------------------------ terrain
  buildTerrain() {
    const d = this.def;
    this.isTerrain = true;
    this.hasSea = d.t!.sea !== null;
    const S0 = (this.R * Math.PI) / 2;
    this.maxLevel = clamp(Math.ceil(Math.log2(S0 / 48)), 4, 13);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
    const fogD = this.fogD, fogC = this.fogC;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFogD = fogD;
      sh.uniforms.uFogC = fogC;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aLocal; attribute float aWater; varying vec3 vLocal; varying float vWater;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = aLocal; vWater = aWater;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vLocal; varying float vWater; uniform float uFogD; uniform vec3 uFogC;\n${NOISE_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          { float vd = length(vViewPosition);
            float fade = 1.0 - smoothstep(80.0, 900.0, vd);
            float n = vn(vLocal*0.6)*0.5 + vn(vLocal*2.7)*0.3 + vn(vLocal*11.0)*0.2;
            float fade2 = (1.0 - smoothstep(4000.0, 40000.0, vd)) * smoothstep(60.0, 400.0, vd);
            float n0 = vn(vLocal*0.0011)*0.6 + vn(vLocal*0.006)*0.4;
            float k = mix(1.0, 0.62 + 0.76*n, fade*(1.0-vWater));
            k *= mix(1.0, 0.8 + 0.4*n0, fade2*(1.0-vWater));
            diffuseColor.rgb *= k; }`
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.07, vWater);')
        .replace(
          '#include <fog_fragment>',
          `{ float fdd = length(vViewPosition); float ff = 1.0 - exp(-uFogD*uFogD*fdd*fdd); gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogC, clamp(ff, 0.0, 1.0)); }`
        );
    };
    mat.customProgramCacheKey = () => 'terrain-v1';
    this.terrainMat = mat;
    this.spinG.add(this.group);
    for (let f = 0; f < 6; f++) {
      const n = this.getNode(f, 0, 0, 0);
      this.roots.push(n);
      this.buildPatch(n);
    }
  }

  getNode(face: number, level: number, ix: number, iy: number): QNode {
    const key = `${face}/${level}/${ix}/${iy}`;
    let n = this.nodes.get(key);
    if (n) return n;
    const cnt = 1 << level;
    const F = FACES[face];
    const a = -1 + (2 * (ix + 0.5)) / cnt, b = -1 + (2 * (iy + 0.5)) / cnt;
    const ta = Math.tan((a * Math.PI) / 4), tb = Math.tan((b * Math.PI) / 4);
    const cdir = new THREE.Vector3(
      F.n[0] + ta * F.u[0] + tb * F.v[0],
      F.n[1] + ta * F.u[1] + tb * F.v[1],
      F.n[2] + ta * F.u[2] + tb * F.v[2]
    ).normalize();
    const size = ((this.R * Math.PI) / 2) / cnt;
    n = { key, face, level, ix, iy, cdir, size, angR: (size * 0.78) / this.R, mesh: null, lastUsed: 0, children: null, queued: false };
    this.nodes.set(key, n);
    return n;
  }

  childrenOf(n: QNode) {
    if (!n.children) {
      const l = n.level + 1, x = n.ix * 2, y = n.iy * 2;
      n.children = [this.getNode(n.face, l, x, y), this.getNode(n.face, l, x + 1, y), this.getNode(n.face, l, x, y + 1), this.getNode(n.face, l, x + 1, y + 1)];
    }
    return n.children;
  }

  buildPatch(node: QNode) {
    const R = this.R, T = this.def.t!;
    const F = FACES[node.face];
    const cnt = 1 << node.level;
    const a0 = -1 + (2 * node.ix) / cnt, a1 = -1 + (2 * (node.ix + 1)) / cnt;
    const b0 = -1 + (2 * node.iy) / cnt, b1 = -1 + (2 * (node.iy + 1)) / cnt;
    const SS = N + 3;
    const quad = node.size / N;
    const maxOct = clamp(Math.floor(Math.log2(R / (T.freq * 5 * 1.5 * quad))) + 1, 0, 14);
    const minCell = quad * 4;
    const dirs = new Float64Array(SS * SS * 3);
    const P = new Float64Array(SS * SS * 3);
    const samples: Samp[] = new Array(SS * SS);
    for (let j = 0; j < SS; j++) {
      for (let i = 0; i < SS; i++) {
        const a = a0 + ((a1 - a0) * (i - 1)) / N, b = b0 + ((b1 - b0) * (j - 1)) / N;
        const ta = Math.tan((a * Math.PI) / 4), tb = Math.tan((b * Math.PI) / 4);
        let x = F.n[0] + ta * F.u[0] + tb * F.v[0], y = F.n[1] + ta * F.u[1] + tb * F.v[1], z = F.n[2] + ta * F.u[2] + tb * F.v[2];
        const l = Math.sqrt(x * x + y * y + z * z);
        x /= l; y /= l; z /= l;
        const s = { raw: 0, h: 0, water: false, depth: 0, e: 0, m: 0, tn: 0, x: 0, c: 0, lat: 0 };
        this.sample(x, y, z, maxOct, minCell, s);
        const k = (j * SS + i) * 3;
        dirs[k] = x; dirs[k + 1] = y; dirs[k + 2] = z;
        const rr = R + s.h;
        P[k] = x * rr; P[k + 1] = y * rr; P[k + 2] = z * rr;
        samples[j * SS + i] = s;
      }
    }
    const cx = node.cdir.x * R, cy = node.cdir.y * R, cz = node.cdir.z * R;
    const NV = (N + 1) * (N + 1);
    const total = NV + 4 * (N + 1);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), colr = new Float32Array(total * 3);
    const loc = new Float32Array(total * 3), wat = new Float32Array(total);
    const sd = node.size * 0.09 + 3;
    const rgb = [0, 0, 0];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const gi = (j + 1) * SS + (i + 1);
        const k = gi * 3;
        const vi = j * (N + 1) + i;
        const tx = P[k + 3] - P[k - 3], ty = P[k + 4] - P[k - 2 + 0] + 0, tz = P[k + 5] - P[k - 1];
        void ty;
        const ux = P[k + 3] - P[k - 3], uy = P[k + 4] - P[k - 2], uz = P[k + 5] - P[k - 1];
        const k2 = k + SS * 3, k1 = k - SS * 3;
        const vx = P[k2] - P[k1], vy = P[k2 + 1] - P[k1 + 1], vz = P[k2 + 2] - P[k1 + 2];
        void tx; void tz;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const dx = dirs[k], dy = dirs[k + 1], dz = dirs[k + 2];
        if (nl < 1e-9) { nx = dx; ny = dy; nz = dz; nl = 1; }
        nx /= nl; ny /= nl; nz /= nl;
        if (nx * dx + ny * dy + nz * dz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const slope = 1 - (nx * dx + ny * dy + nz * dz);
        const s = samples[gi];
        this.colorize(s, slope, rgb);
        const o = vi * 3;
        pos[o] = P[k] - cx; pos[o + 1] = P[k + 1] - cy; pos[o + 2] = P[k + 2] - cz;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        colr[o] = rgb[0]; colr[o + 1] = rgb[1]; colr[o + 2] = rgb[2];
        loc[o] = P[k]; loc[o + 1] = P[k + 1]; loc[o + 2] = P[k + 2];
        wat[vi] = s.water ? 1 : 0;
      }
    }
    // skirt
    const edges: number[][] = [[], [], [], []];
    for (let i = 0; i <= N; i++) { edges[0].push(i); edges[1].push(N * (N + 1) + i); }
    for (let j = 0; j <= N; j++) { edges[2].push(j * (N + 1)); edges[3].push(j * (N + 1) + N); }
    let sv = NV;
    const idxList: number[] = [];
    for (let e = 0; e < 4; e++) {
      const start = sv;
      for (let m = 0; m < edges[e].length; m++) {
        const b = edges[e][m];
        const o = b * 3, so = sv * 3;
        const dl = Math.sqrt(loc[o] * loc[o] + loc[o + 1] * loc[o + 1] + loc[o + 2] * loc[o + 2]);
        const rx = loc[o] / dl, ry = loc[o + 1] / dl, rz = loc[o + 2] / dl;
        pos[so] = pos[o] - rx * sd; pos[so + 1] = pos[o + 1] - ry * sd; pos[so + 2] = pos[o + 2] - rz * sd;
        nor[so] = nor[o]; nor[so + 1] = nor[o + 1]; nor[so + 2] = nor[o + 2];
        colr[so] = colr[o]; colr[so + 1] = colr[o + 1]; colr[so + 2] = colr[o + 2];
        loc[so] = loc[o] - rx * sd; loc[so + 1] = loc[o + 1] - ry * sd; loc[so + 2] = loc[o + 2] - rz * sd;
        wat[sv] = wat[b];
        sv++;
      }
      for (let m = 0; m < edges[e].length - 1; m++) {
        const e0 = edges[e][m], e1 = edges[e][m + 1], s0 = start + m, s1 = start + m + 1;
        idxList.push(e0, e1, s0, e1, s1, s0);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, dd = c + 1;
        idx.push(a, b, c, b, dd, c);
      }
    }
    for (const v of idxList) idx.push(v);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setAttribute('aLocal', new THREE.BufferAttribute(loc, 3));
    geo.setAttribute('aWater', new THREE.BufferAttribute(wat, 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), node.size * 0.95 + T.amp * 1.6 + sd + 10);
    const mesh = new THREE.Mesh(geo, this.terrainMat!);
    mesh.position.set(cx, cy, cz);
    mesh.visible = false;
    mesh.matrixAutoUpdate = true;
    this.group.add(mesh);
    node.mesh = mesh;
    node.queued = false;
    this.meshCount++;
  }

  // ------------------------------------------------ LOD
  private visSet = new Set<QNode>();
  private prevVis: QNode[] = [];
  private camL = new THREE.Vector3();
  private fwdL = new THREE.Vector3();
  private camDir = new THREE.Vector3();
  private camD = 0;
  private vh = 0;

  updateLOD(camLocal: THREE.Vector3, fwdLocal: THREE.Vector3, frame: number) {
    if (!this.isTerrain) return;
    this.frameNo = frame;
    this.camL.copy(camLocal);
    this.fwdL.copy(fwdLocal);
    this.camD = camLocal.length();
    this.camDir.copy(camLocal).normalize();
    this.vh = (this.def.t!.amp * 1.5) / this.R;
    this.visSet.clear();
    this.pending.length = 0;
    for (const r of this.roots) this.visit(r);
    for (const n of this.prevVis) if (!this.visSet.has(n) && n.mesh) n.mesh.visible = false;
    this.prevVis = Array.from(this.visSet);
    for (const n of this.prevVis) if (n.mesh) { n.mesh.visible = true; n.lastUsed = frame; }
    if (this.meshCount > 320) this.evict(frame);
  }

  private culled(n: QNode) {
    if (this.camD <= this.R * 1.0005) return false;
    const ang = Math.acos(clamp(n.cdir.dot(this.camDir), -1, 1));
    const hz = Math.acos(clamp(this.R / this.camD, -1, 1));
    return ang > hz + n.angR + this.vh + 0.02;
  }

  private visit(n: QNode) {
    if (this.culled(n)) return;
    n.lastUsed = this.frameNo;
    if (n.level < this.maxLevel) {
      const cp = this.tv.copy(n.cdir).multiplyScalar(this.R);
      const dist = Math.max(this.camL.distanceTo(cp) - n.size * 0.5, 0.5);
      let want = dist < KTAB[Math.min(n.level, 5)] * n.size;
      if (want && n.level >= 3 && dist > 2.5 * n.size) {
        const v = this.tv2.copy(cp).sub(this.camL).normalize();
        if (v.dot(this.fwdL) < -0.25) want = false;
      }
      if (want) {
        const ch = this.childrenOf(n);
        let ready = true;
        for (const c of ch) {
          if (this.culled(c)) continue;
          if (!c.mesh) {
            ready = false;
            if (!c.queued) { c.queued = true; }
            this.pending.push(c);
          }
        }
        if (ready) {
          for (const c of ch) { c.lastUsed = this.frameNo; this.visit(c); }
          return;
        }
      }
    }
    if (n.mesh) this.visSet.add(n);
  }

  evict(frame: number) {
    const arr: QNode[] = [];
    this.nodes.forEach((n) => { if (n.mesh && n.level > 0 && frame - n.lastUsed > 400) arr.push(n); });
    arr.sort((a, b) => a.lastUsed - b.lastUsed);
    for (let i = 0; i < Math.min(arr.length, 60); i++) {
      const n = arr[i];
      this.group.remove(n.mesh!);
      n.mesh!.geometry.dispose();
      n.mesh = null;
      n.queued = false;
      this.meshCount--;
    }
  }

  // bangun patch yang tertunda, maks sekian ms. kembalikan jumlah
  buildPending(budgetMs: number): number {
    if (!this.pending.length) return 0;
    const cl = this.camL;
    const tmp = this.tv3;
    this.pending.sort((a, b) => tmp.copy(a.cdir).multiplyScalar(this.R).distanceToSquared(cl) - tmp.copy(b.cdir).multiplyScalar(this.R).distanceToSquared(cl));
    const t0 = performance.now();
    let k = 0;
    for (const n of this.pending) {
      if (n.mesh) continue;
      this.buildPatch(n);
      k++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return k;
  }

  // ------------------------------------------------ sun
  buildSun() {
    this.isSun = true;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(256, 128);
    const nz = this.noise;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 256; x++) {
        const th = (x / 256) * Math.PI * 2, ph = (y / 128) * Math.PI;
        const X = Math.cos(th) * Math.sin(ph), Y = Math.cos(ph), Z = Math.sin(th) * Math.sin(ph);
        const v = nz.fbm(X * 4, Y * 4, Z * 4, 4) * 0.5 + 0.5;
        const g = nz.ridged(X * 9 + 3, Y * 9, Z * 9, 3);
        const k = clamp(0.55 + v * 0.55 + g * 0.2);
        const i = (y * 256 + x) * 4;
        img.data[i] = 255 * Math.min(1, k * 1.15);
        img.data[i + 1] = 255 * Math.min(1, 0.45 + k * 0.45);
        img.data[i + 2] = 255 * clamp(k * k * 0.5 - 0.05);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.R, 64, 48), mat);
    this.spinG.add(mesh);
    const mk = (scale: number, op: number, c0: string) => {
      const g = document.createElement('canvas');
      g.width = g.height = 256;
      const x = g.getContext('2d')!;
      const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, c0);
      gr.addColorStop(0.18, 'rgba(255,190,100,0.55)');
      gr.addColorStop(0.5, 'rgba(255,120,40,0.12)');
      gr.addColorStop(1, 'rgba(255,80,20,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(g);
      t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op, toneMapped: false, fog: false }));
      sp.scale.setScalar(this.R * scale);
      this.root.add(sp);
      this.sunSprites.push(sp);
    };
    mk(2.6, 0.9, 'rgba(255,240,200,0.9)');
    mk(7, 0.55, 'rgba(255,220,160,0.4)');
  }

  // ------------------------------------------------ gas giant
  buildGas() {
    this.isGas = true;
    const g = this.def.gas!;
    const cols = g.colors.map(lin);
    const u: any = {
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uC0: { value: cols[0] }, uC1: { value: cols[1] }, uC2: { value: cols[2] }, uC3: { value: cols[3] },
      uBands: { value: g.bands }, uTurb: { value: g.turb }, uTime: { value: 0 },
      uStorm: { value: lin(g.storm || [0, 0, 0]) }, uHasStorm: { value: g.storm ? 1 : 0 },
      uStormPos: { value: new THREE.Vector2(g.stormPos ? g.stormPos[0] : 0, g.stormPos ? g.stormPos[1] : 0) },
      uFog: { value: 0 }, uFogC: { value: lin(this.def.atm!.fog) }, uSeed: { value: this.def.seed * 0.37 },
    };
    this.gasU = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vVP;
        ${LOG_V_PARS}
        void main(){ vN = normalize(position); vec4 mv = modelViewMatrix*vec4(position,1.0); vVP = mv.xyz; gl_Position = projectionMatrix*mv;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `varying vec3 vN; varying vec3 vVP;
        uniform vec3 uSun,uC0,uC1,uC2,uC3,uStorm,uFogC; uniform float uBands,uTurb,uTime,uHasStorm,uFog,uSeed; uniform vec2 uStormPos;
        ${LOG_F_PARS}
        ${NOISE_GLSL}
        vec3 pick(float i){ float k = fract(sin((i+uSeed)*12.9898)*43758.5453)*4.0; vec3 c = mix(uC0,uC1,clamp(k,0.0,1.0)); c = mix(c,uC2,clamp(k-1.0,0.0,1.0)); c = mix(c,uC3,clamp(k-2.0,0.0,1.0)); c = mix(c,uC0,clamp(k-3.0,0.0,1.0)); return c; }
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN);
          float lat = n.y; float lon = atan(n.z,n.x);
          float tb = (vn(vec3(n.x*3.0,n.y*9.0,n.z*3.0)+uTime*0.01)-0.5)*0.4*uTurb + (vn(n*24.0+uTime*0.02)-0.5)*0.1*uTurb;
          float bp = (lat+tb)*uBands; float bi = floor(bp); float bf = fract(bp);
          vec3 c = mix(pick(bi),pick(bi+1.0),smoothstep(0.3,0.7,bf));
          c *= 0.9 + 0.2*vn(vec3(n.x*2.0,n.y*50.0,n.z*2.0)) ;
          c *= 0.93 + 0.14*vn(n*60.0+uTime*0.02);
          float dl = lon-uStormPos.x; dl = atan(sin(dl),cos(dl));
          vec2 dd = vec2(dl*1.1,(lat-uStormPos.y)*3.4);
          float sw = atan(dd.y,dd.x)+length(dd)*7.0; float st = smoothstep(0.62,0.2,length(dd));
          c = mix(c, uStorm*(0.8+0.3*sin(sw*2.0)), st*uHasStorm);
          float li = smoothstep(-0.15,0.55,dot(n,uSun));
          vec3 col = c*(0.025+li*1.1);
          col = mix(col,uFogC*(0.15+li*0.9),uFog);
          gl_FragColor = vec4(col,1.0);
          ${TONE_END}
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.R, 96, 64), mat);
    this.spinG.add(mesh);
    this.gasMesh = mesh;
  }

  // ------------------------------------------------ atmosfer
  buildAtmosphere() {
    const a = this.def.atm!;
    const Ra = this.R + a.h * 6.5;
    this.atmRa = Ra;
    this.atmThickness = a.h * 6.5;
    const u: any = {
      uCam: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(1, 0, 0) },
      uRp: { value: this.isGas ? this.R * 0.985 : this.R }, uRa: { value: Ra }, uH: { value: a.h },
      uColor: { value: lin(a.color) }, uInt: { value: 1 }, uTau: { value: this.isGas ? 0.5 : 0.34 },
    };
    this.atmU = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      vertexShader: `varying vec3 vPos;
        ${LOG_V_PARS}
        void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `varying vec3 vPos;
        uniform vec3 uCam,uSun,uColor; uniform float uRp,uRa,uH,uInt,uTau;
        ${LOG_F_PARS}
        vec2 rs(vec3 ro, vec3 rd, float r){ float b=dot(ro,rd); float c=dot(ro,ro)-r*r; float d=b*b-c; if(d<0.0) return vec2(1e20,-1e20); float s=sqrt(d); return vec2(-b-s,-b+s); }
        void main(){
          #include <logdepthbuf_fragment>
          vec3 ro = uCam; vec3 rd = normalize(vPos-uCam);
          vec2 ta = rs(ro,rd,uRa);
          float t0 = max(ta.x,0.0); float t1 = ta.y;
          vec2 tp = rs(ro,rd,uRp);
          if(tp.x>0.0) t1 = min(t1,tp.x);
          if(t1<=t0) discard;
          const int NS = 12;
          float dt = (t1-t0)/float(NS);
          float od = 0.0; vec3 acc = vec3(0.0);
          for(int i=0;i<NS;i++){
            float t = t0+(float(i)+0.5)*dt;
            vec3 p = ro+rd*t;
            float hg = max(length(p)-uRp,0.0);
            float d = exp(-hg/uH)*dt/uH*uTau;
            float sl = dot(normalize(p),uSun);
            float vis = smoothstep(-0.2,0.3,sl);
            vec3 tint = mix(vec3(1.0,0.4,0.15),vec3(1.0),smoothstep(-0.05,0.45,sl));
            acc += uColor*tint*vis*d*exp(-od);
            od += d*0.6;
          }
          float mu = dot(rd,uSun);
          float ph = 0.8+0.2*mu*mu;
          vec3 col = acc*uInt*ph;
          col += vec3(1.0,0.85,0.65)*pow(max(mu,0.0),20.0)*(1.0-exp(-od))*0.5;
          gl_FragColor = vec4(col,1.0);
          ${TONE_END}
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(Ra * 1.04, 96, 64), mat);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.atmMesh = mesh;
  }

  // ------------------------------------------------ awan
  buildClouds() {
    const cl = this.def.clouds!;
    const Rc = this.R * (1 + cl.height);
    const u: any = {
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: lin(cl.color) }, uCover: { value: cl.cover }, uTime: { value: 0 }, uSeed: { value: this.def.seed * 1.3 },
    };
    this.cloudU = u;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying float vD;
        ${LOG_V_PARS}
        void main(){ vN = normalize(position); vec4 mv = modelViewMatrix*vec4(position,1.0); vD = length(mv.xyz); gl_Position = projectionMatrix*mv;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `varying vec3 vN; varying float vD;
        uniform vec3 uSun,uColor; uniform float uCover,uTime,uSeed;
        ${LOG_F_PARS}
        ${NOISE_GLSL}
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN);
          vec3 q = n*3.2 + vec3(uSeed, uTime*0.02, 0.0);
          q += (vec3(vn(q*2.0),vn(q*2.0+7.0),vn(q*2.0+13.0))-0.5)*0.9;
          float f = 0.0, a = 0.5, fr = 1.0;
          for(int i=0;i<8;i++){
            if(i>=5 && vD>30000.0) break;
            f += a*vn(q*fr); a*=0.5; fr*=2.07;
          }
          f = f/0.97;
          float al = smoothstep(1.0-uCover-0.12, 1.0-uCover+0.18, f);
          al *= smoothstep(150.0,1500.0,vD);
          if(al<0.01) discard;
          float li = clamp(dot(n,uSun)*1.3+0.12,0.0,1.0);
          float shade = 0.7 + 0.5*f;
          vec3 col = uColor*(0.03+li*1.05)*shade;
          gl_FragColor = vec4(col, al*0.96);
          ${TONE_END}
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(Rc, 96, 64), mat);
    mesh.renderOrder = 2;
    this.spinG.add(mesh);
    this.cloudMesh = mesh;
  }

  // ------------------------------------------------ cincin
  buildRings() {
    const r = this.def.rings!;
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 4;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(1024, 4);
    const nz = new Noise3(r.seed + 3);
    for (let x = 0; x < 1024; x++) {
      const t = x / 1023;
      let dens = 0.55 + 0.45 * nz.fbm(t * 38, 0.5, 0, 4);
      dens *= smooth(0, 0.05, t) * smooth(1, 0.93, t);
      if (r.alpha > 0.8) {
        if (t > 0.58 && t < 0.64) dens *= 0.08; // celah Cassini
        if (t > 0.1 && t < 0.3) dens *= 0.55;
      }
      dens = clamp(dens * (0.7 + 0.5 * nz.noise(t * 150, 2, 1)));
      for (let y = 0; y < 4; y++) {
        const i = (y * 1024 + x) * 4;
        const shade = 0.75 + 0.25 * nz.noise(t * 90, 4, 0);
        img.data[i] = r.color[0] * 255 * shade;
        img.data[i + 1] = r.color[1] * 255 * shade;
        img.data[i + 2] = r.color[2] * 255 * shade;
        img.data[i + 3] = dens * r.alpha * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.RingGeometry(r.inner * this.R, r.outer * this.R, 160, 1);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const rr = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (rr - r.inner * this.R) / ((r.outer - r.inner) * this.R), 0.5);
    }
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.def.tilt);
    mesh.renderOrder = 1;
    this.root.add(mesh);
    this.ringMesh = mesh;
  }

  // ------------------------------------------------ pembaruan per frame (arah matahari, kamera)
  updateShading(camRelWorld: THREE.Vector3, sunDirWorld: THREE.Vector3, t: number, densCam: number) {
    const D = camRelWorld.length();
    if (this.atmMesh) {
      const u = this.atmU;
      u.uCam.value.copy(camRelWorld);
      u.uSun.value.copy(sunDirWorld);
      u.uInt.value = 1 + 1.7 * densCam;
      const inside = D < this.atmRa * 1.04;
      (this.atmMesh.material as THREE.ShaderMaterial).side = inside ? THREE.BackSide : THREE.FrontSide;
      this.atmMesh.visible = D < this.R * 60;
    }
    if (this.cloudU || this.gasU) {
      this.toLocal(sunDirWorld, this.tv3);
      if (this.cloudU) { this.cloudU.uSun.value.copy(this.tv3); this.cloudU.uTime.value = t * (this.def.clouds!.speed * 10); }
      if (this.gasU) { this.gasU.uSun.value.copy(this.tv3); this.gasU.uTime.value = t; }
    }
  }
}

export { lerp };
