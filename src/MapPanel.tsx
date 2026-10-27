import { useEffect, useState } from 'react';
import type { Engine, TargetInfo } from './game/engine';
import { fmtDist, fmtSpeed } from './game/screens';

const fmtClock = (sec: number) => (sec >= 86400 ? `${(sec / 86400).toFixed(1)} hr` : sec >= 3600 ? `${(sec / 3600).toFixed(1)} jam` : `${(sec / 60).toFixed(1)} mnt`);

const kindColor = (k: string) => {
  if (k.includes('Bintang')) return '#ffd060';
  if (k.includes('Gas') || k.includes('Es')) return '#e8c898';
  if (k.includes('Satelit')) return '#b6c0cc';
  if (k.includes('Generatif')) return '#d078ff';
  if (k.includes('Kerdil')) return '#c9b9a8';
  if (k.includes('Stasiun') || k.includes('Wahana')) return '#ff9a3c';
  return '#45e3ff';
};

export default function MapPanel({
  engine, targetId, counts, onClose, onAutopilot,
}: {
  engine: Engine;
  targetId: string | null;
  counts: { disc: number; visit: number; landed: number; flags: number; total: number };
  onClose: () => void;
  onAutopilot: () => void;
}) {
  const [list, setList] = useState<TargetInfo[]>([]);
  const [open, setOpen] = useState<string | null>(targetId);

  useEffect(() => {
    const upd = () => setList(engine.listTargets());
    upd();
    const id = setInterval(upd, 700);
    return () => clearInterval(id);
  }, [engine]);

  return (
    <div data-ui className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="w-full max-w-xl max-h-[84vh] flex flex-col rounded-t-3xl border border-cyan-400/30 bg-[#050d14]/95 shadow-[0_-10px_60px_rgba(0,200,255,0.18)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-cyan-300/70 font-mono">PETA · JURNAL</div>
            <div className="text-lg font-semibold text-white">Tata Surya</div>
          </div>
          <button onClick={() => { engine.audio.close(); onClose(); }} className="h-10 w-10 rounded-full border border-white/20 text-white/80 text-lg active:scale-95">✕</button>
        </div>
        <div className="grid grid-cols-4 gap-2 px-5 pb-3 text-center font-mono">
          {[['Temuan', `${counts.disc}/${counts.total}`], ['Orbit', counts.visit], ['Mendarat', counts.landed], ['Bendera', counts.flags]].map(([a, b]) => (
            <div key={a as string} className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 py-1.5">
              <div className="text-base text-cyan-200">{b}</div>
              <div className="text-[9px] uppercase tracking-widest text-white/50">{a}</div>
            </div>
          ))}
        </div>
        <div className="overflow-y-auto px-3 pb-3 flex-1">
          {list.map((t) => {
            const sel = t.id === targetId;
            const isMoon = !!t.parent && t.parent !== 'matahari';
            return (
              <div key={t.id} className={`mb-1 rounded-xl border ${sel ? 'border-amber-400/70 bg-amber-400/10' : 'border-white/10 bg-white/[0.03]'} ${isMoon ? 'ml-5' : ''}`}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  onClick={() => { setOpen(open === t.id ? null : t.id); engine.selectTarget(t.id); }}
                >
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: kindColor(t.kind), boxShadow: `0 0 8px ${kindColor(t.kind)}` }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] text-white leading-tight">{t.name}</span>
                    <span className="block text-[11px] text-white/45">{t.kind}</span>
                  </span>
                  <span className="text-right font-mono text-[11px] text-cyan-200/80">
                    {fmtDist(t.dist)}
                    <span className="block text-[12px] tracking-wider text-amber-300">
                      {t.discovered ? '◉' : ''}{t.landed ? ' ⬇' : ''}{t.flagged ? ' ⚑' : ''}
                    </span>
                  </span>
                </button>
                {open === t.id && t.info && (
                  <div className="px-3 pb-3 text-[13px] text-white/80">
                    <p className="mb-2 leading-snug text-white/70">{t.info.desc}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-cyan-100/80">
                      <span>Radius nyata: {t.info.radiusKm}</span>
                      <span>Radius skala game: {fmtDist(t.radius)}</span>
                      <span>Gravitasi: {t.info.gravity}</span>
                      <span>Suhu: {t.info.temp}</span>
                      <span>Atmosfer: {t.info.atm}</span>
                      {t.circV !== undefined && <span>Orbit rendah: {fmtSpeed(t.circV)}</span>}
                      {t.escV !== undefined && <span>Kec. lepas: {fmtSpeed(t.escV)}</span>}
                      {t.tSurf !== undefined && <span>Suhu permukaan: {Math.round(t.tSurf - 273.15)} °C</span>}
                      {t.pSurf !== undefined && <span>Tekanan: {t.pSurf >= 1000 ? (t.pSurf / 1000).toFixed(t.pSurf > 1e5 ? 0 : 1) + ' kPa' : Math.round(t.pSurf) + ' Pa'}</span>}
                      {t.period !== undefined && <span>Periode orbit: {fmtClock(t.period)}</span>}
                      {t.soi !== undefined && <span>Bola pengaruh: {fmtDist(t.soi)}</span>}
                      {t.life && <span className="col-span-2">Kehidupan: <b className={t.life === 'Tidak ada' ? 'text-white/60' : 'text-emerald-300'}>{t.life}</b></span>}
                      {t.hazards && <span className="col-span-2">Bahaya: <b className="text-amber-200">{t.hazards.join(' · ')}</b></span>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => { onAutopilot(); onClose(); }} className="flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-black active:scale-95">▶ Autopilot</button>
                      <button onClick={() => engine.scanTarget()} className="flex-1 rounded-xl border border-cyan-300/50 py-2.5 text-sm text-cyan-200 active:scale-95">Pindai</button>
                      <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white/80 active:scale-95">Pilih</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="p-3 pt-1" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => { engine.spawnWorld(); setList(engine.listTargets()); }}
            className="w-full rounded-2xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 py-3 text-sm font-semibold text-fuchsia-100 active:scale-[0.98]"
          >
            ✨ Bangkitkan Dunia Baru (generatif)
          </button>
        </div>
      </div>
    </div>
  );
}
