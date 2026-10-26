# NusantaraSpace

Game penjelajahan antariksa progresif (three.js + React + Vite): terbang dari orbit hingga mendarat tanpa teleportasi,
berjalan di dalam kapal, EVA di permukaan planet, dan kini juga **basecamp & stasiun modular**, **misi**, **kehidupan planet**
serta **bencana alam planet**.

## Menjalankan

```bash
npm install
npm run dev      # pengembangan
npm run build    # satu berkas dist/index.html (vite-plugin-singlefile)
```

## Fitur utama

| Area | Isi |
| --- | --- |
| **Habitat modular** | Basecamp (di permukaan) & Stasiun Kartika (orbit Bumi). 11 jenis modul — Hub, Koridor, Airlock, Dermaga, Hunian, Lab, Rumah Kaca, Pembangkit Daya, Gudang, Garasi Rover, Komunikasi. Modul **dipasang/dilepas** lewat Konsol Modul (Hub, tombol `H`); interior & eksterior dibangun dari definisi yang sama (`src/game/modules.ts`). Melepas modul membuatnya melayang pergi, cabang yang terputus ikut lepas, kredit kembali 60%. |
| **Sandar** | Kapal dapat sandar otomatis di dermaga stasiun (tombol `U` / SANDAR) dengan pipa teleskopik, lalu pindah langsung ke interior stasiun. |
| **Interior & mobilitas** | Jalan dengan percepatan, lari, lompat, bobbing; masuk/keluar habitat lewat airlock; **Rover enam roda** (`R`) untuk berkendara di permukaan (turbo, lereng, tabrakan dengan basecamp); jetpack EVA. |
| **Bencana planet** | Mars: badai debu & gempa · Venus: hujan asam · Bumi: badai petir · Io: letusan vulkanik · Titan: hujan metana · Bulan & dunia tanpa atmosfer: hujan meteor · semua: semburan surya. Peringatan dini, kabut/partikel/kilat, angin, kerusakan baju, daya surya turun. Dunia generatif mendapat profil bencana acak (atau surga tenang). |
| **Kehidupan** | Bumi dan dunia generatif beratmosfer punya flora (pohon, semak, kristal berpendar) dan fauna (kijang, burung, makhluk bercahaya) yang bisa dipindai. |
| **Misi** | 10 misi berantai (`src/game/missions.ts`) dengan penanda tujuan di layar, hadiah kredit ◈, sampel regolit/es/belerang, analisis di Lab. Progres tersimpan di `localStorage`. |
| **Kompatibel PC** | Mouse terkunci (pointer-lock) + papan ketik penuh, roda mouse = daya, klik = aksi, gamepad, petunjuk tombol kontekstual, DPR hingga 2×. Layar sentuh tetap didukung. |

## Kontrol PC

`W A S D` gerak/kemudi · `Q E` roll · `Shift`/`Ctrl`/roda mouse daya · `X` rem · `B` turbo · `Spasi` lompat/naik · `C` turun ·
`F`/klik kiri aksi · `T` berdiri/duduk · `V` kamera · `R` rover · `K` basecamp · `U` sandar · `P` autopilot · `G` bendera ·
`O` tarik ke kapal · `L` pandang bebas · `Tab` peta · `J` misi · `H` konsol modul · `M` suara · `/` bantuan · `Esc` lepas mouse.

Gamepad: stik kiri/kanan, RT/LT daya, A aksi, B rem, X berdiri, Y peta, Select misi, Start konsol, L3 rover.

## Struktur kode

```
src/game/engine.ts    mesin utama: fisika, kamera, mode (pilot/walk/eva/hab), sandar, rover, misi, HUD
src/game/modules.ts   sistem habitat modular (interior + eksterior + tabrakan + interaksi)
src/game/hazards.ts   bencana & cuaca (HazardSystem) + partikel cuaca/meteor (WeatherFX) + profil kehidupan
src/game/life.ts      flora & fauna prosedural di sekitar pemain (InstancedMesh)
src/game/missions.ts  definisi & pelacak misi
src/game/vehicles.ts  model Rover Jelajah
src/BuildPanel.tsx    Konsol Modul · src/MissionPanel.tsx  Pusat Misi · src/MapPanel.tsx  Peta
```
