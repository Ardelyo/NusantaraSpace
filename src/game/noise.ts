// Noise prosedural: simplex 3D, fbm, ridged, hash dan kawah (worley-ish)

export function hash3(x: number, y: number, z: number, s = 0): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 2147483629) ^
    Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const G3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export class Noise3 {
  perm = new Uint8Array(512);
  permMod12 = new Uint8Array(512);
  constructor(seed = 1) {
    const rnd = mulberry32(seed * 7919 + 13);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise(xin: number, yin: number, zin: number): number {
    const F3 = 1 / 3,
      G = 1 / 6;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s),
      j = Math.floor(yin + s),
      k = Math.floor(zin + s);
    const t = (i + j + k) * G;
    const x0 = xin - (i - t),
      y0 = yin - (j - t),
      z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G;
    const x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G;
    const x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const perm = this.perm, pm = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const gi = pm[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (G3[gi] * x0 + G3[gi + 1] * y0 + G3[gi + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (G3[gi] * x1 + G3[gi + 1] * y1 + G3[gi + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (G3[gi] * x2 + G3[gi + 1] * y2 + G3[gi + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (G3[gi] * x3 + G3[gi + 1] * y3 + G3[gi + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  }

  fbm(x: number, y: number, z: number, oct: number, gain = 0.5, lac = 2.03): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise(x * f, y * f, z * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }

  // 0..1 puncak tajam
  ridged(x: number, y: number, z: number, oct: number): number {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(this.noise(x * f, y * f, z * f));
      v *= v;
      s += a * v;
      n += a;
      a *= 0.5;
      f *= 2.1;
    }
    return s / n;
  }
}

// Profil kawah: bernilai ~[-1, 0.3]. dalam satuan sel
export function craters(x: number, y: number, z: number, seed: number, density = 0.7): number {
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  const fx0 = x - cx, fy0 = y - cy, fz0 = z - cz;
  const k0 = fz0 < 0.37 ? -1 : 0, k1 = fz0 > 0.63 ? 1 : 0;
  const j0 = fy0 < 0.37 ? -1 : 0, j1 = fy0 > 0.63 ? 1 : 0;
  const i0 = fx0 < 0.37 ? -1 : 0, i1 = fx0 > 0.63 ? 1 : 0;
  let v = 0;
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const ix = cx + i, iy = cy + j, iz = cz + k;
        if (hash3(ix, iy, iz, seed + 4) > density) continue;
        const fx = ix + 0.2 + 0.6 * hash3(ix, iy, iz, seed + 1);
        const fy = iy + 0.2 + 0.6 * hash3(ix, iy, iz, seed + 2);
        const fz = iz + 0.2 + 0.6 * hash3(ix, iy, iz, seed + 3);
        const r = 0.14 + 0.28 * hash3(ix, iy, iz, seed + 5);
        const dx = x - fx, dy = y - fy, dz = z - fz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const rr = r * 1.35;
        if (d2 > rr * rr) continue;
        const d = Math.sqrt(d2) / r;
        if (d < 1) {
          v += -(1 - d * d) * 1.0 + 0.0;
        } else {
          const u = (d - 1) / 0.35;
          v += 0.28 * (1 - u) * (1 - u);
        }
      }
    }
  }
  return v;
}

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
