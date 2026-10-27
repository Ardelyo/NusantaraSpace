// Tes fisika inti: node --experimental-strip-types tests/physics.test.ts
import assert from 'node:assert/strict';
import * as P from '../src/game/physics.ts';

let n = 0;
const near = (a: number, b: number, tol: number, msg: string) => {
  const ok = Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  assert.ok(ok, `${msg}: ${a} ≠ ${b} (tol ${tol})`);
  n++;
};
const t = (name: string, fn: () => void) => { fn(); console.log('✓', name); };

const muE = P.muOf(9.8, 1e5);
const muS = P.muOf(274, P.SUN_R);
const muM = P.muOf(1.62, 27000);

t('μ & kecepatan lingkaran/lepas', () => {
  near(muE, 9.8e10, 1e-9, 'μ Bumi');
  near(P.circularSpeed(muE, 1e5), Math.sqrt(9.8 * 1e5), 1e-12, 'v_circ permukaan = √(gR)');
  near(P.escapeSpeed(muE, 1e5) / P.circularSpeed(muE, 1e5), Math.SQRT2, 1e-12, 'v_esc/v_circ = √2');
  near(P.visViva(muE, 2e5, 2e5), P.circularSpeed(muE, 2e5), 1e-12, 'vis-viva lingkaran');
});

t('Hukum Kepler: T² ∝ a³ dan konsistensi ω', () => {
  const T1 = P.orbitalPeriod(muS, 9.5e6), T2 = P.orbitalPeriod(muS, 57e6);
  near(T2 / T1, Math.pow(57 / 9.5, 1.5), 1e-12, 'rasio periode Neptunus/Bumi');
  near(P.orbitalOmega(muS, 9.5e6) * T1, 2 * Math.PI, 1e-12, 'ωT = 2π');
});

t('Integrator leapfrog: orbit tertutup, energi & momentum sudut kekal', () => {
  // orbit eliptik: perigee r=1.5e5, a=2e5 di sekitar Bumi game
  const a = 2e5, rp = 1.5e5;
  let x = rp, y = 0, vx = 0, vy = P.visViva(muE, rp, a);
  const E0 = 0.5 * (vx * vx + vy * vy) - muE / rp, L0 = x * vy - y * vx;
  assert.ok(Math.abs(E0 - -muE / (2 * a)) < 1e-6 * Math.abs(E0), 'energi spesifik = −μ/2a');
  const T = P.orbitalPeriod(muE, a);
  const dt = 0.5, steps = Math.round(T / dt);
  let ax = (-muE * x) / Math.hypot(x, y) ** 3, ay = (-muE * y) / Math.hypot(x, y) ** 3;
  for (let i = 0; i < steps; i++) {
    vx += 0.5 * dt * ax; vy += 0.5 * dt * ay;
    x += dt * vx; y += dt * vy;
    const r3 = Math.hypot(x, y) ** 3;
    ax = (-muE * x) / r3; ay = (-muE * y) / r3;
    vx += 0.5 * dt * ax; vy += 0.5 * dt * ay;
  }
  const E1 = 0.5 * (vx * vx + vy * vy) - muE / Math.hypot(x, y), L1 = x * vy - y * vx;
  near(E1, E0, 1e-6, 'energi setelah 1 periode');
  near(L1, L0, 1e-9, 'momentum sudut');
  assert.ok(Math.hypot(x - rp, y) < 0.01 * rp, `orbit tidak menutup: ${Math.hypot(x - rp, y)}`);
  n++;
});

t('Bola pengaruh: Bulan di dalam SOI Bumi; Bumi di dalam SOI Matahari', () => {
  const soiE = P.soiRadius(9.5e6, muE, muS);
  const soiM = P.soiRadius(4.2e5, muM, muE);
  assert.ok(soiE > 4.2e5 && soiE < 6e5, `SOI Bumi ${soiE}`);
  assert.ok(soiM > 27000 * 1.5 && soiM < 4.2e5, `SOI Bulan ${soiM}`);
  n += 2;
});

t('Atmosfer: tekanan permukaan Bumi ≈ 1 bar, Venus ≈ 92 bar, Mars ≈ 6 mbar', () => {
  near(P.atmPressure(P.ATMOSPHERES.bumi, 9.8, 0), 1.0e5, 0.05, 'Bumi');
  near(P.atmPressure(P.ATMOSPHERES.venus, 8.9, 0), 9.2e6, 0.06, 'Venus');
  near(P.atmPressure(P.ATMOSPHERES.mars, 3.7, 0), 6.1e2, 0.06, "Mars");
  near(P.atmPressure(P.ATMOSPHERES.jupiter, 24.8, 0), 1.07e5, 0.05, 'Jupiter 1 bar');
});

t('Atmosfer Bumi: tabel AS-1976 (100 km = 5,6e-7; 80 km = 1,85e-5)', () => {
  near(P.atmDensity(P.ATMOSPHERES.bumi, 100e3), 5.604e-7, 1e-9, '100 km');
  near(P.atmDensity(P.ATMOSPHERES.bumi, 80e3), 1.846e-5, 1e-9, '80 km');
  near(P.atmDensity(P.ATMOSPHERES.bumi, 0), 1.225, 1e-9, '0 km');
  let prev = Infinity;
  for (let h = 0; h < 400e3; h += 2e3) { const r = P.atmDensity(P.ATMOSPHERES.bumi, h); assert.ok(r < prev, 'monoton turun'); prev = r; }
  n += 1;
});

t('Drag: kecepatan terminal Bumi & tekanan dinamis', () => {
  const vt = P.terminalVelocity(P.SHIP.mass, 9.8, 1.225, P.SHIP.cdA);
  near(vt, 178.9, 0.005, 'terminal ≈ 179 m/s');
  near(P.dragAccel(1.225, vt, P.SHIP.cdA, P.SHIP.mass), 9.8, 1e-9, 'drag = berat pada terminal');
  near(P.dynamicPressure(1.225, 300), 55125, 1e-9, 'q pada 300 m/s');
  // Mars: angin 24 m/s hanya ~6 Pa
  assert.ok(P.dynamicPressure(0.0155, 24) < 7, 'tekanan dinamis Mars kecil');
  n += 1;
});

t('Sutton–Graves cocok dengan nilai referensi tabel', () => {
  near(P.stagnationHeatFlux(1.85e-5, 7000, 1) / 1e3, 257, 0.02, '80 km 7 km/s');
  near(P.stagnationHeatFlux(5.6e-7, 7500, 1) / 1e3, 55, 0.04, '100 km 7,5 km/s');
  const q1 = P.stagnationHeatFlux(1e-5, 3000, 1), q2 = P.stagnationHeatFlux(1e-5, 6000, 1);
  near(q2 / q1, 8, 1e-9, 'v³: dua kali kecepatan → 8× panas');
  const r1 = P.stagnationHeatFlux(1e-5, 3000, 1), r2 = P.stagnationHeatFlux(4e-5, 3000, 1);
  near(r2 / r1, 2, 1e-9, '√ρ');
});

t('Fluks surya: 1361 di Bumi, kuadrat terbalik di luar, melonjak dekat bintang', () => {
  near(P.solarFlux(9.5e6), 1361, 0.001, 'Bumi');
  near(P.solarFlux(19e6) / P.solarFlux(9.5e6), 0.25, 0.001, '2× jarak → ¼');
  assert.ok(P.solarFlux(P.SUN_R * 1.5) > 1e6, 'dekat Matahari > 1 MW/m²');
  assert.ok(P.solarFlux(P.SUN_R) > 6e7 * 0.99, 'permukaan Matahari ≈ 6,3e7');
  for (let r = P.SUN_R; r < 1e8; r *= 1.3) assert.ok(P.solarFlux(r * 1.3) < P.solarFlux(r), 'monoton turun');
  n += 3;
});

t('Suhu kesetimbangan: pelat hitam 1 AU ≈ 394 K; ubin pada 300 kW/m² ≈ 1580 K', () => {
  near(P.equilibriumTemp(1361, 1, 1), 394, 0.01, 'pelat hitam');
  let T = 300;
  for (let i = 0; i < 400; i++) T = P.skinStep(T, 5, 3e5, P.SHIP.eps, P.SHIP.skinC);
  near(T, Math.pow(3e5 / (P.SHIP.eps * P.SIGMA), 0.25), 0.005, 'kesetimbangan');
  // stabil untuk dt besar
  let T2 = 300;
  for (let i = 0; i < 50; i++) T2 = P.skinStep(T2, 600, 3e5, P.SHIP.eps, P.SHIP.skinC);
  assert.ok(Number.isFinite(T2) && T2 > 1400 && T2 < 1700, `stabil: ${T2}`);
  n += 1;
});

t('Benturan & kerusakan', () => {
  assert.equal(P.impactDamage(P.kineticEnergy(P.SHIP.mass, 5), P.SHIP.legAbsorb), 0, 'mendarat 5 m/s aman');
  const d20 = P.impactDamage(P.kineticEnergy(P.SHIP.mass, 20), P.SHIP.legAbsorb);
  assert.ok(d20 > 0.35 && d20 < 0.5, `20 m/s ≈ 0,41: ${d20}`);
  assert.ok(P.impactDamage(P.kineticEnergy(P.SHIP.mass, 100), P.SHIP.legAbsorb) > 1, '100 m/s menghancurkan');
  near(P.safeLandingSpeed(), 5.77, 0.01, 'kecepatan mendarat aman');
  near(P.kineticEnergy(0.598, 6905) / 1e6, 14.26, 0.002, 'uji NASA 598 g @ 6,9 km/s');
  n += 3;
});

t('Termal kabin: Venus panas, Bumi nyaman', () => {
  // kabin di ruang hampa/Bumi stabil dekat 295 K
  let Tc = 300;
  for (let i = 0; i < 3600; i++) Tc += P.cabinRate(Tc, 288, 288) * 1;
  assert.ok(Tc > 283 && Tc < 300, `kabin Bumi ${Tc}`);
  // di permukaan Venus (kulit 737 K, lingkungan 737 K): pendingin tak berdaya, kabin memanas
  let Tv = 295;
  for (let i = 0; i < 3600; i++) Tv += P.cabinRate(Tv, 737, 737) * 1;
  assert.ok(Tv > 330, `kabin Venus ${Tv}`);
  n += 2;
});

console.log(`\n${n} pernyataan lulus`);
