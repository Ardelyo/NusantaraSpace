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
| **Bencana planet** | Mars: badai pasir/debu & gempa · Venus: hujan asam *hanya di dek awan 45–70 km* · Bumi: badai petir (petir bercabang, tiang antena menangkal) · Io: letusan & beban abu pada atap · Titan: hujan metana · Bulan & dunia tanpa atmosfer: hujan meteor yang menghantam habitat · semua: semburan surya (diskalakan fluks Matahari, magnetosfer, atmosfer). Angin memakai tekanan dinamis ½ρw² (di Mars nyaris tak mendorong, di Bumi merobek panel). Efek visual partikel (pasir melompat, gumpalan debu, abu, hujan), suara berlapis (angin, siulan, desis pasir, gemuruh, guntur tertunda jarak/343 m/s). |
| **Kerusakan fisik** | Modul & kapal benar-benar rusak: penyok/lubang, bocor (tekanan turun), terbakar & menyebar, bagian lepas jadi puing berfisika (panel surya, parabola, antena, kaki, sayap, mesin), meledak. Detail di [docs/BENCANA_KERUSAKAN.md](docs/BENCANA_KERUSAKAN.md). Perbaiki lewat Konsol Modul atau **F** saat EVA; padamkan api dengan **F**. |
| **Istirahat** | Tidur di ranjang hunian melompat waktu ¼ hari setempat (bencana & kebocoran tetap berjalan; alarm membangunkan). |
| **Kehidupan** | Bumi dan dunia generatif yang punya atmosfer, air cair, dan suhu 273–373 K memiliki flora (gerombol pohon, semak, kristal berpendar; butuh kelembapan, suhu, lereng landai) dan fauna (kijang, burung, makhluk bercahaya; menghindari air & tebing) yang bisa dipindai. |
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
src/game/hazards.ts   bencana & cuaca (HazardSystem) + partikel cuaca/pasir/petir/meteor (WeatherFX) + profil kehidupan
src/game/effects.ts   partikel titik (api/asap/percikan), puing berfisika, lampu kilat
src/game/damage.ts    kerusakan modul & kapal: penyok, bocor, api, bagian lepas, ledakan, perbaikan
src/game/physics.ts   fisika murni: orbit Kepler, atmosfer, termal, benturan (diuji `npm test`)
src/game/life.ts      flora & fauna prosedural di sekitar pemain (InstancedMesh)
src/game/missions.ts  definisi & pelacak misi
src/game/vehicles.ts  model Rover Jelajah
src/BuildPanel.tsx    Konsol Modul · src/MissionPanel.tsx  Pusat Misi · src/MapPanel.tsx  Peta
```
