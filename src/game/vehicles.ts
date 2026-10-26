// Kendaraan permukaan: Rover Jelajah (dipakai di garasi basecamp & saat dikendarai di planet)
import * as THREE from 'three';

export interface RoverRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  lamps: THREE.Mesh[];
  beacon: THREE.Mesh;
}

const mat = {
  hull: new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.4, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23282f, metalness: 0.5, roughness: 0.6 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xd9692a, metalness: 0.3, roughness: 0.55 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.1, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fd0ff, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.55 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x1a3a7a, metalness: 0.7, roughness: 0.3, emissive: 0x0a1a3a }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false }),
  red: new THREE.MeshBasicMaterial({ color: 0xff3a30, toneMapped: false }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  red2: new THREE.MeshBasicMaterial({ color: 0xe8112d }),
};

// Model menghadap -Z (depan), panjang ~3.8 m, lebar ~2.7 m, tinggi roda di y=0
export function makeRover(): RoverRig {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    g.add(me);
    return me;
  };
  // sasis
  add(new THREE.BoxGeometry(2.0, 0.5, 3.6), mat.hull, 0, 0.85, 0);
  add(new THREE.BoxGeometry(2.1, 0.12, 3.7), mat.accent, 0, 0.62, 0);
  add(new THREE.BoxGeometry(1.7, 0.2, 1.1), mat.dark, 0, 0.78, -1.9, 0.18);
  // kabin bertekanan
  const cab = add(new THREE.SphereGeometry(0.95, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, 0, 1.1, -0.35);
  cab.scale.set(1, 0.95, 1.2);
  add(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 18), mat.hull, 0, 1.1, -0.35).scale.set(1, 1, 1.2);
  // kursi
  add(new THREE.BoxGeometry(0.6, 0.12, 0.55), mat.dark, 0, 1.2, -0.2);
  add(new THREE.BoxGeometry(0.6, 0.55, 0.1), mat.dark, 0, 1.5, 0.05);
  // bak belakang & panel surya
  add(new THREE.BoxGeometry(1.8, 0.4, 1.3), mat.dark, 0, 1.2, 1.15);
  const sol = add(new THREE.BoxGeometry(2.4, 0.05, 1.5), mat.panel, 0, 1.62, 1.2, -0.12);
  sol.name = 'solar';
  // antena
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), mat.rim, 0.8, 1.9, 1.2);
  const dish = add(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), mat.rim, 0.8, 2.52, 1.2, -0.9);
  dish.material = mat.rim;
  const beacon = add(new THREE.SphereGeometry(0.07, 8, 8), mat.red.clone(), -0.8, 1.7, 1.55);
  // bendera kecil
  add(new THREE.BoxGeometry(0.34, 0.11, 0.01), mat.red2, -0.78, 2.1, 1.4);
  add(new THREE.BoxGeometry(0.34, 0.11, 0.01), mat.white, -0.78, 1.99, 1.4);
  add(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 5), mat.rim, -0.95, 1.85, 1.4);
  // lampu depan
  const lamps: THREE.Mesh[] = [];
  for (const s of [-1, 1]) lamps.push(add(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), mat.lamp, s * 0.7, 0.92, -1.84, Math.PI / 2));
  // roda 6 buah
  const wheels: THREE.Object3D[] = [];
  const wz = [-1.35, 0, 1.35];
  for (const s of [-1, 1]) for (const z of wz) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.38, 16), mat.tire);
    w.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), mat.rim);
    w.add(hub);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.04), mat.dark);
      sp.rotation.y = (i / 6) * Math.PI;
      w.add(sp);
    }
    const holder = new THREE.Group();
    holder.position.set(s * 1.22, 0.46, z);
    holder.add(w);
    g.add(holder);
    wheels.push(holder);
    add(new THREE.BoxGeometry(0.12, 0.12, 0.6), mat.dark, s * 1.05, 0.7, z);
  }
  g.traverse((o) => { o.frustumCulled = false; });
  return { group: g, wheels, lamps, beacon };
}
