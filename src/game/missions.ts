// Sistem misi: rangkaian tujuan yang bereaksi pada kejadian dalam permainan
export interface StepDef {
  text: string;
  ev: string;
  test?: (d: any) => boolean;
  need?: number; // total yang dibutuhkan (default 1)
  acc?: (d: any) => number; // jumlah yang ditambahkan per kejadian (default 1)
  hint?: string; // penanda tujuan: body:id | hab:station | hab:base | sample | fauna | flora | rover
  unit?: string;
}

export interface MissionDef {
  id: string;
  title: string;
  brief: string;
  icon: string;
  reward: number;
  requires?: string[];
  steps: StepDef[];
}

const body = (id: string) => (d: any) => d.body === id;

export const MISSIONS: MissionDef[] = [
  {
    id: 'dock', title: 'Kunjungan ke Stasiun Kartika', icon: '🛰', reward: 150,
    brief: 'Stasiun modular Kartika mengorbit Bumi. Sandarkan kapal, masuk, lalu coba pasang & lepas modulnya.',
    steps: [
      { text: 'Terbang ke Stasiun Kartika dan sandar (tombol SANDAR saat dekat & pelan)', ev: 'dock', hint: 'hab:station' },
      { text: 'Masuk ke stasiun lewat dermaga', ev: 'enter-hab', test: (d) => d.kind === 'station', hint: 'hab:station' },
      { text: 'Pasang satu modul baru lewat Konsol Modul di Hub (tekan H)', ev: 'attach', test: (d) => d.kind === 'station' },
      { text: 'Lepas satu modul dari stasiun', ev: 'detach', test: (d) => d.kind === 'station' },
    ],
  },
  {
    id: 'flare', title: 'Badai Matahari', icon: '☀', reward: 200,
    brief: 'Semburan surya akan datang. Berlindung di kapal atau habitat sampai radiasi mereda.',
    steps: [{ text: 'Berlindung selama semburan surya (20 dtk)', ev: 'shelter-tick', test: (d) => d.type === 'flare', need: 20, acc: (d) => d.dt, unit: 'dtk' }],
  },
  {
    id: 'moon', title: 'Langkah Pertama di Bulan', icon: '🌙', reward: 300,
    brief: 'Dirikan basecamp pertama Anda di Bulan dan kumpulkan sampel regolit.',
    steps: [
      { text: 'Mendaratlah di Bulan', ev: 'land', test: body('bulan'), hint: 'body:bulan' },
      { text: 'Keluar (EVA) dan dirikan Basecamp (tombol K / ⛺)', ev: 'deploy-base', test: body('bulan') },
      { text: 'Kumpulkan 3 sampel regolit (tanda hijau berdenyut)', ev: 'sample', test: body('bulan'), need: 3, hint: 'sample' },
      { text: 'Analisis sampel di Laboratorium (tambahkan modul Lab)', ev: 'analyze' },
    ],
  },
  {
    id: 'life', title: 'Jejak Kehidupan', icon: '🌿', reward: 250,
    brief: 'Bumi menyimpan keanekaragaman hayati. Pindai flora dan fauna dengan tombol aksi.',
    steps: [
      { text: 'Mendaratlah di Bumi', ev: 'land', test: body('bumi'), hint: 'body:bumi' },
      { text: 'Pindai 2 satwa liar (dekati hingga prompt muncul)', ev: 'scan-fauna', need: 2, hint: 'fauna' },
      { text: 'Pindai 2 tumbuhan', ev: 'scan-flora', need: 2, hint: 'flora' },
    ],
  },
  {
    id: 'mars', title: 'Merah Berdebu', icon: '🔴', reward: 500, requires: ['moon'],
    brief: 'Mars terkenal dengan badai debu raksasa. Dirikan basecamp, berlindung, lalu ambil sampel setelahnya.',
    steps: [
      { text: 'Mendaratlah di Mars', ev: 'land', test: body('mars'), hint: 'body:mars' },
      { text: 'Dirikan Basecamp di Mars', ev: 'deploy-base', test: body('mars') },
      { text: 'Berlindung di basecamp saat badai debu (30 dtk) — perhatikan peringatan cuaca', ev: 'shelter-tick', test: (d) => d.type === 'dust' && d.body === 'mars' && d.hab, need: 30, acc: (d) => d.dt, unit: 'dtk', hint: 'hab:base' },
      { text: 'Kumpulkan 3 sampel tanah Mars', ev: 'sample', test: body('mars'), need: 3, hint: 'sample' },
    ],
  },
  {
    id: 'venus', title: 'Awan Asam', icon: '☣', reward: 200,
    brief: 'Atmosfer Venus ganas. Terbang rendah di bawah awan dan bertahan dari hujan asam.',
    steps: [
      { text: 'Terbang di ketinggian < 8 km di atas Venus (20 dtk)', ev: 'low-flight', test: (d) => d.body === 'venus' && d.alt < 8000, need: 20, acc: (d) => d.dt, unit: 'dtk', hint: 'body:venus' },
      { text: 'Bertahan sampai hujan asam datang', ev: 'hazard-start', test: (d) => d.type === 'acid' },
    ],
  },
  {
    id: 'io', title: 'Gunung Api Io', icon: '🌋', reward: 350,
    brief: 'Io adalah dunia paling vulkanik. Saksikan letusan dan ambil sampel belerang.',
    steps: [
      { text: 'Mendaratlah di Io', ev: 'land', test: body('io'), hint: 'body:io' },
      { text: 'Saksikan letusan vulkanik', ev: 'hazard-start', test: (d) => d.type === 'ash' && d.body === 'io' },
      { text: 'Kumpulkan 2 sampel belerang', ev: 'sample', test: body('io'), need: 2, hint: 'sample' },
    ],
  },
  {
    id: 'europa', title: 'Es Europa', icon: '❄', reward: 300,
    brief: 'Di bawah kerak es Europa mungkin ada samudra yang menyimpan kehidupan.',
    steps: [
      { text: 'Mendaratlah di Europa', ev: 'land', test: body('europa'), hint: 'body:europa' },
      { text: 'Kumpulkan 2 sampel es', ev: 'sample', test: body('europa'), need: 2, hint: 'sample' },
      { text: 'Analisis di Laboratorium (basecamp atau stasiun)', ev: 'analyze' },
    ],
  },
  {
    id: 'rover', title: 'Penjelajah Roda Enam', icon: '⛟', reward: 250,
    brief: 'Rover memperluas jangkauan Anda di permukaan. Panggil dari Garasi atau tombol R, lalu berkendara.',
    steps: [
      { text: 'Panggil Rover (EVA di permukaan padat, tekan R)', ev: 'rover-call' },
      { text: 'Berkendara sejauh 1.500 m', ev: 'rover-drive', need: 1500, acc: (d) => d.dist, unit: 'm' },
    ],
  },
  {
    id: 'newworld', title: 'Dunia Baru', icon: '✨', reward: 400,
    brief: 'Bangkitkan dunia generatif dari peta, kunjungi, dan temukan kehidupan atau bahayanya.',
    steps: [
      { text: 'Bangkitkan dunia generatif (Peta → ✨)', ev: 'spawn-world' },
      { text: 'Mendaratlah di dunia generatif', ev: 'land', test: (d) => !!d.gen, hint: 'body:gen' },
      { text: 'Alami bencana atau pindai kehidupan di sana', ev: 'new-world-event' },
    ],
  },
];

export interface MState { status: 'locked' | 'active' | 'done'; step: number; prog: number }
export interface MEvent { kind: 'step' | 'done' | 'progress'; mission: MissionDef; text: string; reward?: number }

export class MissionLog {
  state: Record<string, MState> = {};
  tracked: string | null = null;

  constructor() {
    for (const m of MISSIONS) this.state[m.id] = { status: m.requires?.length ? 'locked' : 'active', step: 0, prog: 0 };
    this.tracked = 'dock';
  }

  def(id: string) { return MISSIONS.find((m) => m.id === id)!; }

  emit(ev: string, data: any = {}): MEvent[] {
    const out: MEvent[] = [];
    for (const m of MISSIONS) {
      const s = this.state[m.id];
      if (s.status !== 'active') continue;
      const st = m.steps[s.step];
      if (!st || st.ev !== ev) continue;
      if (st.test && !st.test(data)) continue;
      const add = st.acc ? st.acc(data) : 1;
      s.prog += add;
      const need = st.need ?? 1;
      if (s.prog >= need) {
        s.step++;
        s.prog = 0;
        if (s.step >= m.steps.length) {
          s.status = 'done';
          out.push({ kind: 'done', mission: m, text: m.title, reward: m.reward });
          // buka misi berikutnya
          for (const o of MISSIONS) {
            const os = this.state[o.id];
            if (os.status === 'locked' && o.requires!.every((r) => this.state[r].status === 'done')) {
              os.status = 'active';
              out.push({ kind: 'step', mission: o, text: `Misi baru terbuka: ${o.title}` });
            }
          }
          if (this.tracked === m.id) this.tracked = this.nextActive();
        } else {
          out.push({ kind: 'step', mission: m, text: m.steps[s.step].text });
        }
      } else if (st.need && st.need > 1 && Math.floor(s.prog) !== Math.floor(s.prog - add) && (st.unit !== 'dtk' && st.unit !== 'm')) {
        out.push({ kind: 'progress', mission: m, text: `${m.title}: ${Math.floor(s.prog)}/${need}` });
      }
    }
    return out;
  }

  nextActive(): string | null {
    for (const m of MISSIONS) if (this.state[m.id].status === 'active') return m.id;
    return null;
  }

  track(id: string) { if (this.state[id]?.status === 'active') this.tracked = id; }

  currentStep(id: string | null): { mission: MissionDef; step: StepDef; prog: number; index: number } | null {
    if (!id) return null;
    const m = this.def(id);
    const s = this.state[id];
    if (s.status !== 'active') return null;
    return { mission: m, step: m.steps[s.step], prog: s.prog, index: s.step };
  }

  doneCount() { return MISSIONS.filter((m) => this.state[m.id].status === 'done').length; }

  toJSON() { return { state: this.state, tracked: this.tracked }; }
  load(j: any) {
    if (!j || !j.state) return;
    for (const m of MISSIONS) {
      const s = j.state[m.id];
      if (s && (s.status === 'active' || s.status === 'done' || s.status === 'locked')) this.state[m.id] = { status: s.status, step: Math.min(s.step | 0, m.steps.length - 1), prog: +s.prog || 0 };
    }
    this.tracked = j.tracked && this.state[j.tracked]?.status === 'active' ? j.tracked : this.nextActive();
  }
}
