// Mesin permainan: fisika kapal, EVA, kamera, tata surya, progres, HUD
import * as THREE from 'three';
import { Body } from './body';
import { makeSolarSystem, generateWorld, type BodyDef } from './bodies';
import { buildShip, type ShipRig, GEAR_H, PILOT_EYE, WALK_START, HATCH_OUT, AIRLOCK_IN, SEAT_POS } from './shipModel';
import { GameAudio } from './audio';
import { drawRadar, drawNav, drawStatus, drawMap, type ScreenData, type Blip } from './screens';
import { makeStarfield, makeStation, makeVoyager, makeFlag, AsteroidBelt, Dust, makeFlares } from './extras';
import { clamp, smooth } from './noise';
import { Habitat, BASE_KIT, STATION_LAYOUT, MOD_DEFS, CELL, DOCK_GAP, type ModType, type HabSave, type PlacedMod, type AttachSlot } from './modules';
import { HazardSystem, WeatherFX, HAZARDS, hazardsOf, lifeOf, type HazardType, type LifeProfile } from './hazards';
import { LifeField } from './life';
import { MissionLog } from './missions';
import { makeRover, type RoverRig } from './vehicles';
import * as PH from './physics';
import { SHIP } from './physics';

export type Mode = 'pilot' | 'walk' | 'eva' | 'airlock' | 'hab';

export interface Hud {
  mode: Mode;
  view: 'cockpit' | 'chase';
  look: boolean;
  speed: number;
  alt: number;
  nearest: string;
  throttle: number;
  limit: number;
  landed: boolean;
  grounded: boolean;
  target: { id: string; name: string; dist: number } | null;
  marker: { x: number; y: number; behind: boolean } | null;
  autopilot: boolean;
  prompt: { text: string; action: string } | null;
  oxygen: number;
  heat: number;
  glare: number;
  atmo: number;
  gasDepth: number;
  warn: string | null;
  seq: string | null;
  fade: number;
  nearSurface: boolean;
  counts: { disc: number; visit: number; landed: number; flags: number; total: number };
  gravity: number;
  boost: boolean;
  muted: boolean;
  suit: number;
  lightning: number;
  radiation: number;
  quake: number;
  weather: { type: HazardType; label: string; icon: string; k: number; in: number; active: boolean; sheltered: boolean } | null;
  link: { name: string; docked: boolean } | null;
  canDock: boolean;
  credits: number;
  samples: number;
  mission: { id: string; title: string; text: string; prog: number; need: number; unit: string } | null;
  obj: { x: number; y: number; behind: boolean; label: string; dist: number } | null;
  rover: { riding: boolean; near: boolean; speed: number; deployed: boolean };
  habName: string | null;
  power: number;
  canBuild: boolean;
  canBase: boolean;
  scanning: boolean;
  // fisika kapal
  fuel: number;
  hull: number;
  skinT: number;
  cabinT: number;
  orbit: { valid: boolean; state: string; pe: number; ap: number; e: number; T: number; primary: string };
  warp: number;
  warpNow: number;
  hold: boolean;
  landAssist: boolean;
  gForce: number;
  thrust: number;
  qDyn: number;
  rho: number;
  tAmb: number;
  pAmb: number;
  solar: number;
  jetDv: number;
  primaryR: number;
}

export interface TargetInfo {
  id: string;
  name: string;
  kind: string;
  dist: number;
  radius: number;
  discovered: boolean;
  visited: boolean;
  landed: boolean;
  flagged: boolean;
  info?: BodyDef['info'];
  gen: boolean;
  parent: string | null;
  life?: string;
  hazards?: string[];
  period?: number; // periode orbit (s), dari Kepler
  soi?: number; // jari-jari bola pengaruh (m)
  gSurf?: number; // gravitasi permukaan (m/s²)
  escV?: number; // kecepatan lepas dari permukaan (m/s)
  circV?: number; // kecepatan orbit rendah (m/s)
}

export interface Events {
  onHud: (h: Hud) => void;
  onToast: (msg: string, kind: 'info' | 'discover' | 'warn') => void;
  onProgress: (p: number, label: string) => void;
  onUi?: (what: 'map' | 'missions' | 'build' | 'help' | 'lock' | 'unlock') => void;
}

export interface SampleSite { body: Body; dirL: THREE.Vector3; rad: number; mesh: THREE.Mesh; taken: boolean }

export interface BuildState {
  id: string; name: string; kind: 'station' | 'base';
  power: { gen: number; use: number; ratio: number; solar: number };
  credits: number;
  mods: { key: string; ix: number; iz: number; type: ModType; rot: number; core: boolean; ports: boolean[]; open: boolean[] }[];
  slots: AttachSlot[];
  here: string | null;
}

interface Target {
  id: string;
  name: string;
  kind: string;
  pos: THREE.Vector3;
  radius: number;
  body?: Body;
  info?: BodyDef['info'];
  stop?: number;
}

const VMAX = 300000;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Engine {
  container: HTMLElement;
  ev: Events;
  renderer!: THREE.WebGLRenderer;
  camera!: THREE.PerspectiveCamera;
  world = new THREE.Scene();
  shipScene = new THREE.Scene();
  audio = new GameAudio();
  rig!: ShipRig;
  bodies: Body[] = [];
  byId = new Map<string, Body>();
  landmarks: Target[] = [];
  station!: THREE.Group;
  voyager!: THREE.Group;
  belt!: AsteroidBelt;
  dust!: Dust;
  flares: ReturnType<typeof makeFlares> = [];
  stars!: ReturnType<typeof makeStarfield>;
  sunLight = new THREE.PointLight(0xfff2e0, 3.6, 0, 0);
  ambient = new THREE.AmbientLight(0x7a88aa, 0.2);
  sun!: Body;

  // status
  mode: Mode = 'pilot';
  view: 'cockpit' | 'chase' = 'cockpit';
  lookMode = false;
  time = 0;
  raf = 0;
  last = 0;
  frameN = 0;
  buildBudget = 4;
  running = false;

  shipPos = new THREE.Vector3();
  shipVel = new THREE.Vector3();
  shipQuat = new THREE.Quaternion();
  origin = new THREE.Vector3();
  throttle = 0;
  braking = false;
  autopilot = false;
  boost = false;
  landed = false;
  contact = false;
  landTimer = 0;
  targetId: string | null = null;

  headYaw = 0;
  headPitch = 0;
  walkPos = WALK_START.clone();
  eyeLocal = PILOT_EYE.clone();
  walkYaw = 0;

  astro = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), grounded: false, gfac: 0, g: 0 };
  oxygen = 1;
  autoReturn = false;
  seq: { type: 'exit' | 'enter' | 'trans'; t: number; label: string; done1: boolean; done2: boolean; done3: boolean; mid?: () => void } | null = null;
  fade = 0;
  hull = 1;
  energy = 1;

  input = { steerX: 0, steerY: 0, roll: 0, moveX: 0, moveY: 0, vert: 0, jetUp: false, jetDown: false, jump: false, lookDX: 0, lookDY: 0, run: false };
  keys = new Set<string>();

  env = { nearest: null as Body | null, alt: 1e9, limit: VMAX, dens: 0, atmBody: null as Body | null, gasDepth: 0, rockAlt: 1e9, rho: 0, pAmb: 0, tAmb: 3, g: 0, physBody: null as Body | null };
  envCam = { nearest: null as Body | null, alt: 1e9, limit: VMAX, dens: 0, atmBody: null as Body | null, gasDepth: 0, rockAlt: 1e9, rho: 0, pAmb: 0, tAmb: 3, g: 0, physBody: null as Body | null };
  heat = 0;
  glare = 0;
  warn: string | null = null;
  warnT = 0;
  genCount = 0;
  hudT = 0;
  scrT = 0;
  flags: { body: Body; mesh: THREE.Object3D }[] = [];
  beltToast = false;
  lastDiscCheck = 0;
  prevSpeed = 0;
  shake = 0;

  // --- habitat modular, cuaca ekstrem, kehidupan, misi, kendaraan
  habs: Habitat[] = [];
  inHab: Habitat | null = null;
  linkHab: Habitat | null = null;
  docked: Habitat | null = null;
  dockAnim: { t: number; fromP: THREE.Vector3; fromQ: THREE.Quaternion } | null = null;
  canDockHab: Habitat | null = null;
  habHemi = new THREE.HemisphereLight(0xbfd2ff, 0x1a1a22, 0);
  habLight = new THREE.PointLight(0xfff0dd, 0, 0, 1);
  hazards = new HazardSystem();
  fx!: WeatherFX;
  life!: LifeField;
  lifeProfiles = new Map<string, LifeProfile | null>();
  missions = new MissionLog();
  credits = 600;
  samplesHeld = 0;
  suit = 1;
  lightning = 0;
  thunderAt = -1;
  radiation = 0;
  quakeK = 0;
  sheltered = false;
  samples: SampleSite[] = [];
  siteLeft = new Map<string, number>();
  scannedBodies = new Set<string>();
  rv = { rig: null as RoverRig | null, deployed: false, riding: false, body: null as Body | null, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), speed: 0, distAcc: 0, wheelRot: 0, boost: false };
  jumpY = 0;
  jumpV = 0;
  walkVel = new THREE.Vector2();
  mouseSteer = new THREE.Vector2();
  pointerLocked = false;
  saveT = 0;
  harvestAt = new Map<string, number>();
  lastActionT = 0;
  padWas = false;
  padBtn: boolean[] = [];
  gimbal = 0;
  col0 = new THREE.Color();

  // --- fisika kapal v2 (Newtonian, bola pengaruh, atmosfer, termal, bahan bakar)
  shipFrame: { p: Body | null; att: boolean } = { p: null, att: false };
  astroFrame: { p: Body | null; att: boolean } = { p: null, att: false };
  roverFrame: { p: Body | null; att: boolean } = { p: null, att: true };
  fuel = 1;
  skinT = 288;
  cabinT = 295;
  warp = 1;
  holdMode = false;
  landAssist = false;
  jetDv = 150; // anggaran Δv jetpack (m/s)
  thrustAcc = new THREE.Vector3(); // percepatan dorong terakhir (m/s²)
  fl = { airSpeed: 0, rho: 0, qDyn: 0, qHeat: 0, pAmb: 0, tAmb: 3, gLocal: 0, solar: 0, ax: 0, relSpeed: 0, vertSpeed: 0, maxQWarn: false };
  orb = { valid: false, state: 'bebas', pe: 0, ap: 0, e: 0, T: 0, a: 0, primary: '—' };
  destroyed = false;
  shipTgtVel = new THREE.Vector3();
  gForce = 0;
  scanLock = 0;
  loweredFlight = 0;

  // temp
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private q3 = new THREE.Quaternion();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private v4 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private camQ = new THREE.Quaternion();
  private camP = new THREE.Vector3();

  constructor(container: HTMLElement, ev: Events) {
    this.container = container;
    this.ev = ev;
  }

  // =============================================================== INIT
  async init() {
    const p = (v: number, l: string) => this.ev.onProgress(v, l);
    p(0.02, 'Menyalakan mesin grafis');
    const fine = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.5);
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5 || fine, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 4e9);
    this.world.add(this.sunLight, this.ambient);
    this.onResize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('mousemove', this.onMouse);
    window.addEventListener('mousedown', this.onMouseBtn);
    window.addEventListener('mouseup', this.onMouseBtn);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('beforeunload', this.save);
    document.addEventListener('pointerlockchange', this.onLockChange);
    await tick();

    p(0.05, 'Menyusun galaksi');
    this.stars = makeStarfield();
    this.world.add(this.stars.group);
    this.flares = makeFlares(this.world);
    this.dust = new Dust(this.world);
    this.belt = new AsteroidBelt(this.world);
    await tick();

    const defs = makeSolarSystem();
    for (let i = 0; i < defs.length; i++) {
      p(0.1 + (i / defs.length) * 0.55, `Membangkitkan ${defs[i].name}`);
      const b = new Body(defs[i], this.world);
      this.bodies.push(b);
      this.byId.set(b.id, b);
      await tick();
    }
    this.sun = this.byId.get('matahari')!;

    p(0.7, 'Membangun stasiun & wahana');
    this.station = makeStation();
    this.world.add(this.station);
    this.voyager = makeVoyager();
    this.world.add(this.voyager);
    this.landmarks.push(
      { id: 'stasiun', name: 'Stasiun Garuda', kind: 'Stasiun Antariksa', pos: new THREE.Vector3(), radius: 700, info: { radiusKm: '~1,2 km', gravity: 'Gaya sentrifugal', temp: '21 °C', atm: 'Terkendali', desc: 'Stasiun antariksa berputar yang mengorbit Bumi. Cincin hunian, panel surya, dan lampu navigasinya berkedip di kegelapan.' } },
      { id: 'voyager', name: 'Voyager 1', kind: 'Wahana Antariksa', pos: new THREE.Vector3(70e6, 5e6, -22e6), radius: 20, info: { radiusKm: '~3,7 m', gravity: '—', temp: '-250 °C', atm: 'Hampa', desc: 'Wahana tertua yang menjelajah di luar tata surya, membawa piringan emas "Golden Record" berisi suara Bumi.' } }
    );
    // stasiun modular Kartika — bisa dipasang/dilepas modulnya
    {
      const st = new Habitat('kartika', 'Stasiun Kartika', 'station');
      st.stOffset.set(Math.cos(0.9) * 260000, 30000, Math.sin(0.9) * 260000);
      for (const m of STATION_LAYOUT) st.place(m.type, m.ix, m.iz, m.rot);
      st.rebuild();
      this.addHab(st);
    }
    for (const b of this.bodies) this.registerBody(b);
    this.fx = new WeatherFX(this.world);
    this.fx.onImpact = (d) => this.onMeteorImpact(d);
    this.life = new LifeField(this.world);
    this.rv.rig = makeRover();
    this.rv.rig.group.visible = false;
    this.world.add(this.rv.rig.group);
    await tick();

    p(0.76, 'Merakit kapal Nusantara-7');
    this.rig = buildShip();
    this.shipScene.add(this.rig.group, this.rig.sun, this.habHemi, this.habLight);
    this.habLight.position.set(0, 2.4, 0);
    await tick();

    // posisi awal: dekat Bumi sisi siang
    for (const b of this.bodies) { b.orbit(this.time, this.byId); b.orbit(this.time, this.byId); }
    this.updateLandmarks();
    const bumi = this.byId.get('bumi')!;
    this.loadSave();
    for (const h of this.habs) h.updatePose(this.origin, bumi, this.sun.pos);
    const toSun = this.v1.copy(this.sun.pos).sub(bumi.pos).normalize();
    toSun.applyAxisAngle(Y, 0.7);
    toSun.y += 0.28;
    toSun.normalize();
    this.shipPos.copy(bumi.pos).addScaledVector(toSun, bumi.R * 2.2);
    this.m4.lookAt(new THREE.Vector3(0, 0, 0), this.v3.copy(bumi.pos).sub(this.shipPos).normalize(), Y);
    this.shipQuat.setFromRotationMatrix(this.m4);
    // orbit lingkaran awal di sekitar Bumi: v = √(μ/r) tegak lurus radial
    {
      const rr = bumi.R * 2.2;
      const tang = new THREE.Vector3().copy(toSun).cross(Y);
      if (tang.lengthSq() < 1e-6) tang.set(1, 0, 0);
      tang.normalize();
      this.shipVel.copy(tang).multiplyScalar(PH.circularSpeed(bumi.mu, rr));
      this.shipFrame.p = bumi;
      this.shipFrame.att = false;
      this.belt.omega = PH.orbitalOmega(this.sun.mu, 17.5e6);
    }
    this.origin.copy(this.shipPos);

    // pemanasan LOD
    this.buildBudget = 60;
    for (let i = 0; i < 22; i++) {
      p(0.8 + (i / 22) * 0.19, 'Membentuk permukaan planet');
      this.step(0.001);
      this.render();
      await tick();
    }
    this.buildBudget = 4;
    p(1, 'Siap');
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('mousemove', this.onMouse);
    window.removeEventListener('mousedown', this.onMouseBtn);
    window.removeEventListener('mouseup', this.onMouseBtn);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('beforeunload', this.save);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.save();
    this.audio.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }

  onResize = () => {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const asp = w / h;
    this.camera.aspect = asp;
    this.baseFov = asp < 1 ? clamp((2 * Math.atan(Math.tan((72 * Math.PI) / 360) / asp) * 180) / Math.PI, 72, 104) : 72;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  };
  baseFov = 72;

  onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (e.type === 'keydown' && (e.ctrlKey || e.metaKey || e.altKey) && k !== 'control') return;
    if (['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '/'].includes(k)) e.preventDefault();
    if (e.type === 'keydown') {
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'f' || k === 'enter') this.interact();
      if (k === ' ') this.input.jump = true;
      if (k === 't') this.standSit();
      if (k === 'g') this.plantFlag();
      if (k === 'x') this.brake(true);
      if (k === 'v') this.toggleView();
      if (k === 'b') this.setBoost(true);
      if (k === 'm') this.audio.setMuted(!this.audio.muted);
      if (k === 'tab' || k === 'n') this.ev.onUi?.('map');
      if (k === 'j') this.ev.onUi?.('missions');
      if (k === 'h') this.ev.onUi?.('build');
      if (k === '/' || k === '?' || k === 'f1') this.ev.onUi?.('help');
      if (k === 'r') this.toggleRover();
      if (k === 'k') this.deployBase();
      if (k === 'u') this.dockToggle();
      if (k === 'l') this.toggleLook();
      if (k === 'o') this.returnToShip();
      if (k === 'p') this.autopilot ? this.cancelAutopilot() : this.engageAutopilot();
      if (k === 'y') this.toggleHold();
      if (k === 'i') this.toggleLandAssist();
      if (k === '.') this.warpStep(1);
      if (k === ',') this.warpStep(-1);
    } else {
      this.keys.delete(k);
      if (k === 'x') this.brake(false);
      if (k === 'b') this.setBoost(false);
    }
  };

  onBlur = () => { this.keys.clear(); this.brake(false); this.setBoost(false); };

  onMouse = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (this.mode === 'pilot' && !this.lookMode && this.view === 'cockpit') {
      this.mouseSteer.x = clamp(this.mouseSteer.x + mx * 0.0042, -1, 1);
      this.mouseSteer.y = clamp(this.mouseSteer.y - my * 0.0042, -1, 1);
    } else this.addLook(mx * 0.9, my * 0.9);
  };

  onMouseBtn = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    if (e.type === 'mousedown') {
      if (e.button === 0) this.interact();
      if (e.button === 2) this.brake(true);
    } else if (e.button === 2) this.brake(false);
  };

  onWheel = (e: WheelEvent) => {
    if (!this.running) return;
    if ((e.target as HTMLElement)?.closest?.('[data-ui]')) return;
    e.preventDefault();
    if (this.mode === 'pilot' && !this.docked) this.setThrottle(this.throttle - e.deltaY * 0.0006);
  };

  onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer?.domElement;
    this.ev.onUi?.(this.pointerLocked ? 'lock' : 'unlock');
    if (!this.pointerLocked) { this.mouseSteer.set(0, 0); this.brake(false); }
  };

  lockPointer() {
    try { this.renderer.domElement.requestPointerLock?.(); } catch { /* abaikan */ }
  }

  // =============================================================== PUBLIC ACTIONS
  startAudio() { this.audio.start(); }
  toggleHold() {
    if (this.mode === 'eva') return;
    this.holdMode = !this.holdMode;
    if (this.holdMode) { this.autopilot = false; this.landAssist = false; this.throttle = 0; this.toast('TAHAN: menahan kecepatan relatif nol terhadap acuan (menggunakan bahan bakar)', 'info'); } else this.toast('TAHAN dimatikan', 'info');
    this.audio.click();
  }

  toggleLandAssist() {
    if (this.mode === 'eva') return;
    const nb = this.env.nearest;
    if (!this.landAssist && !(nb && nb.isTerrain && this.env.alt < 200000)) { this.toast('Pendaratan otomatis butuh benda padat di bawah (< 200 km)', 'warn'); return; }
    if (!this.landAssist && this.env.g > SHIP.aVert * 0.95) this.toast('Gravitasi mendekati batas thruster vertikal — pendaratan sulit', 'warn');
    this.landAssist = !this.landAssist;
    if (this.landAssist) { this.autopilot = false; this.holdMode = false; this.throttle = 0; this.toast('PENDARATAN OTOMATIS: turun dengan profil kecepatan aman', 'info'); } else this.toast('Pendaratan otomatis dimatikan', 'info');
    this.audio.click();
  }

  warpStep(dir: number) {
    const W = [1, 5, 25, 100, 500, 2000];
    const i = Math.max(0, W.indexOf(this.warp));
    const w = W[Math.max(0, Math.min(W.length - 1, i + dir))];
    if (w === this.warp) return;
    if (w > 1 && (this.mode !== 'pilot' || this.docked)) { this.toast('Percepatan waktu hanya saat memilot di luar dermaga', 'warn'); return; }
    this.setWarp(w);
  }

  setThrottle(v: number) {
    if (v > 0.02) { this.holdMode = false; this.landAssist = false; }
    this.throttle = clamp(v);
    if (this.autopilot) { this.autopilot = false; this.toast('Autopilot dimatikan (kendali manual)', 'info'); }
    if (v > 0.02) this.braking = false;
  }
  setSteer(x: number, y: number) { this.input.steerX = x; this.input.steerY = y; }
  setMove(x: number, y: number, run = false) { this.input.moveX = x; this.input.moveY = y; this.input.run = run; }
  setRoll(r: number) { this.input.roll = r; }
  setVert(v: number) { this.input.vert = v; }
  setJet(up: boolean, down: boolean) { this.input.jetUp = up; this.input.jetDown = down; }
  addLook(dx: number, dy: number) { this.input.lookDX += dx; this.input.lookDY += dy; }
  brake(b: boolean) {
    this.braking = b;
    if (b) { this.autopilot = false; this.throttle = 0; }
  }
  setBoost(b: boolean) {
    if (b && !this.boost && this.mode === 'pilot') this.audio.boost();
    this.boost = b;
  }
  toggleLook() { this.lookMode = !this.lookMode; this.audio.click(); }
  toggleView() {
    if (this.mode !== 'pilot') return;
    this.view = this.view === 'cockpit' ? 'chase' : 'cockpit';
    this.headYaw = 0; this.headPitch = this.view === 'chase' ? 0.15 : 0;
    this.audio.click();
  }
  toggleMute() { this.audio.setMuted(!this.audio.muted); }
  jump() { this.input.jump = true; }

  selectTarget(id: string | null) {
    this.targetId = id;
    this.audio.select();
  }

  engageAutopilot() {
    const t = this.getTarget();
    if (!t) { this.toast('Pilih target di peta terlebih dahulu', 'warn'); return; }
    if (this.mode === 'eva') return;
    this.autopilot = true;
    this.braking = false;
    this.view = this.view;
    this.audio.engage();
    this.toast(`Autopilot menuju ${t.name}`, 'info');
  }
  cancelAutopilot() { if (this.autopilot) { this.autopilot = false; this.audio.close(); this.toast('Autopilot dimatikan', 'info'); } }

  scanTarget() {
    const t = this.getTarget();
    if (!t) { this.toast('Pilih target untuk dipindai', 'warn'); return; }
    this.audio.scan();
    if (t.body) this.scannedBodies.add(t.body.id);
    setTimeout(() => {
      const b = t.body;
      let extra = '';
      if (b && b.isTerrain) {
        const life = this.lifeProfiles.get(b.id);
        const hz = this.hazards.profileCache.get(b.id) || [];
        const names = [...new Set(hz)].map((h) => HAZARDS[h].label);
        extra = ` · ${life ? life.label : 'Tanpa kehidupan terdeteksi'} · ${names.length ? 'Bahaya: ' + names.join(', ') : 'Cuaca tenang'}`;
      }
      this.toast(`Pemindaian ${t.name} selesai${extra}`, 'info');
    }, 1100);
  }

  standSit() {
    if (this.mode === 'pilot') {
      if (this.view === 'chase') { this.view = 'cockpit'; }
      this.mode = 'walk';
      this.walkPos.set(-0.45, 1.65, -1.9);
      this.walkYaw = 0;
      this.headYaw = 0; this.headPitch = 0;
      this.autopilotKeep();
      this.audio.open();
    } else if (this.mode === 'walk') {
      const dx = this.walkPos.x - SEAT_POS.x, dz = this.walkPos.z - SEAT_POS.z;
      if (Math.hypot(dx, dz) < 1.7) {
        this.mode = 'pilot';
        this.headYaw = 0; this.headPitch = 0;
        this.audio.close();
      } else this.toast('Dekati kursi pilot untuk duduk', 'info');
    }
  }
  private autopilotKeep() { /* autopilot tetap berjalan saat berjalan di kabin */ }

  interact() {
    const pr = this.getPrompt();
    if (!pr) return;
    if (pr.action === 'sit') this.standSit();
    else if (pr.action === 'exit') this.startExit();
    else if (pr.action === 'enter') this.startEnter();
    else if (pr.action === 'flag') this.plantFlag();
    else if (pr.action === 'stand') this.standSit();
    else if (pr.action === 'habin') this.startHabEnter();
    else if (pr.action === 'sample') this.collectSample();
    else if (pr.action === 'mount') this.mountRover();
    else if (pr.action === 'dismount') this.dismountRover();
    else if (pr.action === 'scan-fauna' || pr.action === 'scan-flora') this.scanLife(pr.action === 'scan-fauna' ? 'fauna' : 'flora');
    else if (pr.action === 'dock') this.dockToggle();
    else if (pr.action === 'undock') this.undock();
    else if (pr.action.startsWith('h:')) this.habAction(pr.action.slice(2));
  }

  returnToShip() {
    if (this.mode !== 'eva') return;
    if (this.rv.riding) this.dismountRover();
    this.autoReturn = true;
    this.toast('Tali penarik diaktifkan — kembali ke kapal', 'info');
    this.audio.engage();
  }

  startExit() {
    if (this.mode !== 'walk' || this.seq) return;
    if (this.shipRelSpeed() > 40 && !this.docked) { this.toast('Kapal harus hampir diam (<40 m/s) — tekan REM', 'warn'); this.audio.warn(); return; }
    if (this.env.nearest && (this.env.nearest.isSun || (this.env.nearest.isGas && this.env.alt < this.env.nearest.R * 0.2)) && this.env.alt < this.env.nearest.R * 1.5) {
      this.toast('Terlalu berbahaya untuk keluar di sini', 'warn');
      this.audio.warn();
      return;
    }
    this.autopilot = false;
    this.throttle = 0;
    this.mode = 'airlock';
    this.seq = { type: 'exit', t: 0, label: this.linkHab ? 'Membuka lorong ' + this.linkHab.name + '…' : 'Menyegel airlock…', done1: false, done2: false, done3: false };
    this.audio.thunk();
  }

  startEnter() {
    if (this.mode !== 'eva' || this.seq) return;
    this.autoReturn = false;
    this.seq = { type: 'enter', t: 0, label: 'Masuk airlock…', done1: false, done2: false, done3: false };
    this.audio.thunk();
  }

  plantFlag() {
    if (this.mode !== 'eva') return;
    const b = this.envCam.nearest;
    if (!b || !b.isTerrain || !this.astro.grounded) { this.toast('Berdirilah di permukaan padat untuk menancapkan bendera', 'warn'); return; }
    const rel = this.v1.copy(this.astro.pos).sub(b.pos);
    const dirW = rel.clone().normalize();
    const dirL = b.toLocal(dirW, new THREE.Vector3());
    const r = b.surfaceRadius(dirL);
    const flag = makeFlag();
    flag.position.copy(dirL).multiplyScalar(r);
    this.q1.setFromUnitVectors(Y, dirL);
    flag.quaternion.copy(this.q1);
    // posisi sedikit di depan pemain
    b.spinG.add(flag);
    this.flags.push({ body: b, mesh: flag });
    if (!b.flagged) {
      b.flagged = true;
      this.toast(`Bendera Merah Putih berkibar di ${b.def.name}!`, 'discover');
      this.audio.discover();
    }
    this.audio.flag();
  }

  spawnWorld() {
    if (this.genCount >= 4) { this.toast('Batas dunia generatif tercapai', 'warn'); return; }
    this.genCount++;
    const f = this.v1.set(0, 0, -1).applyQuaternion(this.shipQuat);
    const pos: [number, number, number] = [this.shipPos.x + f.x * 4.5e6, this.shipPos.y + f.y * 4.5e6 + 2e5, this.shipPos.z + f.z * 4.5e6];
    const def = generateWorld(Math.floor(Math.random() * 1e9), this.genCount, pos);
    const b = new Body(def, this.world);
    b.orbit(this.time, this.byId); b.orbit(this.time, this.byId);
    this.bodies.push(b);
    this.byId.set(b.id, b);
    this.registerBody(b);
    this.emit('spawn-world', {});
    this.targetId = b.id;
    this.audio.discover();
    this.toast(`Dunia baru dibangkitkan: ${def.name} — di depan kapal`, 'discover');
  }

  toast(msg: string, kind: 'info' | 'discover' | 'warn' = 'info') { this.ev.onToast(msg, kind); }

  // =============================================================== HABITAT / MISI / KENDARAAN
  registerBody(b: Body) {
    if (!b.isTerrain) return;
    const gen = b.def.fixedPos ? b.def.seed : undefined;
    const hasAtm = !!b.def.atm;
    const hasSea = !!b.def.t && b.def.t.sea !== null;
    this.hazards.setProfile(b.id, hazardsOf(b.id, gen, hasAtm, hasSea));
    this.lifeProfiles.set(b.id, lifeOf(b.id, gen, hasAtm, hasSea));
    this.siteLeft.set(b.id, 14);
  }

  addHab(h: Habitat) {
    this.habs.push(h);
    h.attachExterior(this.world);
    h.int.visible = false;
    this.shipScene.add(h.int);
    const isSt = h.kind === 'station';
    this.landmarks.push({
      id: h.id, name: h.name, kind: isSt ? 'Stasiun Modular' : 'Basecamp', pos: h.pos, radius: 25, stop: isSt ? 100 : 500,
      info: {
        radiusKm: '~30 m', gravity: isSt ? 'Mikro (gravitasi buatan di kabin)' : 'Sesuai planet', temp: '21 °C', atm: 'Terkendali',
        desc: isSt
          ? 'Stasiun modular yang modulnya dapat dipasang dan dilepas lewat Konsol Modul di Hub. Sandar di dermaga untuk masuk dari kapal.'
          : 'Basecamp modular di permukaan. Tambah Lab, Rumah Kaca, Garasi Rover, Komunikasi — atau lepas modul lewat Konsol Modul.',
      },
    });
  }

  emit(ev: string, data: any = {}) {
    for (const r of this.missions.emit(ev, data)) {
      if (r.kind === 'done') {
        this.credits += r.reward ?? 0;
        this.toast(`Misi selesai: ${r.text} · +${r.reward} kredit`, 'discover');
        this.audio.discover();
        this.save();
      } else if (r.kind === 'step') {
        this.toast(r.mission.title + ' — ' + r.text, 'info');
        this.audio.select();
      } else this.toast(r.text, 'info');
    }
  }

  save = () => {
    try {
      const o = {
        v: 2, credits: this.credits, samples: this.samplesHeld, missions: this.missions.toJSON(),
        habs: this.habs.map((h) => h.toJSON()), left: [...this.siteLeft],
      };
      localStorage.setItem('nusantara-save-v2', JSON.stringify(o));
    } catch { /* abaikan */ }
  };

  resetSave() {
    try { localStorage.removeItem('nusantara-save-v2'); } catch { /* abaikan */ }
    location.reload();
  }

  private loadSave() {
    try {
      const raw = localStorage.getItem('nusantara-save-v2');
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || o.v !== 2) return;
      this.credits = typeof o.credits === 'number' ? o.credits : 600;
      this.samplesHeld = o.samples | 0;
      this.missions.load(o.missions);
      for (const [k, v] of (o.left || []) as [string, number][]) this.siteLeft.set(k, v);
      const valid = (m: any) => m && MOD_DEFS[m.type as ModType] && Number.isFinite(m.ix) && Number.isFinite(m.iz);
      for (const hs of (o.habs || []) as HabSave[]) {
        if (hs.kind === 'station') {
          const h = this.habs.find((x) => x.id === hs.id);
          if (h && hs.mods?.some(valid)) { h.mods.clear(); for (const m of hs.mods) if (valid(m)) h.place(m.type, m.ix, m.iz, m.rot | 0); h.rebuild(); }
        } else {
          const b = hs.bodyId ? this.byId.get(hs.bodyId) : undefined;
          if (!b || !hs.dir || !b.isTerrain) continue;
          const h = new Habitat(hs.id, hs.name, 'base');
          h.body = b;
          h.dirL.set(hs.dir[0], hs.dir[1], hs.dir[2]).normalize();
          h.yaw = hs.yaw || 0;
          for (const m of hs.mods) if (valid(m)) h.place(m.type, m.ix, m.iz, m.rot | 0);
          h.rebuild();
          this.addHab(h);
        }
      }
    } catch { /* abaikan data rusak */ }
  }

  currentHab(): Habitat | null {
    if (this.inHab) return this.inHab;
    const o = this.mode === 'eva' ? this.astro.pos : this.shipPos;
    let best: Habitat | null = null, bd = 150;
    for (const h of this.habs) { const d = o.distanceTo(h.pos); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  getBuildState(): BuildState | null {
    const h = this.currentHab();
    if (!h) return null;
    const core = h.coreKey();
    return {
      id: h.id, name: h.name, kind: h.kind,
      power: { gen: h.powerGen, use: h.powerUse, ratio: h.powerRatio, solar: h.solarFactor },
      credits: this.credits,
      mods: [...h.mods.values()].map((m) => ({ key: m.key, ix: m.ix, iz: m.iz, type: m.type, rot: m.rot, core: m.key === core, ports: h.worldPorts(m), open: h.openWorld(m) })),
      slots: h.slots(),
      here: this.inHab ? `${Math.round(this.walkPos.x / CELL)},${Math.round(this.walkPos.z / CELL)}` : null,
    };
  }

  slotsFor(type: ModType): AttachSlot[] {
    const h = this.currentHab();
    return h ? h.slots(type) : [];
  }

  attachModule(type: ModType, anchor: string, side: number): string | null {
    const h = this.currentHab();
    if (!h) return 'Tidak ada habitat di dekat Anda';
    const def = MOD_DEFS[type];
    if (this.credits < def.cost) return `Kredit kurang (butuh ${def.cost})`;
    const err = h.canAttach(type, anchor, side);
    if (err) return err;
    const m = h.attach(type, anchor, side);
    if (!m) return 'Gagal memasang modul';
    this.credits -= def.cost;
    this.audio.thunk();
    this.audio.engage();
    this.toast(`${def.name} terpasang di ${h.name}`, 'discover');
    this.emit('attach', { kind: h.kind, type });
    this.save();
    return null;
  }

  detachModule(key: string): string | null {
    const h = this.currentHab();
    if (!h) return 'Tidak ada habitat di dekat Anda';
    if (key === h.coreKey()) return 'Hub inti tidak dapat dilepas';
    const removed = h.detach(key);
    if (!removed.length) return 'Modul tidak ditemukan';
    let refund = 0;
    for (const m of removed) refund += Math.round(MOD_DEFS[m.type].cost * 0.6);
    this.credits += refund;
    this.audio.thunk();
    this.audio.hiss(1.4);
    this.toast(`${removed.length} modul dilepas · +${refund} kredit`, 'info');
    if (this.inHab === h && h.blocked(this.walkPos.x, this.walkPos.z, 0)) { const sp = h.spawnPoint(); this.walkPos.copy(sp); this.eyeLocal.copy(sp); }
    if (this.docked === h && !h.has('dock')) this.undock();
    this.emit('detach', { kind: h.kind });
    this.save();
    return null;
  }

  // ------------------------------------------------ sandar
  dockToggle() {
    if (this.docked) { this.undock(); return; }
    if (this.mode !== 'pilot') return;
    if (this.canDockHab) this.beginDock(this.canDockHab);
    else this.toast('Dekati dermaga stasiun (< 70 m, pelan) untuk sandar', 'warn');
  }

  private beginDock(h: Habitat) {
    this.docked = h;
    this.dockAnim = { t: 0, fromP: this.shipPos.clone().sub(h.pos), fromQ: this.shipQuat.clone() };
    this.throttle = 0; this.autopilot = false; this.braking = false;
    this.audio.engage();
    this.toast(`Sandar otomatis ke ${h.name}…`, 'info');
  }

  undock() {
    const h = this.docked;
    if (!h) return;
    const dock = h.modulesOf('dock')[0];
    this.docked = null;
    this.dockAnim = null;
    this.throttle = 0;
    if (dock) {
      const dn = h.hatchDirLocal(dock, this.v1).applyQuaternion(h.quat);
      this.shipVel.copy(h.vel).sub(this.findPrimary(this.shipPos).vel).addScaledVector(dn, 3);
      this.shipPos.addScaledVector(dn, 3);
    }
    this.audio.thunk();
    this.toast('Sandar dilepas', 'info');
  }

  private dockPose(h: Habitat, outP: THREE.Vector3, outQ: THREE.Quaternion): boolean {
    const dock = h.modulesOf('dock')[0];
    if (!dock) return false;
    const C = h.hatchWorld(dock, this.v2);
    const dn = h.hatchDirLocal(dock, this.v3).applyQuaternion(h.quat);
    const up = this.v4.set(0, 1, 0).applyQuaternion(h.quat);
    const x = dn.clone().negate();
    const z = x.clone().cross(up).normalize();
    const y = z.clone().cross(x).normalize();
    this.m4.makeBasis(x, y, z);
    outQ.setFromRotationMatrix(this.m4);
    const Hs = new THREE.Vector3(2.04, 1.08, 4.9).applyQuaternion(outQ);
    outP.copy(C).addScaledVector(dn, DOCK_GAP).sub(Hs);
    return true;
  }

  private updateLink(dt: number) {
    this.canDockHab = null;
    this.linkHab = this.docked;
    if (this.dockAnim && this.docked) {
      const a = this.dockAnim;
      a.t += dt;
      const f = smooth(0, 3.4, a.t);
      const P = new THREE.Vector3(), Q = new THREE.Quaternion();
      if (this.dockPose(this.docked, P, Q)) {
        this.shipPos.copy(this.docked.pos).add(this.v1.lerpVectors(a.fromP, P.sub(this.docked.pos), f));
        this.shipQuat.copy(a.fromQ).slerp(Q, f);
      }
      this.shipVel.copy(this.docked.vel).sub(this.findPrimary(this.shipPos).vel);
      if (a.t >= 3.4) {
        this.dockAnim = null;
        this.toast(`Tersandar di ${this.docked.name}`, 'discover');
        this.audio.thunk();
        this.emit('dock', { id: this.docked.id });
      }
      return;
    }
    if (this.docked) {
      const P = new THREE.Vector3(), Q = new THREE.Quaternion();
      if (this.dockPose(this.docked, P, Q)) { this.shipPos.copy(P); this.shipQuat.copy(Q); }
      this.shipVel.copy(this.docked.vel).sub(this.findPrimary(this.shipPos).vel);
      return;
    }
    for (const h of this.habs) {
      if (h.kind === 'station') {
        const dock = h.modulesOf('dock')[0];
        if (!dock) continue;
        const C = h.hatchWorld(dock, this.v1);
        const vrel = this.shipVel.clone().add((this.shipFrame.p ?? this.sun).vel).sub(h.vel).length();
        if (this.shipPos.distanceTo(C) < 70 && vrel < 10) this.canDockHab = h;
      } else if (this.landed && this.shipPos.distanceTo(h.pos) < 90) this.linkHab = h;
    }
  }

  // ------------------------------------------------ transisi masuk/keluar habitat
  private transition(label: string, mid: () => void) {
    if (this.seq) return;
    this.seq = { type: 'trans', t: 0, label, done1: false, done2: false, done3: false, mid };
    this.audio.thunk();
  }

  private entryModule(h: Habitat): PlacedMod | undefined {
    return h.modulesOf('dock')[0] || h.modulesOf('airlock')[0] || h.mods.values().next().value;
  }

  private setInHab(h: Habitat, m: PlacedMod | undefined) {
    this.inHab = h;
    this.mode = 'hab';
    this.view = 'cockpit';
    const ep = m ? h.entryPoint(m) : { pos: h.spawnPoint(), yaw: 0 };
    this.walkPos.set(ep.pos.x, 1.65, ep.pos.z);
    this.eyeLocal.copy(this.walkPos);
    this.headYaw = ep.yaw; this.headPitch = 0;
    this.walkVel.set(0, 0);
    this.jumpY = 0; this.jumpV = 0;
    this.autoReturn = false;
    this.rv.riding = false;
    this.throttle = 0; this.autopilot = false;
    for (const x of this.habs) x.int.visible = x === h;
    this.audio.open();
    this.toast(`Masuk ${h.name}`, 'info');
    this.emit('enter-hab', { kind: h.kind, id: h.id });
  }

  startHabEnter() {
    if (this.mode !== 'eva' || this.seq) return;
    const hit = this.nearestHatch();
    if (!hit) return;
    if (this.rv.riding) this.dismountRover();
    this.transition('Menyamakan tekanan…', () => { this.audio.hiss(1.6); this.setInHab(hit.h, hit.m); });
  }

  private nearestHatch(): { h: Habitat; m: PlacedMod; d: number } | null {
    let best: { h: Habitat; m: PlacedMod; d: number } | null = null;
    for (const h of this.habs) {
      for (const m of h.modulesOf('airlock')) {
        const d = h.hatchWorld(m, this.v2).distanceTo(this.astro.pos);
        if (d < 6.5 && (!best || d < best.d)) best = { h, m, d };
      }
    }
    return best;
  }

  private leaveHabToEva(h: Habitat, m: PlacedMod) {
    this.transition('Depresurisasi…', () => {
      this.audio.hiss(2);
      const hatchW = h.hatchWorld(m, new THREE.Vector3());
      const dnW = h.hatchDirLocal(m, new THREE.Vector3()).applyQuaternion(h.quat);
      const upH = new THREE.Vector3(0, 1, 0).applyQuaternion(h.quat);
      this.astro.pos.copy(hatchW).addScaledVector(dnW, 2.4).addScaledVector(upH, 0.6);
      const Pn = this.findPrimary(this.astro.pos);
      this.astroFrame.p = Pn;
      if (h.kind === 'base') { this.astroFrame.att = true; this.astro.vel.set(0, 0, 0); this.astro.gfac = 1; }
      else { this.astroFrame.att = false; this.astro.vel.copy(h.vel).sub(Pn.vel); this.astro.gfac = 0; }
      this.m4.lookAt(new THREE.Vector3(0, 0, 0), dnW, upH);
      this.astro.quat.setFromRotationMatrix(this.m4);
      this.astro.grounded = false;
      this.inHab = null;
      h.int.visible = false;
      this.mode = 'eva';
      this.input.moveX = 0; this.input.moveY = 0;
      this.toast('Berjalan di luar — hati-hati cuaca!', 'info');
    });
  }

  private enterShipFromHab() {
    this.transition('Berpindah ke kapal…', () => {
      if (this.inHab) this.inHab.int.visible = false;
      this.inHab = null;
      this.mode = 'walk';
      this.walkPos.set(1.1, 1.65, 4.9);
      this.eyeLocal.copy(this.walkPos);
      this.headYaw = Math.PI / 2; this.headPitch = 0;
      this.audio.open();
    });
  }

  private habAction(action: string) {
    const h = this.inHab;
    if (!h) return;
    const it = h.interactionAt(this.walkPos.x, this.walkPos.z);
    if (!it) return;
    switch (action) {
      case 'build': this.ev.onUi?.('build'); break;
      case 'out': this.leaveHabToEva(h, it.mod); break;
      case 'ship':
        if (this.linkHab === h) this.enterShipFromHab();
        else this.toast('Tidak ada kapal yang bersandar di sini', 'warn');
        break;
      case 'rest':
        this.transition('Beristirahat…', () => { this.suit = 1; this.oxygen = 1; this.toast('Segar kembali — baju & oksigen penuh', 'info'); this.emit('rest', {}); });
        break;
      case 'lab':
        if (this.samplesHeld > 0) {
          const n = this.samplesHeld, gain = n * 45;
          this.samplesHeld = 0;
          this.credits += gain;
          this.audio.discover();
          this.toast(`Analisis ${n} sampel selesai · +${gain} kredit`, 'discover');
          this.emit('analyze', { n });
          this.save();
        } else this.toast('Belum ada sampel. Kumpulkan sampel (tanda hijau) di permukaan dulu', 'warn');
        break;
      case 'harvest': {
        const last = this.harvestAt.get(h.id) ?? -999;
        if (this.time - last > 60) { this.harvestAt.set(h.id, this.time); this.credits += 20; this.oxygen = 1; this.audio.discover(); this.toast('Panen segar · +20 kredit · udara disegarkan', 'discover'); this.emit('harvest', {}); }
        else this.toast('Tanaman belum siap dipanen', 'info');
        break;
      }
      case 'power':
        this.toast(`Daya ${h.powerGen.toFixed(1)} / ${h.powerUse.toFixed(1)} kW · surya ×${h.solarFactor.toFixed(2)}`, 'info');
        break;
      case 'supply':
        this.oxygen = 1; this.suit = 1; this.audio.hiss(0.8); this.toast('Oksigen & baju terisi penuh', 'info');
        break;
      case 'rover':
        if (h.kind !== 'base') { this.toast('Rover hanya untuk basecamp planet', 'warn'); break; }
        this.leaveHabToEva(h, h.modulesOf('airlock')[0] || it.mod);
        this.pendingRover = true;
        break;
      case 'comms': this.ev.onUi?.('missions'); break;
    }
  }
  pendingRover = false;

  // ------------------------------------------------ basecamp
  deployBase() {
    if (this.mode !== 'eva' || this.rv.riding) { this.toast('Basecamp didirikan saat berjalan EVA di permukaan padat (tombol K)', 'warn'); return; }
    const A = this.astro;
    const b = this.envCam.nearest;
    if (!b || !b.isTerrain || !A.grounded) { this.toast('Berdirilah di permukaan padat untuk mendirikan basecamp', 'warn'); return; }
    if (this.habs.filter((x) => x.kind === 'base').length >= 6) { this.toast('Batas 6 basecamp tercapai', 'warn'); return; }
    const COST = 250;
    if (this.credits < COST) { this.toast(`Kredit kurang — basecamp butuh ${COST}`, 'warn'); return; }
    const upW = this.v1.copy(A.pos).sub(b.pos).normalize().clone();
    const fA = new THREE.Vector3(0, 0, -1).applyQuaternion(A.quat);
    const fH = fA.addScaledVector(upW, -fA.dot(upW));
    if (fH.lengthSq() < 0.01) fH.set(1, 0, 0).addScaledVector(upW, -upW.x);
    fH.normalize();
    const posW = A.pos.clone().addScaledVector(fH, 11);
    const dirW = posW.sub(b.pos).normalize();
    for (const h of this.habs) {
      if (h.body === b && h.pos.distanceTo(b.pos.clone().addScaledVector(dirW, b.R)) < 50) { this.toast('Terlalu dekat dengan struktur lain', 'warn'); return; }
    }
    const dirL = b.toLocal(dirW, new THREE.Vector3());
    // cek kemiringan
    const e1 = new THREE.Vector3().copy(dirL).cross(Math.abs(dirL.y) < 0.9 ? Y : X).normalize();
    const e2 = new THREE.Vector3().copy(dirL).cross(e1).normalize();
    const r0 = b.surfaceRadius(dirL);
    let worst = 0;
    for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const dd = dirL.clone().addScaledVector(e1, (a * 9) / b.R).addScaledVector(e2, (c * 9) / b.R).normalize();
      worst = Math.max(worst, Math.abs(b.surfaceRadius(dd) - r0));
    }
    if (worst > 8) { this.toast(`Medan terlalu miring (${worst.toFixed(0)} m) — cari tempat datar`, 'warn'); return; }
    const fL = b.toLocal(fH, new THREE.Vector3());
    const qBase = new THREE.Quaternion().setFromUnitVectors(Y, dirL);
    const v0 = new THREE.Vector3(0, 0, -1).applyQuaternion(qBase);
    const t = fL.clone().negate();
    const yaw = Math.atan2(dirL.dot(v0.clone().cross(t)), v0.dot(t));
    const n = this.habs.filter((x) => x.kind === 'base').length + 1;
    const h = new Habitat(`base-${Date.now().toString(36)}`, `Basecamp ${b.def.name} ${n}`, 'base');
    h.body = b; h.dirL.copy(dirL); h.yaw = yaw;
    for (const m of BASE_KIT) h.place(m.type, m.ix, m.iz, m.rot);
    h.rebuild();
    h.updatePose(this.origin, this.byId.get('bumi')!, this.sun.pos);
    this.addHab(h);
    for (const m of h.mods.values()) h.anim.set(m.key, 0);
    this.credits -= COST;
    this.audio.flag();
    this.audio.discover();
    this.toast(`${h.name} berdiri! Masuk lewat airlock`, 'discover');
    this.emit('deploy-base', { body: b.id });
    this.save();
  }

  // ------------------------------------------------ rover
  toggleRover() {
    if (this.mode !== 'eva') { this.toast('Rover dipanggil saat EVA di permukaan padat (tombol R)', 'warn'); return; }
    const rv = this.rv;
    if (rv.riding) { this.dismountRover(); return; }
    const A = this.astro;
    if (rv.deployed && rv.pos.distanceTo(A.pos) < 10) { this.mountRover(); return; }
    this.callRover();
  }

  callRover() {
    const A = this.astro;
    const b = this.envCam.nearest;
    if (!b || !b.isTerrain || !A.grounded) { this.toast('Rover hanya bisa dipanggil di permukaan padat', 'warn'); return; }
    const nearShip = A.pos.distanceTo(this.shipPos) < 40;
    const garage = this.habs.find((h) => h.kind === 'base' && h.body === b && h.has('garage') && h.pos.distanceTo(A.pos) < 90);
    if (!nearShip && !garage) { this.toast('Panggil Rover dekat kapal atau Garasi (≤ 40 m)', 'warn'); return; }
    const upW = this.v1.copy(A.pos).sub(b.pos).normalize().clone();
    const fA = new THREE.Vector3(0, 0, -1).applyQuaternion(A.quat);
    const fH = fA.addScaledVector(upW, -fA.dot(upW)).normalize();
    const posW = A.pos.clone().addScaledVector(fH, 7).sub(b.pos).normalize();
    this.rv.body = b;
    this.rv.speed = 0;
    this.placeRover(b, posW, fH);
    this.rv.deployed = true;
    this.rv.rig!.group.visible = true;
    this.audio.thunk();
    this.toast('Rover diturunkan — tekan R / "Naiki" untuk mengemudi', 'discover');
    this.emit('rover-call', {});
  }

  private placeRover(b: Body, dirW: THREE.Vector3, fwdW: THREE.Vector3) {
    const dirL = b.toLocal(dirW.clone(), new THREE.Vector3());
    const r = b.surfaceRadius(dirL);
    this.rv.pos.copy(dirW).multiplyScalar(r + 0.05).applyQuaternion(b.quat).add(b.pos);
    const up = this.rv.pos.clone().sub(b.pos).normalize();
    const f = fwdW.clone().addScaledVector(up, -fwdW.dot(up)).normalize();
    const right = f.clone().cross(up).normalize();
    this.m4.makeBasis(right, up, f.clone().negate());
    this.rv.quat.setFromRotationMatrix(this.m4);
  }

  mountRover() {
    const rv = this.rv;
    if (this.mode !== 'eva' || !rv.deployed) return;
    rv.riding = true;
    this.astro.vel.set(0, 0, 0);
    this.autoReturn = false;
    this.headYaw = 0; this.headPitch = 0.25;
    this.audio.close();
    this.toast('Mengemudi: W/S gas, A/D belok, B turbo, R turun', 'info');
  }

  dismountRover() {
    const rv = this.rv;
    if (!rv.riding) return;
    rv.riding = false;
    rv.speed = 0;
    const up = this.v1.set(0, 1, 0).applyQuaternion(rv.quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rv.quat);
    this.astro.pos.copy(rv.pos).addScaledVector(right, 2.6).addScaledVector(up, 1.2);
    this.astro.vel.set(0, 0, 0);
    this.astro.quat.copy(rv.quat);
    this.audio.open();
  }

  // ------------------------------------------------ sampel & pemindaian kehidupan
  private spawnSamples(b: Body) {
    const left = this.siteLeft.get(b.id) ?? 0;
    if (left <= 0) return;
    const n = Math.min(4, left);
    const A = this.astro;
    const dirP = b.toLocal(this.v1.copy(A.pos).sub(b.pos).normalize(), new THREE.Vector3());
    const e1 = new THREE.Vector3().copy(dirP).cross(Math.abs(dirP.y) < 0.9 ? Y : X).normalize();
    const e2 = new THREE.Vector3().copy(dirP).cross(e1).normalize();
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 1.2, rr = 35 + Math.random() * 65;
      const d = dirP.clone().addScaledVector(e1, (Math.cos(ang) * rr) / b.R).addScaledVector(e2, (Math.sin(ang) * rr) / b.R).normalize();
      const rad = b.surfaceRadius(d);
      if (b.tmpS.water) continue;
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0x40ff90, toneMapped: false, transparent: true, opacity: 0.92 }));
      mesh.frustumCulled = false;
      this.world.add(mesh);
      this.samples.push({ body: b, dirL: d, rad, mesh, taken: false });
    }
    this.siteLeft.set(b.id, left - n);
  }

  private nearestSample(maxD: number): { s: SampleSite; d: number } | null {
    const A = this.astro;
    let best: { s: SampleSite; d: number } | null = null;
    for (const s of this.samples) {
      if (s.taken) continue;
      const w = this.v2.copy(s.dirL).multiplyScalar(s.rad).applyQuaternion(s.body.quat).add(s.body.pos);
      const d = w.distanceTo(A.pos);
      if (d < maxD && (!best || d < best.d)) best = { s, d };
    }
    return best;
  }

  collectSample() {
    if (this.mode !== 'eva') return;
    const hit = this.nearestSample(4.5);
    if (!hit) return;
    hit.s.taken = true;
    this.world.remove(hit.s.mesh);
    hit.s.mesh.geometry.dispose();
    this.samplesHeld++;
    this.audio.discover();
    this.toast(`Sampel ${hit.s.body.def.name} terkumpul (${this.samplesHeld}) — bawa ke Lab`, 'discover');
    this.emit('sample', { body: hit.s.body.id });
    this.samples = this.samples.filter((x) => !x.taken);
  }

  scanLife(kind: 'fauna' | 'flora') {
    if (this.mode !== 'eva') return;
    const sp = this.life.nearest(kind, kind === 'fauna' ? 25 : 10);
    if (!sp) { this.toast('Tidak ada objek untuk dipindai', 'warn'); return; }
    if (this.life.scanned.has(sp.key)) { this.toast(`${sp.name} sudah tercatat`, 'info'); return; }
    this.life.scanned.add(sp.key);
    this.scanLock = 1.2;
    this.audio.scan();
    this.credits += kind === 'fauna' ? 25 : 10;
    const bn = this.envCam.nearest;
    setTimeout(() => {
      this.toast(`Tercatat: ${sp.name} (+${kind === 'fauna' ? 25 : 10} kredit)`, 'discover');
    }, 600);
    this.emit(kind === 'fauna' ? 'scan-fauna' : 'scan-flora', { body: bn?.id });
    if (bn && bn.def.fixedPos) this.emit('new-world-event', {});
  }

  // =============================================================== TARGET
  allTargets(): Target[] {
    const arr: Target[] = this.bodies.map((b) => ({ id: b.id, name: b.def.name, kind: b.def.kind, pos: b.pos, radius: b.R, body: b, info: b.def.info }));
    return arr.concat(this.landmarks);
  }
  getTarget(): Target | null {
    if (!this.targetId) return null;
    return this.allTargets().find((t) => t.id === this.targetId) || null;
  }
  listTargets(): TargetInfo[] {
    const o = this.mode === 'eva' ? this.astro.pos : this.shipPos;
    return this.allTargets().map((t) => ({
      id: t.id, name: t.name, kind: t.kind, dist: Math.max(0, t.pos.distanceTo(o) - t.radius), radius: t.radius,
      discovered: t.body ? t.body.discovered : true, visited: t.body ? t.body.visited : false,
      landed: t.body ? t.body.landedOn : false, flagged: t.body ? t.body.flagged : false,
      info: t.info, gen: !!t.body?.def.fixedPos, parent: t.body ? t.body.def.parent : null,
      ...this.knownExtra(t),
      ...this.physExtra(t),
    }));
  }

  private physExtra(t: Target): Partial<TargetInfo> {
    const b = t.body;
    if (!b) {
      const h = this.habs.find((x) => x.id === t.id);
      if (h && h.kind === 'station') { const r = h.stOffset.length(); const bm = this.byId.get('bumi')!; return { period: PH.orbitalPeriod(bm.mu, r) }; }
      return {};
    }
    const out: Partial<TargetInfo> = { gSurf: b.def.g, escV: PH.escapeSpeed(b.mu, b.R), circV: PH.circularSpeed(b.mu, b.R) };
    if (b.def.parent) { const p = this.byId.get(b.def.parent); if (p) out.period = PH.orbitalPeriod(p.mu, b.def.dist); }
    if (isFinite(b.soi)) out.soi = b.soi;
    return out;
  }

  private knownExtra(t: Target): { life?: string; hazards?: string[] } {
    const b = t.body;
    if (!b || !b.isTerrain) return {};
    if (b.def.fixedPos && !this.scannedBodies.has(b.id)) return { life: '? (belum dipindai)', hazards: ['? (pindai untuk tahu)'] };
    const life = this.lifeProfiles.get(b.id);
    const hz = [...new Set(this.hazards.profileCache.get(b.id) || [])].map((h) => HAZARDS[h].icon + ' ' + HAZARDS[h].label);
    return { life: life ? life.label : 'Tidak ada', hazards: hz.length ? hz : ['Tenang'] };
  }

  lmVel0 = new THREE.Vector3();
  private updateLandmarks() {
    const bumi = this.byId.get('bumi')!;
    const r = 320000, inc = 0.12;
    const w = PH.orbitalOmega(bumi.mu, r); // orbit Kepler lingkaran
    const a = 0.5 + w * this.time;
    const ca = Math.cos(a), sa = Math.sin(a), si = Math.sin(inc), ci = Math.cos(inc);
    const st = this.landmarks[0];
    st.pos.set(bumi.pos.x + ca * r, bumi.pos.y + sa * si * r, bumi.pos.z + sa * r * ci);
    this.lmVel0.set(bumi.vel.x - sa * r * w, bumi.vel.y + ca * si * r * w, bumi.vel.z + ca * ci * r * w);
  }

  /** kecepatan inersia target (m/s) */
  targetVel(t: Target, out = new THREE.Vector3()): THREE.Vector3 {
    if (t.body) return out.copy(t.body.vel);
    const h = this.habs.find((x) => x.id === t.id);
    if (h) return out.copy(h.vel);
    if (t.id === 'stasiun') return out.copy(this.lmVel0);
    return out.set(0, 0, 0);
  }

  /** maju satu langkah waktu dunia: waktu, orbit benda, landmark, stasiun */
  private advanceWorld(h: number, full: boolean) {
    this.time += h;
    for (const b of this.bodies) b.orbit(this.time, this.byId);
    this.updateLandmarks();
    const bumi = this.byId.get('bumi')!;
    for (const hb of this.habs) if (full || hb.kind === 'station') hb.updatePose(this.origin, bumi, this.sun.pos, this.time);
  }

  // =============================================================== LOOP
  loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (dt <= 0) return;
    this.step(dt);
    this.render();
  };

  /** Benda primer (bola pengaruh terkecil yang memuat titik); default Matahari. */
  findPrimary(pos: THREE.Vector3): Body {
    let best = this.sun, bs = Infinity;
    for (const b of this.bodies) {
      if (b.isSun) continue;
      if (b.soi < bs && pos.distanceToSquared(b.pos) < b.soi * b.soi) { best = b; bs = b.soi; }
    }
    return best;
  }

  /**
   * Bawa entitas bersama bingkai primer (translasi orbit primer). Bila `attached` (menapak/mendarat)
   * ikut berputar bersama benda; saat lepas, kecepatan inersia = kecepatan relatif + Ω×r (tanpa lompatan).
   * Saat berpindah bola pengaruh, kecepatan dikoreksi v_baru = v_lama + V_lama − V_baru.
   */
  private carry(pos: THREE.Vector3, vel: THREE.Vector3 | null, fr: { p: Body | null; att: boolean }, quat: THREE.Quaternion | null, attached: boolean) {
    const P = fr.p ?? this.findPrimary(pos);
    pos.add(this.v4.copy(P.pos).sub(P.prevPos));
    if (attached && !P.isSun) {
      this.q3.copy(P.prevQuat).invert();
      this.q3.premultiply(P.quat);
      const rel = this.v4.copy(pos).sub(P.pos).applyQuaternion(this.q3);
      pos.copy(P.pos).add(rel);
      if (quat) quat.premultiply(this.q3);
    }
    if (vel && attached !== fr.att && !P.isSun) {
      const w = this.v4.copy(pos).sub(P.pos);
      const sv = this.v3.copy(P.omegaVec).cross(w);
      if (fr.att && !attached) vel.add(sv); else vel.sub(sv);
    }
    fr.att = attached;
    const N = this.findPrimary(pos);
    if (N !== P && vel) vel.add(this.v4.copy(P.vel).sub(N.vel));
    fr.p = N;
  }

  // lingkungan (jarak permukaan, batas kecepatan, atmosfer)
  private computeEnv(pos: THREE.Vector3, e: Engine['env']) {
    let near: Body | null = null, nr = 1e9, lim = VMAX * (this.boost ? 2 : 1), dens = 0, atmB: Body | null = null, nearAlt = 1e9, gasDepth = 0;
    const kf = this.boost ? 1.4 : 0.5;
    let rhoMax = 0, physB: Body | null = null, pAmb = 0, tAmb = PH.T_SPACE, gNear = 0;
    for (const b of this.bodies) {
      const rel = this.v1.copy(pos).sub(b.pos);
      const d = rel.length();
      let alt = d - b.R;
      if (b.isTerrain && d < b.R + b.def.t!.amp * 3 + 800) {
        const dl = b.toLocal(rel.multiplyScalar(1 / d), this.v2);
        alt = d - b.surfaceRadius(dl);
      }
      const ratio = alt / b.R;
      if (ratio < nr) { nr = ratio; near = b; nearAlt = alt; gNear = b.mu / (d * d); }
      if (b.phys && alt < b.phys.H * 16) {
        const r0 = PH.atmDensity(b.phys, alt);
        if (r0 > rhoMax) { rhoMax = r0; physB = b; pAmb = PH.atmPressure(b.phys, b.def.g, alt); tAmb = PH.atmTemperature(b.phys, alt); }
      }
      if (b.isGas && alt < 0) lim = Math.min(lim, 400);
      else lim = Math.min(lim, Math.max(alt, 0) * kf + 6);
      if (b.def.atm) {
        let dn = 0;
        if (alt < b.atmThickness * 1.3) {
          dn = Math.exp(-Math.max(alt, 0) / b.def.atm.h);
          if (b.isGas && alt < 0) { dn = 1 + Math.min(-alt / (b.R * 0.05), 0.8); gasDepth = Math.max(gasDepth, -alt / b.R); }
        }
        if (dn > dens) { dens = dn; atmB = b; }
      }
    }
    if (this.belt.inside) {
      for (const r of this.belt.rocks) {
        const d = Math.hypot(pos.x - r.x, pos.y - r.y, pos.z - r.z) - r.r;
        if (d < 40000) lim = Math.min(lim, Math.max(d, 0) * kf + 6);
      }
    }
    for (const h of this.habs) {
      const d = pos.distanceTo(h.pos) - 20;
      if (d < 20000) lim = Math.min(lim, Math.max(d, 0) * 0.35 + 4);
    }
    e.nearest = near; e.alt = nearAlt; e.limit = Math.max(6, lim); e.dens = dens; e.atmBody = atmB; e.gasDepth = gasDepth;
    e.rho = rhoMax; e.physBody = physB; e.pAmb = pAmb; e.tAmb = tAmb; e.g = gNear;
  }

  private rollLevel(q: THREE.Quaternion, up: THREE.Vector3, k: number) {
    const f = this.v2.set(0, 0, -1).applyQuaternion(q);
    const r = this.v3.set(1, 0, 0).applyQuaternion(q);
    const rd = this.v4.copy(f).cross(up);
    if (rd.lengthSq() < 1e-4) return;
    rd.normalize();
    const cr = this.v1.copy(r).cross(rd);
    const ang = Math.atan2(f.dot(cr), r.dot(rd));
    this.q3.setFromAxisAngle(f, ang * k);
    q.premultiply(this.q3);
  }

  step(dt: number) {
    this.frameN++;
    const warp = this.effectiveWarp();
    this.warpNow = warp;
    if (warp <= 1) {
      this.advanceWorld(dt, true);
      // bawa entitas bersama bingkai primernya (translasi orbit; ikut berputar bila menapak)
      if (!this.docked) this.carry(this.shipPos, this.shipVel, this.shipFrame, this.shipQuat, this.landed && this.contact);
      if (this.mode === 'eva') this.carry(this.astro.pos, this.astro.vel, this.astroFrame, this.astro.quat, this.astro.gfac > 0.25 && !!this.envCam.nearest?.isTerrain);
      if (this.rv.deployed) this.carry(this.rv.pos, null, this.roverFrame, this.rv.quat, true);
    }

    this.computeEnv(this.shipPos, this.env);
    this.pollGamepad(dt);
    this.keyboardInput(dt);
    this.mouseSteer.multiplyScalar(Math.exp(-1.6 * dt));
    this.updateLink(dt);

    this.stepShip(dt);
    if (this.mode === 'eva') this.stepAstro(dt);

    this.stepSequence(dt);
    this.stepWalk(dt);
    this.stepHazards(dt);
    this.stepSamples(dt);
    if (this.pendingRover && this.mode === 'eva' && !this.seq && this.astro.grounded) { this.pendingRover = false; this.callRover(); }

    // oksigen & baju
    const eva = this.mode === 'eva';
    if (!eva) this.jetDv = Math.min(150, this.jetDv + dt * 30);
    if (eva && !this.rv.riding) {
      this.oxygen = Math.max(0, this.oxygen - dt / 420);
      if (this.oxygen < 0.2 && Math.floor(this.time * 2) % 8 === 0 && !this.warn) this.setWarn('Oksigen rendah', 3);
      if (this.oxygen <= 0 && !this.autoReturn) { this.autoReturn = true; this.toast('Oksigen habis! Penarikan darurat ke kapal', 'warn'); this.audio.warn(); }
    } else this.oxygen = Math.min(1, this.oxygen + dt * (eva ? 0.1 : 0.15));
    if (!eva || this.rv.riding) this.suit = Math.min(1, this.suit + dt * (eva ? 0.01 : 0.05));
    if (eva && this.suit <= 0 && !this.autoReturn) {
      this.rv.riding = false;
      this.autoReturn = true;
      this.suit = 0.02;
      this.toast('Baju rusak! Penarikan darurat ke kapal', 'warn');
      this.audio.warn();
    }
    if (eva && this.suit < 0.25 && Math.floor(this.time * 2) % 8 === 0 && !this.warn) this.setWarn('Integritas baju rendah', 3);

    this.cameraUpdate(dt);
    this.worldUpdate(dt);
    this.progressCheck(dt);

    // simpan berkala
    this.saveT += dt;
    if (this.saveT > 20) { this.saveT = 0; this.save(); }

    // HUD & layar
    this.hudT += dt; this.scrT += dt;
    if (this.scrT > 0.12) { this.scrT = 0; this.drawScreens(); }
    if (this.hudT > 0.1) { this.hudT = 0; this.ev.onHud(this.makeHud()); }
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0) this.warn = null; }
    this.input.lookDX = 0; this.input.lookDY = 0;
    this.input.jump = false;
    if (this.scanLock > 0) this.scanLock -= dt;

    // audio
    const speed = this.mode === 'eva' ? (this.rv.riding ? Math.abs(this.rv.speed) : this.astro.vel.length()) : this.shipVel.length();
    const hasMove = Math.abs(this.input.moveX) + Math.abs(this.input.moveY) > 0.2;
    this.audio.update({
      throttle: this.mode === 'eva' ? (this.rv.riding ? 0.25 + Math.abs(this.rv.speed) / 40 : 0) : Math.max(this.throttle, clamp(this.thrustAcc.length() / SHIP.aMain)) * 0.9,
      speed01: clamp(Math.log10(1 + this.shipVel.length()) / 5.5),
      atmo: clamp(this.envCam.dens), inside: this.mode !== 'eva' || this.rv.riding, eva: this.mode === 'eva' && !this.rv.riding,
      jet: this.mode === 'eva' && !this.rv.riding && (this.input.jetUp || this.input.jetDown || this.input.moveY !== 0 && !this.astro.grounded) ? 1 : 0,
      walking: ((this.mode === 'walk' || this.mode === 'hab') && hasMove && this.jumpY < 0.02) || (this.mode === 'eva' && !this.rv.riding && this.astro.grounded && hasMove),
      heat: this.heat, windSpeed: clamp(Math.max(speed / 1500, this.hazards.active ? HAZARDS[this.hazards.active.type].wind * this.hazards.active.k / 30 : 0)),
    }, dt);
    this.prevSpeed = speed;
  }

  private setWarn(m: string, t = 2.5) { this.warn = m; this.warnT = t; }

  // ------------------------------------------------ gamepad
  private pollGamepad(dt: number) {
    const gps = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gps && Array.from(gps).find((g) => g && g.connected);
    if (!gp) { this.padWas = false; return; }
    const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const btn = (i: number) => !!gp.buttons[i]?.pressed;
    const edge = (i: number, fn: () => void) => { const now = btn(i); if (now && !this.padBtn[i]) fn(); this.padBtn[i] = now; };
    edge(0, () => this.interact());
    edge(2, () => this.standSit());
    edge(3, () => this.ev.onUi?.('map'));
    edge(8, () => this.ev.onUi?.('missions'));
    edge(9, () => this.ev.onUi?.('build'));
    edge(10, () => this.toggleRover());
    edge(11, () => this.toggleView());
    edge(14, () => this.dockToggle());
    edge(15, () => this.deployBase());
    this.brake(btn(1) && this.mode === 'pilot');
    const active = lx || ly || rx || ry || btn(6) || btn(7);
    if (!active && !this.padWas) return;
    this.padWas = !!active;
    const inp = this.input;
    if (this.mode === 'pilot') {
      if (!this.lookMode && this.view === 'cockpit') { inp.steerX = rx * 0.9; inp.steerY = -ry * 0.9; }
      else this.addLook(rx * dt * 300, ry * dt * 300);
      inp.roll = (btn(5) ? 1 : 0) - (btn(4) ? 1 : 0);
      const trig = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
      if (trig) this.setThrottle(this.throttle + trig * dt * 0.6);
      inp.vert = (btn(12) ? 1 : 0) - (btn(13) ? 1 : 0);
    } else {
      inp.moveX = lx; inp.moveY = -ly;
      inp.run = Math.hypot(lx, ly) > 0.95;
      this.addLook(rx * dt * 320, ry * dt * 320);
      inp.jetUp = btn(7) || btn(12);
      inp.jetDown = btn(6) || btn(13);
      if (btn(5)) inp.jump = true;
    }
  }

  // ------------------------------------------------ cuaca & bencana
  private windVec(up: THREE.Vector3, out = new THREE.Vector3()) {
    return out.set(0.8, 0.1, 0.6).cross(up).normalize();
  }

  private hazardBody(): Body | null {
    const e = this.mode === 'eva' ? this.envCam : this.env;
    const b = e.nearest;
    if (!b || !b.isTerrain) return null;
    return e.alt < Math.max(b.atmThickness * 1.2, 20000) ? b : null;
  }

  private forecastKey = '';
  private stepHazards(dt: number) {
    const hb = this.hazardBody();
    this.hazards.update(dt, hb ? hb.id : null);
    const a = this.hazards.active, fl = this.hazards.flare;
    if (a && !a.warned) {
      a.warned = true;
      const info = HAZARDS[a.type];
      this.toast(`${info.icon} ${info.label} — ${info.desc.split('.')[0]}`, 'warn');
      this.audio.warn();
      this.emit('hazard-start', { type: a.type, body: a.bodyId });
      if (hb && hb.def.fixedPos) this.emit('new-world-event', {});
    }
    if (fl && !fl.warned) {
      fl.warned = true;
      this.audio.warn();
    }
    // peringatan dini
    const fc = this.hazards.forecast(hb ? hb.id : null);
    if (fc && !fc.active && fc.in < 22) {
      const key = fc.type + ':' + Math.floor(this.time / 60);
      if (key !== this.forecastKey) { this.forecastKey = key; this.audio.warn(); }
    }
    this.quakeK = a && a.type === 'quake' ? a.k : 0;
    this.radiation = fl ? fl.k : 0;
    const eva = this.mode === 'eva';
    this.sheltered = !eva;
    const exposure = eva ? (this.rv.riding ? 0.35 : 1) : 0;
    const A = this.astro;
    for (const hz of [a, fl]) {
      if (!hz || hz.k < 0.02) continue;
      const info = HAZARDS[hz.type];
      if (eva && info.suit > 0) this.suit = Math.max(0, this.suit - info.suit * hz.k * exposure * dt);
      if (!eva && hz.k > 0.3) this.emit('shelter-tick', { type: hz.type, body: hz.bodyId, hab: !!this.inHab, dt });
    }
    if (!eva && hb && this.env.alt < 8000) this.emit('low-flight', { body: hb.id, alt: this.env.alt, dt });
    // angin
    if (a && a.k > 0.02 && HAZARDS[a.type].wind > 0 && hb) {
      const info = HAZARDS[a.type];
      const up = this.v1.copy(eva ? A.pos : this.shipPos).sub(hb.pos).normalize();
      const w = this.windVec(up).multiplyScalar(info.wind * a.k);
      if (eva && !this.rv.riding) {
        if (A.grounded) A.pos.addScaledVector(w, dt * 0.1);
        else A.vel.addScaledVector(w, dt * 0.06);
      } else if (!eva && !this.docked && !this.landed && this.envCam.dens > 0.1) {
        this.shipVel.addScaledVector(w, dt * 0.05 * clamp(this.env.dens));
        this.shake = Math.max(this.shake, 0.012 * a.k * clamp(this.env.dens));
      }
      if (this.mode !== 'eva') this.shake = Math.max(this.shake, 0.004 * a.k);
    }
    // petir
    if (a && (a.type === 'storm' || a.type === 'acid') && a.k > 0.3 && Math.random() < dt * 0.5 * a.k) {
      this.lightning = 1;
      this.thunderAt = this.time + 0.3 + Math.random() * 1.8;
      if (eva && !this.rv.riding && A.grounded && Math.random() < 0.1) {
        this.suit = Math.max(0, this.suit - 0.18);
        A.vel.add(new THREE.Vector3((Math.random() - 0.5) * 8, 4, (Math.random() - 0.5) * 8));
        this.toast('⚡ Tersambar petir! Baju rusak', 'warn');
        this.audio.warn();
        this.thunderAt = this.time + 0.05;
        this.shake = 0.12;
      }
    }
    this.lightning = Math.max(0, this.lightning - dt * 6);
    if (this.thunderAt > 0 && this.time >= this.thunderAt) { this.thunderAt = -1; this.audio.thunk(); this.audio.hiss(1.4); }
    if (this.quakeK > 0.02) {
      this.shake = Math.max(this.shake, 0.045 * this.quakeK * (0.6 + 0.4 * Math.sin(this.time * 23)));
      if (eva && A.grounded && !this.rv.riding) A.pos.addScaledVector(this.v2.set(Math.sin(this.time * 31), 0, Math.cos(this.time * 27)), dt * 0.4 * this.quakeK);
      if (Math.floor(this.time * 3) % 7 === 0) this.audio.touch();
    }
    // daya habitat
    for (const h of this.habs) {
      let mul = 1;
      if (a && hb && (h.kind === 'station' ? false : h.body === hb)) mul *= 1 - HAZARDS[a.type].solar * a.k;
      if (fl) mul *= 1 - 0.4 * fl.k;
      h.computePower(h.sunFactor * mul);
    }
  }

  private onMeteorImpact(dist: number) {
    const k = clamp(1 - dist / 500);
    this.shake = Math.max(this.shake, 0.14 * k);
    if (dist < 220) this.audio.thunk();
    if (this.mode === 'eva' && !this.rv.riding && dist < 14) {
      this.suit = Math.max(0, this.suit - 0.22);
      this.astro.vel.add(new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10));
      this.toast('☄ Terkena pecahan meteor!', 'warn');
      this.audio.warn();
    }
  }

  private sampleT = 0;
  private stepSamples(dt: number) {
    if (this.mode !== 'eva' || !this.astro.grounded || this.rv.riding) return;
    this.sampleT += dt;
    if (this.sampleT < 2) return;
    this.sampleT = 0;
    const b = this.envCam.nearest;
    if (!b || !b.isTerrain || (this.siteLeft.get(b.id) ?? 0) <= 0) return;
    if (this.nearestSample(260)) return;
    this.spawnSamples(b);
  }

  // dorong keluar dari badan habitat; true bila berdiri di atas atap
  private pushOutHab(p: THREE.Vector3, r: number, feet: number, vel?: THREE.Vector3): boolean {
    let onTop = false;
    for (const h of this.habs) {
      if (p.distanceToSquared(h.pos) > 45 * 45) continue;
      const loc = h.toLocalPoint(p, this.v3);
      if (loc.y < -2 - feet || loc.y > 3.4 + feet + 1) continue;
      const hx = 2.78 + r;
      let moved = false;
      for (const m of h.mods.values()) {
        const dx = loc.x - m.ix * CELL, dz = loc.z - m.iz * CELL;
        if (Math.abs(dx) >= hx || Math.abs(dz) >= hx) continue;
        const floorY = 3.05 + feet;
        if (loc.y >= floorY + 0.4) continue;
        const pen = [hx - dx, hx + dx, hx - dz, hx + dz, floorY - loc.y + 0.01];
        let mi = 0;
        for (let i = 1; i < 5; i++) if (pen[i] < pen[mi]) mi = i;
        if (mi === 0) loc.x += pen[0]; else if (mi === 1) loc.x -= pen[1];
        else if (mi === 2) loc.z += pen[2]; else if (mi === 3) loc.z -= pen[3];
        else { loc.y = floorY; onTop = true; }
        moved = true;
        break;
      }
      if (moved) { h.toWorld(loc, p); if (vel) vel.multiplyScalar(0.6); }
    }
    return onTop;
  }

  // ------------------------------------------------ rover
  private stepRover(dt: number) {
    const rv = this.rv, A = this.astro, inp = this.input;
    const b = rv.body;
    if (!b) { rv.riding = false; return; }
    const hOf = (d: THREE.Vector3) => b.surfaceRadius(b.toLocal(d.clone(), new THREE.Vector3()));
    const up = rv.pos.clone().sub(b.pos).normalize();
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(rv.quat);
    f.addScaledVector(up, -f.dot(up)).normalize();
    const turbo = this.boost;
    const maxV = turbo ? 36 : 18;
    const fw = inp.moveY;
    const target = fw > 0 ? fw * maxV : fw * 7;
    rv.speed += (target - rv.speed) * (1 - Math.exp(-(Math.abs(target) > Math.abs(rv.speed) ? 1.5 : 3.2) * dt));
    const steer = -inp.moveX * 0.95 * clamp(Math.abs(rv.speed) / 5, 0.12, 1) * (rv.speed < -0.3 ? -1 : 1);
    this.q1.setFromAxisAngle(up, steer * dt);
    f.applyQuaternion(this.q1);
    rv.pos.addScaledVector(f, rv.speed * dt);
    // tempel ke permukaan
    const dir0 = rv.pos.clone().sub(b.pos).normalize();
    const r0 = hOf(dir0);
    rv.pos.copy(dir0).multiplyScalar(r0 + 0.04).add(b.pos);
    const right = f.clone().cross(dir0).normalize();
    const smp = (v: THREE.Vector3) => hOf(rv.pos.clone().add(v).sub(b.pos).normalize());
    const hf = smp(f.clone().multiplyScalar(2)), hb = smp(f.clone().multiplyScalar(-2));
    const hr = smp(right.clone().multiplyScalar(1.4)), hl = smp(right.clone().multiplyScalar(-1.4));
    const n = dir0.clone().addScaledVector(f, -(hf - hb) / 4).addScaledVector(right, -(hr - hl) / 2.8).normalize();
    // batas kemiringan
    const slope = Math.acos(clamp(n.dot(dir0), -1, 1));
    if (slope > 0.75) rv.speed *= Math.exp(-3 * dt);
    const fwd = f.clone().addScaledVector(n, -f.dot(n)).normalize();
    const rgt = fwd.clone().cross(n).normalize();
    this.m4.makeBasis(rgt, n, fwd.clone().negate());
    this.q2.setFromRotationMatrix(this.m4);
    rv.quat.slerp(this.q2, 1 - Math.exp(-9 * dt));
    this.pushOutHab(rv.pos, 1.6, 0.2, undefined);
    // statistik
    rv.distAcc += Math.abs(rv.speed) * dt;
    rv.wheelRot += (rv.speed * dt) / 0.46;
    if (rv.distAcc > 25) { this.emit('rover-drive', { dist: rv.distAcc }); rv.distAcc = 0; }
    // pemain mengikuti rover
    A.pos.copy(rv.pos).addScaledVector(n, 1.5);
    A.vel.set(0, 0, 0);
    A.grounded = true;
    A.g = b.def.g; A.gfac = 1;
    // kamera orbit
    this.headYaw -= inp.lookDX * 0.005;
    this.headPitch = clamp(this.headPitch - inp.lookDY * 0.005, -0.2, 1.2);
    this.headYaw *= Math.exp(-0.35 * dt * (Math.abs(inp.lookDX) > 0 ? 0 : 1));
  }


  private keyboardInput(dt: number) {
    const k = this.keys;
    if (!k.size) {
      if (this.kbWas) {
        this.kbWas = false;
        const i = this.input;
        i.steerX = 0; i.steerY = 0; i.roll = 0; i.moveX = 0; i.moveY = 0; i.vert = 0; i.jetUp = false; i.jetDown = false; i.run = false;
      }
      return;
    }
    this.kbWas = true;
    const has = (s: string) => k.has(s);
    const ax = (has('d') || has('arrowright') ? 1 : 0) - (has('a') || has('arrowleft') ? 1 : 0);
    const ay = (has('w') || has('arrowup') ? 1 : 0) - (has('s') || has('arrowdown') ? 1 : 0);
    if (this.mode === 'pilot') {
      this.input.steerX = ax * 0.8; this.input.steerY = ay * 0.8;
      this.input.roll = (has('e') ? 1 : 0) - (has('q') ? 1 : 0);
      if (has('shift')) this.throttle = clamp(this.throttle + dt * 0.5);
      if (has('control')) this.throttle = clamp(this.throttle - dt * 0.5);
      this.input.vert = (has(' ') ? 1 : 0) - (has('c') ? 1 : 0);
    } else {
      this.input.moveX = ax; this.input.moveY = ay;
      this.input.run = has('shift');
      this.input.jetUp = has(' ');
      this.input.jetDown = has('c');
    }
  }
  kbWas = false;

  // ------------------------------------------------ kapal (dinamika Newtonian)
  // Gaya: gravitasi benda primer (bola pengaruh), dorong (mesin utama + thruster), drag atmosfer nyata (ρ₀, H).
  // Efek: pemanasan Sutton–Graves + surya (dengan gerhana), tekanan dinamis, tekanan luar, benturan berenergi, bahan bakar.
  warpNow = 1;
  private invuln = 0;
  private dmgToastT = 0;

  /** Kecepatan acuan (relatif bingkai primer): target dekat, permukaan yang berputar bila rendah, atau pusat benda terdekat. */
  refVelocity(out = new THREE.Vector3()): THREE.Vector3 {
    const P = this.shipFrame.p ?? this.findPrimary(this.shipPos);
    const tgt = this.getTarget();
    if (tgt && !tgt.body && this.shipPos.distanceTo(tgt.pos) < 3000) return this.targetVel(tgt, out).sub(P.vel);
    const nb = this.env.nearest;
    if (!nb) return out.set(0, 0, 0);
    out.copy(nb.vel).sub(P.vel);
    if (!nb.isSun && (this.env.rho > 1e-6 || this.env.alt < 3000)) {
      const w = new THREE.Vector3().copy(this.shipPos).sub(nb.pos);
      out.add(new THREE.Vector3().copy(nb.omegaVec).cross(w));
    }
    return out;
  }

  /** Kecepatan kapal relatif terhadap acuan (m/s) */
  shipRelSpeed(): number {
    if (this.landed && this.contact) return 0;
    return new THREE.Vector3().copy(this.shipVel).sub(this.refVelocity()).length();
  }

  private updateOrbitInfo() {
    const P = this.shipFrame.p ?? this.sun;
    const o = this.orb;
    if (this.landed && this.contact) { o.valid = false; o.state = 'darat'; o.primary = P.def.name; return; }
    const rel = new THREE.Vector3().copy(this.shipPos).sub(P.pos);
    const r = rel.length(), v = this.shipVel.length();
    const mu = P.mu;
    const eps = 0.5 * v * v - mu / r;
    const h2 = rel.cross(this.shipVel).lengthSq();
    const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h2) / (mu * mu)));
    o.primary = P.def.name; o.e = e; o.valid = true;
    o.pe = h2 / (mu * (1 + e)); // r_p = h²/(μ(1+e)) berlaku untuk semua kerucut
    if (eps < 0) {
      const a = -mu / (2 * eps);
      o.a = a; o.ap = a * (1 + e); o.T = PH.orbitalPeriod(mu, a);
      o.state = o.pe > P.R ? 'orbit' : 'suborbital';
    } else { o.a = Infinity; o.ap = Infinity; o.T = 0; o.state = 'lepas'; }
  }

  private effectiveWarp(): number {
    if (this.warp <= 1 || this.mode !== 'pilot' || this.docked || this.seq || this.landed || this.contact) return 1;
    const e = this.env;
    if (e.physBody?.phys && e.rho > 1e-8 && e.alt < 8 * e.physBody.phys.H) return 1;
    const nb = e.nearest;
    let w = this.warp;
    if (nb) {
      const o = this.orb;
      if (nb.isSun) {
        if (!(o.valid && o.pe > nb.R * 4)) w = Math.min(w, 20);
      } else if (!(o.valid && o.pe > nb.R + (nb.phys ? nb.phys.H * 8 : 0) + 1500)) {
        const T = Math.max(0, e.alt) / Math.max(1, this.shipVel.length());
        w = Math.min(w, Math.max(1, Math.floor(T / 30)));
      }
    }
    return w;
  }

  setWarp(w: number) {
    this.warp = w;
    if (w > 1) this.toast(`Percepatan waktu ×${w} (otomatis turun dekat permukaan/atmosfer)`, 'info');
  }

  private sunVisible(pos: THREE.Vector3): number {
    const sd = new THREE.Vector3().copy(pos).negate();
    const dist = sd.length();
    sd.divideScalar(Math.max(dist, 1));
    for (const b of this.bodies) {
      if (b.isSun) continue;
      const c = new THREE.Vector3().copy(b.pos).sub(pos);
      const t = c.dot(sd);
      if (t <= 0 || t > dist) continue;
      if (c.lengthSq() - t * t < b.R * b.R) return 0;
    }
    return 1;
  }

  /** Batasi dorong per sumbu kapal: mesin utama (+X, rem sebagian), thruster vertikal dan samping */
  private clampThrust(a: THREE.Vector3, Q: THREE.Quaternion, boost: number, fac: number) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(Q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(Q), r = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
    const af = clamp(a.dot(f), -0.35 * SHIP.aMain * fac, SHIP.aMain * boost * fac);
    const au = clamp(a.dot(u), -SHIP.aVert * fac, SHIP.aVert * fac);
    const ar = clamp(a.dot(r), -4 * fac, 4 * fac);
    return a.set(0, 0, 0).addScaledVector(f, af).addScaledVector(u, au).addScaledVector(r, ar);
  }

  /** Pemandu autopilot: profil kecepatan menutup v = √(2·a·jarak) relatif terhadap target; mengembalikan true saat tiba */
  private guidance(tgt: Target, P: Body, gAcc: THREE.Vector3, out: THREE.Vector3): boolean {
    const tv = this.targetVel(tgt);
    const sv = new THREE.Vector3().copy(this.shipVel).add(P.vel);
    const rel = new THREE.Vector3().copy(tgt.pos).sub(this.shipPos);
    const dist = rel.length();
    const stopAlt = tgt.stop ?? (clamp(tgt.radius * 0.7, 6000, 80000) + (tgt.body?.phys ? tgt.body.phys.H * 3 : 0));
    const range = dist - (tgt.radius + stopAlt);
    const vrel = sv.sub(tv);
    const base = this.habs.find((x) => x.id === tgt.id && x.kind === 'base');
    let gT = new THREE.Vector3();
    if (!(tgt.body === P) && !base) {
      const rt = new THREE.Vector3().copy(tgt.pos).sub(P.pos);
      const d3 = Math.max(rt.length(), 1) ** 3;
      gT = rt.multiplyScalar(-P.mu / d3);
    }
    const aDec = Math.max(2, 0.45 * SHIP.aMain);
    const vDes = range > 0 ? Math.min(150e3, Math.sqrt(2 * aDec * range)) : 0;
    const vD = rel.normalize().multiplyScalar(vDes);
    out.copy(vD).sub(vrel).multiplyScalar(0.25).sub(gAcc).add(gT);
    return range < 50 && vrel.length() < 3;
  }

  private landingThrust(nb: Body, P: Body, gAcc: THREE.Vector3, out: THREE.Vector3) {
    const rel = new THREE.Vector3().copy(this.shipPos).sub(nb.pos);
    const d = rel.length();
    const n = rel.divideScalar(d);
    const vsurf = new THREE.Vector3().copy(nb.vel).sub(P.vel).add(new THREE.Vector3().copy(nb.omegaVec).cross(new THREE.Vector3().copy(n).multiplyScalar(d)));
    const vs = this.shipVel.clone().sub(vsurf);
    const vn = vs.dot(n);
    const vh = vs.clone().addScaledVector(n, -vn);
    const altS = Math.max(0, this.env.alt - GEAR_H);
    const aDec = Math.max(1, 0.5 * (SHIP.aVert - gAcc.length()));
    const vDes = -Math.min(80, Math.sqrt(2 * aDec * altS)) - 0.7;
    const aFF = vDes > -79.9 ? aDec * clamp(altS / 15) : 0; // umpan-maju: percepatan pengereman profil
    out.copy(n).multiplyScalar(aFF + (vDes - vn) / 0.5).addScaledVector(vh, -1 / 3).sub(gAcc);
  }

  /** Kerusakan lambung (fraksi 0..1). quiet = kerusakan kontinu (hanya peringatan, tanpa toast berulang) */
  private damageHull(frac: number, why: string, quiet = false) {
    if (frac <= 0 || this.invuln > 0) return;
    this.hull = Math.max(0, this.hull - frac);
    if (!quiet) {
      this.shake = Math.max(this.shake, Math.min(0.4, 0.05 + frac * 0.8));
      if (frac > 0.015) { this.toast(`Lambung rusak −${Math.round(frac * 100)}% (${why})`, 'warn'); this.audio.warn(); }
    } else {
      this.setWarn(`Lambung rusak: ${why} (${Math.round(this.hull * 100)}%)`, 1.2);
      this.shake = Math.max(this.shake, 0.02);
    }
    if (this.hull <= 0) this.respawn(why);
  }

  respawn(why: string) {
    const st = this.habs.find((h) => h.kind === 'station');
    this.audio.warn();
    this.toast(`Kapal hancur (${why}). Dievakuasi ke ${st ? st.name : 'stasiun'} — kredit −20%`, 'warn');
    this.credits = Math.floor(this.credits * 0.8);
    this.rv.riding = false; this.inHab = null; this.seq = null;
    for (const h of this.habs) h.int.visible = false;
    this.autopilot = false; this.holdMode = false; this.landAssist = false; this.docked = null; this.dockAnim = null;
    this.throttle = 0; this.braking = false; this.autoReturn = false;
    this.hull = 1; this.fuel = Math.max(this.fuel, 0.5); this.skinT = 260; this.cabinT = 295; this.suit = 1; this.oxygen = 1;
    this.landed = false; this.contact = false; this.invuln = 4; this.warp = 1;
    if (st) {
      const dock = st.modulesOf('dock')[0];
      const dn = dock ? st.hatchDirLocal(dock, new THREE.Vector3()).applyQuaternion(st.quat) : new THREE.Vector3(0, 0, 1).applyQuaternion(st.quat);
      this.shipPos.copy(st.pos).addScaledVector(dn, 140);
      this.shipFrame.p = this.findPrimary(this.shipPos);
      this.shipFrame.att = false;
      this.shipVel.copy(st.vel).sub(this.shipFrame.p.vel);
      this.m4.lookAt(new THREE.Vector3(0, 0, 0), dn.clone().negate(), new THREE.Vector3(0, 1, 0).applyQuaternion(st.quat));
      this.shipQuat.setFromRotationMatrix(this.m4);
    }
    this.mode = 'pilot'; this.view = 'cockpit';
    this.fade = 1;
  }

  /** Satu langkah fisika kapal (Verlet kecepatan, gaya konstan selama langkah) */
  private shipSubstep(h: number, c: { Q: THREE.Quaternion; boost: number; fac: number; tgt: Target | null }) {
    const Q = c.Q;
    const env = this.env;
    const nb = env.nearest;
    const P = this.shipFrame.p ?? this.findPrimary(this.shipPos);
    const rel = new THREE.Vector3().copy(this.shipPos).sub(P.pos);
    const r = Math.max(rel.length(), 1);
    const g0 = rel.clone().multiplyScalar(-P.mu / (r * r * r));
    const gLoc = g0.length();
    const aT = new THREE.Vector3();
    const piloting = this.mode === 'pilot';

    // ---- perintah dorong
    if (this.autopilot && c.tgt) {
      if (this.guidance(c.tgt, P, g0, aT)) {
        this.autopilot = false; this.holdMode = true;
        this.toast(`Tiba di ${c.tgt.name} — mode TAHAN aktif`, 'discover');
        this.audio.discover();
      }
    } else if (this.landAssist && nb && nb.isTerrain) {
      this.landingThrust(nb, P, g0, aT);
    } else if (this.holdMode) {
      aT.copy(this.shipVel).sub(this.refVelocity()).multiplyScalar(-0.5).sub(g0);
    } else if (piloting) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(Q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
      const thr = this.braking ? 0 : this.throttle;
      aT.addScaledVector(f, thr * SHIP.aMain * c.boost);
      if (this.input.vert) aT.addScaledVector(u, this.input.vert * SHIP.aVert);
      if (this.braking) {
        const vr = this.shipVel.clone().sub(this.refVelocity());
        const sp = vr.length();
        if (sp > 0.05) aT.addScaledVector(vr, -Math.min(SHIP.aBrake, sp / h) / sp);
      }
    }
    if (this.fuel <= 0) { if (aT.lengthSq() > 0.01 && this.dmgToastT <= 0) { this.setWarn('Bahan bakar habis!', 2); this.dmgToastT = 3; } aT.set(0, 0, 0); }
    this.clampThrust(aT, Q, c.boost, c.fac);

    // ---- di tanah: menapak bila dorong ke atas tak melebihi gravitasi
    if (this.landed && this.contact) {
      const n = rel.clone().normalize();
      if (aT.dot(n) < gLoc * 1.02) { this.shipVel.set(0, 0, 0); this.thrustAcc.copy(aT); return; }
      this.landed = false;
    }

    this.thrustAcc.copy(aT);
    if (aT.lengthSq() > 0) this.fuel = Math.max(0, this.fuel - (aT.length() * h) / SHIP.dvTotal);

    // ---- Verlet kecepatan
    const a0 = g0.clone().add(aT);
    this.shipPos.addScaledVector(this.shipVel, h).addScaledVector(a0, 0.5 * h * h);
    const rel2 = new THREE.Vector3().copy(this.shipPos).sub(P.pos);
    const r2 = Math.max(rel2.length(), 1);
    const g1 = rel2.clone().multiplyScalar(-P.mu / (r2 * r2 * r2));
    this.shipVel.addScaledVector(g0.clone().add(g1).multiplyScalar(0.5).add(aT), h);

    // ---- atmosfer: drag implisit, pemanasan, tekanan
    const pb = env.physBody;
    let vAirMag = 0, rho = 0;
    if (pb && pb.phys) {
      const relB = new THREE.Vector3().copy(this.shipPos).sub(pb.pos);
      const alt = pb === nb ? env.alt : relB.length() - pb.R;
      rho = PH.atmDensity(pb.phys, alt);
      const vAir = new THREE.Vector3().copy(this.shipVel).add(P.vel).sub(pb.vel).sub(new THREE.Vector3().copy(pb.omegaVec).cross(relB));
      vAirMag = vAir.length();
      const c1 = (0.5 * rho * SHIP.cdA) / SHIP.mass;
      if (c1 * vAirMag * h > 1e-9) this.shipVel.addScaledVector(vAir, 1 / (1 + c1 * vAirMag * h) - 1);
    }
    const qDyn = PH.dynamicPressure(rho, vAirMag);
    const qHeat = rho > 1e-12 ? PH.stagnationHeatFlux(rho, vAirMag, SHIP.noseR) : 0;
    const S = PH.solarFlux(this.shipPos.length()) * this.sunVisible(this.shipPos);
    const fl = this.fl;
    fl.rho = rho; fl.airSpeed = vAirMag; fl.qDyn = qDyn; fl.qHeat = qHeat; fl.solar = S; fl.pAmb = env.pAmb; fl.tAmb = env.tAmb; fl.gLocal = gLoc;
    const convH = rho > 1e-9 ? PH.convectiveH(rho, vAirMag) : 0;
    this.skinT = PH.skinStep(this.skinT, h, qHeat * 0.5 + SHIP.alpha * S * 0.35, SHIP.eps, SHIP.skinC, PH.T_SPACE, convH, env.tAmb);
    this.cabinT += PH.cabinRate(this.cabinT, this.skinT, rho > 1e-6 ? env.tAmb : PH.T_SPACE, 1) * h;
    let dmg = 0, why = '';
    if (this.skinT > SHIP.maxSkinT) { dmg += ((this.skinT - SHIP.maxSkinT) / 600) * 0.05 * h; why = 'panas lambung'; }
    if (qDyn > SHIP.maxQ) { dmg += (qDyn / SHIP.maxQ - 1) * 0.04 * h; why = 'tekanan dinamis'; }
    if (env.pAmb > SHIP.crushP) { dmg += ((env.pAmb / SHIP.crushP - 1) * 0.3 + 0.02) * h; why = 'tekanan atmosfer'; }
    if (this.cabinT > SHIP.cabinMaxT) { dmg += ((this.cabinT - SHIP.cabinMaxT) / 40) * 0.01 * h; why = 'kabin terlalu panas'; }
    if (dmg > 0) this.damageHull(dmg, why, true);

    // ---- tabrakan dengan benda langit
    let touched = false;
    let nTouch = new THREE.Vector3();
    for (const b of this.bodies) {
      const rb = new THREE.Vector3().copy(this.shipPos).sub(b.pos);
      const d = rb.length();
      const rough = b.R + (b.isTerrain ? b.def.t!.amp * 3 + 100 : 0);
      if (d > rough * 1.05 + 100) continue;
      if (b.isSun) { if (d < b.R) this.damageHull(2, 'masuk ke Matahari'); continue; }
      if (b.isGas) continue; // tak ada permukaan; tekanan yang menghancurkan
      const n = rb.clone().multiplyScalar(1 / d);
      const dl = b.toLocal(n.clone(), new THREE.Vector3());
      const minD = b.surfaceRadius(dl) + GEAR_H;
      if (d >= minD) continue;
      this.shipPos.copy(b.pos).addScaledVector(n, minD);
      const vsurf = new THREE.Vector3().copy(b.vel).sub(P.vel).add(new THREE.Vector3().copy(b.omegaVec).cross(n.clone().multiplyScalar(minD)));
      const vs = this.shipVel.clone().sub(vsurf);
      const vn = vs.dot(n);
      if (vn < 0) {
        const dm = PH.impactDamage(PH.kineticEnergy(SHIP.mass, -vn), SHIP.legAbsorb);
        if (-vn > 1.5 && !this.prevContact) { this.audio.touch(); this.shake = Math.max(this.shake, Math.min(0.2, -vn * 0.01)); }
        if (dm > 0) this.damageHull(dm, `benturan ${(-vn).toFixed(0)} m/s`);
        vs.addScaledVector(n, -vn); // tak lenting
      }
      const vt = vs.clone().addScaledVector(n, -vs.dot(n));
      const sp = vt.length();
      if (sp > 1e-6) {
        const dec = Math.max(0.5, gLoc * 0.6) * h;
        const f = Math.max(0, sp - dec) / sp;
        if (sp > 40) this.damageHull(PH.impactDamage(0.15 * PH.kineticEnergy(SHIP.mass, sp) * (1 - f * f), 0), 'gesekan permukaan', true);
        vt.multiplyScalar(f);
      }
      this.shipVel.copy(vsurf).add(vt);
      touched = true; nTouch = n;
      if (!this.landed && vt.length() < 0.8 && aT.dot(n) < gLoc * 1.02) this.landed = true;
    }
    this.contact = touched;
    if (!touched) this.landed = false;
    this.prevContact = touched;
    void nTouch;

    // ---- asteroid: energi benturan dari kecepatan relatif terhadap batu yang mengorbit
    if (this.belt.rocks.length) {
      for (const rk of this.belt.rocks) {
        const rb = new THREE.Vector3(this.shipPos.x - rk.x, this.shipPos.y - rk.y, this.shipPos.z - rk.z);
        const d = rb.length();
        if (d >= rk.r + 10) continue;
        const n = rb.multiplyScalar(1 / d);
        this.shipPos.set(rk.x, rk.y, rk.z).addScaledVector(n, rk.r + 10);
        const vr = new THREE.Vector3(rk.vx, rk.vy, rk.vz);
        const vs = new THREE.Vector3().copy(this.shipVel).add(P.vel).sub(vr);
        const vn = vs.dot(n);
        if (vn < 0) {
          this.damageHull(PH.impactDamage(PH.kineticEnergy(SHIP.mass, -vn), 0), `asteroid ${(-vn).toFixed(0)} m/s`);
          this.audio.touch(); this.shake = Math.max(this.shake, 0.12);
          vs.addScaledVector(n, -vn * 1.2);
          this.shipVel.copy(vs).add(vr).sub(P.vel);
        }
      }
    }
  }

  private stepShip(dt: number) {
    const inp = this.input;
    const piloting = this.mode === 'pilot';
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dmgToastT > 0) this.dmgToastT -= dt;
    this.updateOrbitInfo();
    if (this.docked) {
      this.contact = false; this.landed = false; this.throttle = 0; this.holdMode = false; this.landAssist = false;
      this.thrustAcc.set(0, 0, 0);
      this.shipVel.copy(this.docked.vel).sub(this.findPrimary(this.shipPos).vel);
      this.fuel = Math.min(1, this.fuel + dt * 0.02); // isi ulang di dermaga
      this.hull = Math.min(1, this.hull + dt * 0.004);
      return;
    }
    const Q = this.shipQuat;
    const nb = this.env.nearest;
    const upS = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
    const radial = nb ? new THREE.Vector3().copy(this.shipPos).sub(nb.pos).normalize() : upS.clone();

    // ---- kendali sikap
    const tgt = this.getTarget();
    let userOverride = false;
    if (piloting && !this.lookMode && (Math.abs(inp.steerX + this.mouseSteer.x) > 0.6 || Math.abs(inp.steerY + this.mouseSteer.y) > 0.6)) userOverride = true;
    if (this.autopilot && tgt && !userOverride) {
      const aim = this.thrustAcc.lengthSq() > 1 ? this.thrustAcc.clone().normalize() : new THREE.Vector3().copy(tgt.pos).sub(this.shipPos).normalize();
      this.m4.lookAt(new THREE.Vector3(0, 0, 0), aim, upS);
      this.q1.setFromRotationMatrix(this.m4);
      Q.rotateTowards(this.q1, 1.3 * dt);
    } else if (this.autopilot && userOverride) {
      this.autopilot = false;
      this.toast('Autopilot dimatikan (kendali manual)', 'info');
    } else if (piloting && !this.lookMode) {
      const cv = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.5);
      const landedLock = this.contact && this.landed;
      const rate = 0.95;
      const sx = cv(clamp(inp.steerX + this.mouseSteer.x, -1, 1)), sy = landedLock ? 0 : cv(clamp(inp.steerY + this.mouseSteer.y, -1, 1)), rl = landedLock ? 0 : inp.roll;
      this.q1.setFromAxisAngle(Y, -sx * rate * dt);
      this.q2.setFromAxisAngle(X, sy * rate * dt);
      this.q3.setFromAxisAngle(Z, -rl * 1.0 * dt);
      Q.multiply(this.q1).multiply(this.q2).multiply(this.q3);
    } else if (piloting) {
      if (inp.roll) { this.q3.setFromAxisAngle(Z, -inp.roll * dt); Q.multiply(this.q3); }
    }
    Q.normalize();

    // ---- sikap otomatis untuk TAHAN/DARAT: sumbu atas = vertikal lokal, heading dipertahankan
    if (nb && !nb.isSun && !(this.landed && this.contact) && (this.landAssist || this.holdMode) && this.env.alt < 30000 && !this.autopilot) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(Q);
      fwd.addScaledVector(radial, -fwd.dot(radial));
      if (fwd.lengthSq() < 0.05) fwd.set(1, 0, 0).applyQuaternion(Q).cross(radial);
      fwd.normalize();
      const right = fwd.clone().cross(radial).normalize();
      this.m4.makeBasis(right, radial, fwd.clone().negate());
      this.q1.setFromRotationMatrix(this.m4);
      Q.rotateTowards(this.q1, 1.2 * dt);
    }
    // ---- perata otomatis dekat benda
    if (nb && !nb.isSun) {
      if (this.landed && this.contact) {
        const cu = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
        this.q1.setFromUnitVectors(cu, radial);
        this.q2.identity().slerp(this.q1, 1 - Math.exp(-3 * dt));
        Q.premultiply(this.q2);
      } else if (this.env.alt < Math.min(4000, nb.R * 0.15) && Math.abs(inp.roll) < 0.1 && (this.holdMode || this.landAssist || this.env.rho > 1e-4 || !this.autopilot)) {
        this.rollLevel(Q, radial, 1 - Math.exp(-0.9 * dt));
      }
    }

    // ---- integrasi (dengan percepatan waktu)
    const boost = piloting && this.boost && !this.autopilot ? SHIP.boostMul : 1;
    const fac = 0.35 + 0.65 * clamp(this.hull / 0.5);
    const c = { Q, boost, fac, tgt };
    const warp = this.warpNow;
    if (warp <= 1) {
      const alt = Math.max(this.env.alt, 3);
      const n = clamp(Math.ceil((this.shipVel.length() * dt) / (0.4 * alt)), 1, 40);
      for (let i = 0; i < n; i++) this.shipSubstep(dt / n, c);
    } else {
      const P = this.shipFrame.p ?? this.sun;
      const r = this.shipPos.distanceTo(P.pos);
      const Td = Math.sqrt((r * r * r) / P.mu);
      const hmax = clamp(0.01 * Td, 0.02, this.autopilot || this.holdMode || this.throttle > 0 ? 1 : 2.5);
      const total = dt * warp;
      const n = Math.min(600, Math.ceil(total / hmax));
      const h = total / n;
      for (let i = 0; i < n; i++) {
        this.advanceWorld(h, false);
        this.carry(this.shipPos, this.shipVel, this.shipFrame, this.shipQuat, false);
        if (this.rv.deployed) this.carry(this.rv.pos, null, this.roverFrame, this.rv.quat, true);
        this.shipSubstep(h, c);
      }
    }
    this.gForce = this.thrustAcc.length() / PH.G0;

    // ---- pendaratan & peringatan
    if (this.landed && this.contact) {
      this.landAssist = false;
      this.landTimer += dt;
      const lb = this.env.nearest;
      if (this.landTimer > 1.2 && lb && !lb.landedOn && !lb.isGas && !lb.isSun) {
        lb.landedOn = true;
        lb.visited = true;
        this.toast(`Mendarat di ${lb.def.name}!`, 'discover');
        this.audio.discover();
        this.emit('land', { body: lb.id, gen: !!lb.def.fixedPos });
      }
    } else this.landTimer = 0;
    if (this.skinT > 0.85 * SHIP.maxSkinT) this.setWarn('Panas lambung kritis — menjauh/naik!', 1);
    else if (this.fl.qDyn > 0.8 * SHIP.maxQ) this.setWarn('Tekanan dinamis tinggi — kurangi kecepatan', 1);
    else if (this.env.pAmb > 0.7 * SHIP.crushP) this.setWarn('Tekanan atmosfer mendekati batas lambung — naik!', 1);
    else if (this.cabinT > SHIP.cabinMaxT - 10) this.setWarn(`Suhu kabin ${Math.round(this.cabinT - 273.15)} °C — tinggalkan area panas`, 1);
    else if (this.fuel < 0.1 && this.fuel > 0) this.setWarn('Bahan bakar menipis', 1);
  }
  prevContact = false;

  // ------------------------------------------------ berjalan di dalam kapal
  private stepWalk(dt: number) {
    // kamera kepala
    const inp = this.input;
    if (this.mode === 'walk' || this.mode === 'airlock' || this.mode === 'hab') {
      this.headYaw -= inp.lookDX * 0.005;
      this.headPitch = clamp(this.headPitch - inp.lookDY * 0.005, -1.4, 1.4);
    } else if (this.mode === 'pilot') {
      if (this.lookMode || this.view === 'chase') {
        this.headYaw -= inp.lookDX * 0.005;
        this.headPitch = clamp(this.headPitch - inp.lookDY * 0.005, this.view === 'chase' ? -1.3 : -1.2, 1.3);
        if (this.view === 'cockpit') this.headYaw = clamp(this.headYaw, -2.4, 2.4);
      } else {
        this.headYaw *= Math.exp(-2.5 * dt);
        this.headPitch *= Math.exp(-2.5 * dt);
      }
    }
    if (this.mode !== 'walk' && this.mode !== 'hab') return;
    if (this.seq) { this.walkVel.multiplyScalar(Math.exp(-8 * dt)); return; }
    // gerak halus dengan percepatan
    const sp = 2.4 * (inp.run ? 1.65 : 1);
    const yaw = this.headYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = fx * inp.moveY + rx * inp.moveX, mz = fz * inp.moveY + rz * inp.moveX;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const acc = ml > 0.05 ? 12 : 16;
    this.walkVel.x += (mx * sp - this.walkVel.x) * (1 - Math.exp(-acc * dt));
    this.walkVel.y += (mz * sp - this.walkVel.y) * (1 - Math.exp(-acc * dt));
    const nx = this.walkPos.x + this.walkVel.x * dt, nz = this.walkPos.z + this.walkVel.y * dt;
    if (!this.blocked(nx, this.walkPos.z)) this.walkPos.x = nx; else this.walkVel.x = 0;
    if (!this.blocked(this.walkPos.x, nz)) this.walkPos.z = nz; else this.walkVel.y = 0;
    // lompat: kecepatan awal tetap (otot), gravitasi lokal menentukan tinggi & waktu di udara
    if (inp.jump && this.jumpY <= 0.001) { this.jumpV = 3.0; this.audio.jump(); }
    if (this.jumpY > 0 || this.jumpV > 0) {
      this.jumpV -= this.walkGravity() * dt;
      this.jumpY = Math.max(0, Math.min(0.95, this.jumpY + this.jumpV * dt));
      if (this.jumpY <= 0 && this.jumpV < 0) { this.jumpY = 0; this.jumpV = 0; this.audio.step(false); }
      if (this.jumpY >= 0.95 && this.jumpV > 0) this.jumpV = 0; // kepala membentur langit-langit
    }
    this.walkPos.y = 1.65 + this.jumpY;
  }

  /** gravitasi yang dirasakan saat berjalan di dalam kapal/habitat */
  walkGravity(): number {
    if (this.inHab) return this.inHab.kind === 'base' && this.inHab.body ? this.inHab.body.def.g : 1.0; // stasiun: sepatu magnet, gravitasi mikro
    if (this.landed && this.contact && this.env.nearest) return this.env.nearest.def.g;
    return 1.0; // kabin dalam penerbangan: sepatu magnet
  }

  private blocked(x: number, z: number) {
    const r = 0.28;
    if (this.mode === 'hab' && this.inHab) return this.inHab.blocked(x, z, r);
    if (x < -1.7 || x > 1.7 || z < -4.2 || z > 5.65) return true;
    for (const c of this.rig.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  }

  // ------------------------------------------------ urutan airlock
  private stepSequence(dt: number) {
    const s = this.seq;
    const lamp = this.rig.hatchLamp.material as THREE.MeshBasicMaterial;
    if (!s) {
      lamp.color.setHex(this.mode === 'eva' ? 0x40ff90 : 0xff3a30);
      this.fade = Math.max(0, this.fade - dt * 2);
      return;
    }
    s.t += dt;
    if (s.type === 'trans') {
      if (s.t < 0.55) this.fade = Math.min(1, s.t * 2.2);
      if (s.t > 0.6 && !s.done1) { s.done1 = true; this.fade = 1; s.mid && s.mid(); s.label = 'Aman'; }
      if (s.t > 1.4) this.fade = Math.max(0, 1 - (s.t - 1.4) * 2.2);
      if (s.t > 2.1 && !s.done3) { s.done3 = true; this.seq = null; }
      return;
    }
    const blink = Math.floor(s.t * 4) % 2 === 0;
    lamp.color.setHex(blink ? 0xffb030 : 0x331100);
    this.rig.lights.airlock.color.setHex(blink ? 0xff6a40 : 0xffffff);
    if (s.type === 'exit') {
      if (s.t > 0.8 && !s.done1) { s.done1 = true; s.label = this.linkHab ? 'Menyamakan tekanan…' : 'Depresurisasi…'; this.audio.hiss(2.2); }
      if (s.t > 3.2 && !s.done2) { s.done2 = true; s.label = this.linkHab ? 'Lorong terbuka' : 'Palka terbuka'; this.audio.thunk(); }
      if (s.t > 3.5) this.fade = Math.min(1, (s.t - 3.5) * 3);
      if (s.t > 4.1 && !s.done3) {
        s.done3 = true;
        if (this.linkHab) this.setInHab(this.linkHab, this.docked ? this.docked.modulesOf('dock')[0] : this.entryModule(this.linkHab));
        else this.beginEva();
        this.seq = null;
        this.rig.lights.airlock.color.setHex(0xffffff);
      }
    } else {
      if (s.t < 0.5) this.fade = Math.min(1, s.t * 3);
      if (s.t > 0.6 && !s.done1) { s.done1 = true; s.label = 'Pressurisasi…'; this.audio.thunk(); this.audio.hiss(2.2); this.mode = 'airlock'; this.walkPos.copy(AIRLOCK_IN); this.walkPos.x = 1.1; this.eyeLocal.copy(this.walkPos); this.headYaw = Math.PI / 2; this.headPitch = 0; this.rv.riding = false; }
      if (s.t > 3.2 && !s.done2) { s.done2 = true; s.label = 'Aman — selamat datang kembali'; this.audio.open(); }
      if (s.t > 3.2) this.fade = Math.max(0, 1 - (s.t - 3.2) * 2.5);
      if (s.t > 3.7 && !s.done3) {
        s.done3 = true;
        this.mode = 'walk';
        this.seq = null;
        this.rig.lights.airlock.color.setHex(0xffffff);
      }
    }
  }

  private beginEva() {
    const Q = this.shipQuat;
    const y = this.landed ? -GEAR_H + 1.8 : 1.0;
    this.v1.set(HATCH_OUT.x, y, HATCH_OUT.z).applyQuaternion(Q);
    this.astro.pos.copy(this.shipPos).add(this.v1);
    this.astro.vel.copy(this.shipVel);
    this.astroFrame.p = this.shipFrame.p;
    this.astroFrame.att = this.landed && this.contact; // di tanah: bingkai ikut berputar bersama benda
    this.astro.gfac = this.astroFrame.att ? 1 : 0;
    this.q1.setFromAxisAngle(Y, -Math.PI / 2);
    this.astro.quat.copy(Q).multiply(this.q1);
    this.astro.grounded = false;
    this.mode = 'eva';
    this.view = 'cockpit';
    this.inHab = null;
    this.input.moveX = 0; this.input.moveY = 0;
    this.toast('Berjalan di luar — jetpack aktif, awas cuaca!', 'info');
  }

  /** kecepatan acuan astronot (relatif bingkai primer): kapal bila dekat, selain itu permukaan/pusat benda */
  astroRefVelocity(): THREE.Vector3 {
    const P = this.astroFrame.p ?? this.findPrimary(this.astro.pos);
    const sh = this.shipFrame.p ?? P;
    if (this.astro.pos.distanceTo(this.shipPos) < 5000 && sh === P) {
      if (this.landed && this.contact) {
        const nb = this.env.nearest;
        if (nb) return new THREE.Vector3().copy(nb.vel).sub(P.vel).add(new THREE.Vector3().copy(nb.omegaVec).cross(new THREE.Vector3().copy(this.shipPos).sub(nb.pos)));
      }
      return this.shipVel.clone();
    }
    const nb = this.envCam.nearest;
    if (!nb) return new THREE.Vector3();
    const out = new THREE.Vector3().copy(nb.vel).sub(P.vel);
    if (!nb.isSun && this.envCam.alt < 3000) out.add(new THREE.Vector3().copy(nb.omegaVec).cross(new THREE.Vector3().copy(this.astro.pos).sub(nb.pos)));
    return out;
  }

  // ------------------------------------------------ astronot (EVA)
  private stepAstro(dt: number) {
    const A = this.astro;
    const inp = this.input;
    const env = this.envCam;
    this.computeEnv(A.pos, env);
    const b = env.nearest;
    const Qa = A.quat;
    if (this.seq) {
      A.vel.multiplyScalar(Math.exp(-4 * dt));
      A.pos.addScaledVector(A.vel, dt);
      return;
    }
    if (this.rv.riding && this.autoReturn) this.rv.riding = false;
    if (this.rv.riding) { this.stepRover(dt); return; }

    let upW = this.v1.set(0, 1, 0).applyQuaternion(Qa);
    let gfac = 0, g0 = 0, isTer = false;
    let dirW = new THREE.Vector3(0, 1, 0);
    if (b) {
      dirW = new THREE.Vector3().copy(A.pos).sub(b.pos).normalize();
      g0 = b.def.g;
      isTer = b.isTerrain;
      if (isTer) gfac = clamp(1 - (env.alt - 300) / 700);
      upW = dirW.clone();
    }
    A.gfac = gfac; A.g = g0;
    const gravMode = gfac > 0.25 && isTer;
    // percepatan gravitasi nyata di posisi astronot (primer): a = −μ r̂ / r²
    const Pa = this.astroFrame.p ?? this.findPrimary(A.pos);
    const relP = new THREE.Vector3().copy(A.pos).sub(Pa.pos);
    const gVec = relP.clone().multiplyScalar(-Pa.mu / Math.max(relP.lengthSq() * relP.length(), 1));
    const gLocal = gVec.length();
    const refV = this.astroRefVelocity();

    // pandangan
    if (gravMode) {
      this.q1.setFromAxisAngle(upW, -inp.lookDX * 0.005);
      Qa.premultiply(this.q1);
      const f0 = this.v2.set(0, 0, -1).applyQuaternion(Qa);
      const pitchNow = Math.asin(clamp(f0.dot(upW), -1, 1));
      const dp = clamp(-inp.lookDY * 0.005, -1.45 - pitchNow, 1.45 - pitchNow);
      this.q2.setFromAxisAngle(X, dp);
      Qa.multiply(this.q2);
      this.rollLevel(Qa, upW, 1 - Math.exp(-6 * dt));
    } else {
      this.q1.setFromAxisAngle(Y, -inp.lookDX * 0.005);
      this.q2.setFromAxisAngle(X, -inp.lookDY * 0.005);
      Qa.multiply(this.q1).multiply(this.q2);
    }
    Qa.normalize();
    const fA = new THREE.Vector3(0, 0, -1).applyQuaternion(Qa);
    const rA = new THREE.Vector3(1, 0, 0).applyQuaternion(Qa);
    const uA = new THREE.Vector3(0, 1, 0).applyQuaternion(Qa);

    // tali kembali
    const hatchW = new THREE.Vector3(HATCH_OUT.x - 0.9, 0.9, HATCH_OUT.z).applyQuaternion(this.shipQuat).add(this.shipPos);
    if (this.autoReturn) {
      const to = hatchW.clone().sub(A.pos);
      const d = to.length();
      const sp = clamp(d * 0.6, 6, 80);
      A.vel.copy(refV).addScaledVector(to.normalize(), Math.min(sp, d / dt)); // derek tali relatif terhadap kapal
      A.pos.addScaledVector(A.vel, dt);
      if (d < 2.5) { this.autoReturn = false; this.startEnter(); }
      return;
    }

    if (gravMode && b) {
      // jalan kaki
      const fH = fA.clone().addScaledVector(upW, -fA.dot(upW));
      if (fH.lengthSq() < 0.01) fH.copy(uA).addScaledVector(upW, -uA.dot(upW));
      fH.normalize();
      const rH = fH.clone().cross(upW).normalize();
      const sp = inp.run ? 8 : 4.2;
      const wish = fH.multiplyScalar(inp.moveY).addScaledVector(rH, inp.moveX);
      if (wish.length() > 1) wish.normalize();
      let vv = A.vel.dot(upW);
      const vh = A.vel.clone().addScaledVector(upW, -vv);
      const acc = A.grounded ? 12 : 1.2;
      vh.lerp(wish.multiplyScalar(sp), 1 - Math.exp(-acc * dt));
      if (inp.jetUp && this.jetDv > 0) { vv += (6 + gLocal) * dt; this.jetDv = Math.max(0, this.jetDv - 6 * dt); }
      if (inp.jetDown && this.jetDv > 0) { vv -= 6 * dt; this.jetDv = Math.max(0, this.jetDv - 6 * dt); }
      vv -= gLocal * dt;
      if (inp.jump && A.grounded) { vv += clamp(Math.sqrt(2 * g0 * 1.4), 2.4, 7); this.audio.jump(); }
      A.vel.copy(vh).addScaledVector(upW, vv);
    } else {
      // jetpack di ruang bebas: tanpa hambatan; hanya gravitasi benda primer + dorong (anggaran Δv terbatas)
      const acc = 5;
      const th = new THREE.Vector3().addScaledVector(fA, inp.moveY).addScaledVector(rA, inp.moveX);
      th.addScaledVector(uA, (inp.jetUp ? 1 : 0) - (inp.jetDown ? 1 : 0));
      if (th.lengthSq() > 0 && this.jetDv > 0) {
        A.vel.addScaledVector(th.normalize().multiplyScalar(acc * dt), 1);
        this.jetDv = Math.max(0, this.jetDv - acc * dt);
      }
      // rem jetpack: menyamakan kecepatan dengan acuan (kapal/permukaan) — butuh Δv
      if ((this.braking || (!th.lengthSq() && this.keys.has('x'))) && this.jetDv > 0) {
        const vr = A.vel.clone().sub(refV);
        const f = Math.exp(-2.5 * dt);
        this.jetDv = Math.max(0, this.jetDv - vr.length() * (1 - f));
        A.vel.copy(refV).addScaledVector(vr, f);
      }
      A.vel.addScaledVector(gVec, dt);
    }
    A.pos.addScaledVector(A.vel, dt);

    // tanah
    A.grounded = false;
    if (b && isTer) {
      const rel = this.v2.copy(A.pos).sub(b.pos);
      const d = rel.length();
      const dl = b.toLocal(rel.clone().multiplyScalar(1 / d), this.v3);
      const sr = b.surfaceRadius(dl) + 1.75;
      if (d < sr) {
        const n = rel.multiplyScalar(1 / d);
        A.pos.copy(b.pos).addScaledVector(n, sr);
        const vn = A.vel.dot(n);
        if (vn < 0) A.vel.addScaledVector(n, -vn);
        A.grounded = true;
      }
    }

    // badan kapal
    const loc = this.v2.copy(A.pos).sub(this.shipPos).applyQuaternion(this.q1.copy(this.shipQuat).invert());
    const lx = 2.45, y0 = -1.5, y1 = 4.8, z0 = -8, z1 = 7.6;
    if (Math.abs(loc.x) < lx && loc.y > y0 && loc.y < y1 && loc.z > z0 && loc.z < z1) {
      const px = lx - Math.abs(loc.x), py1 = y1 - loc.y, pz0 = loc.z - z0, pz1 = z1 - loc.z, py0 = loc.y - y0;
      const m = Math.min(px, py1, pz0, pz1, py0);
      if (m === px) loc.x = Math.sign(loc.x || 1) * lx;
      else if (m === py1) loc.y = y1;
      else if (m === py0) loc.y = y0;
      else if (m === pz0) loc.z = z0;
      else loc.z = z1;
      loc.applyQuaternion(this.shipQuat);
      A.pos.copy(this.shipPos).add(loc);
      A.vel.multiplyScalar(0.5);
      if (m === py1 && b && gravMode) A.grounded = true;
    }
    if (this.pushOutHab(A.pos, 0.45, 1.75, A.vel) && gravMode) A.grounded = true;
    if (A.pos.distanceTo(this.shipPos) > 1500 && Math.floor(this.time * 2) % 10 === 0) this.setWarn('Jauh dari kapal — tekan TARIK', 2);
  }

  // =============================================================== KAMERA & DUNIA
  private cameraUpdate(dt: number) {
    const mode = this.mode;
    const cam = this.camera;
    // transisi duduk/berdiri
    const targetEye = mode === 'pilot' ? PILOT_EYE : this.walkPos;
    if (mode === 'eva') this.origin.copy(this.astro.pos);
    else if (mode === 'hab' && this.inHab) this.origin.copy(this.inHab.pos);
    else this.origin.copy(this.shipPos);
    this.eyeLocal.lerp(targetEye, 1 - Math.exp(-(mode === 'airlock' ? 12 : 6) * dt));
    let shake = this.shake;
    this.shake = Math.max(0, this.shake - dt * 0.2);
    shake += this.heat * 0.012 + (mode === 'pilot' ? this.throttle * 0.0015 * (this.boost ? 3 : 1) : 0);
    if (this.seq) shake += 0.004;

    const Q = mode === 'hab' && this.inHab ? this.inHab.quat : this.shipQuat;
    if (mode === 'eva' && this.rv.riding) {
      const rq = this.rv.quat;
      this.q1.setFromAxisAngle(Y, this.headYaw);
      this.q2.setFromAxisAngle(X, -this.headPitch);
      const off = new THREE.Vector3(0, 0.9, 9).applyQuaternion(this.q2).applyQuaternion(this.q1).applyQuaternion(rq);
      const upR = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
      const focus = upR.clone().multiplyScalar(-0.4);
      this.camP.copy(focus).add(off);
      this.m4.lookAt(this.camP, focus, upR);
      this.camQ.setFromRotationMatrix(this.m4);
    } else if (mode === 'eva') {
      this.camP.set(0, 0, 0);
      this.camQ.copy(this.astro.quat);
    } else if (this.view === 'chase' && mode === 'pilot') {
      const d = 22;
      this.q1.setFromAxisAngle(Y, this.headYaw);
      this.q2.setFromAxisAngle(X, -this.headPitch);
      const off = this.v1.set(0, 3.5, d).applyQuaternion(this.q2).applyQuaternion(this.q1);
      const rel = off.clone().applyQuaternion(Q);
      this.camP.copy(rel);
      this.m4.lookAt(rel, this.v2.set(0, 1.2, 0).applyQuaternion(Q), this.v3.set(0, 1, 0).applyQuaternion(Q));
      this.camQ.setFromRotationMatrix(this.m4);
    } else {
      this.q1.setFromAxisAngle(Y, this.headYaw);
      this.q2.setFromAxisAngle(X, this.headPitch);
      const bob = (mode === 'walk' || mode === 'hab') && this.jumpY < 0.02 && (Math.abs(this.walkVel.x) + Math.abs(this.walkVel.y) > 0.5) ? Math.sin(this.time * 8) * 0.025 : 0;
      this.camP.copy(this.eyeLocal);
      this.camP.y += bob;
      this.camP.applyQuaternion(Q);
      this.camQ.copy(Q).multiply(this.q1).multiply(this.q2);
    }
    cam.position.copy(this.camP);
    cam.quaternion.copy(this.camQ);
    if (shake > 0) {
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
      cam.position.z += (Math.random() - 0.5) * shake;
    }
    // FOV mengikuti kecepatan
    const sp = mode === 'eva' ? this.astro.vel.length() : this.shipVel.length();
    const fovT = this.baseFov + clamp(Math.log10(1 + sp / 200) / 3.2) * 14 + (this.boost ? 4 : 0);
    cam.fov += (fovT - cam.fov) * (1 - Math.exp(-3 * dt));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // kapal di adegan interior
    this.rig.group.position.set(this.shipPos.x - this.origin.x, this.shipPos.y - this.origin.y, this.shipPos.z - this.origin.z);
    this.rig.group.quaternion.copy(Q);
  }

  private worldUpdate(dt: number) {
    const cam = this.camera;
    const origin = this.origin;
    const camWorld = this.camP.clone().add(origin);
    if (this.mode !== 'eva') this.envCam = Object.assign(this.envCam, this.env);
    const env = this.envCam;

    // sinkron render semua benda
    for (const b of this.bodies) b.syncRender(origin);
    for (const h of this.habs) { h.dockTarget = this.docked === h ? 1 : 0; h.syncRender(origin); h.update(dt, this.time, h.pos.distanceTo(camWorld)); }
    {
      const rv = this.rv;
      if (rv.rig && rv.deployed) {
        rv.rig.group.position.copy(rv.pos).sub(origin);
        rv.rig.group.quaternion.copy(rv.quat);
        for (const w of rv.rig.wheels) w.rotation.x = rv.wheelRot;
        rv.rig.beacon.visible = Math.floor(this.time * 1.5) % 2 === 0;
        const lampOn = this.env.dens > 0 || true;
        for (const l of rv.rig.lamps) l.visible = lampOn;
      }
      const t = this.time;
      for (const sm of this.samples) {
        const w = this.v4.copy(sm.dirL).multiplyScalar(sm.rad + 0.7 + Math.sin(t * 2.2 + sm.rad) * 0.12).applyQuaternion(sm.body.quat).add(sm.body.pos);
        sm.mesh.position.copy(w).sub(origin);
        sm.mesh.rotation.y += dt * 1.5; sm.mesh.rotation.x += dt * 0.7;
        const dist = sm.mesh.position.length();
        sm.mesh.visible = dist < 5000;
        sm.mesh.scale.setScalar(Math.min(30, 1 + dist * 0.012));
        (sm.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(t * 4);
      }
    }
    this.station.position.copy(this.landmarks[0].pos).sub(origin);
    const stRing = (this.station as any).ring as THREE.Object3D;
    stRing.rotation.y += dt * 0.12;
    const bumi = this.byId.get('bumi')!;
    this.station.quaternion.setFromAxisAngle(Y, 0.5 + this.time * 0.0008 + bumi.def.phase);
    ((this.station as any).lamp as THREE.Mesh).visible = Math.floor(this.time * 1.5) % 2 === 0;
    this.voyager.position.copy(this.landmarks[1].pos).sub(origin);
    this.voyager.rotation.y += dt * 0.02;

    // arah matahari & cahaya
    const sunRel = this.v1.copy(this.sun.pos).sub(origin);
    this.sunLight.position.copy(sunRel);
    const sdShip = sunRel.clone().add(origin).sub(this.shipPos).normalize();
    this.rig.sun.position.copy(sdShip).multiplyScalar(100);
    const outside = this.mode === 'eva' || (this.view === 'chase');
    this.rig.sun.intensity += ((outside ? 3.4 : 0.35) - this.rig.sun.intensity) * (1 - Math.exp(-4 * dt));
    const hemi = this.rig.lights.hemi;
    hemi.intensity += ((this.mode === 'eva' ? 0.45 : this.mode === 'hab' ? 0 : 2.1) - hemi.intensity) * (1 - Math.exp(-4 * dt));

    // LOD per benda
    const fwdW = this.v2.set(0, 0, -1).applyQuaternion(this.camQ);
    const order: { b: Body; r: number }[] = [];
    for (const b of this.bodies) {
      const rel = this.v3.copy(camWorld).sub(b.pos);
      const sunDir = this.v4.copy(this.sun.pos).sub(b.pos).normalize();
      let dens = 0;
      if (env.atmBody === b) dens = clamp(env.dens, 0, 1.5);
      b.updateShading(rel, sunDir, this.time, dens);
      if (b.isTerrain) {
        const cl = b.toLocal(rel, new THREE.Vector3());
        const fl = b.toLocal(fwdW, new THREE.Vector3());
        b.updateLOD(cl, fl, this.frameN);
        order.push({ b, r: cl.length() / b.R });
      }
    }
    order.sort((a, c) => a.r - c.r);
    let budget = this.buildBudget;
    const t0 = performance.now();
    for (const o of order) {
      if (o.r > 80) break;
      const used = performance.now() - t0;
      if (used >= budget) break;
      o.b.buildPending(Math.max(1, budget - used));
    }

    // langit / kabut
    for (const b of this.bodies) { b.fogD.value = 0; if (b.gasU) b.gasU.uFog.value = 0; }
    let skyBright = 0;
    let dimK = 0;
    this.heat = 0;
    if (env.atmBody) {
      const b = env.atmBody;
      const atm = b.def.atm!;
      const up = this.v3.copy(camWorld).sub(b.pos).normalize();
      const sd = this.v4.copy(this.sun.pos).sub(b.pos).normalize();
      const sl = up.dot(sd);
      const sunlit = smooth(-0.18, 0.3, sl);
      const dens = Math.min(env.dens, 1.2);
      skyBright = clamp(dens * sunlit * 1.5);
      b.fogD.value = dens * atm.dens * (0.4 + 0.6 * sunlit);
      const sunset = smooth(-0.12, 0.04, sl) * (1 - smooth(0.04, 0.32, sl));
      const c = b.fogC.value;
      const base = 0.03 + 0.97 * sunlit;
      c.setRGB(
        (atm.fog[0] * (1 - sunset * 0.5) + 0.95 * sunset * 0.5) * base,
        (atm.fog[1] * (1 - sunset * 0.5) + 0.5 * sunset * 0.5) * base,
        (atm.fog[2] * (1 - sunset * 0.5) + 0.25 * sunset * 0.5) * base
      );
      // bencana: kabut badai pekat
      const hz = this.hazards.active;
      if (hz && hz.bodyId === b.id && hz.k > 0.01) {
        const info = HAZARDS[hz.type];
        b.fogD.value *= 1 + (info.fogMul - 1) * hz.k;
        if (info.fog[0] + info.fog[1] + info.fog[2] > 0) {
          const m = hz.k * 0.9;
          c.setRGB(c.r * (1 - m) + info.fog[0] * base * m, c.g * (1 - m) + info.fog[1] * base * m, c.b * (1 - m) + info.fog[2] * base * m);
        }
        if (info.fogMul > 8) skyBright = Math.max(skyBright, hz.k * 0.75 * sunlit);
        dimK = info.fogMul > 8 ? hz.k : hz.k * 0.4;
      }
      if (b.isGas && env.gasDepth > 0 && b.gasU) b.gasU.uFog.value = smooth(0, 0.02, env.gasDepth);
      this.heat = this.mode === 'eva' ? 0 : clamp((this.shipVel.length() * Math.min(dens, 1)) / 900);
    }
    this.sunLight.intensity = 3.6 * (1 - 0.55 * dimK);
    // kehidupan & cuaca partikel
    {
      const nb = env.nearest;
      this.life.update(nb, nb ? this.lifeProfiles.get(nb.id) ?? null : null, camWorld, origin, this.time, env.alt);
      const ah = this.hazards.active;
      const fup = nb ? this.v3.copy(camWorld).sub(nb.pos).normalize() : this.v3.set(0, 1, 0);
      const local = ah && nb && ah.bodyId === nb.id && ah.type !== 'flare';
      this.fx.update(dt, origin, fup, local ? ah!.type : null, local ? ah!.k : 0, camWorld, clamp(env.dens, 0, 1));
    }
    this.stars.starMat.opacity = 1 - skyBright;
    this.stars.mwMat.opacity = 1 - skyBright;
    this.stars.group.position.copy(cam.position);
    this.ambient.intensity = 0.16 + 1.1 * skyBright;
    this.ambient.color.setRGB(0.55, 0.62, 0.8);

    // debu & sabuk
    const velRef = this.mode === 'eva' ? this.astro.vel : this.shipVel;
    const spd = velRef.length();
    this.dust.update(origin, velRef, clamp(Math.log10(1 + spd) / 3) * 0.55 * (1 - skyBright * 0.8));
    this.belt.update(origin, this.time);
    if (this.belt.inside && !this.beltToast) { this.beltToast = true; this.toast('Memasuki Sabuk Asteroid — hati-hati!', 'warn'); this.audio.warn(); }
    if (!this.belt.inside && this.beltToast && Math.hypot(origin.x, origin.z) < 14e6) this.beltToast = false;

    // flare & silau
    this.updateFlares(camWorld, fwdW);
  }

  private updateFlares(camWorld: THREE.Vector3, fwdW: THREE.Vector3) {
    const sunRel = this.v1.copy(this.sun.pos).sub(camWorld);
    const dist = sunRel.length();
    const dir = sunRel.clone().normalize();
    // tertutup?
    let occluded = false;
    for (const b of this.bodies) {
      if (b === this.sun) continue;
      const c = this.v2.copy(b.pos).sub(camWorld);
      const t = c.dot(dir);
      if (t <= 0 || t > dist) continue;
      const dd = Math.sqrt(Math.max(0, c.lengthSq() - t * t));
      if (dd < b.R * 0.995) { occluded = true; break; }
    }
    const facing = dir.dot(fwdW);
    const ndc = dir.clone().multiplyScalar(1000).add(this.camera.position).project(this.camera);
    const inFront = facing > 0.2;
    const edge = 1 - clamp((Math.max(Math.abs(ndc.x), Math.abs(ndc.y)) - 0.7) / 0.6);
    const vis = occluded || !inFront ? 0 : edge;
    const dFade = clamp(1.4 - Math.log10(dist / 1e6) * 0.5, 0.25, 1);
    this.glare = vis * smooth(0.82, 1, facing) * dFade;
    for (const f of this.flares) {
      const nx = ndc.x * f.k, ny = ndc.y * f.k;
      const w = this.v3.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
      f.s.position.copy(this.camera.position).addScaledVector(w, 100);
      const sc = f.base * (f.k === 1 ? 1 : 0.6 + 0.4 * (1 - Math.abs(ndc.x)));
      f.s.scale.setScalar(sc * 0.4);
      (f.s.material as THREE.SpriteMaterial).opacity = vis * dFade * (f.k === 1 ? 0.5 : 0.28);
    }
  }

  private progressCheck(dt: number) {
    this.lastDiscCheck += dt;
    if (this.lastDiscCheck < 0.5) return;
    this.lastDiscCheck = 0;
    const o = this.mode === 'eva' ? this.astro.pos : this.shipPos;
    for (const b of this.bodies) {
      const d = o.distanceTo(b.pos);
      if (!b.discovered && d < b.R * (b.isSun ? 5 : 8) + 30000) {
        b.discovered = true;
        this.toast(`Penemuan: ${b.def.name} (${b.def.kind})`, 'discover');
        this.audio.discover();
      }
      if (!b.visited && d - b.R < Math.max(4000, b.R * 0.12)) {
        b.visited = true;
        if (!b.isSun) this.toast(`Orbit rendah: ${b.def.name}`, 'info');
      }
    }
  }

  // =============================================================== PROMPT, HUD
  private unscanned(kind: 'fauna' | 'flora', d: number) {
    for (const sp of this.life.spots) if (sp.kind === kind && sp.dist <= d && !this.life.scanned.has(sp.key)) return sp;
    return null;
  }

  private getPrompt(): { text: string; action: string } | null {
    if (this.seq || this.mode === 'airlock') return null;
    if (this.mode === 'pilot') {
      if (this.docked && !this.dockAnim) return { text: 'Lepas sandar', action: 'undock' };
      if (this.canDockHab && !this.docked) return { text: `Sandar ke ${this.canDockHab.name}`, action: 'dock' };
      return null;
    }
    if (this.mode === 'walk') {
      const dx = this.walkPos.x - SEAT_POS.x, dz = this.walkPos.z - SEAT_POS.z;
      if (Math.hypot(dx, dz) < 1.7) return { text: 'Duduk di kursi pilot', action: 'sit' };
      if (this.walkPos.x > 0.7 && this.walkPos.z > 4.0) return { text: this.linkHab ? `Pindah ke ${this.linkHab.name}` : 'Keluar kapal (EVA)', action: 'exit' };
    }
    if (this.mode === 'hab' && this.inHab) {
      const it = this.inHab.interactionAt(this.walkPos.x, this.walkPos.z);
      if (it) return { text: it.text, action: 'h:' + it.action };
    }
    if (this.mode === 'eva') {
      if (this.rv.riding) return { text: 'Turun dari Rover', action: 'dismount' };
      const hatchW = this.v1.set(HATCH_OUT.x, 0.9, HATCH_OUT.z).applyQuaternion(this.shipQuat).add(this.shipPos);
      if (this.astro.pos.distanceTo(hatchW) < 7) return { text: 'Masuk kapal', action: 'enter' };
      const hh = this.nearestHatch();
      if (hh) return { text: `Masuk ${hh.h.name}`, action: 'habin' };
      if (this.nearestSample(4.5)) return { text: 'Ambil sampel', action: 'sample' };
      if (this.rv.deployed && this.rv.pos.distanceTo(this.astro.pos) < 9) return { text: 'Naiki Rover', action: 'mount' };
      const fa = this.unscanned('fauna', 25);
      if (fa) return { text: `Pindai ${fa.name}`, action: 'scan-fauna' };
      const fl = this.unscanned('flora', 10);
      if (fl) return { text: `Pindai ${fl.name}`, action: 'scan-flora' };
      if (this.astro.grounded && this.envCam.nearest?.isTerrain) return { text: 'Tancapkan bendera', action: 'flag' };
    }
    return null;
  }

  private objective(): { pos: THREE.Vector3; label: string } | null {
    const cur = this.missions.currentStep(this.missions.tracked);
    if (!cur || !cur.step.hint) return null;
    const h = cur.step.hint;
    const ref = this.mode === 'eva' ? this.astro.pos : this.shipPos;
    if (h.startsWith('body:')) {
      const id = h.slice(5);
      const b = id === 'gen' ? [...this.bodies].reverse().find((x) => x.def.fixedPos) : this.byId.get(id);
      return b ? { pos: b.pos, label: b.def.name } : null;
    }
    if (h === 'hab:station') { const st = this.habs.find((x) => x.kind === 'station'); return st ? { pos: st.pos, label: st.name } : null; }
    if (h === 'hab:base') {
      let best: Habitat | null = null, bd = 1e18;
      for (const x of this.habs) if (x.kind === 'base') { const d = x.pos.distanceToSquared(ref); if (d < bd) { bd = d; best = x; } }
      return best ? { pos: best.pos, label: best.name } : null;
    }
    if (h === 'sample') {
      let best: THREE.Vector3 | null = null, bd = 1e18;
      for (const sm of this.samples) {
        if (sm.taken) continue;
        const w = new THREE.Vector3().copy(sm.dirL).multiplyScalar(sm.rad).applyQuaternion(sm.body.quat).add(sm.body.pos);
        const d = w.distanceToSquared(ref);
        if (d < bd) { bd = d; best = w; }
      }
      return best ? { pos: best, label: 'Sampel' } : null;
    }
    if (h === 'fauna' || h === 'flora') {
      const sp = this.life.spots.find((x) => x.kind === h && !this.life.scanned.has(x.key));
      return sp ? { pos: sp.pos, label: sp.name } : null;
    }
    return null;
  }

  private makeHud(): Hud {
    const mode = this.mode;
    const t = this.getTarget();
    const o = mode === 'eva' ? this.astro.pos : this.shipPos;
    let marker: Hud['marker'] = null;
    let tdist = 0;
    if (t) {
      const rel = this.v1.copy(t.pos).sub(this.origin);
      tdist = Math.max(0, rel.length() - t.radius);
      const cv = rel.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const behind = cv.z > 0;
      const nd = rel.clone().project(this.camera);
      marker = { x: behind ? -nd.x : nd.x, y: behind ? -nd.y : nd.y, behind };
    }
    const env = mode === 'eva' ? this.envCam : this.env;
    let disc = 0, vis = 0, land = 0, fl = 0;
    for (const b of this.bodies) { if (b.discovered) disc++; if (b.visited) vis++; if (b.landedOn) land++; if (b.flagged) fl++; }
    const spd = mode === 'eva' ? (this.rv.riding ? Math.abs(this.rv.speed) : this.astro.vel.clone().sub(this.astroRefVelocity()).length()) : this.shipRelSpeed();
    void o;
    return {
      mode, view: this.view, look: this.lookMode, speed: spd, alt: env.alt, nearest: env.nearest ? env.nearest.def.name : '—',
      throttle: this.throttle, limit: SHIP.aMain * (this.boost ? SHIP.boostMul : 1), landed: this.landed, grounded: this.astro.grounded,
      target: t ? { id: t.id, name: t.name, dist: tdist } : null, marker, autopilot: this.autopilot,
      prompt: this.getPrompt(), oxygen: this.oxygen, heat: this.heat, glare: this.glare, atmo: clamp(env.dens),
      gasDepth: this.envCam.gasDepth, warn: this.warn, seq: this.seq ? this.seq.label : null, fade: this.fade,
      nearSurface: env.alt < 4000 && !!env.nearest && !env.nearest.isSun, counts: { disc, visit: vis, landed: land, flags: fl, total: this.bodies.length },
      gravity: this.mode === 'walk' || this.mode === 'hab' ? this.walkGravity() : this.astro.g * this.astro.gfac, boost: this.boost, muted: this.audio.muted,
      ...this.extraHud(),
    };
  }

  private extraHud() {
    const hb = this.hazardBody();
    const fc = this.hazards.forecast(hb ? hb.id : null);
    const cur = this.missions.currentStep(this.missions.tracked);
    let obj: Hud['obj'] = null;
    const ob = this.objective();
    if (ob) {
      const rel = this.v1.copy(ob.pos).sub(this.origin);
      const dist = rel.length();
      const cv = rel.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const behind = cv.z > 0;
      const nd = rel.clone().project(this.camera);
      obj = { x: behind ? -nd.x : nd.x, y: behind ? -nd.y : nd.y, behind, label: ob.label, dist };
    }
    const ch = this.currentHab();
    return {
      suit: this.suit, lightning: this.lightning, radiation: this.radiation, quake: this.quakeK,
      weather: fc ? { type: fc.type, label: fc.label, icon: fc.icon, k: fc.k, in: fc.in, active: fc.active, sheltered: this.sheltered } : null,
      link: this.linkHab ? { name: this.linkHab.name, docked: this.docked === this.linkHab } : null,
      canDock: !!this.canDockHab && !this.docked,
      credits: this.credits, samples: this.samplesHeld,
      mission: cur ? { id: cur.mission.id, title: cur.mission.title, text: cur.step.text, prog: cur.prog, need: cur.step.need ?? 1, unit: cur.step.unit ?? '' } : null,
      obj,
      rover: { riding: this.rv.riding, near: this.rv.deployed && this.mode === 'eva' && this.rv.pos.distanceTo(this.astro.pos) < 10, speed: this.rv.speed, deployed: this.rv.deployed },
      habName: this.inHab ? this.inHab.name : null,
      power: ch ? ch.powerRatio : 1,
      canBuild: !!ch,
      canBase: this.mode === 'eva' && this.astro.grounded && !!this.envCam.nearest?.isTerrain,
      scanning: this.scanLock > 0,
      fuel: this.fuel, hull: this.hull, skinT: this.skinT, cabinT: this.cabinT,
      orbit: { ...this.orb }, warp: this.warp, warpNow: this.warpNow, hold: this.holdMode, landAssist: this.landAssist,
      gForce: this.gForce, thrust: this.thrustAcc.length(), qDyn: this.fl.qDyn, rho: this.fl.rho, tAmb: this.fl.tAmb, pAmb: this.fl.pAmb,
      solar: this.fl.solar, jetDv: this.jetDv, primaryR: (this.shipFrame.p ?? this.sun).R,
    };
  }

  // =============================================================== LAYAR KOKPIT
  private mapList: { b: Body; col: string; r: number }[] | null = null;
  private drawScreens() {
    if (!this.mapList) {
      this.mapList = this.bodies.filter((b) => !b.def.parent || b.def.parent === 'matahari').map((b) => ({
        b, r: b.isSun ? 5 : b.R > 200000 ? 3.2 : 2.2,
        col: b.isSun ? '#ffd060' : b.def.id === 'bumi' ? '#4aa0ff' : b.def.id === 'mars' ? '#e0703a' : b.isGas ? '#e0c090' : '#cfd6dd',
      }));
    }
    const inv = this.q1.copy(this.shipQuat).invert();
    const blips: Blip[] = [];
    for (const t of this.allTargets()) {
      const v = this.v1.copy(t.pos).sub(this.shipPos).applyQuaternion(inv);
      const len = v.length();
      if (len < 1) continue;
      const th = Math.acos(clamp(-v.z / len, -1, 1));
      const phi = Math.atan2(v.y, v.x);
      const rad = th / Math.PI;
      blips.push({
        x: Math.cos(phi) * rad, y: -Math.sin(phi) * rad, sel: t.id === this.targetId,
        col: t.body ? (t.body.isSun ? '#ffd060' : t.body.def.parent && t.body.def.parent !== 'matahari' ? '#aab4bf' : '#45e3ff') : '#ff9a3c',
        r: t.body?.isSun ? 4.5 : t.body && t.body.R > 100000 ? 3.5 : 2.4,
      });
    }
    const f = this.v2.set(0, 0, -1).applyQuaternion(this.shipQuat);
    const nb = this.env.nearest;
    const rad = nb ? this.v3.copy(this.shipPos).sub(nb.pos).normalize() : new THREE.Vector3(0, 1, 0);
    const upS = this.v4.set(0, 1, 0).applyQuaternion(this.shipQuat);
    const rS = new THREE.Vector3(1, 0, 0).applyQuaternion(this.shipQuat);
    const t = this.getTarget();
    const data: ScreenData = {
      t: this.time, blips,
      pitch: Math.asin(clamp(f.dot(rad), -1, 1)),
      roll: Math.atan2(rS.dot(rad), upS.dot(rad)),
      speed: this.shipRelSpeed(), alt: this.env.alt, throttle: this.throttle,
      targetName: t ? t.name : '', targetDist: t ? Math.max(0, t.pos.distanceTo(this.shipPos) - t.radius) : 0,
      ap: this.autopilot, oxygen: this.oxygen, hull: this.hull, energy: this.energy,
      nearest: nb ? nb.def.name : '—', dens: this.env.dens,
      mapBodies: this.mapList.map((m) => ({ x: m.b.pos.x, z: m.b.pos.z, r: m.r, col: m.col, name: m.b.def.name, parentless: true, sel: m.b.id === this.targetId })),
      ship: { x: this.shipPos.x, z: this.shipPos.z, h: Math.atan2(f.z, f.x) },
      warn: this.warn,
    };
    const s = this.rig.screens;
    const ph = this.frameN % 4;
    if (ph === 0) drawRadar(s.radar, data);
    else if (ph === 1) drawNav(s.nav, data);
    else if (ph === 2) drawStatus(s.status, data);
    else drawMap(s.map, data);
  }

  // =============================================================== RENDER
  private animateRig() {
    const rig = this.rig;
    const t = this.time;
    // tuas gas & yoke
    rig.throttleLever.rotation.x += (-this.throttle * 0.9 - rig.throttleLever.rotation.x) * 0.2;
    rig.yoke.rotation.z += (-this.input.steerX * 0.5 - rig.yoke.rotation.z) * 0.2;
    rig.yoke.rotation.x += (-this.input.steerY * 0.25 - rig.yoke.rotation.x) * 0.2;
    // lampu berkedip
    for (const b of rig.blinkers) {
      const on = Math.sin(t * b.speed * 3 + b.phase) > -0.2;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      b.mesh.scale.setScalar(on ? 1 : 0.35);
    }
    // holo
    rig.holo.rotation.y = t * 0.1;
    const sunPos = this.sun.pos;
    rig.holoPlanets.forEach((m, id) => {
      const b = this.byId.get(id);
      if (!b) return;
      const dx = b.pos.x - sunPos.x, dz = b.pos.z - sunPos.z;
      const r = Math.hypot(dx, dz);
      const rr = 0.06 + Math.sqrt(r / 68e6) * 0.46;
      const a = Math.atan2(dz, dx);
      m.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    });
    {
      const dx = this.shipPos.x - sunPos.x, dz = this.shipPos.z - sunPos.z;
      const r = Math.hypot(dx, dz);
      const rr = 0.06 + Math.sqrt(r / 68e6) * 0.46;
      const a = Math.atan2(dz, dx);
      rig.holoShip.position.set(Math.cos(a) * rr, 0.02 + Math.sin(t * 3) * 0.005, Math.sin(a) * rr);
      rig.holoShip.scale.setScalar(Math.floor(t * 2) % 2 ? 1 : 0.5);
    }
    // mesin
    const sp = this.shipVel.length();
    const thr = this.mode === 'eva' ? 0 : Math.max(this.throttle, this.braking ? 0 : clamp(sp / Math.max(1, this.env.limit)) * 0.4);
    const flick = 0.85 + Math.random() * 0.3;
    rig.engineGlows.forEach((g, i) => {
      const core = i % 2 === 1;
      (g.material as THREE.MeshBasicMaterial).opacity = (core ? 0.55 : 0.4) * Math.min(1, thr * 1.4) * flick;
      g.scale.set(1, 0.4 + thr * (this.boost ? 2.2 : 1.1) * flick, 1);
    });
    rig.engineLight.intensity = thr * 25 * flick;
    rig.fans.forEach((f, i) => { f.rotation.z += (i ? -1 : 1) * 0.02 * (1 + thr * 8); });
    (rig.reactor.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 2) * 0.15 + thr * 0.2;
    // kaki pendarat: tampak bila rendah/ landed
    const gearOut = this.env.alt < 3000 ? 1 : 0;
    rig.legs.forEach((l) => {
      const cur = l.scale.y;
      l.scale.y += (gearOut ? 1 - cur : 0.15 - cur) * 0.08;
    });
    // lampu habitat (satu set tetap agar shader tidak dikompilasi ulang)
    {
      const hab = this.mode === 'hab' ? this.inHab : null;
      const rat = hab ? hab.powerRatio : 1;
      const rad = 1 - this.radiation * 0.5 * (0.5 + 0.5 * Math.sin(t * 40));
      this.habHemi.intensity += ((hab ? 1.5 * (0.35 + 0.65 * rat) : 0) - this.habHemi.intensity) * 0.2;
      let target = 0;
      if (hab) {
        hab.cellCenterAt(this.walkPos.x, this.walkPos.z, this.habLight.position);
        this.habLight.position.applyQuaternion(hab.quat).add(hab.int.position);
        const m = hab.getMod(Math.round(this.walkPos.x / CELL), Math.round(this.walkPos.z / CELL));
        if (m) this.habLight.color.setHex(MOD_DEFS[m.type].color).lerp(this.col0.setHex(0xfff0dd), 0.75);
        target = 5.8 * (0.25 + 0.75 * rat) * (rat < 0.6 ? 0.8 + 0.2 * Math.random() : 1) * rad;
      }
      this.habLight.intensity += (target - this.habLight.intensity) * 0.25;
      const shipOn = this.mode === 'hab' ? 0 : 1;
      rig.lights.cabin.intensity = 5.2 * shipOn;
      rig.lights.airlock.intensity = 3.5 * shipOn;
    }
    // lampu kokpit menyesuaikan
    rig.lights.cockpit.intensity = (this.mode === 'hab' ? 0 : 1) * (3.4 + Math.sin(t * 5) * 0.1 * this.heat + this.heat * 4);
    if (this.heat > 0.1) rig.lights.cockpit.color.setRGB(1, 0.6 + 0.4 * (1 - this.heat), 0.4 + 0.6 * (1 - this.heat));
    else rig.lights.cockpit.color.setHex(0x88ccff);
  }

  render() {
    if (!this.renderer) return;
    this.animateRig();
    this.renderer.clear();
    this.renderer.render(this.world, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.shipScene, this.camera);
  }
}
