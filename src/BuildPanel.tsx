import { useEffect, useState } from 'react';
import type { Engine, BuildState } from './game/engine';
import { MOD_DEFS, BUILD_ORDER, SIDE_NAMES, type ModType } from './game/modules';

const CS = 66; // ukuran sel di peta (px)
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export default function BuildPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [st, setSt] = useState<BuildState | null>(engine.getBuildState());
  const [sel, setSel] = useState<{ kind: 'mod' | 'slot'; key: string } | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setSt(engine.getBuildState()), 350);
    return () => clearInterval(id);
  }, [engine]);

  if (!st) {
    return (
      <Shell onClose={() => { engine.audio.close(); onClose(); }} title="Konsol Modul">
        <p className="p-5 text-sm text-white/70">Tidak ada habitat di dekat Anda. Dekati Stasiun Kartika atau Basecamp (≤ 150 m), atau masuk ke dalamnya.</p>
      </Shell>
    );
  }

  // kumpulkan sel slot unik
  const slotCells = new Map<string, { ix: number; iz: number }>();
  for (const s of st.slots) slotCells.set(`${s.ix},${s.iz}`, { ix: s.ix, iz: s.iz });
  const xs = [...st.mods.map((m) => m.ix), ...[...slotCells.values()].map((s) => s.ix)];
  const zs = [...st.mods.map((m) => m.iz), ...[...slotCells.values()].map((s) => s.iz)];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const W = (maxX - minX + 1) * CS + 20, H = (maxZ - minZ + 1) * CS + 20;
  const px = (ix: number) => 10 + (ix - minX) * CS;
  const pz = (iz: number) => 10 + (iz - minZ) * CS;

  const selMod = sel?.kind === 'mod' ? st.mods.find((m) => m.key === sel.key) : null;
  const selSlot = sel?.kind === 'slot' ? slotCells.get(sel.key) : null;

  const doAttach = (type: ModType) => {
    if (!selSlot) return;
    const slot = engine.slotsFor(type).find((s) => s.ix === selSlot.ix && s.iz === selSlot.iz);
    if (!slot) { setMsg({ t: `${MOD_DEFS[type].name} tidak punya port yang cocok di sel ini`, ok: false }); return; }
    const err = engine.attachModule(type, slot.anchor, slot.side);
    if (err) setMsg({ t: err, ok: false });
    else { setMsg({ t: `${MOD_DEFS[type].name} terpasang`, ok: true }); setSel(null); setSt(engine.getBuildState()); }
  };
  const doRepair = (all: boolean) => {
    const err = all ? engine.repairAllModules() : selMod ? engine.repairModule(selMod.key) : null;
    if (err) setMsg({ t: err, ok: false });
    else { setMsg({ t: all ? 'Semua modul diperbaiki' : 'Modul diperbaiki', ok: true }); setSt(engine.getBuildState()); }
  };
  const doDetach = () => {
    if (!selMod) return;
    const err = engine.detachModule(selMod.key);
    if (err) setMsg({ t: err, ok: false });
    else { setMsg({ t: 'Modul dilepas', ok: true }); setSel(null); setSt(engine.getBuildState()); }
  };

  const pw = st.power;
  const pct = Math.min(100, Math.round(pw.ratio * 100));

  return (
    <Shell onClose={() => { engine.audio.close(); onClose(); }} title={st.name} sub={st.kind === 'station' ? 'STASIUN MODULAR' : 'BASECAMP'}>
      <div className="grid grid-cols-3 gap-2 px-4 pb-2 text-center font-mono">
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 py-1.5"><div className="text-base text-amber-200">◈ {st.credits}</div><div className="text-[9px] uppercase tracking-widest text-white/50">Kredit</div></div>
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 py-1.5"><div className="text-base text-cyan-200">{st.mods.length}</div><div className="text-[9px] uppercase tracking-widest text-white/50">Modul</div></div>
        <div className={`rounded-xl border py-1.5 ${pw.ratio < 0.99 ? 'border-red-400/40 bg-red-500/10' : 'border-emerald-400/30 bg-emerald-400/5'}`}>
          <div className={`text-base ${pw.ratio < 0.99 ? 'text-red-200' : 'text-emerald-200'}`}>{pw.gen.toFixed(1)}/{pw.use.toFixed(1)} kW</div>
          <div className="text-[9px] uppercase tracking-widest text-white/50">Daya · surya ×{pw.solar.toFixed(2)}</div>
        </div>
      </div>
      {(st.pressure < 0.99 || st.mods.some((m) => m.hp < 0.995 || m.lost > 0 || m.dents > 0)) && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-300/40 bg-amber-900/20 px-3 py-1.5 text-[12px] text-amber-100">
          <span>Tekanan {Math.round(st.pressure * 100)}% · {st.mods.filter((m) => m.hp < 0.995 || m.lost > 0 || m.dents > 0).length} modul rusak</span>
          <button onClick={() => doRepair(true)} className="rounded-lg border border-emerald-300/50 bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-100 active:scale-95">🔧 Perbaiki semua</button>
        </div>
      )}
      <div className="mx-4 mb-2 h-1.5 overflow-hidden rounded bg-white/10"><div className={`h-full ${pw.ratio < 0.99 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} /></div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 md:flex-row" data-scroll>
        <div className="shrink-0 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-1 md:max-h-[52vh]" data-scroll>
          <svg width={W} height={H} style={{ minWidth: W }}>
            {[...slotCells.entries()].map(([k, c]) => (
              <g key={k} onClick={() => { setSel({ kind: 'slot', key: k }); setMsg(null); }} className="cursor-pointer">
                <rect x={px(c.ix) + 5} y={pz(c.iz) + 5} width={CS - 10} height={CS - 10} rx={8} fill={sel?.key === k ? 'rgba(255,190,60,0.22)' : 'rgba(255,255,255,0.03)'} stroke={sel?.key === k ? '#ffbe3c' : 'rgba(255,255,255,0.28)'} strokeDasharray="5 4" />
                <text x={px(c.ix) + CS / 2} y={pz(c.iz) + CS / 2 + 7} textAnchor="middle" fontSize="22" fill={sel?.key === k ? '#ffbe3c' : 'rgba(255,255,255,0.45)'}>＋</text>
              </g>
            ))}
            {st.mods.map((m) => {
              const d = MOD_DEFS[m.type];
              const x = px(m.ix), y = pz(m.iz);
              const isSel = sel?.key === m.key;
              const here = st.here === m.key;
              return (
                <g key={m.key} onClick={() => { setSel({ kind: 'mod', key: m.key }); setMsg(null); }} className="cursor-pointer">
                  <rect x={x + 5} y={y + 5} width={CS - 10} height={CS - 10} rx={9} fill={hex(d.color) + '33'} stroke={isSel ? '#ffffff' : hex(d.color)} strokeWidth={isSel ? 2.5 : 1.5} />
                  <text x={x + CS / 2} y={y + CS / 2 + 6} textAnchor="middle" fontSize="20" fill={hex(d.color)}>{d.icon}</text>
                  <text x={x + CS / 2} y={y + CS - 10} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.7)">{d.name.length > 11 ? d.name.slice(0, 10) + '…' : d.name}</text>
                  {m.core && <text x={x + 10} y={y + 17} fontSize="9" fill="#ffd060">★</text>}
                  {m.hp < 0.995 && <rect x={x + 8} y={y + CS - 8} width={(CS - 16) * m.hp} height={3} rx={1.5} fill={m.hp < 0.35 ? '#ff4a3c' : m.hp < 0.7 ? '#ffb030' : '#40ff90'} />}
                  {m.fire > 0.03 && <text x={x + CS - 16} y={y + 28} fontSize="13">🔥</text>}
                  {here && <circle cx={x + CS - 12} cy={y + 14} r={4} fill="#40ff90" />}
                  {/* port: bar terang = tersambung, putus-putus = terbuka (tak tersambung) */}
                  {m.ports.map((p, s) => {
                    if (!p) return null;
                    const open = m.open[s];
                    const cx = x + CS / 2 + (s === 1 ? CS / 2 - 3 : s === 3 ? -CS / 2 + 3 : 0);
                    const cy = y + CS / 2 + (s === 2 ? CS / 2 - 3 : s === 0 ? -CS / 2 + 3 : 0);
                    return <rect key={s} x={cx - (s % 2 ? 2 : 9)} y={cy - (s % 2 ? 9 : 2)} width={s % 2 ? 4 : 18} height={s % 2 ? 18 : 4} rx={2} fill={open ? '#40ff90' : '#ff6a40'} opacity={open ? 0.95 : 0.8} />;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="px-2 pb-1 font-mono text-[9px] text-white/40">Utara ↑ · hijau = tersambung · oranye = port tertutup · ＋ = slot kosong</div>
        </div>

        <div className="min-w-0 flex-1 text-sm">
          {msg && <div className={`mb-2 rounded-xl border px-3 py-2 text-[13px] ${msg.ok ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-red-400/40 bg-red-900/30 text-red-100'}`}>{msg.t}</div>}

          {selMod && (
            <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-3">
              <div className="flex items-center gap-2"><span className="text-xl" style={{ color: hex(MOD_DEFS[selMod.type].color) }}>{MOD_DEFS[selMod.type].icon}</span><span className="text-base font-semibold text-white">{MOD_DEFS[selMod.type].name}</span></div>
              <p className="mt-1 text-[13px] text-white/70">{MOD_DEFS[selMod.type].desc}</p>
              <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-cyan-100/80">
                <span>Konsumsi: {MOD_DEFS[selMod.type].use} kW</span>
                <span>Daya: +{(MOD_DEFS[selMod.type].gen + MOD_DEFS[selMod.type].solar * pw.solar).toFixed(1)} kW</span>
                <span>Port: {selMod.ports.map((p, i) => (p ? SIDE_NAMES[i][0] : '')).join('') || '—'}</span>
                <span>Nilai kembali: ◈ {Math.round(MOD_DEFS[selMod.type].cost * 0.6)}</span>
              </div>
              {(selMod.hp < 0.995 || selMod.lost > 0 || selMod.dents > 0 || selMod.dust > 0.05 || selMod.ash > 5) && (
                <div className="mt-2 rounded-xl border border-amber-300/40 bg-amber-900/20 p-2 text-[12px] text-amber-100">
                  <div>Integritas <b>{Math.round(selMod.hp * 100)}%</b>{selMod.fire > 0.03 ? ' · 🔥 terbakar' : ''}{selMod.lost > 0 ? ` · ${selMod.lost} bagian lepas` : ''}{selMod.dents > 0 ? ` · ${selMod.dents} penyok/lubang` : ''}{selMod.dust > 0.05 ? ` · debu ${Math.round(selMod.dust * 100)}%` : ''}{selMod.ash > 5 ? ` · abu ${Math.round(selMod.ash)} kg/m²` : ''}</div>
                  <button disabled={st.credits < selMod.repair} onClick={() => doRepair(false)} className="mt-1.5 w-full rounded-lg border border-emerald-300/50 bg-emerald-500/15 py-2 text-sm font-semibold text-emerald-100 active:scale-95 disabled:opacity-40">🔧 Perbaiki · ◈ {selMod.repair}</button>
                </div>
              )}
              <button disabled={selMod.core} onClick={doDetach} className="mt-3 w-full rounded-xl border border-red-400/60 bg-red-500/15 py-2.5 text-sm font-semibold text-red-100 active:scale-95 disabled:opacity-35">
                {selMod.core ? 'Hub inti tidak dapat dilepas' : '⏏ Lepas modul (beserta cabang yang terputus)'}
              </button>
            </div>
          )}

          {selSlot && (
            <div>
              <div className="mb-1.5 text-[12px] tracking-widest text-amber-200/90">PASANG MODUL DI SEL ({selSlot.ix}, {selSlot.iz})</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {BUILD_ORDER.map((t) => {
                  const d = MOD_DEFS[t];
                  const fits = engine.slotsFor(t).some((s) => s.ix === selSlot.ix && s.iz === selSlot.iz);
                  const afford = st.credits >= d.cost;
                  return (
                    <button key={t} disabled={!fits || !afford} onClick={() => doAttach(t)}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-2.5 py-2 text-left active:scale-95 disabled:opacity-35">
                      <span className="w-6 text-center text-lg" style={{ color: hex(d.color) }}>{d.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] leading-tight text-white">{d.name}</span>
                        <span className="block truncate text-[10px] text-white/45">{!fits ? 'port tidak cocok' : d.desc}</span>
                      </span>
                      <span className={`font-mono text-[11px] ${afford ? 'text-amber-200' : 'text-red-300'}`}>◈{d.cost}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!selMod && !selSlot && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[13px] leading-snug text-white/70">
              <p className="mb-1.5 text-white/85">Pilih <b className="text-amber-200">slot ＋</b> untuk memasang modul baru, atau pilih modul untuk melihat/melepasnya.</p>
              <p className="text-white/55">Modul tersambung lewat port yang berhadapan. Interior & eksterior dibangun dari definisi yang sama — modul yang dipasang langsung bisa dimasuki. Melepas modul juga melepas cabang yang terputus dari Hub inti (kredit kembali 60%).</p>
              <p className="mt-1.5 text-white/55">Daya surya turun saat badai debu & jauh dari Matahari; tambahkan Pembangkit Daya bila defisit.</p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-ui className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 backdrop-blur-[2px] md:items-center" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-3xl border border-cyan-400/30 bg-[#050d14]/95 shadow-[0_-10px_60px_rgba(0,200,255,0.18)] md:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-cyan-300/70">{sub || 'KONSOL'}</div>
            <div className="text-lg font-semibold text-white">{title}</div>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full border border-white/20 text-lg text-white/80 active:scale-95">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
