# Spesifikasi Fisika: Orbit, Matahari, Gravitasi, dan Benturan

Dokumen ini adalah dasar untuk mengganti model kinematik saat ini dengan fisika yang konsisten. Setiap angka di sini sudah dihitung dari rumus dasar, dan sumbernya dicantumkan. Angka yang bergantung pada sumber yang belum diverifikasi ditandai.

---

## 1. Prinsip umum

1. **Satuan SI di simulasi** (meter, kilogram, detik). Skala tampilan dipisah dari simulasi lewat *floating origin*, yang sudah ada di `engine.ts` (`origin`).
2. **Gravitasi Newton** `a = −GM·r̂ / r²` dengan `G = 6,674×10⁻¹¹ m³ kg⁻¹ s⁻²`.
3. **Massa, radius, dan periode tiap benda diturunkan dari data nyata**, bukan dari angka yang dipilih supaya tampak bagus. Ini mengatasi temuan F1–F6 di `docs/EVALUASI.md`.
4. **Integrasi numerik** dengan langkah kecil (atau integrator simplektik seperti leapfrog) agar energi orbit tidak drift.

---

## 2. Orbit

### 2.1 Kecepatan orbit dan energi
Dari energi konservatif, kecepatan pada jarak `r` dengan sumbu semi-mayor `a` (vis-viva):

```
v² = GM · (2/r − 1/a)
```

- Orbit lingkaran: `r = a` → `v = √(GM/r)`.
- Kecepatan lepas: `v_esc = √(2GM/r)`.

Sumber: [physics.it.com — vis-viva](https://physics.it.com/dictionary/vis-viva), [satnow — vis-viva equation](https://satnow.com/calculators/vis-viva-equation). Catatan: satu halaman (pantherdb) memberi rumus dengan tanda yang salah; jangan dipakai.

### 2.2 Angka hasil perhitungan

| Kasus | Nilai | Keterangan |
|---|---|---|
| LEO 400 km (Bumi) | v = 7,67 km/s, periode 92,4 menit | rumus lingkaran |
| Lepas Bumi (permukaan) | 11,19 km/s | |
| Bulan (384.400 km) | v = 1,02 km/s, periode 27,45 hari | sesuai data nyata |
| Bumi mengorbit Matahari (1 AU) | v = 29,8 km/s | |
| Lepas Matahari dari 1 AU | 42,1 km/s | |
| Mengorbit di 0,13 AU | v = 82,6 km/s | |

Angka periode Bulan 27,45 hari cocok dengan nilai nyata 27,3 hari, dan ini menunjukkan rumusnya benar.

### 2.3 Implikasi untuk game
- **Kapal tidak boleh diam di udara.** Tanpa mesin, kapal harus jatuh atau mengorbit. Kapal di LEO perlu kecepatan tangensial ≈ 7,7 km/s, bukan `throttle` yang diubah langsung.
- **Autopilot dan sandar** harus memakai Δv (perubahan kecepatan) dan transfer orbit (Hohmann), bukan lerp posisi. Untuk game, cukup mengizinkan Δv dari bahan bakar dengan batas, lalu integrasi gravitasi menentukan lintasannya.
- **Orbit Stasiun Kartika** harus mengikuti vis-viva: di 50 km di atas Bumi (radius 150 km di skala lama, tetapi harus nyata di sistem baru), kecepatannya tetap dihitung dari GM Bumi.

---

## 3. Matahari dan radiasi

### 3.1 Fluks radiasi (hukum kuadrat terbalik)
```
S(r) = S₁ · (1 AU / r)²,   S₁ ≈ 1361 W/m²
```
Sumber nilai: [naturalsciences.ch — solarkonstante](https://naturalsciences.ch/astronomy-explained/glossary/solarkonstante) (1361 W/m²). Catatan: pengukuran roket 1970-an memberi 1367–1376 W/m² dan NASA Earth fact sheet sering dikutip 1361–1368 W/m². Nilai ini tergantung siklus Matahari (sekitar 0,1%). Gunakan 1361 W/m² dan tandai sebagai pembulatan. Sumber lain: [NASA NTRS — 1979 review](https://ntrs.nasa.gov/citations/19790051039).

| Jarak | Fluks (W/m²) | Percepatan Matahari (m/s²) | Kecepatan orbit (km/s) | Suhu kesetimbangan hitam, A = 0,3 |
|---|---|---|---|---|
| 1 AU (Bumi) | 1.361 | 0,0059 | 29,8 | 255 K (−19 °C) |
| 0,39 AU (Merkurius) | 8.948 | 0,039 | 47,7 | — |
| 0,13 AU (Parker, perihelion 2020) | 80.533 | 0,35 | 82,6 | 706 K (433 °C) |
| 0,05 AU | 544.400 | 2,37 | 133 | — |

Suhu kesetimbangan dihitung dari `T = [S(1−A)/(4εσ)]^(1/4)`, dengan `σ = 5,67×10⁻⁸ W m⁻² K⁻⁴`. Ini model permukaan hitam tanpa konduksi dan tanpa pemanasan internal, jadi hanya perkiraan orde besar.

Konteks: Parker Solar Probe mencapai perihelion sekitar 0,13 AU (sekitar 27,8 jari-jari Matahari) pada 2020, dengan perihelion sebelumnya sekitar 0,17 AU. [arXiv 2101.03121 — Parker Solar Probe, energi aliran angin surya](https://arxiv.org/pdf/2101.03121) dan [arXiv 1902.09673 — Parker Solar Probe perihelion pertama](https://arxiv.org/pdf/1902.09673). Kedua sumber menyebut penurunan 1/r² untuk angin surya.

### 3.2 Gravitasi Matahari
- Pada 1 AU: `GM_Matahari = 1,327×10²⁰ m³/s²`. Ini gaya yang menahan Bumi.
- **Kapal di sekitar Matahari tidak boleh berhenti.** Jika kecepatannya nol di 0,13 AU, kapal jatuh ke Matahari dalam hitungan jam.
- **Batas aman dekat Matahari:** pada 0,13 AU sudah sekitar 706 K (433 °C) secara kesetimbangan hitam. Pelindung panas nyata menahan ini dengan sudut hadap dan bahan keramik. Untuk game, batas dapat dipasang di suhu permukaan kapal, bukan di jarak.
- **Pemanasan bagian pelindung** dihitung dari fluks dan absorptivitas: `Q_in = α·S(r)`. Bila suhu melewati `T_max` bahan, modul rusak.

### 3.3 Radiasi partikel
Angin surya dan semburan surya mengikuti 1/r² di kecepatan dan kerapatan. Dosis di luar magnetosfer Bumi lebih tinggi; magnetosfer Bumi dan Jupiter melindungi. Lihat Fl7 di `docs/EVALUASI.md`.

---

## 4. Atmosfer, drag, dan pemanasan

### 4.1 Model kerapatan
`ρ(h) ≈ ρ₀ · exp(−h/H)` untuk pendekatan. Tetapi untuk Bumi, eksponensial dengan `H = 8,5 km` meleset di ketinggian tinggi. Nilai tabel standar:

| Ketinggian | ρ (kg/m³) |
|---|---|
| 80 km | 1,85×10⁻⁵ |
| 100 km | 5,6×10⁻⁷ |
| 120 km | 2,2×10⁻⁸ |

Nilai tabel ini dari standar atmosfer US 1976 (dikenal luas), perlu verifikasi terhadap sumber resmi sebelum dipakai di produksi.

### 4.2 Tekanan dinamis dan drag
`q = ½ρv²`, gaya drag `F = ½ρ·C_d·A·v²`.
- Di 100 km dengan v = 7,5 km/s: `q ≈ 15,8 Pa`. Kapal masih merasakan drag kecil.
- Di 0 km dengan v = 300 m/s (Bumi): `q ≈ 55 kPa`. Di sinilah badai dan angin benar-benar menekan kapal.
- Di Mars dengan ρ ≈ 0,02 kg/m³ dan angin 24 m/s: `q ≈ 6 Pa`, jauh lebih kecil dari angin Bumi. Badai debu Mars **tidak** bisa mendorong kapal sekuat badai Bumi, dan ini harus tercermin di game (Fl3).

### 4.3 Pemanasan stagnasi (Sutton–Graves)
```
q̇ = k · √(ρ / R_n) · v³,   k ≈ 1,74×10⁻⁴ (SI)
```
Sumber: [NASA NTRS — Sutton & Graves 1971](https://ntrs.nasa.gov/citations/19720003329), [Wikipedia — Planar reentry equations](https://en.wikipedia.org/wiki/Planar_reentry_equations). Sumber lain memberi konstanta 1,74–1,83×10⁻⁴ dan kadang eksponen 3,05 untuk v. Akurasi sekitar 20%, cukup untuk desain awal.

Hasil:
| Ketinggian | v | R_n | q̇ (kW/m²) |
|---|---|---|---|
| 80 km | 7,0 km/s | 1 m | 257 |
| 80 km | 7,5 km/s | 1 m | 316 |
| 100 km | 7,5 km/s | 1 m | 55 |
| 120 km | 7,8 km/s | 1 m | 12 |

Menurut ini, pemanasan puncak terjadi sekitar 70–85 km, bukan di ketinggian tinggi. Ini cocok dengan pengalaman pesawat ulang-alik.

Implikasi game: pemanasan kapal = `k·√(ρ/R_n)·v³`, bukan `v·ρ/900` seperti sekarang (Fl5).

---

## 5. Benturan dan kerusakan

### 5.1 Energi benturan
```
E = ½ m v²   (v = kecepatan relatif)
```
| Objek | Massa | Kecepatan | Energi |
|---|---|---|---|
| Bola aluminium 1 mm | 0,001 g | 10 km/s | 0,1 kJ |
| Bola aluminium 10 mm | 1,4 g | 10 km/s | 70 kJ |
| Bola aluminium 10 mm | 1,4 g | 20 km/s | 283 kJ |
| Puing 598 g (uji NASA) | 0,598 kg | 6,9 km/s | 14,3 MJ |

Kecepatan debu rata-rata di LEO sekitar 10 km/s dan bisa mencapai 15 km/s; meteoroid rata-rata sekitar 20 km/s. Sumber: [NASA NTRS — pengujian perisai](https://ntrs.nasa.gov/api/citations/20140006462/downloads/20140006462.pdf) dan [paper 1993 Boslough et al.](https://www.unm.edu/~mbeb/Publications/Boslough%20et%20al.%20-%201993%20-%20Hypervelocity%20testing%20of%20advanced%20shielding%20concep.pdf).

### 5.2 Batas perisai pasif
Paper 1993 memperkirakan bahwa perisai pasif untuk stasiun besar melindungi dari partikel hingga beberapa sentimeter pada 10 km/s. Objek yang lebih besar harus dihindari dengan manuver. Perisai *bumper* (Whipple) memakai lembaran aluminium tipis 4–8 inci (10–20 cm) dari dinding terlindungi: lembaran itu pecah dan menyebarkan energi. Sumber: [US Patent 6.647.855](https://patents.google.com/patent/US6647855).

### 5.3 Model kerusakan yang diusulkan
Untuk setiap benturan:

1. Hitung `E` relatif terhadap kapal atau modul.
2. Tentukan `ketebalan_perisai` (kg/m² atau mm) dari modul.
3. Gunakan kategori:
   - **E < 1 kJ**: tidak ada efek, atau goresan kosmetik.
   - **1 kJ ≤ E < 100 kJ**: rusak panel atau jendela. Perisai menyerap bila tebal memadai.
   - **100 kJ ≤ E < 10 MJ**: lubang pada modul tanpa perisai, kebocoran udara (O₂ turun, daya turun).
   - **E ≥ 10 MJ**: modul hancur, interior terbuka ke vakum.
4. Untuk pemain di EVA: `E` yang melewati baju menyebabkan kerusakan baju; partikel dengan `E ≥ 1 kJ` menembus baju.

Angka ambang ini adalah **pendekatan desain game**, bukan standar. Tandai di UI sebagai pendekatan.

### 5.4 Benturan dengan planet
- Kecepatan mendarat yang aman untuk kaki pendarat: sekitar 2–5 m/s. Di atas itu, kapal rusak. Ini harus diturunkan dari energi dan kekuatan kaki, bukan dari `limit = alt·kf + 6`.
- **Benturan dengan terrain**: kapal dengan kecepatan normal `v_n` berhenti dalam jarak `d` dengan percepatan `a = v_n²/(2d)`. Jika `a` melampaui batas struktur, kapal rusak.
- **Tumbukan dengan benda lain**: gunakan momentum dan koefisien restitusi `e` (0 = tak lenting, 1 = lenting sempurna). Kapal dan basecamp memakai `e ≈ 0,1–0,3`.

### 5.5 Batas Roche
Benda yang mendekati planet tanpa struktur kuat akan terpecah. Batas Roche untuk benda kompak (rigid) dan fluida:
- rigid: `d ≈ 1,26·R·(ρ_M/ρ_m)^(1/3)`
- fluid: `d ≈ 2,44·R·(ρ_M/ρ_m)^(1/3)`

Sumber: [Wikipedia — Roche limit](https://en.wikipedia.org/wiki/Roche_limit). Sumber menyebut koefisien rigid 1,26 atau 1,44 dan fluid 2,44. Verifikasi dulu sebelum dipakai.

Untuk Bumi dengan benda kerapatan 1000 kg/m³ (es): Roche rigid ≈ 14.200 km dan fluid ≈ 27.500 km. Stasiun di 50 km di atas permukaan aman dari Roche. Stasiun di Bumi tidak perlu khawatir dengan batas ini; relevan untuk bulan kecil seperti Phobos atau Deimos.

---

## 6. Gravitasi di permukaan

`g = GM/R²`. Untuk Bumi nyata: `GM = 3,986×10¹⁴`, `R = 6.371 km`, `g = 9,81 m/s²`. Ini harus dipakai sebagai sumber, bukan angka `g` yang ditulis manual (F6).

Ketergantungan ketinggian: `g(h) = GM/(R+h)²`. Di 400 km, `g ≈ 8,68 m/s²`. Di EVA yang sekarang linier, harus diganti dengan rumus ini (F9).

---

## 7. Yang perlu dicek ulang dengan sumber

- Kalibrasi konstanta Sutton–Graves untuk kondisi kapal (tidak ada data uji).
- Koefisien Roche (1,26 vs 1,44 untuk rigid).
- Nilai atmosfer tabel 1976 dan skala tinggi tiap planet.
- Ambang kerusakan di bagian 5.3 (belum ada sumber, harus ditandai sebagai desain).

---

## 8. Rencana implementasi (usulan, belum dikerjakan)

1. Ganti satuan simulasi ke SI dengan floating origin yang ada. Ini mengatasi F1–F2.
2. Ganti `orbit()` dengan gravitasi dari massa dan jarak nyata. Turunkan `speed` dari vis-viva. Ini mengatasi F3–F5.
3. Gravitasi kapal dari semua benda: kapal jatuh, bisa lepas, bisa mengorbit. Ini mengatasi F7.
4. Model atmosfer dengan `ρ(h)` dan drag `½ρC_dAv²`. Hapus `limit = alt·kf + 6` (F8).
5. Pemanasan Sutton–Graves untuk kapal (Fl5).
6. Model benturan energi dan tabel ambang di 5.3. Tambahkan HP struktur kapal dan tiap modul.
7. Batas suhu kapal dekat Matahari (3.2).
8. Ganti `fall` dan `wind` cuaca dengan kecepatan terminal dan tekanan dinamis (Fl2, Fl3).

Langkah 1–3 mengubah inti simulasi dan harus diuji ulang secara menyeluruh. Langkah 4–8 bisa dikerjakan bertahap.

---

## 9. Sumber

- [physics.it.com — vis-viva](https://physics.it.com/dictionary/vis-viva)
- [satnow — vis-viva equation](https://satnow.com/calculators/vis-viva-equation)
- [NASA NTRS — pengujian perisai benturan (20140006462)](https://ntrs.nasa.gov/api/citations/20140006462/downloads/20140006462.pdf)
- [Boslough et al. 1993 — hypervelocity testing](https://www.unm.edu/~mbeb/Publications/Boslough%20et%20al.%20-%201993%20-%20Hypervelocity%20testing%20of%20advanced%20shielding%20concep.pdf)
- [US Patent 6.647.855 — hypervelocity shield](https://patents.google.com/patent/US6647855)
- [arXiv 2101.03121 — Parker Solar Probe, energi angin surya](https://arxiv.org/pdf/2101.03121)
- [arXiv 1902.09673 — Parker Solar Probe, perihelion pertama](https://arxiv.org/pdf/1902.09673)
- [naturalsciences.ch — solar constant 1361 W/m²](https://naturalsciences.ch/astronomy-explained/glossary/solarkonstante)
- [NASA NTRS — solar constant review 1979](https://ntrs.nasa.gov/citations/19790051039)
- [NASA NTRS — Sutton & Graves 1971](https://ntrs.nasa.gov/citations/19720003329)
- [Wikipedia — Planar reentry equations](https://en.wikipedia.org/wiki/Planar_reentry_equations)
- [Wikipedia — Roche limit](https://en.wikipedia.org/wiki/Roche_limit)

## Status implementasi (v2)

| Area | Status | Verifikasi |
|---|---|---|
| Orbit Kepler, SOI, gravitasi nyata (μ=gR²) | Selesai | `npm test` (42 pernyataan) + uji dalam-mesin: orbit lingkaran dengan warp ×500, Δr/r < 2·10⁻⁵ |
| Drag, tekanan dinamis, pemanasan Sutton–Graves, termal kabin | Selesai | `tests/physics.test.ts` |
| Kerusakan benturan berbasis energi (aman ≤ 5,8 m/s; 20 m/s ≈ 41%) | Selesai | uji jatuh ke Bulan: lambung 0,581 vs 0,593 teoretis |
| Pendaratan otomatis (profil kecepatan + umpan-maju) | Selesai | mendarat dari 5 km, lambung 100% |
| Sandar/lepas sandar dengan kecepatan relatif | Selesai | uji headless: sandar, tahan, lepas 3 m/s |
| Stasiun pada orbit Kepler, orientasi LVLH | Selesai | — |
| Kecepatan jatuh hujan (asam 7, badai 9, metana 3 m/s) | Selesai | — |
| Densitas Mars ρ₀ | 0,0155 kg/m³ (tekanan 610 Pa); angka 0,02 pada draf awal sudah diganti | — |

## Status implementasi (bencana, kerusakan, biologi)

| Butir | Status | Keterangan |
|---|---|---|
| Hujan asam Venus hanya di dek awan 45–70 km | Selesai | `HAZARDS.acid.alt`; `HazardSystem.allowed()`; bencana mereda 5× lebih cepat bila keluar rentang |
| Gaya angin dari kerapatan udara | Selesai | q = ½ρw²; astronot (CdA 1 m², 150 kg vs gesekan 0,6 g), panel/antena patah bila q melampaui kekuatan, drag kapal memakai kecepatan udara relatif angin |
| Kerusakan meteor pada modul | Selesai | `onMeteorImpact` → `DamageSystem.hitModule` (langsung ≤3 m, serpihan ≤55 m), kawah hangus, lontaran batu |
| Istirahat / lompat waktu | Selesai | `Engine.skipTime` — ¼ hari setempat; bencana & kebocoran tetap berjalan |
| Aturan biologi | Selesai | air cair + 273–373 K + >611 Pa; kelembapan/suhu/lereng; gerombol; hewan hindari air; bank burung dari gaya sentripetal |
| Kerusakan visual fisik | Selesai | penyok/lubang, bagian lepas jadi puing, api, asap, kebocoran, ledakan, retak kaca kokpit, sobek baju membocorkan oksigen |
| Suara bencana | Selesai | angin, siulan, desis pasir + ketukan butiran, hujan, gemuruh, guntur tertunda jarak/343, api berderak, alarm, desis bocor, ledakan, benturan logam |
