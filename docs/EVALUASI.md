# Evaluasi Akurasi: Fisika, Fluida, Kimia, Biologi, Matematika & Logika

Tujuan: menilai apakah simulasi dan konten sesuai dengan sains yang dinyatakan di UI/deskripsi, dan menandai hal yang salah secara logis. Tingkat keparahan: **K** = kritis (salah jelas, tampak di UI), **S** = sedang (tidak konsisten/menyesatkan), **R** = rendah (pendekatan wajar tapi perlu dicatat).

Ringkasan: game ini memakai skala dan model yang bersifat **kinematik dan artistik**, bukan simulasi fisik. Itu bisa diterima, tapi beberapa angka di UI (jari-jari, jarak, gravitasi, "dinding" stasiun) menyatakan nilai nyata yang tidak cocok dengan simulasinya.

---

## 1. Fisika: skala, orbit, dan gravitasi

| # | Tingkat | Temuan | Bukti (kode / data) |
|---|---|---|---|
| F1 | **K** | **Skala jarak dan radius tidak konsisten antar benda.** Bumi R = 100 km di game (nyata 6.371 km; rasio 0,016). Matahari R = 800 km (nyata 696.340 km; rasio 0,0011). Jarak Bumi–Matahari 9.500 km (nyata 1,496×10⁸ km; rasio 6×10⁻⁵). Jarak Bulan 420 km (nyata 384.400 km; rasio 0,0011). | `src/game/bodies.ts` nilai `radius` & `dist` |
| F2 | **K** | **Teks info menyatakan radius nyata, padahal yang dipakai game adalah radius skala.** Contoh: Bumi tertulis "6.371 km", tetapi `radius = 100000` (100 km). Panel peta dan HUD menampilkan angka yang tidak sesuai dengan yang dialami pemain. | `bodies.ts` field `info.radiusKm` vs `radius` |
| F3 | **K** | **Periode orbit tidak mengikuti Hukum Kepler, bahkan terhadap jarak yang dipakai game sendiri.** Dengan rumus `T = 2π·d/v`: Neptunus/Bumi = 21,1, sedangkan Kepler dari jarak game = 14,7. Merkurius/Bumi = 0,27, sedangkan Kepler = 0,38. Kecepatan orbit ditulis per planet tanpa turunan dari gravitasi. | `body.ts` `orbit()`: `a = phase + (speed/dist)·t`; nilai `speed` di `bodies.ts` |
| F4 | **K** | **Bulan mengorbit Bumi dalam ±3,2 jam** (nyata 27,3 hari). Penyebab: jarak 420 km dan kecepatan 230 m/s. | `bulan`: `dist 420000, speed 230` |
| F5 | **S** | **Rotasi Bumi 20 menit** (nyata 23,9 jam). Pengaruhnya ke siklus siang-malam dan ke posisi Matahari tidak sesuai dengan yang diharapkan pemain. | `bumi.spin = 0.0052 rad/s` |
| F6 | **S** | **Gravitasi permukaan tidak diturunkan dari massa dan radius.** Dengan g = 9,8 m/s² dan R = 100 km, massa implisit Bumi = 1,5×10²¹ kg (nyata 6×10²⁴ kg, faktor ~4.000). Mars dan Bulan juga tidak konsisten. Dampaknya terbatas karena g hanya dipakai di EVA. | `bodies.ts` `g:` vs `radius` |
| F7 | **S** | **Tidak ada gravitasi pada kapal.** Kapal dan rover hanya dibatasi kecepatan dan permukaan; tidak ada gaya gravitasi dari planet atau Matahari. Akibatnya kapal tidak jatuh ke planet saat mesin mati, dan tidak ada orbit alami. | `engine.ts` `stepShip()` |
| F8 | **S** | **Batas kecepatan pendaratan dibuat dari altitude, bukan dari energi.** `limit = alt·kf + 6` adalah pendekatan artistik, bukan hasil dari gaya hambat atau energi kinetik. | `engine.ts` `computeEnv()` |
| F9 | **S** | **Gravitasi di EVA memudar linier antara 300 dan 1000 m altitude** (`gfac = 1 − (alt−300)/700`). Gravitasi nyata turun dengan 1/r², bukan linier dan bukan dari ketinggian permukaan. | `engine.ts` `stepAstro()` |
| F10 | **S** | **Stasiun dan basecamp tidak mengikuti fisika orbit.** Stasiun Kartika ditempatkan di `bumi.pos + stOffset` dengan orientasi tetap; tidak mengorbit, tidak berputar. | `modules.ts` `updatePose()` |
| F11 | **S** | **Gravitasi buatan tidak konsisten dengan teks.** Deskripsi stasiun: "Mikro (gravitasi buatan di kabin)". Di kode, pemain di dalam stasiun berjalan dan melompat dengan 9,8 m/s² penuh tanpa sumber gravitasi buatan. | `engine.ts` `stepWalk()`, `modules.ts` `STATION_LAYOUT`, info stasiun |

---

## 2. Fluida: atmosfer, aerodinamika, dan cuaca

| # | Tingkat | Temuan | Bukti |
|---|---|---|---|
| Fl1 | **K** | **Hujan asam di permukaan Venus tidak fisis.** Permukaan Venus ~465 °C; asam sulfat (H₂SO₄) di awan 48–70 km menguap sebelum mencapai tanah. Jadi "Hujan Asam" di permukaan tidak mungkin, dan deskripsi "menggerogoti baju" harus diubah atau lokasinya dipindah ke awan. | `hazards.ts` `HAZARDS.acid`, `PROFILE.venus` |
| Fl2 | **S** | **Kecepatan jatuh hujan terlalu besar.** Hujan Bumi (`storm`) 30 m/s; kecepatan terminal tetesan hujan nyata sekitar 2–9 m/s. Hujan asam 22 m/s dan metana 14 m/s juga terlalu cepat. Kecepatan ini hanya memengaruhi visual, tetapi tampak salah bagi pemain yang paham. | `hazards.ts` field `fall` |
| Fl3 | **S** | **Angin di atmosfer tipis tidak punya dasar fisis.** Mars: 24 m/s, dengan kerapatan ~0,02 kg/m³ dan tekanan dinamis q = ½ρv² ≈ 6 Pa. Angin itu hampir tidak mendorong apa pun di Mars, tetapi kode `engine.ts` memberi dorongan kecepatan kapal yang tidak diturunkan dari gaya hambat. |  `engine.ts` `stepHazards()` |
| Fl4 | **S** | **Tidak ada drag aerodinamis.** Tidak ada gaya hambat `F = ½ρCdAv²` pada kapal. Kecepatan hanya dibatasi oleh `env.limit`. |  `grep drag` kosong |
| Fl5 | **S** | **Pemanasan kapal memakai `heat = v·ρ / 900`.** Pemanasan aerodinamis nyata sebanding dengan √ρ·v³ (Sutton–Graves). Perbedaannya besar: menggandakan kecepatan seharusnya menaikkan panas delapan kali, bukan dua kali. | `engine.ts` `worldUpdate()` |
| Fl6 | **S** | **Ketebalan atmosfer dari skala tinggi `h × 6,5`** cukup masuk akal untuk Bumi (8,45 km; nyata skala tinggi 8,5 km) dan Venus (14,3 km; nyata 15,9 km). Mars memakai h = 1000 m, sehingga tebal 6,5 km (nyata skala tinggi 11 km). Konstanta ini tidak diturunkan dari suhu dan massa molar. | `body.ts` `atmThickness`, `bodies.ts` `atm.h` |
| Fl7 | **S** | **Semburan surya berlaku sama di semua benda.** Bumi dan Jupiter menerima semburan yang sama dan pada waktu yang sama. Dalam kenyataan magnetosfer Jupiter dan Bumi sangat berbeda, dan Venus/Mars tidak punya magnetosfer kuat. Kecepatan CME ke planet juga berbeda per jarak. | `hazards.ts` `HazardSystem.flare` |
| Fl8 | **R** | **Badai debu Mars memakai kabut yang cukup pekat** (`fogMul 45`). Ini artistik dan wajar selama dinyatakan sebagai gameplay, bukan simulasi fisik. |  `hazards.ts` |
| Fl9 | **R** | **Letusan Io dan Enceladus tidak punya atmosfer, tetapi bahayanya tetap memberi kerusakan baju.** Abu tidak bisa "tertiup angin" tanpa atmosfer. Di kode, partikel ditampilkan hanya bila `density > 0,02`, sehingga efek visual tidak muncul, sementara kerusakan baju tetap berlaku. Ini inkonsisten. | `hazards.ts` `WeatherFX.update()`, `engine.ts` `stepHazards()` |
| Fl10 | **R** | **Gelombang laut, arus, dan kapilaritas tidak disimulasikan.** Bagian "air" hanya warna dan batas, tidak ada fluida. Cukup untuk visual, tetapi jangan dinyatakan sebagai samudra hidup. |  `body.ts` `colorize()` |
| Fl11 | **R** | **Kilat dan hujan meteor dibangkitkan sebagai efek acak** (`Math.random`), tidak terkait kondisi atmosfer. Meteor bergerak 330 m/s, sedangkan meteor nyata 11–72 km/s di ketinggian. Aman sebagai stilisasi tetapi tidak akurat. | `hazards.ts` `WeatherFX` |

---

## 3. Kimia

| # | Tingkat | Temuan |
|---|---|---|
| C1 | **R** | Komposisi atmosfer di UI umumnya benar: Bumi N₂ 78%, O₂ 21%; Venus CO₂ pekat dengan awan H₂SO₄; Mars CO₂ tipis; Titan N₂ dan metana; Io SO₂; Enceladus uap air. |
| C2 | **S** | **Venus "awan asam sulfat"** benar, tetapi hazard "Hujan Asam" di permukaan bertentangan (lihat Fl1). |
| C3 | **S** | **Titan "Hujan Metana"** masuk akal (metana cair pada −179 °C). Tetapi "Danau metana cair" dan "bukit pasir hidrokarbon" di deskripsi tidak dimodelkan; hanya visual. |
| C4 | **R** | **Sampel "belerang" di Io dan "es" di Europa** sesuai. **Regolit Bulan** masuk akal. Hasil analisis Lab hanya kredit, tanpa data kimia. |
| C5 | **R** | **"Pemindaian" di peta** menampilkan kehidupan dan bahaya. Tidak ada komposisi kimia yang ditampilkan, sehingga tidak bisa dinilai salah atau benar. |
| C6 | **S** | **Gas di Jupiter/Saturnus "H₂ & He"** benar. **Uranus "metana"** benar (memberi warna biru). |

---

## 4. Biologi

| # | Tingkat | Temuan | Bukti |
|---|---|---|---|
| B1 | **S** | **Kehidupan dihubungkan ke kondisi yang terlalu longgar.** `habitable = hasAtm && (hasSea || a < 0,55)`. Artinya dunia beratmosfer tanpa laut tetap bisa punya biosfer dengan peluang 45%. Dalam sains, air cair adalah syarat kunci; suhu dan jarak dari bintang tidak dipakai sama sekali. | `hazards.ts` `lifeOf()` |
| B2 | **S** | **Suhu dunia generatif tidak dihitung dari jarak dan albedo.** Suhu dihitung dari garis lintang dan elevasi. Dunia generatif tidak punya posisi tata surya nyata, jadi kelayakan hidupnya tidak terkait dengan Matahari. | `life.ts` `gen()`: `temp = 1 − lat·1.18 − e·0.55 + tn·0.18` |
| B3 | **S** | **Hewan berkeliaran tanpa mengecek air atau lereng.** Rusa dan makhluk berjalan melingkar dengan radius 5–20 m dari titik jangkar. Titik jangkar dipastikan bukan air, tetapi jalurnya bisa masuk laut atau tebing. | `life.ts` `gen()`, `update()` |
| B4 | **R** | **Burung terbang berputar dalam lingkaran 25–65 m pada ketinggian 14–38 m dengan kecepatan 7–11 m/s.** Gerakan ini tidak mengikuti aerodinamika. Burung nyata tidak berputar dalam lingkaran kecil dengan ketinggian tetap, dan gulingnya tidak terkait dengan gaya sentripetal. | `life.ts` `update()` |
| B5 | **R** | **Kepadatan flora alien memakai `sin(a·800)·cos(b·700)`.** Ini pola deterministik berbentuk kisi, bukan ekologi. Tidak masalah secara fisis, tetapi tampak artifisial. | `life.ts` `gen()` |
| B6 | **R** | **Nama spesies lokal:** "Kijang Nusantara" (rusa Jawa, *Rusa timorensis*, sesuai), "Burung Camar" (sesuai), "Pohon Jati" (*Tectona grandis*, tropis: sesuai), "Pinus Gunung" (konifer dingin: sesuai). Fauna "Makhluk Berkaki Enam" dan "Ulat Cahaya" adalah fiksi wajar. |
| B7 | **R** | **Keluaran flora Bumi tidak memperhitungkan curah hujan dan tanah secara terpisah.** `dens` memakai `s.m` (kelembapan) dan `temp`, cukup untuk visual. |

---

## 5. Matematika dan implementasi

| # | Tingkat | Temuan | Bukti |
|---|---|---|---|
| M1 | **S** | **Sudut yang dipakai untuk spin tidak sesuai rotasi nyata (sudah di F5).** | `body.ts` `orbit()` |
| M2 | **R** | **Model orbit kinematik:** `phase + (speed/dist)·t` menghasilkan lingkaran sempurna. Orbit eliptik dan inklinasi bulan tidak dimodelkan dengan benar, walau `incl` ada. | `body.ts` `orbit()` |
| M3 | **R** | **Rumus burung memakai rotasi kecil di `makeRotationZ(0.4·sin)`.** Benar secara matematika, tidak ada masalah. |
| M4 | **OK** | **Dasar tangen dan arah di `life.ts`:** basis `(right, up, −fwd)` ortonormal; gerakan melingkar memiliki kecepatan linear `speed` karena ω = speed/ρ. Ini benar. |
| M5 | **OK** | **Envelope `envelope()` di hazards:** `min(t/ramp, (dur−t)/ramp)` dibatasi [0,1]. Benar. |
| M6 | **S** | **`forecast()` mengembalikan `in: 0` saat hazard aktif tapi `k` masih naik.** Tidak salah, tetapi `in` seharusnya ditampilkan sebagai "sisa waktu", bukan 0. |
| M7 | **R** | **Dua stasiun di daftar landmark:** "Stasiun Garuda" (lama, di `engine.ts` `init`) dan "Stasiun Kartika" (baru). Keduanya dihitung di peta dan misi; ini membingungkan. |
| M8 | **R** | **`suit` tidak pernah dikurangi di interior yang bertekanan, tetapi dikurangi oleh badai di EVA.** Ini benar secara logika, tetapi `rv.riding` membuat pengurangan 35%. Angka ini tidak punya dasar. |
| M9 | **OK** | **Pemeriksaan kemiringan basecamp** memakai `surfaceRadius` pada empat titik. Pendekatan wajar. |

---

## 6. Logika permainan dan konsistensi

| # | Tingkat | Temuan |
|---|---|---|
| L1 | **K** | **Panel info planet tidak sesuai dengan simulasi (lihat F2).** Pemain yang membaca "6.371 km" lalu mengukur di game akan mendapat 100 km. |
| L2 | **S** | **Deskripsi Venus "Planet terpanas" dan "dataran vulkanik"** benar, tetapi bahaya "hujan asam" bertentangan (lihat Fl1). |
| L3 | **S** | **Deskripsi stasiun "gravitasi buatan"** tidak diimplementasikan (lihat F11). |
| L4 | **S** | **Misi "Venus: Terbang di ketinggian < 8 km"** tidak berdasar secara fisis. Di Venus, tekanan permukaan 92 bar; terbang di 8 km pun tidak aman bagi kapal nyata, tetapi tidak ada tekanan di model. |
| L5 | **S** | **Misi Bulan "Kumpulkan 3 sampel regolit"** sesuai dengan tema, tetapi "Analisis di Lab" hanya memberi kredit. Sains di misi tidak terukur. |
| L6 | **R** | **Peta menampilkan `inc` (inklinasi) dan orbit, tetapi tidak menampilkan periode.** Pemain tidak punya cara memverifikasi konsistensi. |

---

## 7. Rekomendasi (urut prioritas)

1. **Hentikan klaim angka palsu di UI (F2, L1).** Ubah teks menjadi "radius (skala game)" atau tampilkan nilai nyata dengan label "nyata". Ini perbaikan paling murah.
2. **Perbaiki Venus (Fl1, C2, L2).** Pindahkan asam ke ketinggian awan atau ganti dengan "awan asam" yang tidak mencapai permukaan.
3. **Perbaiki kecepatan jatuh hujan (Fl2)** ke kisaran 2–9 m/s agar visual sesuai.
4. **Samakan stasiun dengan deskripsi (F11, L3).** Pilih satu: stasiun berputar untuk gravitasi buatan (ubah info), atau tetap mikrogravitasi (ubah lompatan dan berjalan di interior).
5. **Terapkan Kepler (F3)** dengan menurunkan `speed` dari `dist` dan massa pusat, sehingga periode orbit konsisten dengan jarak yang dipakai.
6. **Skala konsisten (F1, F4, F5)**: tentukan satu faktor skala untuk jarak dan radius, lalu turunkan periode dan spin darinya. Pilih faktor yang juga menjaga Bulan dan Bumi dalam perbandingan yang wajar.
7. **Gravitasi dari massa dan radius (F6, F9)**: `g = GM/R²` dengan `M` ditetapkan per benda, dan gravitasi di EVA memakai `1/r²`.
8. **Heat dan drag (Fl4, Fl5)**: pakai `q = ½ρv²` dan pemanasan `√ρ·v³` jika ingin sesuai teori. Tidak wajib untuk game, tetapi harus disebut sebagai pendekatan.
9. **Biologi (B1–B5)** ✔ terimplementasi: mensyaratkan air cair (sea) dan suhu hidup di kisaran 0–100 °C dari jarak Matahari, dan cek air atau lereng saat menentukan jalur hewan.
10. **Semburan surya (Fl7)**: buat intensitas tiap benda bergantung pada magnetosfer (Bumi dan Jupiter kuat, Venus dan Mars lemah).

Catatan: sebagian besar temuan adalah **pendekatan artistik yang disengaja**. Yang perlu diperbaiki adalah bagian yang **menyatakan angka nyata di UI** (F1–F2, L1), karena itu yang paling mudah dilihat dan paling cepat menurunkan kepercayaan pemain.
