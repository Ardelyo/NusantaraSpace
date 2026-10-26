import { useEffect, useState } from 'react';
import type { Engine } from './game/engine';
import { MISSIONS } from './game/missions';
import { HAZARDS } from './game/hazards';

export default function MissionPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const log = engine.missions;
  const done = log.doneCount();

  return (
    <div data-ui className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 backdrop-blur-[2px] md:items-center" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl border border-cyan-400/30 bg-[#050d14]/95 shadow-[0_-10px_60px_rgba(0,200,255,0.18)] md:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-cyan-300/70">PUSAT MISI · JURNAL</div>
            <div className="text-lg font-semibold text-white">Misi & Bahaya Planet</div>
          </div>
          <button onClick={() => { engine.audio.close(); onClose(); }} className="h-10 w-10 rounded-full border border-white/20 text-lg text-white/80 active:scale-95">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-5 pb-3 text-center font-mono">
          {[['Selesai', `${done}/${MISSIONS.length}`], ['Kredit', `◈ ${engine.credits}`], ['Sampel', engine.samplesHeld]].map(([a, b]) => (
            <div key={a as string} className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 py-1.5">
              <div className="text-base text-cyan-200">{b}</div>
              <div className="text-[9px] uppercase tracking-widest text-white/50">{a}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3" data-scroll>
          {MISSIONS.map((m) => {
            const s = log.state[m.id];
            const tracked = log.tracked === m.id;
            return (
              <div key={m.id} className={`mb-1.5 rounded-xl border px-3 py-2.5 ${s.status === 'done' ? 'border-emerald-400/30 bg-emerald-400/5' : s.status === 'locked' ? 'border-white/10 bg-white/[0.02] opacity-55' : tracked ? 'border-amber-400/70 bg-amber-400/10' : 'border-white/15 bg-white/[0.04]'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{s.status === 'done' ? '✔' : s.status === 'locked' ? '🔒' : m.icon}</span>
                  <span className="flex-1 text-[15px] leading-tight text-white">{m.title}</span>
                  <span className="font-mono text-[11px] text-amber-200">◈ {m.reward}</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-white/60">{m.brief}</p>
                {s.status === 'locked' && <p className="mt-1 font-mono text-[10px] text-white/40">Butuh: {m.requires!.map((r) => MISSIONS.find((x) => x.id === r)!.title).join(', ')}</p>}
                {s.status !== 'locked' && (
                  <ol className="mt-1.5 space-y-0.5">
                    {m.steps.map((st, i) => {
                      const isDone = s.status === 'done' || i < s.step;
                      const cur = s.status === 'active' && i === s.step;
                      const need = st.need ?? 1;
                      return (
                        <li key={i} className={`flex gap-2 text-[12px] leading-snug ${isDone ? 'text-emerald-300/80 line-through decoration-emerald-300/40' : cur ? 'text-white' : 'text-white/40'}`}>
                          <span className="w-4 shrink-0 text-center">{isDone ? '✓' : cur ? '▶' : '·'}</span>
                          <span className="flex-1">{st.text}{cur && need > 1 ? ` — ${Math.floor(s.prog)}/${need}${st.unit ? ' ' + st.unit : ''}` : ''}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {s.status === 'active' && !tracked && (
                  <button onClick={() => { log.track(m.id); engine.audio.select(); force((n) => n + 1); }} className="mt-2 rounded-lg border border-amber-300/50 px-3 py-1 text-[12px] text-amber-100 active:scale-95">Lacak misi ini</button>
                )}
                {tracked && <div className="mt-1.5 font-mono text-[10px] tracking-widest text-amber-300">● DILACAK</div>}
              </div>
            );
          })}

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1.5 font-mono text-[11px] tracking-widest text-cyan-300/70">ENSIKLOPEDIA BAHAYA</div>
            <div className="space-y-1.5">
              {(Object.keys(HAZARDS) as (keyof typeof HAZARDS)[]).map((k) => (
                <div key={k} className="text-[12px] leading-snug text-white/70"><span className="mr-1">{HAZARDS[k].icon}</span><b className="text-white/90">{HAZARDS[k].label}</b> — {HAZARDS[k].desc}</div>
              ))}
            </div>
          </div>
          <button
            onClick={() => { if (confirm('Hapus semua progres tersimpan (misi, kredit, basecamp, modul stasiun)?')) engine.resetSave(); }}
            className="mt-3 w-full rounded-xl border border-red-400/30 py-2 text-[12px] text-red-200/80 active:scale-95"
          >
            Hapus data tersimpan & mulai ulang
          </button>
        </div>
      </div>
    </div>
  );
}
