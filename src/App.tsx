import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine, type Hud } from './game/engine';
import { fmtDist, fmtSpeed } from './game/screens';
import MapPanel from './MapPanel';
import MissionPanel from './MissionPanel';
import BuildPanel from './BuildPanel';

interface Toast { id: number; text: string; kind: 'info' | 'discover' | 'warn' }
const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

function HoldBtn({ onDown, onUp, children, className = '', active = false }: { onDown: () => void; onUp: () => void; children: React.ReactNode; className?: string; active?: boolean }) {
  return (
    <button
      className={`select-none touch-none flex items-center justify-center rounded-full border backdrop-blur-sm active:scale-95 transition ${active ? 'border-amber-300 bg-amber-400/30 text-amber-100' : 'border-cyan-300/40 bg-black/40 text-cyan-100'} ${className}`}
      onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); onDown(); }}
      onPointerUp={(e) => { e.stopPropagation(); onUp(); }}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function TapBtn({ onTap, children, className = '', active = false }: { onTap: () => void; children: React.ReactNode; className?: string; active?: boolean }) {
  return (
    <button
      className={`select-none touch-none flex items-center justify-center rounded-full border backdrop-blur-sm active:scale-95 transition ${active ? 'border-amber-300 bg-amber-400/30 text-amber-100' : 'border-cyan-300/40 bg-black/40 text-cyan-100'} ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onTap(); }}
    >
      {children}
    </button>
  );
}

const Key = ({ k }: { k: string }) => <kbd className="mx-0.5 rounded border border-white/30 bg-white/10 px-1 py-px font-mono text-[10px] text-white">{k}</kbd>;

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [progress, setProgress] = useState({ p: 0, label: 'Memulai' });
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const hudRef = useRef<Hud | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<null | 'map' | 'missions' | 'build' | 'help'>(null);
  const panelRef = useRef<typeof panel>(null);
  const [tip, setTip] = useState(true);
  const [locked, setLocked] = useState(false);
  const [stick, setStick] = useState<{ L?: { cx: number; cy: number; x: number; y: number }; R?: { cx: number; cy: number; x: number; y: number } }>({});
  const [flash, setFlash] = useState(0);
  const toastId = useRef(0);
  const ptrs = useRef(new Map<number, { zone: 'L' | 'R'; sx: number; sy: number; lx: number; ly: number; thr: number }>());
  const pc = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches, []);
  hudRef.current = hud;
  panelRef.current = panel;

  const openPanel = useCallback((p: 'map' | 'missions' | 'build' | 'help' | null) => {
    if (p && document.pointerLockElement) document.exitPointerLock?.();
    setPanel((cur) => (cur === p ? null : p));
    if (p) engineRef.current?.audio.open();
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    let dead = false;
    const eng = new Engine(mountRef.current, {
      onHud: (h) => { if (!dead) setHud(h); },
      onToast: (text, kind) => {
        if (dead) return;
        const id = ++toastId.current;
        setToasts((t) => [...t.slice(-3), { id, text, kind }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'discover' ? 4800 : 3600);
      },
      onProgress: (p, label) => { if (!dead) setProgress({ p, label }); },
      onUi: (what) => {
        if (dead || !startedRef.current) return;
        if (what === 'lock') setLocked(true);
        else if (what === 'unlock') setLocked(false);
        else if (what === 'build') {
          if (engineRef.current?.currentHab()) openPanel('build');
          else engineRef.current?.toast('Dekati Stasiun/Basecamp atau masuk ke dalamnya untuk membuka Konsol Modul', 'warn');
        } else openPanel(what);
      },
    });
    (window as unknown as { __engine?: Engine }).__engine = eng;
    engineRef.current = eng;
    eng.init().then(() => { if (!dead) { setReady(true); eng.start(); } }).catch((e) => { console.error(e); setProgress({ p: 1, label: 'Gagal memuat: ' + (e?.message || e) }); });
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && panelRef.current) setPanel(null); };
    window.addEventListener('keydown', onEsc);
    return () => { dead = true; window.removeEventListener('keydown', onEsc); eng.dispose(); engineRef.current = null; };
  }, [openPanel]);

  // kilat: di dalam gas raksasa & badai
  useEffect(() => {
    if (!hud || hud.gasDepth < 0.004) return;
    if (Math.random() < 0.18) { setFlash(0.6); setTimeout(() => setFlash(0), 90); }
  }, [hud]);

  const eng = () => engineRef.current!;

  // ---------------- gestur ----------------
  const onDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget || !startedRef.current) return;
    if (e.pointerType === 'mouse' && 'requestPointerLock' in Element.prototype) {
      if (!document.pointerLockElement) engineRef.current?.lockPointer();
      return;
    }
    const zone: 'L' | 'R' = e.clientX < window.innerWidth * 0.5 ? 'L' : 'R';
    for (const p of ptrs.current.values()) if (p.zone === zone) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { zone, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, thr: eng().throttle });
    const h = hudRef.current;
    const mv = h?.mode === 'walk' || h?.mode === 'eva' || h?.mode === 'hab';
    const showStick = zone === 'R' ? h?.mode === 'pilot' && !h.look : mv;
    if (showStick) setStick((s) => ({ ...s, [zone]: { cx: e.clientX, cy: e.clientY, x: 0, y: 0 } }));
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    const en = engineRef.current;
    const h = hudRef.current;
    if (!en || !h) return;
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    if (p.zone === 'L') {
      if (h.mode === 'pilot') en.setThrottle(clamp(p.thr - dy / (window.innerHeight * 0.38), 0, 1));
      else if (h.mode === 'walk' || h.mode === 'eva' || h.mode === 'hab') {
        const x = clamp(dx / 56), y = clamp(-dy / 56);
        en.setMove(x, y, Math.hypot(x, y) > 0.95);
        setStick((s) => ({ ...s, L: { cx: p.sx, cy: p.sy, x: clamp(dx, -56, 56), y: clamp(dy, -56, 56) } }));
      }
    } else {
      if (h.mode === 'pilot' && !h.look) {
        en.setSteer(clamp(dx / 70), clamp(-dy / 70));
        setStick((s) => ({ ...s, R: { cx: p.sx, cy: p.sy, x: clamp(dx, -70, 70), y: clamp(dy, -70, 70) } }));
      } else en.addLook(e.clientX - p.lx, e.clientY - p.ly);
    }
    p.lx = e.clientX; p.ly = e.clientY;
  }, []);

  const onUp = useCallback((e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    ptrs.current.delete(e.pointerId);
    const en = engineRef.current;
    if (p.zone === 'L') en?.setMove(0, 0);
    else en?.setSteer(0, 0);
    setStick((s) => ({ ...s, [p.zone]: undefined }));
  }, []);

  const start = () => {
    eng().startAudio();
    startedRef.current = true;
    setStarted(true);
    setTimeout(() => setTip(false), 20000);
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* abaikan */ }
    if (pc) setTimeout(() => engineRef.current?.lockPointer(), 120);
  };

  const h = hud;
  const mode = h?.mode;
  const marker = h?.marker;
  let markerEl: React.ReactNode = null;
  if (marker && h?.target && started && mode !== 'airlock') {
    const edge = marker.behind || Math.abs(marker.x) > 0.9 || Math.abs(marker.y) > 0.82;
    let mx = marker.x, my = marker.y, ang = 0;
    if (edge) {
      if (mx === 0 && my === 0) my = -1;
      const s = Math.min(0.88 / Math.max(Math.abs(mx), 1e-6), 0.8 / Math.max(Math.abs(my), 1e-6));
      ang = (Math.atan2(my, mx) * 180) / Math.PI;
      mx *= s; my *= s;
    }
    markerEl = (
      <div className="pointer-events-none absolute z-10" style={{ left: `${(mx * 0.5 + 0.5) * 100}%`, top: `${(0.5 - my * 0.5) * 100}%`, transform: 'translate(-50%,-50%)' }}>
        {edge ? (
          <div className="text-amber-300 text-xl drop-shadow" style={{ transform: `rotate(${-ang}deg)` }}>➤</div>
        ) : (
          <div className="relative">
            <div className="h-9 w-9 rounded-full border-2 border-amber-300/90 shadow-[0_0_12px_rgba(255,190,60,0.7)]" />
            <div className="absolute left-11 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[11px] text-amber-200 drop-shadow">
              {h.target.name}<br /><span className="text-amber-100/70">{fmtDist(h.target.dist)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
  // penanda misi (hijau)
  let objEl: React.ReactNode = null;
  if (h?.obj && started && mode !== 'airlock') {
    const o = h.obj;
    const edge = o.behind || Math.abs(o.x) > 0.9 || Math.abs(o.y) > 0.82;
    let ox = o.x, oy = o.y, ang = 0;
    if (edge) {
      if (ox === 0 && oy === 0) oy = -1;
      const s = Math.min(0.86 / Math.max(Math.abs(ox), 1e-6), 0.78 / Math.max(Math.abs(oy), 1e-6));
      ang = (Math.atan2(oy, ox) * 180) / Math.PI;
      ox *= s; oy *= s;
    }
    objEl = (
      <div className="pointer-events-none absolute z-10" style={{ left: `${(ox * 0.5 + 0.5) * 100}%`, top: `${(0.5 - oy * 0.5) * 100}%`, transform: 'translate(-50%,-50%)' }}>
        {edge ? (
          <div className="text-emerald-300 text-lg drop-shadow" style={{ transform: `rotate(${-ang}deg)` }}>▶</div>
        ) : (
          <div className="relative">
            <div className="h-7 w-7 rotate-45 border-2 border-emerald-300/90 shadow-[0_0_12px_rgba(64,255,144,0.7)]" />
            <div className="absolute left-9 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[11px] text-emerald-200 drop-shadow">
              {o.label}<br /><span className="text-emerald-100/70">{fmtDist(o.dist)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const near = !!h?.nearSurface;
  const pilot = mode === 'pilot';
  const eva = mode === 'eva';
  const inHab = mode === 'hab';
  const walk = mode === 'walk' || inHab;
  const riding = !!h?.rover.riding;
  const showCtl = !(pc && locked);
  const w = h?.weather;
  const wk = w ? w.k : 0;
  const stormTint = w && w.active ? (w.type === 'dust' ? '210,120,60' : w.type === 'ash' ? '70,55,50' : w.type === 'acid' ? '190,200,60' : w.type === 'methane' ? '230,140,40' : w.type === 'storm' ? '40,50,70' : '') : '';

  const hint = (() => {
    if (!pc) return null;
    if (pilot) return <><Key k="W/S" /><Key k="A/D" />kemudi <Key k="Q/E" />roll <Key k="Shift/Ctrl" />atau <Key k="roda" />daya <Key k="X" />rem <Key k="B" />turbo <Key k="P" />auto <Key k="U" />sandar <Key k="T" />berdiri</>;
    if (riding) return <><Key k="W/S" />gas <Key k="A/D" />belok <Key k="B" />turbo <Key k="mouse" />kamera <Key k="R" />turun</>;
    if (eva) return <><Key k="WASD" />jalan <Key k="Shift" />lari <Key k="Spasi" />lompat/jet <Key k="C" />turun <Key k="F" />aksi <Key k="R" />rover <Key k="K" />basecamp <Key k="G" />bendera <Key k="O" />tarik</>;
    if (walk) return <><Key k="WASD" />jalan <Key k="Shift" />lari <Key k="Spasi" />lompat <Key k="F" />aksi {inHab ? <><Key k="H" />konsol modul</> : <><Key k="T" />duduk</>}</>;
    return null;
  })();

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-white select-none"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", touchAction: 'none', animation: h && h.quake > 0.05 ? `quake ${0.1 + (1 - h.quake) * 0.05}s infinite` : undefined }}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {/* lapisan gestur */}
      <div className="absolute inset-0 z-[5]" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()} />

      {started && h && (
        <>
          {/* efek layar */}
          {h.heat > 0.05 && (
            <div className="pointer-events-none absolute inset-0 z-[6] heat-fx" style={{ opacity: Math.min(1, h.heat * 1.2), background: 'radial-gradient(ellipse at 50% 55%, rgba(255,120,30,0) 30%, rgba(255,110,20,0.55) 75%, rgba(255,60,10,0.9) 100%)' }} />
          )}
          {h.glare > 0.02 && <div className="pointer-events-none absolute inset-0 z-[6]" style={{ opacity: h.glare * 0.75, background: 'radial-gradient(circle at 50% 45%, rgba(255,250,235,0.95), rgba(255,230,180,0.3) 55%, rgba(255,200,120,0) 85%)' }} />}
          {h.gasDepth > 0.01 && <div className="pointer-events-none absolute inset-0 z-[6] bg-black" style={{ opacity: Math.min(0.6, h.gasDepth * 25) }} />}
          {flash > 0 && <div className="pointer-events-none absolute inset-0 z-[7] bg-white" style={{ opacity: flash }} />}
          {h.lightning > 0.02 && <div className="pointer-events-none absolute inset-0 z-[7] bg-white" style={{ opacity: h.lightning * 0.85 }} />}
          {stormTint && wk > 0.02 && !inHab && <div className="pointer-events-none absolute inset-0 z-[6]" style={{ background: `radial-gradient(ellipse at 50% 60%, rgba(${stormTint},${0.1 * wk}) 20%, rgba(${stormTint},${0.38 * wk}) 100%)` }} />}
          {h.radiation > 0.04 && <div className="pointer-events-none absolute inset-0 z-[8] rad-fx" style={{ opacity: Math.min(0.85, h.radiation * (eva ? 0.9 : 0.5)) }} />}
          {eva && (
            <div className="pointer-events-none absolute inset-0 z-[6]" style={{ background: riding ? 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 70%, rgba(2,4,8,0.5) 100%)' : 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 62%, rgba(4,8,14,0.55) 82%, rgba(2,4,8,0.95) 100%)', boxShadow: riding ? 'none' : 'inset 0 0 60px rgba(120,200,255,0.18)' }} />
          )}
          {(pilot || walk) && <div className="pointer-events-none absolute inset-0 z-[6]" style={{ boxShadow: 'inset 0 0 120px rgba(0,0,0,0.55)' }} />}
          {walk && h.power < 0.6 && <div className="pointer-events-none absolute inset-0 z-[6] power-low" style={{ opacity: (0.6 - h.power) * 1.2 }} />}
          <div className="pointer-events-none absolute inset-0 z-[30] bg-black" style={{ opacity: h.fade }} />

          {markerEl}
          {objEl}

          {/* bar atas */}
          <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between px-3 pt-[max(10px,env(safe-area-inset-top))] pointer-events-none">
            <div className="font-mono leading-tight drop-shadow">
              <div className="text-[10px] tracking-[0.2em] text-cyan-300/70">{riding ? 'ROVER' : eva ? 'EVA' : inHab ? (h.habName || 'HABITAT').toUpperCase() : walk ? 'KABIN' : mode === 'airlock' ? 'AIRLOCK' : h.link?.docked ? 'TERSANDAR' : 'KEMUDI'}</div>
              <div className="text-lg text-white">{fmtSpeed(h.speed)}</div>
              <div className="text-[11px] text-cyan-100/80">{h.alt > 0 ? fmtDist(h.alt) : '0 m'} · {h.nearest}</div>
              {eva && (
                <div className="mt-1 w-28">
                  <div className="text-[9px] tracking-widest text-sky-200/70">O₂ {Math.round(h.oxygen * 100)}%</div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-white/15"><div className={`h-full ${h.oxygen < 0.2 ? 'bg-red-400' : 'bg-sky-300'}`} style={{ width: `${h.oxygen * 100}%` }} /></div>
                  <div className="mt-1 text-[9px] tracking-widest text-amber-200/70">BAJU {Math.round(h.suit * 100)}%</div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-white/15"><div className={`h-full ${h.suit < 0.3 ? 'bg-red-400' : 'bg-amber-300'}`} style={{ width: `${h.suit * 100}%` }} /></div>
                  <div className="mt-1 text-[10px] text-white/50">g {h.gravity.toFixed(2)} m/s²</div>
                </div>
              )}
              {inHab && (
                <div className="mt-1 w-28">
                  <div className="text-[9px] tracking-widest text-emerald-200/70">DAYA {Math.round(h.power * 100)}%</div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-white/15"><div className={`h-full ${h.power < 0.6 ? 'bg-red-400' : 'bg-emerald-300'}`} style={{ width: `${h.power * 100}%` }} /></div>
                </div>
              )}
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-1.5">
              <div className="flex gap-1">
                <TapBtn onTap={() => openPanel('map')} className="h-9 w-9 text-base">🗺</TapBtn>
                <TapBtn onTap={() => openPanel('missions')} className="h-9 w-9 text-sm">📋</TapBtn>
                {h.canBuild && <TapBtn onTap={() => openPanel('build')} className="h-9 w-9 text-sm">🏗</TapBtn>}
                <TapBtn onTap={() => eng().toggleMute()} className="h-9 w-9 text-sm">{h.muted ? '🔇' : '🔊'}</TapBtn>
                <TapBtn onTap={() => openPanel('help')} className="h-9 w-9 text-sm">?</TapBtn>
              </div>
              <div className="pointer-events-none rounded-full border border-amber-300/30 bg-black/40 px-2.5 py-0.5 font-mono text-[11px] text-amber-200 backdrop-blur-sm">
                ◈ {h.credits}{h.samples > 0 && <span className="ml-2 text-emerald-300">⬡ {h.samples}</span>}
              </div>
            </div>
          </div>

          {/* kolom tengah: target, misi, cuaca, toast, tips (tidak saling menimpa) */}
          <div className="pointer-events-none absolute left-0 right-0 top-[max(50px,calc(env(safe-area-inset-top)+40px))] z-20 flex flex-col items-center gap-1.5 pl-[132px] pr-3 sm:px-6">
            <button
              className="pointer-events-auto max-w-full truncate rounded-full border border-amber-300/50 bg-black/45 px-3 py-1 text-xs text-amber-100 backdrop-blur active:scale-95"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => openPanel('map')}
            >
              {h.target ? `◎ ${h.target.name} · ${fmtDist(h.target.dist)}` : '◎ Pilih target'}
              {h.autopilot && <span className="ml-1 text-emerald-300">● AP</span>}
            </button>
            {h.mission && (
              <div className="w-full max-w-[340px] rounded-xl border border-emerald-300/30 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
                <div className="truncate font-mono text-[9px] tracking-widest text-emerald-300/80">MISI · {h.mission.title.toUpperCase()}</div>
                <div className="line-clamp-3 text-[11.5px] leading-snug text-white/90">{h.mission.text}</div>
                {h.mission.need > 1 && (
                  <div className="mt-1 h-1 overflow-hidden rounded bg-white/15"><div className="h-full bg-emerald-300" style={{ width: `${Math.min(100, (h.mission.prog / h.mission.need) * 100)}%` }} /></div>
                )}
              </div>
            )}
            {h.warn && <div className="warn-pulse max-w-full rounded-full border border-red-400/70 bg-red-900/60 px-3 py-1 font-mono text-xs text-red-100">⚠ {h.warn}</div>}
            {w && (
              <div className={`max-w-full rounded-2xl border px-3 py-1 text-center font-mono text-[11px] leading-snug backdrop-blur ${w.active ? 'warn-pulse border-red-400/70 bg-red-900/55 text-red-100' : 'border-amber-300/60 bg-amber-900/45 text-amber-100'}`}>
                {w.icon} {w.label}{w.active ? (w.k < 0.5 ? ' — mendekat' : ' — memuncak') : ` dalam ${Math.ceil(w.in)} dtk`}
                {w.active && <span className="ml-1.5">{h.mode === 'eva' && !riding ? '⚠ di luar!' : w.sheltered ? '✔ aman di dalam' : ''}</span>}
              </div>
            )}
            {h.link && pilot && <div className="max-w-full truncate rounded-full border border-emerald-300/50 bg-emerald-900/45 px-3 py-1 font-mono text-[11px] text-emerald-100">⚓ {h.link.docked ? 'Tersandar' : 'Dekat'}: {h.link.name}</div>}
            {h.scanning && <div className="rounded-full border border-cyan-300/50 bg-cyan-900/45 px-3 py-1 font-mono text-[11px] text-cyan-100">⌖ Memindai…</div>}
            {toasts.map((t) => (
              <div key={t.id} className={`toast-in w-full max-w-md rounded-2xl border px-3 py-1.5 text-center text-[13px] leading-snug backdrop-blur ${t.kind === 'discover' ? 'border-amber-300/60 bg-amber-500/25 text-amber-100' : t.kind === 'warn' ? 'border-red-400/50 bg-red-900/50 text-red-100' : 'border-cyan-300/30 bg-black/60 text-cyan-50'}`}>{t.text}</div>
            ))}
            {tip && !panel && (
              <div className="pointer-events-auto w-full max-w-[340px] rounded-2xl border border-cyan-300/40 bg-[#050d14]/92 p-2.5 text-[11.5px] leading-snug text-cyan-50 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
                <div className="mb-1 font-semibold text-amber-200">Selamat datang, Kapten.</div>
                <ul className="space-y-0.5 text-white/80">
                  {pc ? (
                    <>
                      <li>🖱 Mouse kemudi · roda daya · <b>F</b> aksi · <b>Tab</b> peta · <b>J</b> misi</li>
                      <li>🛰 Peta → <b>Stasiun Kartika</b> → <b>P</b> autopilot → <b>U</b> sandar</li>
                    </>
                  ) : (
                    <>
                      <li>↕ Geser kiri: <b>daya</b> · ✥ kanan: <b>kemudi</b></li>
                      <li>🗺 Pilih <b>Stasiun Kartika</b> → <b>AUTO</b> → <b>SANDAR</b></li>
                    </>
                  )}
                  <li>⛺ EVA di tanah padat → <b>BASE</b>; 🏗 pasang/lepas modul</li>
                </ul>
                <button className="mt-1.5 text-amber-300" onClick={() => setTip(false)}>Mengerti</button>
              </div>
            )}
          </div>

          {/* urutan airlock */}
          {h.seq && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[28%] z-[35] flex flex-col items-center">
              <div className="rounded-xl border border-cyan-300/40 bg-black/60 px-5 py-3 font-mono text-sm text-cyan-100 backdrop-blur">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />{h.seq}
              </div>
            </div>
          )}

          {/* throttle (pilot) */}
          {pilot && (
            <div className="pointer-events-none absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-4 z-10 flex items-end gap-2">
              <div className="relative h-[34vh] w-3 overflow-hidden rounded-full border border-cyan-300/40 bg-black/40">
                <div className={`absolute bottom-0 w-full ${h.throttle > 0.85 ? 'bg-amber-400' : 'bg-cyan-300'}`} style={{ height: `${h.throttle * 100}%` }} />
              </div>
              <div className="pb-1 font-mono text-[10px] leading-tight text-cyan-100/80">
                DAYA<br /><span className="text-base text-white">{Math.round(h.throttle * 100)}%</span><br />
                <span className="text-white/40">{pc ? 'roda mouse' : 'geser ↑↓'}</span><br />
                <span className="text-white/40">batas {fmtSpeed(h.limit)}</span>
              </div>
            </div>
          )}

          {/* tombol kanan */}
          {showCtl && (
            <div className="absolute bottom-[max(20px,env(safe-area-inset-bottom))] right-3 z-20 flex flex-col items-center gap-2.5">
              {pilot && (
                <>
                  <div className="flex flex-col gap-2">
                    <TapBtn onTap={() => eng().toggleLook()} active={h.look} className="h-10 w-10 text-base">👁</TapBtn>
                    <TapBtn onTap={() => eng().toggleView()} active={h.view === 'chase'} className="h-10 w-10 text-base">🎥</TapBtn>
                    <TapBtn onTap={() => eng().standSit()} className="h-10 w-10 text-base">🧍</TapBtn>
                  </div>
                  {(h.canDock || h.link?.docked) && (
                    <TapBtn onTap={() => eng().dockToggle()} active={!!h.link?.docked} className="h-14 w-14 flex-col text-[10px] font-mono leading-none"><span className="text-lg">⚓</span>{h.link?.docked ? 'LEPAS' : 'SANDAR'}</TapBtn>
                  )}
                  {h.target && !h.link?.docked && (
                    <TapBtn onTap={() => (h.autopilot ? eng().cancelAutopilot() : eng().engageAutopilot())} active={h.autopilot} className="h-14 w-14 flex-col text-[10px] font-mono leading-none"><span className="text-lg">⌖</span>AUTO</TapBtn>
                  )}
                  <HoldBtn onDown={() => eng().setBoost(true)} onUp={() => eng().setBoost(false)} active={h.boost} className="h-14 w-14 flex-col text-[10px] font-mono leading-none"><span className="text-lg">⚡</span>BOOST</HoldBtn>
                  <HoldBtn onDown={() => eng().brake(true)} onUp={() => eng().brake(false)} className="h-14 w-14 flex-col text-[10px] font-mono leading-none border-red-400/60 text-red-200"><span className="text-lg">■</span>REM</HoldBtn>
                </>
              )}
              {walk && (
                <>
                  {!inHab && h.prompt?.action !== 'sit' && <TapBtn onTap={() => eng().standSit()} className="h-12 w-12 text-sm">🪑</TapBtn>}
                  <TapBtn onTap={() => eng().jump()} className="h-14 w-14 flex-col text-[9px] font-mono leading-none"><span className="text-lg">⤒</span>LOMPAT</TapBtn>
                </>
              )}
              {eva && !riding && (
                <>
                  <TapBtn onTap={() => eng().returnToShip()} className="h-12 w-12 flex-col text-[9px] font-mono leading-none"><span className="text-base">↩</span>TARIK</TapBtn>
                  {h.canBase && <TapBtn onTap={() => eng().deployBase()} className="h-12 w-12 flex-col text-[9px] font-mono leading-none border-emerald-300/60 text-emerald-100"><span className="text-base">⛺</span>BASE</TapBtn>}
                  <TapBtn onTap={() => (h.rover.near ? eng().mountRover() : eng().callRover())} className="h-12 w-12 flex-col text-[9px] font-mono leading-none"><span className="text-base">⛟</span>{h.rover.near ? 'NAIKI' : 'ROVER'}</TapBtn>
                  <TapBtn onTap={() => eng().jump()} className="h-12 w-12 flex-col text-[9px] font-mono leading-none"><span className="text-base">⤒</span>LOMPAT</TapBtn>
                  <HoldBtn onDown={() => eng().setJet(false, true)} onUp={() => eng().setJet(false, false)} className="h-12 w-12 text-lg">▼</HoldBtn>
                  <HoldBtn onDown={() => eng().setJet(true, false)} onUp={() => eng().setJet(false, false)} className="h-16 w-16 flex-col text-[9px] font-mono leading-none border-sky-300/70 text-sky-100"><span className="text-xl">▲</span>JETPACK</HoldBtn>
                </>
              )}
              {riding && (
                <>
                  <TapBtn onTap={() => eng().dismountRover()} className="h-12 w-12 flex-col text-[9px] font-mono leading-none"><span className="text-base">⇩</span>TURUN</TapBtn>
                  <HoldBtn onDown={() => eng().setBoost(true)} onUp={() => eng().setBoost(false)} active={h.boost} className="h-14 w-14 flex-col text-[10px] font-mono leading-none"><span className="text-lg">⚡</span>TURBO</HoldBtn>
                </>
              )}
            </div>
          )}

          {/* tombol tengah bawah: roll & thruster vertikal */}
          {pilot && showCtl && (
            <div className="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 gap-2">
              <HoldBtn onDown={() => eng().setRoll(-1)} onUp={() => eng().setRoll(0)} className="h-11 w-11 text-lg">⟲</HoldBtn>
              {near && (
                <>
                  <HoldBtn onDown={() => eng().setVert(-1)} onUp={() => eng().setVert(0)} className="h-11 w-11 text-base">▼</HoldBtn>
                  <HoldBtn onDown={() => eng().setVert(1)} onUp={() => eng().setVert(0)} className="h-11 w-11 text-base">▲</HoldBtn>
                </>
              )}
              <HoldBtn onDown={() => eng().setRoll(1)} onUp={() => eng().setRoll(0)} className="h-11 w-11 text-lg">⟳</HoldBtn>
            </div>
          )}

          {/* prompt kontekstual */}
          {h.prompt && (
            <div className="absolute inset-x-0 bottom-[22%] z-20 flex justify-center">
              <button
                className="prompt-glow rounded-full border border-amber-300/80 bg-amber-400/90 px-6 py-3 text-sm font-semibold text-black shadow-lg active:scale-95"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => eng().interact()}
              >
                {h.prompt.action === 'flag' ? '⚑' : '▶'} {h.prompt.text}{pc && <span className="ml-2 rounded bg-black/20 px-1.5 py-px font-mono text-[11px]">F</span>}
              </button>
            </div>
          )}

          {/* petunjuk papan ketik */}
          {pc && locked && hint && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto w-fit max-w-[92vw] rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-center text-[11px] leading-relaxed text-white/80 backdrop-blur-sm">
              {hint}
              <div className="mt-0.5 text-white/45"><Key k="Tab" />peta <Key k="J" />misi <Key k="H" />konsol <Key k="M" />suara <Key k="/" />bantuan <Key k="Esc" />lepas mouse</div>
            </div>
          )}

          {/* jeda: mouse tidak terkunci */}
          {pc && !locked && !panel && !h.seq && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[10%] z-10 flex justify-center">
              <div className="rounded-2xl border border-cyan-300/40 bg-black/60 px-5 py-2.5 text-center text-sm text-cyan-100 backdrop-blur">
                Klik layar untuk mengendalikan (mouse terkunci)<div className="text-[11px] text-white/50">atau gunakan papan ketik · Esc melepas mouse</div>
              </div>
            </div>
          )}

          {/* stick virtual */}
          {(['L', 'R'] as const).map((z) => {
            const s = stick[z];
            if (!s) return null;
            return (
              <div key={z} className="pointer-events-none absolute z-10" style={{ left: s.cx - 40, top: s.cy - 40 }}>
                <div className="h-20 w-20 rounded-full border border-white/30 bg-white/5" />
                <div className="absolute h-9 w-9 rounded-full border border-cyan-200/70 bg-cyan-300/30" style={{ left: 22 + s.x * 0.5, top: 22 + s.y * 0.5 }} />
              </div>
            );
          })}

          {panel === 'map' && eng() && (
            <MapPanel
              engine={eng()}
              targetId={h.target?.id || null}
              counts={h.counts}
              onClose={() => setPanel(null)}
              onAutopilot={() => eng().engageAutopilot()}
            />
          )}
          {panel === 'missions' && eng() && <MissionPanel engine={eng()} onClose={() => setPanel(null)} />}
          {panel === 'build' && eng() && <BuildPanel engine={eng()} onClose={() => setPanel(null)} />}

          {panel === 'help' && (
            <div data-ui className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onPointerDown={(e) => e.stopPropagation()}>
              <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-cyan-300/30 bg-[#050d14] p-5 text-sm text-white/85">
                <div className="mb-2 text-lg font-semibold text-cyan-200">Panduan</div>
                <p className="mb-2 text-white/70">Terbang dari angkasa hingga mendarat — tanpa teleportasi. Dirikan basecamp, kelola stasiun modular, selesaikan misi, dan bertahan dari bencana planet.</p>
                <ul className="space-y-1.5 text-[13px]">
                  <li><b className="text-amber-200">Kapal:</b> daya & kemudi (sentuh/mouse). ⟲⟳ roll. 👁 pandang bebas, 🎥 kamera luar. Peta 🗺 → pilih target → ▶ Autopilot.</li>
                  <li><b className="text-amber-200">Sandar ⚓:</b> dekati dermaga Stasiun Kartika (&lt; 70 m, pelan) → SANDAR. Berdiri 🧍 → jalan ke airlock belakang → langsung masuk stasiun.</li>
                  <li><b className="text-amber-200">Interior:</b> jelajahi kabin, lompat, dan masuk habitat. Mobilitas halus dengan percepatan, lari, lompat, dan rover di permukaan.</li>
                  <li><b className="text-amber-200">Basecamp ⛺:</b> EVA di tanah datar → BASE (250 ◈). Masuk lewat airlock; di Hub buka <b>Konsol Modul</b> 🏗 untuk memasang/melepas modul (Lab, Rumah Kaca, Garasi, Komunikasi, Daya…).</li>
                  <li><b className="text-amber-200">Modul stasiun:</b> modul dipasang pada port yang berhadapan; interior & eksterior kompatibel. Melepas modul membuatnya melayang pergi; cabang terputus ikut lepas.</li>
                  <li><b className="text-amber-200">Bahaya:</b> Mars — badai debu & gempa · Venus — hujan asam · Bumi — badai petir · Io — letusan · Titan — hujan metana · Bulan — hujan meteor · semua — semburan surya. Lihat peringatan cuaca di atas layar, lalu berlindung di kapal/habitat.</li>
                  <li><b className="text-amber-200">Kehidupan:</b> Bumi dan sebagian dunia generatif punya flora & fauna — pindai dengan tombol aksi saat EVA.</li>
                  <li><b className="text-amber-200">Misi 📋:</b> ikuti tanda hijau ◆ di layar. Selesaikan untuk kredit ◈ guna membangun modul.</li>
                </ul>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[12px] leading-relaxed text-white/75">
                  <div className="mb-1 font-semibold text-cyan-200">Papan ketik & mouse (PC)</div>
                  <div><Key k="W A S D" /> gerak/kemudi · <Key k="Q E" /> roll · <Key k="Shift" /><Key k="Ctrl" /> daya · roda mouse = daya · <Key k="X" /> rem · <Key k="B" /> turbo</div>
                  <div><Key k="F" />/klik kiri aksi · klik kanan rem · <Key k="Spasi" /> lompat/jet naik · <Key k="C" /> jet turun · <Key k="T" /> berdiri/duduk · <Key k="V" /> kamera</div>
                  <div><Key k="R" /> rover · <Key k="K" /> basecamp · <Key k="U" /> sandar/lepas · <Key k="P" /> autopilot · <Key k="G" /> bendera · <Key k="O" /> tarik ke kapal · <Key k="L" /> pandang bebas</div>
                  <div><Key k="Tab" /> peta · <Key k="J" /> misi · <Key k="H" /> konsol modul · <Key k="M" /> suara · <Key k="/" /> bantuan · <Key k="Esc" /> lepas mouse/tutup panel</div>
                  <div className="mt-1 text-white/55">Gamepad: stik kiri/kanan, RT/LT daya, A aksi, B rem, X berdiri, Y peta, Select misi, Start konsol.</div>
                </div>
                <button className="mt-4 w-full rounded-xl bg-cyan-400 py-2.5 font-semibold text-black" onClick={() => setPanel(null)}>Tutup</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* layar pemuatan / awal */}
      {!started && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-end bg-gradient-to-b from-black/70 via-black/30 to-black/90 px-6 pb-[max(36px,env(safe-area-inset-bottom))] text-center">
          <div className="mb-auto mt-[14vh]">
            <div className="font-mono text-[11px] tracking-[0.5em] text-cyan-300/80">EKSPEDISI ANTARIKSA</div>
            <h1 className="mt-2 bg-gradient-to-b from-white to-cyan-300 bg-clip-text text-5xl font-black tracking-tight text-transparent">NUSANTARA</h1>
            <div className="mt-1 text-sm text-white/70">Basecamp · stasiun modular · misi · kehidupan & bencana planet</div>
          </div>
          {!ready ? (
            <div className="w-full max-w-xs">
              <div className="mb-2 font-mono text-xs text-cyan-200/80">{progress.label}…</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300 transition-all" style={{ width: `${progress.p * 100}%` }} /></div>
            </div>
          ) : (
            <div className="w-full max-w-xs">
              <button onClick={start} className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-4 text-lg font-bold text-black shadow-[0_0_40px_rgba(255,160,40,0.45)] active:scale-95">MULAI MISI</button>
              <div className="mt-3 text-[11px] text-white/50">{pc ? 'PC: papan ketik + mouse (klik untuk mengunci) · gamepad didukung' : 'Disarankan: layar penuh, suara aktif, mode lanskap atau potret'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
