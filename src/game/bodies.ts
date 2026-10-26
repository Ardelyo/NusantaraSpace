// Definisi tata surya: data benda langit + generator dunia acak

export type Style =
  | 'earth' | 'mars' | 'moon' | 'mercury' | 'venus' | 'io' | 'europa' | 'ganymede' | 'callisto'
  | 'titan' | 'enceladus' | 'triton' | 'pluto' | 'ceres' | 'rock' | 'alien' | 'sun' | 'gas';

export type RGB = [number, number, number];

export interface BodyDef {
  id: string;
  name: string;
  kind: string;
  radius: number;
  parent: string | null;
  dist: number;
  speed: number; // kecepatan orbit (unit/detik)
  phase: number;
  incl: number;
  spin: number; // rad/detik
  tilt: number;
  g: number; // m/s2 permukaan
  style: Style;
  seed: number;
  t?: { amp: number; freq: number; cont: number; ridge: number; rough: number; crater: number; sea: number | null; cracks?: boolean };
  atm?: { color: RGB; fog: RGB; h: number; dens: number };
  clouds?: { color: RGB; cover: number; speed: number; height: number };
  gas?: { colors: RGB[]; bands: number; storm?: RGB; stormPos?: [number, number]; turb: number };
  rings?: { inner: number; outer: number; color: RGB; alpha: number; seed: number };
  palette?: { liquid: RGB; shore: RGB; low: RGB; mid: RGB; high: RGB; cap: RGB; seaColor2: RGB };
  fixedPos?: [number, number, number];
  info: { radiusKm: string; gravity: string; temp: string; atm: string; desc: string };
}

const T = (amp: number, freq: number, cont: number, ridge: number, rough: number, crater: number, sea: number | null, cracks = false) => ({
  amp, freq, cont, ridge, rough, crater, sea, cracks,
});

export const SUN_RADIUS = 800000;

export function makeSolarSystem(): BodyDef[] {
  const B: BodyDef[] = [];
  const add = (b: BodyDef) => B.push(b);

  add({
    id: 'matahari', name: 'Matahari', kind: 'Bintang', radius: SUN_RADIUS, parent: null, dist: 0, speed: 0, phase: 0, incl: 0,
    spin: 0.0003, tilt: 0, g: 274, style: 'sun', seed: 1,
    info: { radiusKm: '696.340 km', gravity: '274 m/s²', temp: '5.500 °C (permukaan)', atm: 'Korona plasma', desc: 'Bintang kelas G yang menampung 99,8% massa tata surya. Jangan mendekat terlalu dalam — perisai panas kapal terbatas.' },
  });

  add({
    id: 'merkurius', name: 'Merkurius', kind: 'Planet', radius: 38000, parent: 'matahari', dist: 5000000, speed: 250, phase: 0.6, incl: 0.02,
    spin: 0.0008, tilt: 0.02, g: 3.7, style: 'mercury', seed: 11, t: T(1700, 1.7, 0.4, 0.3, 1, 1, null),
    info: { radiusKm: '2.440 km', gravity: '3,7 m/s²', temp: '-180 s/d 430 °C', atm: 'Nyaris hampa', desc: 'Planet terkecil dan terdekat dari Matahari. Permukaannya penuh kawah purba akibat tumbukan.' },
  });

  add({
    id: 'venus', name: 'Venus', kind: 'Planet', radius: 95000, parent: 'matahari', dist: 7000000, speed: 190, phase: 2.2, incl: 0.03,
    spin: -0.0006, tilt: 3.0, g: 8.9, style: 'venus', seed: 21, t: T(2400, 1.4, 0.8, 0.6, 1, 0.05, null),
    atm: { color: [1.0, 0.68, 0.28], fog: [0.88, 0.62, 0.3], h: 2200, dens: 1 / 9000 },
    clouds: { color: [0.95, 0.85, 0.6], cover: 0.95, speed: 0.01, height: 0.03 },
    info: { radiusKm: '6.052 km', gravity: '8,9 m/s²', temp: '465 °C', atm: 'CO₂ pekat, awan asam sulfat', desc: 'Planet terpanas akibat efek rumah kaca ekstrem. Dataran vulkanik tertutup awan kuning tebal.' },
  });

  add({
    id: 'bumi', name: 'Bumi', kind: 'Planet', radius: 100000, parent: 'matahari', dist: 9500000, speed: 130, phase: 4.0, incl: 0,
    spin: 0.0052, tilt: 0.41, g: 9.8, style: 'earth', seed: 31, t: T(2700, 1.6, 1, 1, 1, 0, 0.1),
    atm: { color: [0.28, 0.52, 1.0], fog: [0.56, 0.74, 0.97], h: 1300, dens: 1 / 24000 },
    clouds: { color: [1, 1, 1], cover: 0.5, speed: 0.02, height: 0.011 },
    info: { radiusKm: '6.371 km', gravity: '9,8 m/s²', temp: '15 °C (rata-rata)', atm: 'N₂ 78%, O₂ 21%', desc: 'Rumah kita. Satu-satunya dunia yang diketahui menopang kehidupan: samudra, hutan hujan, gurun, dan es kutub.' },
  });

  add({
    id: 'bulan', name: 'Bulan', kind: 'Satelit Bumi', radius: 27000, parent: 'bumi', dist: 420000, speed: 230, phase: 1.1, incl: 0.09,
    spin: 0.002, tilt: 0.03, g: 1.62, style: 'moon', seed: 41, t: T(1500, 1.8, 0.7, 0.3, 1, 1, null),
    info: { radiusKm: '1.737 km', gravity: '1,62 m/s²', temp: '-170 s/d 120 °C', atm: 'Hampa', desc: 'Satu-satunya satelit alami Bumi. Dataran gelap "mare" dan kawah tumbukan raksasa.' },
  });

  add({
    id: 'mars', name: 'Mars', kind: 'Planet', radius: 53000, parent: 'matahari', dist: 13000000, speed: 105, phase: 5.3, incl: 0.03,
    spin: 0.0046, tilt: 0.44, g: 3.7, style: 'mars', seed: 51, t: T(3600, 1.5, 0.8, 0.9, 1, 0.45, null),
    atm: { color: [0.95, 0.6, 0.4], fog: [0.86, 0.62, 0.48], h: 1000, dens: 1 / 50000 },
    info: { radiusKm: '3.390 km', gravity: '3,7 m/s²', temp: '-63 °C (rata-rata)', atm: 'CO₂ tipis', desc: 'Planet merah dengan gunung berapi raksasa, ngarai dalam, dan tudung es kutub.' },
  });
  add({
    id: 'phobos', name: 'Phobos', kind: 'Satelit Mars', radius: 4200, parent: 'mars', dist: 100000, speed: 120, phase: 0.3, incl: 0.02,
    spin: 0.003, tilt: 0, g: 0.006, style: 'rock', seed: 52, t: T(1100, 1.0, 1.0, 0, 1, 1, null),
    info: { radiusKm: '11 km', gravity: '0,006 m/s²', temp: '-40 °C', atm: 'Hampa', desc: 'Bulan kecil berbentuk kentang yang mengorbit sangat rendah di atas Mars.' },
  });
  add({
    id: 'deimos', name: 'Deimos', kind: 'Satelit Mars', radius: 3000, parent: 'mars', dist: 165000, speed: 100, phase: 3.3, incl: 0.03,
    spin: 0.002, tilt: 0, g: 0.003, style: 'rock', seed: 53, t: T(800, 1.0, 1.0, 0, 1, 1, null),
    info: { radiusKm: '6 km', gravity: '0,003 m/s²', temp: '-40 °C', atm: 'Hampa', desc: 'Bulan terkecil Mars; permukaannya tertutup debu halus.' },
  });

  add({
    id: 'ceres', name: 'Ceres', kind: 'Planet Kerdil', radius: 15000, parent: 'matahari', dist: 17500000, speed: 95, phase: 1.4, incl: 0.04,
    spin: 0.003, tilt: 0.05, g: 0.28, style: 'ceres', seed: 61, t: T(700, 1.8, 0.6, 0.2, 1, 0.9, null),
    info: { radiusKm: '470 km', gravity: '0,28 m/s²', temp: '-105 °C', atm: 'Hampa', desc: 'Benda terbesar di sabuk asteroid. Bintik-bintik terang di dasar kawahnya adalah endapan garam.' },
  });

  add({
    id: 'jupiter', name: 'Jupiter', kind: 'Raksasa Gas', radius: 420000, parent: 'matahari', dist: 25000000, speed: 82, phase: 0.2, incl: 0.02,
    spin: 0.007, tilt: 0.05, g: 24.8, style: 'gas', seed: 71,
    gas: { colors: [[0.84, 0.72, 0.56], [0.62, 0.42, 0.28], [0.93, 0.88, 0.78], [0.5, 0.33, 0.24]], bands: 15, storm: [0.8, 0.32, 0.18], stormPos: [0.55, -0.25], turb: 1.0 },
    atm: { color: [0.85, 0.65, 0.45], fog: [0.8, 0.62, 0.45], h: 6000, dens: 1 / 90000 },
    rings: { inner: 1.55, outer: 1.75, color: [0.5, 0.45, 0.4], alpha: 0.12, seed: 3 },
    info: { radiusKm: '69.911 km', gravity: '24,8 m/s²', temp: '-110 °C (puncak awan)', atm: 'H₂ & He', desc: 'Planet terbesar. Badai Bintik Merah Raksasa telah mengamuk lebih dari 300 tahun.' },
  });
  add({
    id: 'io', name: 'Io', kind: 'Satelit Jupiter', radius: 29000, parent: 'jupiter', dist: 900000, speed: 280, phase: 0.5, incl: 0.01,
    spin: 0.003, tilt: 0, g: 1.8, style: 'io', seed: 72, t: T(2400, 1.6, 0.5, 0.7, 1, 0.1, null),
    info: { radiusKm: '1.821 km', gravity: '1,8 m/s²', temp: '-130 °C', atm: 'SO₂ sangat tipis', desc: 'Benda paling aktif secara vulkanik di tata surya, dilapisi belerang kuning-oranye.' },
  });
  add({
    id: 'europa', name: 'Europa', kind: 'Satelit Jupiter', radius: 25000, parent: 'jupiter', dist: 1150000, speed: 250, phase: 2.5, incl: 0.01,
    spin: 0.003, tilt: 0, g: 1.3, style: 'europa', seed: 73, t: T(350, 1.7, 0.3, 0.1, 0.6, 0.08, null, true),
    info: { radiusKm: '1.561 km', gravity: '1,3 m/s²', temp: '-160 °C', atm: 'O₂ tipis', desc: 'Kerak es retak-retak di atas samudra air asin global — kandidat kuat kehidupan.' },
  });
  add({
    id: 'ganymede', name: 'Ganymede', kind: 'Satelit Jupiter', radius: 42000, parent: 'jupiter', dist: 1500000, speed: 230, phase: 4.2, incl: 0.01,
    spin: 0.003, tilt: 0, g: 1.43, style: 'ganymede', seed: 74, t: T(1000, 1.5, 0.6, 0.4, 1, 0.5, null, true),
    info: { radiusKm: '2.634 km', gravity: '1,43 m/s²', temp: '-163 °C', atm: 'O₂ tipis', desc: 'Satelit terbesar di tata surya — lebih besar dari Merkurius, punya medan magnet sendiri.' },
  });
  add({
    id: 'callisto', name: 'Callisto', kind: 'Satelit Jupiter', radius: 38000, parent: 'jupiter', dist: 2000000, speed: 210, phase: 5.8, incl: 0.01,
    spin: 0.002, tilt: 0, g: 1.24, style: 'callisto', seed: 75, t: T(900, 1.7, 0.4, 0.2, 1, 1, null),
    info: { radiusKm: '2.410 km', gravity: '1,24 m/s²', temp: '-139 °C', atm: 'CO₂ tipis', desc: 'Salah satu permukaan paling berkawah di tata surya, sangat tua dan gelap.' },
  });

  add({
    id: 'saturnus', name: 'Saturnus', kind: 'Raksasa Gas', radius: 350000, parent: 'matahari', dist: 36000000, speed: 62, phase: 3.1, incl: 0.02,
    spin: 0.0065, tilt: 0.47, g: 10.4, style: 'gas', seed: 81,
    gas: { colors: [[0.9, 0.82, 0.62], [0.82, 0.71, 0.5], [0.94, 0.88, 0.72], [0.72, 0.6, 0.42]], bands: 11, turb: 0.5 },
    atm: { color: [0.9, 0.78, 0.5], fog: [0.85, 0.75, 0.55], h: 6000, dens: 1 / 90000 },
    rings: { inner: 1.25, outer: 2.35, color: [0.86, 0.78, 0.62], alpha: 0.95, seed: 8 },
    info: { radiusKm: '58.232 km', gravity: '10,4 m/s²', temp: '-140 °C', atm: 'H₂ & He', desc: 'Permata tata surya dengan cincin es dan batu yang membentang ratusan ribu kilometer.' },
  });
  add({
    id: 'enceladus', name: 'Enceladus', kind: 'Satelit Saturnus', radius: 9000, parent: 'saturnus', dist: 1000000, speed: 220, phase: 1.2, incl: 0.01,
    spin: 0.003, tilt: 0, g: 0.11, style: 'enceladus', seed: 82, t: T(500, 1.6, 0.4, 0.1, 0.5, 0.25, null, true),
    info: { radiusKm: '252 km', gravity: '0,11 m/s²', temp: '-198 °C', atm: 'Uap air (geyser)', desc: 'Bulan es putih bersih dengan geyser air menyembur dari "garis harimau" di kutub selatan.' },
  });
  add({
    id: 'titan', name: 'Titan', kind: 'Satelit Saturnus', radius: 41000, parent: 'saturnus', dist: 1900000, speed: 190, phase: 4.6, incl: 0.01,
    spin: 0.002, tilt: 0, g: 1.35, style: 'titan', seed: 83, t: T(900, 1.5, 0.9, 0.5, 1, 0.03, 0.08),
    atm: { color: [0.95, 0.58, 0.2], fog: [0.78, 0.5, 0.2], h: 4000, dens: 1 / 7000 },
    info: { radiusKm: '2.575 km', gravity: '1,35 m/s²', temp: '-179 °C', atm: 'N₂ pekat + metana', desc: 'Satu-satunya bulan dengan atmosfer tebal. Danau metana cair dan bukit pasir hidrokarbon.' },
  });

  add({
    id: 'uranus', name: 'Uranus', kind: 'Raksasa Es', radius: 180000, parent: 'matahari', dist: 47000000, speed: 46, phase: 5.0, incl: 0.01,
    spin: 0.005, tilt: 1.45, g: 8.9, style: 'gas', seed: 91,
    gas: { colors: [[0.62, 0.86, 0.9], [0.56, 0.82, 0.88], [0.7, 0.9, 0.94], [0.5, 0.78, 0.86]], bands: 5, turb: 0.2 },
    atm: { color: [0.5, 0.85, 0.95], fog: [0.6, 0.85, 0.9], h: 5000, dens: 1 / 80000 },
    rings: { inner: 1.6, outer: 2.0, color: [0.6, 0.65, 0.7], alpha: 0.35, seed: 5 },
    info: { radiusKm: '25.362 km', gravity: '8,9 m/s²', temp: '-195 °C', atm: 'H₂, He, metana', desc: 'Raksasa es biru-kehijauan yang berputar miring 98° — menggelinding mengelilingi Matahari.' },
  });

  add({
    id: 'neptunus', name: 'Neptunus', kind: 'Raksasa Es', radius: 175000, parent: 'matahari', dist: 57000000, speed: 37, phase: 0.9, incl: 0.02,
    spin: 0.005, tilt: 0.5, g: 11.2, style: 'gas', seed: 101,
    gas: { colors: [[0.18, 0.34, 0.88], [0.12, 0.26, 0.76], [0.3, 0.52, 0.96], [0.08, 0.18, 0.6]], bands: 7, storm: [0.04, 0.08, 0.3], stormPos: [0.3, -0.35], turb: 0.7 },
    atm: { color: [0.3, 0.5, 1.0], fog: [0.25, 0.4, 0.8], h: 5000, dens: 1 / 80000 },
    info: { radiusKm: '24.622 km', gravity: '11,2 m/s²', temp: '-200 °C', atm: 'H₂, He, metana', desc: 'Dunia berangin paling kencang — hingga 2.000 km/jam — dengan biru tua yang pekat.' },
  });
  add({
    id: 'triton', name: 'Triton', kind: 'Satelit Neptunus', radius: 22000, parent: 'neptunus', dist: 700000, speed: 180, phase: 2.0, incl: 0.2,
    spin: 0.002, tilt: 0, g: 0.78, style: 'triton', seed: 102, t: T(700, 1.7, 0.6, 0.3, 1, 0.2, null),
    info: { radiusKm: '1.353 km', gravity: '0,78 m/s²', temp: '-235 °C', atm: 'N₂ sangat tipis', desc: 'Mengorbit berlawanan arah putar planet — kemungkinan objek Sabuk Kuiper yang tertangkap.' },
  });

  add({
    id: 'pluto', name: 'Pluto', kind: 'Planet Kerdil', radius: 20000, parent: 'matahari', dist: 65000000, speed: 30, phase: 3.6, incl: 0.2,
    spin: 0.002, tilt: 2.0, g: 0.62, style: 'pluto', seed: 111, t: T(1600, 1.5, 1, 0.6, 1, 0.25, null),
    atm: { color: [0.55, 0.65, 0.95], fog: [0.5, 0.55, 0.7], h: 1500, dens: 1 / 300000 },
    info: { radiusKm: '1.188 km', gravity: '0,62 m/s²', temp: '-230 °C', atm: 'N₂ sangat tipis', desc: 'Dunia es di tepi Sabuk Kuiper dengan dataran nitrogen berbentuk hati dan pegunungan es air.' },
  });

  return B;
}

// ---------- Generator dunia acak ----------
function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export function generateWorld(seed: number, index: number, pos: [number, number, number]): BodyDef {
  let s = seed;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const names = ['Nusantara', 'Kalimaya', 'Sriwijaya', 'Arunika', 'Baskara', 'Cendana', 'Dwipa', 'Sagara', 'Wanadri', 'Tirta', 'Pralaya', 'Aksara'];
  const name = `${names[Math.floor(r() * names.length)]}-${index}`;
  const hue = r();
  const hue2 = (hue + 0.25 + r() * 0.3) % 1;
  const sea = r() < 0.65 ? 0.05 + r() * 0.2 : null;
  const hasAtm = r() < 0.85;
  const radius = 45000 + r() * 55000;
  const sat = 0.35 + r() * 0.4;
  const palette = {
    liquid: hsl((hue + 0.5) % 1, 0.7, 0.18),
    seaColor2: hsl((hue + 0.5) % 1, 0.6, 0.42),
    shore: hsl(hue2, 0.4, 0.62),
    low: hsl(hue, sat, 0.3),
    mid: hsl((hue + 0.08) % 1, sat, 0.42),
    high: hsl(hue2, 0.2, 0.72),
    cap: [0.95, 0.97, 1] as RGB,
  };
  const atmHue = (hue + 0.55) % 1;
  return {
    id: `gen${index}`, name, kind: 'Dunia Generatif', radius, parent: null, dist: 0, speed: 0, phase: 0, incl: 0,
    spin: 0.002 + r() * 0.005, tilt: r() * 0.7, g: 3 + r() * 10, style: 'alien', seed: Math.floor(r() * 9000) + 200,
    t: T(1800 + r() * 2500, 1.2 + r() * 1.2, 0.9, 0.5 + r() * 0.6, 1, r() < 0.3 ? 0.4 : 0, sea),
    atm: hasAtm
      ? { color: hsl(atmHue, 0.9, 0.58), fog: hsl(atmHue, 0.5, 0.7), h: 1000 + r() * 1500, dens: 1 / (14000 + r() * 30000) }
      : undefined,
    clouds: hasAtm && r() < 0.6 ? { color: [1, 0.98, 0.95], cover: 0.3 + r() * 0.4, speed: 0.02, height: 0.01 } : undefined,
    rings: r() < 0.25 ? { inner: 1.4, outer: 2.0 + r(), color: hsl(hue2, 0.3, 0.6), alpha: 0.7, seed: Math.floor(r() * 50) } : undefined,
    palette,
    fixedPos: pos,
    info: {
      radiusKm: `${Math.round(radius / 15.7)} km`,
      gravity: '? m/s²',
      temp: 'Tidak diketahui',
      atm: hasAtm ? 'Atmosfer terdeteksi' : 'Hampa',
      desc: 'Dunia yang baru dibangkitkan secara prosedural oleh mesin generatif kapal. Belum ada manusia yang pernah menjejakkan kaki di sini.',
    },
  };
}
