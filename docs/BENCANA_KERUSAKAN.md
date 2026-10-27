# Bencana & Kerusakan Fisik (v2)

Dokumen ini menjelaskan bagaimana bencana planet dan kerusakan modul/kapal bekerja. Kerusakan **bukan lapisan (overlay)**:
bagian benar-benar lepas, penyok/berlubang, terbakar, bocor, berserakan sebagai puing berfisika, atau meledak.

## 1. Mesin efek (`src/game/effects.ts`)
- **Partikel titik berbayang lembut** (api, asap, percikan, gas, debu). Shader memakai log-depth sehingga benar bersama buffer kedalaman logaritmik.
  Mode *lokal* (ikut induk: modul/kapal) dan mode *dunia* (koordinat absolut + bingkai primer, dibawa oleh `carry`).
- **Puing berfisika** (`DebrisField`): gravitasi dari μ benda primer, hambatan udara ρ, tumbukan dengan medan (`surfaceRadius`), pantulan, menetap
  dan ikut berputar dengan permukaan, memudar. Puing panas meninggalkan jejak api & asap.
- **Lampu kilat** (`FxLights`): jumlah lampu tetap agar shader tak dikompilasi ulang.

## 2. Kerusakan modul (`damage.ts` + `modules.ts`)
| Gejala | Mekanisme |
|---|---|
| Kekuatan | Tiap jenis modul punya energi serap `MOD_STRENGTH` (J). Benturan E → `hp −= E / kapasitas`. |
| Penyok / lubang | `shellPoint` menempatkan lekuk tepat di cangkang (kotak / tabung tegak / tabung memanjang). Lubang → kebocoran tekanan. |
| Bagian lepas | Panel surya, parabola, tiang antena, sensor, tangki, kargo, kubah kaca … menjadi puing dengan kecepatan sesuai arah benturan/angin. |
| Kebocoran | Tekanan habitat `P' = −Σ(r²·3)·0,06·P`; semburan gas terlihat di lubang; di dalam <60% udara menipis (oksigen turun), <25% bahaya. |
| Api | Butuh oksigen (tekanan > 30%); tumbuh pelan, menyebar lewat pintu terbuka, menggerogoti hp; padam di vakum; sprinkler pasif bila daya cukup; pemain memadamkan dengan **F**. |
| Ledakan | `hp ≤ 0` → bola api + gelombang asap + semua bagian + pecahan menjadi puing; modul tetangga ikut kena; modul terputus melayang. Hub inti hanya runtuh sebagian (tak bisa dihancurkan total). |
| Perbaikan | Konsol modul: ongkos `cost·(0,12 + 0,55·(1−hp)) + bagian·12 + penyok·2` kredit; atau **F** dari luar (EVA) di dekat modul rusak. |
| Penyimpanan | `hp`, penyok, dan bagian yang hilang disimpan dalam `nusantara-save-v2`. |

## 3. Kerusakan kapal
- `damageHull(frac, why, quiet, dir)` memicu `ShipDamage.hit`: penyok di kulit (ellipsoid badan), retak kaca kokpit (kanvas prosedural), percikan,
  dan bagian terdekat dari titik tumbuk **lepas**: 4 kaki, 2 sayap, 3 mesin, parabola, sirip.
- Dampak fungsional: mesin hilang → daya dorong 30–100%; sayap hilang → laju putar 50–100%; kaki hilang → penyerapan benturan turun (bisa 15%).
- Lambung < 55% → asap dari mesin/sayap yang tertinggal di belakang kapal; < 25% → api di kokpit, lampu darurat merah berkedip, alarm.
- Lambung 0 → ledakan 2,8 detik (semua bagian jadi puing), lalu evakuasi & perbaikan penuh.
- Sandar di stasiun memperbaiki lambung 1,2%/dtk dan memulihkan semua bagian bila penuh.

## 4. Bencana
| Bencana | Fisika/efek |
|---|---|
| **Badai pasir/debu** | Gumpalan debu raksasa (titik lembut) bergerak searah angin pada lapisan 0–70 m di atas tanah, butiran pasir melompat (saltasi) di dekat tanah, goresan angin, kabut pekat bertint cokelat; suara angin + desis butiran + ketukan butiran pada lambung. Kecepatan angin berhembus (gust) 0,45–1,7×. **Tekanan dinamis q = ½ρw²** menentukan efek: di Mars (ρ=0,0155) q hanya ≈ 5 Pa → *tak ada hempasan*, bahayanya debu menutupi panel (daya turun hingga −75%) dan abrasi baju; di Bumi badai kencang q ≈ 1 kPa merobek panel surya & menyeret astronot. |
| **Hujan asam Venus** | Hanya terjadi di **dek awan 45–70 km** (suhu ≈ 300–350 K, tekanan ≈ 1 bar); di permukaan Venus tak ada hujan asam (menguap sebelum sampai) tetapi panas 737 K / 90 bar. Menggerogoti lambung & modul (korosi). Turun dari dek awan membuat bencana reda cepat. |
| **Badai petir** | Petir bercabang sungguhan (garis bergerigi + kilat + lampu), sasaran dipilih menurut ketinggian/keruncingan. **Tiang antena (Komunikasi) menangkal petir**; tanpa tiang, modul disambar (sebagian energi → api & hp). Guntur tertunda `jarak / 343 m/s`. |
| **Hujan meteor** | Energi `½·m·v²` (m: 0,5 g–0,3 kg, v ≈ 14 km/s). Sebagian meteor diarahkan ke habitat/kapal. Kena langsung → penyok/lubang/bagian lepas/api; serpihan dalam radius 55 m → kerusakan kecil; di tanah: awan debu, lontaran batu berfisika, kawah hangus permanen, kilatan, suara. |
| **Letusan vulkanik** | Hujan abu; **beban atap** terkumpul 3 kg/m²/dtk; modul datar runtuh pada beban ambang (Rumah Kaca 140, Hunian 380, bulat 520–600 kg/m²), modul berkubah/silinder menggelincirkan abu. |
| **Gempa** | Getaran, debu jatuh dari langit-langit interior, derit struktur, kerusakan kecil acak ∝ intensitas². |
| **Semburan surya** | Dosis ∝ fluks Matahari (1/r²) × perisai: magnetosfer (×0,3 dekat Bumi/raksasa gas) dan atmosfer tebal (×0,15 di permukaan). |

## 5. Istirahat (lompat waktu) & biologi
- **Tidur** di ranjang hunian: waktu maju ¼ hari setempat (stasiun 90 menit; 10 menit–6 jam). Bencana, kebakaran, kebocoran, dan hujan meteor
  tetap berjalan selama tidur; alarm membangunkan. Syarat: kapal sandar/mendarat, tak ada api, tekanan > 60%.
- **Kehidupan** mensyaratkan: atmosfer, **air cair di permukaan**, suhu 273–373 K, tekanan > 611 Pa. Flora butuh kelembapan & suhu & lereng landai; kepadatan membentuk
  gerombol (patch), bukan kisi. Hewan hanya di lereng < 20°, jauh dari tebing, dan **tidak masuk air**. Burung miring menurut gaya sentripetal `tan φ = v²/(g·r)`.
- **Rumah kaca**: panen butuh tekanan > 50%, kubah kaca utuh, daya > 50%; hasil ∝ cahaya × daya; memulihkan udara lebih cepat.
