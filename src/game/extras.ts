// Objek tambahan: bintang, galaksi, stasiun, Voyager, sabuk asteroid, debu, bendera, lensa flare
import * as THREE from 'three';
import { Noise3, hash3, mulberry32, clamp, smooth } from './noise';

export function makeStarfield() {
  const group = new THREE.Group();
  const rnd = mulberry32(2024);
  const n = 4200;
  const pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const R = 6e8;
    pos[i * 3] = Math.cos(th) * s * R; pos[i * 3 + 1] = u * R; pos[i * 3 + 2] = Math.sin(th) * s * R;
    const k = rnd();
    const b = 0.35 + Math.pow(rnd(), 3) * 0.65;
    const c = k < 0.2 ? [0.7, 0.8, 1] : k < 0.8 ? [1, 0.97, 0.92] : [1, 0.75, 0.55];
    colr[i * 3] = c[0] * b; colr[i * 3 + 1] = c[1] * b; colr[i * 3 + 2] = c[2] * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const starMat = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const stars = new THREE.Points(geo, starMat);
  stars.renderOrder = -10;
  stars.frustumCulled = false;
  group.add(stars);

  // galaksi (Bima Sakti)
  const W = 640, H = 320;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const nz = new Noise3(77);
  const gn = new THREE.Vector3(0.3, 0.88, 0.25).normalize();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const th = (x / W) * Math.PI * 2, ph = (y / H) * Math.PI;
      const X = Math.cos(th) * Math.sin(ph), Y = Math.cos(ph), Z = Math.sin(th) * Math.sin(ph);
      const dg = X * gn.x + Y * gn.y + Z * gn.z;
      const band = Math.exp(-(dg * dg) / 0.035);
      const clouds = nz.fbm(X * 3, Y * 3, Z * 3, 4) * 0.5 + 0.5;
      const dust = nz.fbm(X * 7 + 5, Y * 7, Z * 7, 3) * 0.5 + 0.5;
      const core = Math.exp(-((X - 0.7) ** 2 + (Z - 0.1) ** 2) * 3.0) * band;
      let I = band * (0.25 + clouds * 0.75) * (1 - Math.max(0, dust - 0.55) * 1.4) * 0.9;
      const neb = Math.max(0, nz.fbm(X * 2 + 9, Y * 2, Z * 2, 3)) * 0.35;
      I = clamp(I);
      const i = (y * W + x) * 4;
      const r = 0.05 + I * 0.55 + core * 0.45 + neb * 0.3;
      const g = 0.06 + I * 0.5 + core * 0.3 + neb * 0.05;
      const b = 0.14 + I * 0.55 + core * 0.15 + neb * 0.35;
      img.data[i] = clamp(r * 0.55) * 255;
      img.data[i + 1] = clamp(g * 0.55) * 255;
      img.data[i + 2] = clamp(b * 0.6) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mwMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, transparent: true });
  const mw = new THREE.Mesh(new THREE.SphereGeometry(8e8, 40, 24), mwMat);
  mw.renderOrder = -11;
  mw.frustumCulled = false;
  group.add(mw);
  return { group, starMat, mwMat };
}

export function makeStation() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 0.6, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a424c, metalness: 0.5, roughness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1a3a7a, metalness: 0.7, roughness: 0.3, emissive: 0x0a1a3a });
  const ringG = new THREE.Group();
  ringG.add(new THREE.Mesh(new THREE.TorusGeometry(600, 38, 12, 64), metal));
  ringG.add(new THREE.Mesh(new THREE.TorusGeometry(600, 12, 6, 64), new THREE.MeshStandardMaterial({ color: 0xff7a30 })).translateZ(40));
  const winM = new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false });
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 6), winM);
    w.position.set(Math.cos(a) * 600, Math.sin(a) * 600, 0);
    w.rotation.z = a;
    w.translateX(37);
    ringG.add(w);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(600, 8, 8), dark);
    sp.position.set(Math.cos(a) * 300, Math.sin(a) * 300, 0);
    sp.rotation.z = a;
    ringG.add(sp);
  }
  ringG.rotation.x = Math.PI / 2;
  g.add(ringG);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(80, 80, 900, 20), metal);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (const z of [-480, 480]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(50, 90, 90, 16), dark);
    c.rotation.x = Math.PI / 2;
    c.position.z = z;
    g.add(c);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 300), dark);
    arm.position.set(s * 100, 0, 0);
    arm.rotation.y = Math.PI / 2;
    arm.scale.set(1, 1, 0.6);
    g.add(arm);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(380, 3, 180), panel);
      p.position.set(s * (320 + i * 20), 0, (i - 1) * 190);
      p.rotation.y = 0;
      g.add(p);
    }
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
  lamp.position.set(0, 100, 480);
  g.add(lamp);
  const lamp2 = lamp.clone();
  lamp2.material = new THREE.MeshBasicMaterial({ color: 0x30ff60, toneMapped: false });
  lamp2.position.set(0, -100, -480);
  g.add(lamp2);
  (g as any).ring = ringG;
  (g as any).lamp = lamp;
  return g;
}

export function makeVoyager() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 });
  const gray = new THREE.MeshStandardMaterial({ color: 0xb0b4ba, metalness: 0.6, roughness: 0.5 });
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), gray);
  dish.rotation.x = Math.PI / 2;
  dish.material.side = THREE.DoubleSide;
  g.add(dish);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 10), gray).translateZ(-0.4));
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 6), gray);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(4, -0.4, -0.5);
  g.add(boom);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 8), gray).translateX(8).translateY(-0.4));
  const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), gold);
  rec.position.set(-0.4, 0.2, -0.9);
  rec.rotation.x = Math.PI / 2;
  g.add(rec);
  const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 10, 6), gray);
  mag.rotation.z = Math.PI / 2;
  mag.position.set(-5, 0, -0.6);
  g.add(mag);
  g.scale.setScalar(1.6);
  return g;
}

export function makeFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.6, 8), new THREE.MeshLambertMaterial({ color: 0xcfd3d8 }));
  pole.position.y = 1.8;
  g.add(pole);
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 64;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#e8112d'; x.fillRect(0, 0, 96, 32);
  x.fillStyle = '#ffffff'; x.fillRect(0, 32, 96, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2, 8, 4), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
  cloth.position.set(0.92, 3.0, 0);
  g.add(cloth);
  const pos = cloth.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 3) * 0.08);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshLambertMaterial({ color: 0xffd04a })).translateY(3.65));
  return g;
}

// ---------- sabuk asteroid ----------
const CELL = 100000;
export class AsteroidBelt {
  mesh: THREE.InstancedMesh;
  far: THREE.Points;
  rocks: { x: number; y: number; z: number; r: number; vx: number; vy: number; vz: number }[] = [];
  omega = 0; // kecepatan sudut sabuk mengelilingi Matahari (rad/s), dari Kepler
  inside = false;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const nz = new Noise3(9);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const k = 1 + 0.22 * nz.fbm(x * 1.6, y * 1.6, z * 1.6, 3) + 0.05 * nz.noise(x * 6, y * 6, z * 6);
      pa.setXYZ(i, x * k, y * k * 0.85, z * k);
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: false }), 300);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    const n = 9000;
    const pos = new Float32Array(n * 3);
    const rnd = mulberry32(5);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = 15.3e6 + (rnd() + rnd()) * 2.25e6;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (rnd() - 0.5) * (rnd() - 0.5) * 2.4e6; pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.far = new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xb09a86, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false }));
    this.far.frustumCulled = false;
    scene.add(this.far);
  }

  update(origin: THREE.Vector3, time = 0) {
    this.far.position.set(-origin.x, -origin.y, -origin.z);
    const rr = Math.hypot(origin.x, origin.z);
    this.inside = rr > 15.2e6 && rr < 19.8e6 && Math.abs(origin.y) < 1.4e6;
    this.rocks.length = 0;
    if (!this.inside && !(rr > 14.6e6 && rr < 20.4e6 && Math.abs(origin.y) < 1.4e6)) {
      this.mesh.count = 0;
      return;
    }
    // bingkai berputar bersama sabuk (rotasi kaku dengan ω Kepler): batu mengorbit, bukan diam
    const th = this.omega * time, ct = Math.cos(th), st = Math.sin(th);
    const bx = origin.x * ct + origin.z * st, bz = -origin.x * st + origin.z * ct; // rotasi −θ
    const cx = Math.floor(bx / CELL), cy = Math.floor(origin.y / CELL), cz = Math.floor(bz / CELL);
    let n = 0;
    for (let k = -3; k <= 3; k++) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      if (n >= 300) break;
      const ix = cx + i, iy = cy + j, iz = cz + k;
      const x = (ix + hash3(ix, iy, iz, 1)) * CELL, y = (iy + hash3(ix, iy, iz, 2)) * CELL, z = (iz + hash3(ix, iy, iz, 3)) * CELL;
      const r = Math.hypot(x, z);
      const prof = smooth(15.2e6, 16.4e6, r) * smooth(19.8e6, 18.6e6, r) * Math.exp(-((y / 5e5) ** 2));
      const h = hash3(ix, iy, iz, 4);
      if (h > 0.6 * prof) continue;
      const h5 = hash3(ix, iy, iz, 5);
      const rad = 180 + h5 * h5 * h5 * 4800;
      const wx = x * ct - z * st, wz = x * st + z * ct; // rotasi +θ → koordinat dunia
      this.p.set(wx - origin.x, y - origin.y, wz - origin.z);
      this.e.set(h * 40, h5 * 30, h * h5 * 50);
      this.q.setFromEuler(this.e);
      this.s.set(rad, rad, rad);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      const tone = 0.35 + hash3(ix, iy, iz, 6) * 0.35;
      this.mesh.setColorAt(n, this.c.setRGB(tone * 1.05, tone * 0.95, tone * 0.85));
      this.rocks.push({ x: wx, y, z: wz, r: rad * 0.95, vx: -this.omega * wz, vy: 0, vz: this.omega * wx });
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- debu ruang ----------
export class Dust {
  lines: THREE.LineSegments;
  base: Float64Array;
  pos: Float32Array;
  n = 220;
  size = 700;
  constructor(scene: THREE.Scene) {
    this.base = new Float64Array(this.n * 3);
    this.pos = new Float32Array(this.n * 6);
    const rnd = mulberry32(42);
    for (let i = 0; i < this.n * 3; i++) this.base[i] = rnd() * 100000;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }
  update(origin: THREE.Vector3, vel: THREE.Vector3, intensity: number) {
    const S = this.size, H = S / 2;
    const sp = vel.length();
    const len = Math.min(sp * 0.014, 140) + 0.4;
    const inv = sp > 1e-3 ? 1 / sp : 0;
    const b = this.base, p = this.pos;
    for (let i = 0; i < this.n; i++) {
      let x = (b[i * 3] - origin.x) % S, y = (b[i * 3 + 1] - origin.y) % S, z = (b[i * 3 + 2] - origin.z) % S;
      if (x < -H) x += S; if (x > H) x -= S;
      if (y < -H) y += S; if (y > H) y -= S;
      if (z < -H) z += S; if (z > H) z -= S;
      const o = i * 6;
      p[o] = x; p[o + 1] = y; p[o + 2] = z;
      p[o + 3] = x - vel.x * inv * len; p[o + 4] = y - vel.y * inv * len; p[o + 5] = z - vel.z * inv * len;
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.material as THREE.LineBasicMaterial).opacity = intensity;
  }
}

// ---------- lensa flare ----------
export function makeFlares(scene: THREE.Scene) {
  const mkTex = (inner: string, outer: string) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const defs: [number, string, string, number][] = [
    [1.0, 'rgba(255,240,200,0.85)', 'rgba(255,200,120,0)', 50],
    [0.55, 'rgba(120,180,255,0.4)', 'rgba(120,180,255,0)', 20],
    [-0.35, 'rgba(255,140,60,0.35)', 'rgba(255,140,60,0)', 28],
    [-0.8, 'rgba(120,255,200,0.3)', 'rgba(120,255,200,0)', 14],
    [1.5, 'rgba(255,220,160,0.3)', 'rgba(255,220,160,0)', 22],
  ];
  const sprites: { s: THREE.Sprite; k: number; base: number }[] = [];
  for (const [k, a, b, sc] of defs) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(a, b), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0, toneMapped: false, fog: false }));
    s.scale.setScalar(sc);
    s.renderOrder = 20;
    s.frustumCulled = false;
    scene.add(s);
    sprites.push({ s, k, base: sc });
  }
  return sprites;
}
