// Gambar layar kokpit (kanvas) dengan data nyata dari permainan
import type { Screen } from './shipModel';

export const fmtDist = (u: number) => {
  if (u < 1000) return `${u.toFixed(0)} m`;
  return `${(u / 1000).toLocaleString('id-ID', { maximumFractionDigits: u < 100000 ? 1 : 0 })} km`;
};
export const fmtSpeed = (u: number) => (u < 1000 ? `${u.toFixed(0)} m/s` : `${(u / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km/s`);

const C1 = '#45e3ff', C2 = '#ffb030', C3 = '#40ff90', CR = '#ff4a3a';

export interface Blip { x: number; y: number; col: string; sel: boolean; r: number }
export interface ScreenData {
  t: number;
  blips: Blip[];
  pitch: number;
  roll: number;
  speed: number;
  alt: number;
  throttle: number;
  targetName: string;
  targetDist: number;
  ap: boolean;
  oxygen: number;
  hull: number;
  energy: number;
  nearest: string;
  dens: number;
  mapBodies: { x: number; z: number; r: number; col: string; name: string; parentless: boolean; sel: boolean }[];
  ship: { x: number; z: number; h: number };
  warn: string | null;
}

function frame(s: Screen, title: string) {
  const { ctx, canvas } = s;
  ctx.fillStyle = '#021218';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(69,227,255,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = C1;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(title, 10, 17);
}

export function drawRadar(s: Screen, d: ScreenData) {
  frame(s, 'RADAR 360°');
  const { ctx } = s;
  const cx = 128, cy = 90, R = 66;
  ctx.strokeStyle = 'rgba(64,255,144,0.45)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (R * i) / 3, 0, 7);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  const a = d.t * 1.6;
  const g = ctx.createConicGradient ? ctx.createConicGradient(a, cx, cy) : null;
  if (g) {
    g.addColorStop(0, 'rgba(64,255,144,0.0)');
    g.addColorStop(0.92, 'rgba(64,255,144,0.0)');
    g.addColorStop(1, 'rgba(64,255,144,0.45)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  }
  for (const b of d.blips) {
    const x = cx + b.x * R, y = cy + b.y * R;
    ctx.fillStyle = b.col;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, 7); ctx.fill();
    if (b.sel) {
      ctx.strokeStyle = C2; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - b.r - 3, y - b.r - 3, (b.r + 3) * 2, (b.r + 3) * 2);
    }
  }
  ctx.fillStyle = C3;
  ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx + 3, cy + 3); ctx.fill();
  ctx.fillStyle = '#7fe'; ctx.font = '9px monospace';
  ctx.fillText('DEPAN', cx - 14, cy - R - 3 + 8);
  ctx.fillText('BELAKANG', cx - 18, cy + R + 11);
  s.tex.needsUpdate = true;
}

export function drawNav(s: Screen, d: ScreenData) {
  frame(s, 'NAVIGASI');
  const { ctx } = s;
  const cx = 72, cy = 92, R = 56;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-d.roll);
  const off = (d.pitch / (Math.PI / 2)) * R * 1.4;
  ctx.fillStyle = '#1c5a8a'; ctx.fillRect(-100, -200 + off, 200, 200);
  ctx.fillStyle = '#6a4a28'; ctx.fillRect(-100, off, 200, 200);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-100, off); ctx.lineTo(100, off); ctx.stroke();
  ctx.lineWidth = 1;
  for (let p = -60; p <= 60; p += 20) {
    if (!p) continue;
    const y = off - (p / 90) * R * 1.4;
    ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(14, y); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = C2; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 8, cy); ctx.lineTo(cx - 8, cy + 5); ctx.moveTo(cx + 26, cy); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx + 8, cy + 5); ctx.stroke();
  ctx.strokeStyle = C1; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  ctx.fillStyle = C1; ctx.textAlign = 'left'; ctx.font = 'bold 10px monospace';
  ctx.fillText('KECEPATAN', 140, 38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 17px monospace';
  ctx.fillText(fmtSpeed(d.speed), 140, 56);
  ctx.fillStyle = C1; ctx.font = 'bold 10px monospace';
  ctx.fillText('KETINGGIAN', 140, 78);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 17px monospace';
  ctx.fillText(fmtDist(Math.max(0, d.alt)), 140, 96);
  ctx.fillStyle = C1; ctx.font = 'bold 10px monospace';
  ctx.fillText('DAYA DORONG', 140, 118);
  ctx.fillStyle = '#123'; ctx.fillRect(140, 124, 100, 12);
  ctx.fillStyle = d.throttle > 0.85 ? C2 : C3; ctx.fillRect(140, 124, 100 * d.throttle, 12);
  ctx.fillStyle = '#9ef'; ctx.font = '10px monospace';
  ctx.fillText(d.nearest.toUpperCase().slice(0, 16), 140, 150);
  s.tex.needsUpdate = true;
}

export function drawStatus(s: Screen, d: ScreenData) {
  frame(s, 'STATUS KAPAL · NUSANTARA-7');
  const { ctx } = s;
  ctx.textAlign = 'left';
  ctx.fillStyle = C1; ctx.font = 'bold 10px monospace';
  ctx.fillText('TARGET', 12, 38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace';
  ctx.fillText(d.targetName ? d.targetName.toUpperCase() : '— TIDAK ADA —', 12, 56);
  ctx.fillStyle = C2; ctx.font = '12px monospace';
  ctx.fillText(d.targetName ? `JARAK ${fmtDist(d.targetDist)}` : 'PILIH DI PETA', 12, 74);
  ctx.fillStyle = d.ap ? C3 : '#567'; ctx.fillText(d.ap ? '● AUTOPILOT AKTIF' : '○ AUTOPILOT MATI', 12, 92);
  const bar = (y: number, label: string, v: number, c: string) => {
    ctx.fillStyle = '#9ef'; ctx.font = '10px monospace'; ctx.fillText(label, 12, y);
    ctx.fillStyle = '#0c2a33'; ctx.fillRect(80, y - 9, 150, 9);
    ctx.fillStyle = c; ctx.fillRect(80, y - 9, 150 * Math.max(0, Math.min(1, v)), 9);
  };
  bar(114, 'ENERGI', d.energy, C3);
  bar(130, 'OKSIGEN', d.oxygen, C1);
  bar(146, 'PERISAI', d.hull, d.hull < 0.5 ? CR : C2);
  if (d.warn) {
    if (Math.floor(d.t * 3) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,60,40,0.9)'; ctx.fillRect(140, 28, 108, 30);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('PERINGATAN', 194, 41);
      ctx.font = '9px monospace'; ctx.fillText(d.warn.slice(0, 18), 194, 53);
    }
  }
  s.tex.needsUpdate = true;
}

export function drawMap(s: Screen, d: ScreenData) {
  frame(s, 'PETA TATA SURYA');
  const { ctx, canvas } = s;
  const cx = canvas.width / 2, cy = canvas.height / 2 + 6;
  const sc = (r: number) => Math.sqrt(r / 68e6) * (canvas.height / 2 - 14);
  ctx.strokeStyle = 'rgba(69,227,255,0.18)'; ctx.lineWidth = 1;
  for (const r of [5e6, 7e6, 9.5e6, 13e6, 25e6, 36e6, 47e6, 57e6, 65e6]) {
    ctx.beginPath(); ctx.arc(cx, cy, sc(r), 0, 7); ctx.stroke();
  }
  ctx.textAlign = 'left';
  for (const b of d.mapBodies) {
    if (!b.parentless) continue;
    const r = Math.hypot(b.x, b.z), a = Math.atan2(b.z, b.x);
    const x = cx + Math.cos(a) * sc(r), y = cy + Math.sin(a) * sc(r);
    ctx.fillStyle = b.col;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, 7); ctx.fill();
    if (b.sel) { ctx.strokeStyle = C2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, b.r + 4, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#bfefff'; ctx.font = '8px monospace';
    if (b.r > 2) ctx.fillText(b.name, x + b.r + 2, y + 3);
  }
  const sr = Math.hypot(d.ship.x, d.ship.z), sa = Math.atan2(d.ship.z, d.ship.x);
  const sx = cx + Math.cos(sa) * sc(sr), sy = cy + Math.sin(sa) * sc(sr);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(d.ship.h);
  ctx.fillStyle = Math.floor(d.t * 2) % 2 ? C3 : '#fff';
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4); ctx.fill();
  ctx.restore();
  s.tex.needsUpdate = true;
}
