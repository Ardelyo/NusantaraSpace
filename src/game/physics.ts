// Fisika inti (fungsi murni, satuan SI dalam "skala game").
//
// ASUMSI SKALA (lihat docs/FISIKA_SPEC.md):
//  - Radius benda dikecilkan ±64× dari nyata, tetapi gravitasi permukaan g dibuat NYATA.
//    Maka parameter gravitasi tiap benda: μ = g·R²  (bukan GM nyata).
//  - Jarak antar planet dimampatkan; periode orbit mengikuti Hukum Kepler dari μ dan jarak yang dipakai game.
//  - Atmosfer memakai kerapatan permukaan ρ₀ dan skala tinggi H NYATA (H = kT/mg tidak bergantung radius).
//  - Fluks Matahari 1361 W/m² di jarak Bumi (game); suku korona menambah panas ekstrem di dekat bintang.

export const SIGMA = 5.670374e-8; // W m⁻² K⁻⁴
export const S_EARTH = 1361; // W/m² di jarak Bumi
export const SUN_SURFACE_FLUX = 6.29e7; // W/m² di permukaan Matahari (σT⁴, T = 5772 K)
export const EARTH_ORBIT_R = 9.5e6; // m (jarak Bumi–Matahari di game)
export const SUN_R = 800000; // m (radius Matahari di game)
export const T_SPACE = 3; // K
export const G0 = 9.80665;

// ------------------------------------------------------------------ gravitasi & orbit
export const muOf = (g: number, R: number) => g * R * R;
export const circularSpeed = (mu: number, r: number) => Math.sqrt(mu / r);
export const escapeSpeed = (mu: number, r: number) => Math.sqrt((2 * mu) / r);
/** v² = μ (2/r − 1/a) */
export const visViva = (mu: number, r: number, a: number) => Math.sqrt(Math.max(0, mu * (2 / r - 1 / a)));
export const orbitalPeriod = (mu: number, a: number) => 2 * Math.PI * Math.sqrt((a * a * a) / mu);
export const orbitalOmega = (mu: number, a: number) => Math.sqrt(mu / (a * a * a));
/** Jari-jari bola pengaruh (Laplace): a (m/M)^(2/5) */
export const soiRadius = (a: number, muBody: number, muParent: number) => a * Math.pow(muBody / muParent, 0.4);
/** Batas Roche: rigid k=1,26; fluida k=2,44 */
export const rocheLimit = (Rprimary: number, rhoPrimary: number, rhoSat: number, k = 1.26) => k * Rprimary * Math.cbrt(rhoPrimary / rhoSat);
/** Percepatan gravitasi pada jarak r dari pusat */
export const gravityAt = (mu: number, r: number) => mu / (r * r);

// ------------------------------------------------------------------ atmosfer
export interface AtmosphereData {
  rho0: number; // kg/m³ di permukaan (1 bar untuk raksasa gas)
  H: number; // skala tinggi (m)
  T0: number; // K di permukaan
  lapse: number; // K/m (penurunan suhu terhadap ketinggian)
  Tmin: number; // K batas bawah suhu
}

export const ATMOSPHERES: Record<string, AtmosphereData> = {
  bumi: { rho0: 1.225, H: 8500, T0: 288, lapse: 6.5e-3, Tmin: 217 },
  venus: { rho0: 65, H: 15900, T0: 737, lapse: 8.0e-3, Tmin: 170 },
  mars: { rho0: 0.0155, H: 11100, T0: 210, lapse: 2.5e-3, Tmin: 130 },
  titan: { rho0: 5.3, H: 20000, T0: 94, lapse: 1.0e-3, Tmin: 70 },
  jupiter: { rho0: 0.16, H: 27000, T0: 165, lapse: 2.0e-3, Tmin: 110 },
  saturnus: { rho0: 0.19, H: 59500, T0: 134, lapse: 0.7e-3, Tmin: 80 },
  uranus: { rho0: 0.42, H: 27700, T0: 76, lapse: 1.0e-3, Tmin: 53 },
  neptunus: { rho0: 0.45, H: 19700, T0: 72, lapse: 1.0e-3, Tmin: 50 },
  pluto: { rho0: 8.4e-5, H: 60000, T0: 40, lapse: 0, Tmin: 40 },
};

/** Atmosfer dunia generatif dari parameter visual `dens` & seed (kira-kira Bumi ±) */
export function generatedAtmosphere(seed: number): AtmosphereData {
  const r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const r2 = ((Math.sin(seed * 78.233) * 12345.6789) % 1 + 1) % 1;
  return { rho0: 0.3 + 2.2 * r, H: 6500 + 6000 * r2, T0: 230 + 90 * r2, lapse: 5e-3, Tmin: 150 };
}

export const atmDensity = (a: AtmosphereData, alt: number) => a.rho0 * Math.exp(-alt / a.H);
/** Tekanan hidrostatik isoterm: P = ρ g H */
export const atmPressure = (a: AtmosphereData, g: number, alt: number) => atmDensity(a, alt) * g * a.H;
export const atmTemperature = (a: AtmosphereData, alt: number) => Math.max(a.Tmin, a.T0 - a.lapse * Math.max(alt, 0));

/** ½ρv² */
export const dynamicPressure = (rho: number, v: number) => 0.5 * rho * v * v;
/** Percepatan drag (m/s²) untuk massa m, luas efektif CdA */
export const dragAccel = (rho: number, v: number, cdA: number, mass: number) => (0.5 * rho * v * v * cdA) / mass;
/** Kecepatan terminal: √(2mg/(ρ·CdA)) */
export const terminalVelocity = (mass: number, g: number, rho: number, cdA: number) => Math.sqrt((2 * mass * g) / (rho * cdA));
/** Fluks panas stagnasi Sutton–Graves (W/m²) */
export const stagnationHeatFlux = (rho: number, v: number, noseR: number, k = 1.74e-4) => k * Math.sqrt(rho / noseR) * v * v * v;
/** Koefisien konveksi (W/m²K) kasar untuk pertukaran dengan udara sekitar */
export const convectiveH = (rho: number, v: number) => 15 * Math.pow(Math.max(rho, 1e-12) / 1.225, 0.6) * Math.sqrt(1 + Math.max(v, 0) / 100);

// ------------------------------------------------------------------ Matahari & termal
/** Fluks surya (W/m²): hukum kuadrat terbalik + suku korona yang hanya berarti di dekat bintang */
export function solarFlux(r: number): number {
  const rr = Math.max(r, SUN_R);
  const inv = S_EARTH * (EARTH_ORBIT_R / rr) ** 2;
  const corona = SUN_SURFACE_FLUX * (SUN_R / rr) ** 8;
  return inv + corona;
}

/** Suhu kesetimbangan pelat (K): ((α S) / (ε σ))^¼ untuk pelat yang menghadap Matahari */
export const equilibriumTemp = (S: number, alpha: number, eps: number) => Math.pow((alpha * S) / (eps * SIGMA), 0.25);

/** Satu langkah semi-implisit untuk suhu kulit (stabil untuk dt berapa pun) */
export function skinStep(T: number, dt: number, qIn: number, eps: number, C: number, Tbg = T_SPACE, convH = 0, Tamb = 0): number {
  const f0 = qIn - eps * SIGMA * (T ** 4 - Tbg ** 4) + convH * (Tamb - T);
  const k = 4 * eps * SIGMA * T ** 3 + convH;
  return T + (dt * f0) / (C + dt * k);
}

// ------------------------------------------------------------------ pesawat & benturan
export const SHIP = {
  mass: 60000, // kg
  aMain: 30, // m/s² mesin utama
  boostMul: 2.5,
  aVert: 12, // m/s² thruster vertikal
  aBrake: 25, // m/s² thruster retro
  cdA: 30, // m² luas hambat efektif
  noseR: 1.5, // m
  alpha: 0.3, // absorptivitas surya
  eps: 0.85, // emisivitas
  skinC: 3200, // J/m²K kapasitas panas kulit (ubin ±3,2 kg/m²)
  maxSkinT: 1800, // K
  maxQ: 60e3, // Pa tekanan dinamis maksimum
  crushP: 15e6, // Pa tekanan luar maksimum lambung
  legAbsorb: 1.0e6, // J diserap kaki pendarat (≈ 5,8 m/s)
  hullCritV: 30, // m/s benturan yang menghancurkan
  cabinC: 6e5, // J/K kapasitas panas kabin
  cabinUA: 40, // W/K konduktansi kulit→kabin
  coolMax: 40e3, // W kapasitas pendingin kabin
  radLimitT: 450, // K suhu lingkungan tertinggi di mana radiator masih bisa membuang panas
  cabinMaxT: 330, // K batas aman kru
  dvTotal: 250e3, // m/s anggaran Δv penuh
};

export const kineticEnergy = (m: number, v: number) => 0.5 * m * v * v;
export const hullCapacity = (m = SHIP.mass) => kineticEnergy(m, SHIP.hullCritV);

/** Fraksi kerusakan lambung (0..∞; ≥1 = hancur) dari benturan dengan energi E; `absorb` = energi yang diserap kaki/perisai */
export const impactDamage = (E: number, absorb: number, capacity = hullCapacity()) => Math.max(0, E - absorb) / capacity;

/** Kecepatan mendarat tertinggi tanpa kerusakan (m/s) */
export const safeLandingSpeed = (m = SHIP.mass) => Math.sqrt((2 * SHIP.legAbsorb) / m);

/** Kapasitas pendingin kabin menurun bila lingkungan terlalu panas untuk membuang panas */
export const coolingCapacity = (Tamb: number) => SHIP.coolMax * Math.max(0, Math.min(1, (SHIP.radLimitT - Tamb) / (SHIP.radLimitT - 250)));

/** Laju perubahan suhu kabin (K/s) */
export function cabinRate(Tcab: number, Tskin: number, Tamb: number, powerRatio = 1): number {
  const leak = SHIP.cabinUA * (Tskin - Tcab);
  const cool = coolingCapacity(Tamb) * powerRatio * Math.min(1, Math.max(0, (Tcab - 285) / 15));
  const heater = 8000 * powerRatio * Math.min(1, Math.max(0, (290 - Tcab) / 10));
  return (leak - cool + heater) / SHIP.cabinC;
}

/** Partikel kecil menembus baju bila E ≥ ~1 kJ */
export const SUIT_PENETRATION_J = 1000;
