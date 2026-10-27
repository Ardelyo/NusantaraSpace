# Catatan Masalah & Rencana Perbaikan

Sumber: uji di HP (build Vercel `nusantariksa.vercel.app`) dan screenshot. Belum diperbaiki.

## A. Fisika & tabrakan

| # | Gejala | Dugaan penyebab |
|---|--------|-----------------|
| A1 | Kapal & habitat bisa masuk ke dalam badan planet (terutama saat cepat atau dekat permukaan) | `stepShip` hanya koreksi posisi per frame; tidak ada sweep/continuous collision. Badan habitat tidak punya collider terhadap terrain |
| A2 | Saat EVA di permukaan, basecamp/kapal terlihat tenggelam ke tanah (kaki mendarat masuk rumput) | `fondasi` basecamp & offset kaki (`GEAR_H`) tidak disesuaikan dengan `surfaceRadius` di titik pijak |
| A3 | Tidak ada fisika gravitasi di habitat/stasiun: barang & pemain melayang aneh, lompat tidak jatuh balik secara benar di stasiun | Stasiun adalah gravitasi nol; `jumpY` diatur manual, tidak ada gaya di interior stasiun |
| A4 | Saat dekat planet, stasiun/kapal tidak ikut berputar atau mengorbit | Stasiun Kartika ditempatkan di `bumi.pos + stOffset` dengan quat tetap (`updatePose`); tidak ada orbit maupun rotasi sendiri. Basecamp sudah ikut spin planet, tapi stasiun tidak |
| A5 | Rover/kapal sesekali tembus gunung kecil | Rover hanya menempel ke `surfaceRadius` tanpa cek tabrakan dinding |

## B. Interior & geometri

| # | Gejala | Dugaan penyebab |
|---|--------|-----------------|
| B1 | Pintu interior terlihat sebagai pilar oranye dan palang merah, bukan pintu | `box` pintu di `buildInterior` hanya membuat frame; tidak ada daun pintu dan pilar `accM` menembus lantai/langit-langit |
| B2 | Tempat tidur (bunk) melayang & menembus dinding, bentuknya tidak masuk akal | Posisi `bunk` di `hab` ditulis manual dengan offset y yang tidak sinkron dengan rak loker dan pipa |
| B3 | Panel kokpit dan blok warna menumpuk di atas dasbor | Blok lampu/tombol pada kokpit lama (`shipModel.ts`) dan panel baru tumpang tindih (koordinat `y` dan `z` tidak dicek) |
| B4 | Interior stasiun & basecamp terlihat tidak rapi (kotak penuh, dinding menembus) | Modul di `modules.ts` belum diatur ulang berdasarkan dinding/port; banyak `box` dengan ukuran tebal menembus |
| B5 | Dermaga/pipa teleskopik menembus badan kapal saat sandar | `DOCK_GAP` & `dockPose` belum diuji pada semua sudut |

## C. HUD & layout mobile

| # | Gejala | Dugaan penyebab |
|---|--------|-----------------|
| C1 | Banner cuaca menimpa kartu misi dan toast | Posisi `top-[88px]` untuk toast dan banner tidak mempertimbangkan kartu misi di kiri atas |
| C2 | Tombol kanan atas (🗺 📋 🔊 ? 🏗) terpotong di sisi kanan layar | Lebar bar atas tidak responsif; tombol 🏗 dan ◈ kredit keluar layar di layar sempit |
| C3 | Hint kontrol PC di bawah menumpuk di layar kecil | Hanya untuk `pc`, tapi kadang muncul di HP (cek `matchMedia`) |
| C4 | Kartu misi tertutup warning | Warning `top-[88px]` & misi di `top` yang sama |

## D. Gameplay & kejelasan

- D1: Peringatan "Semburan Surya — mendekat ✔ aman" dan toast "Semburan Surya! Berlindung..." muncul bersamaan dan menumpuk. Gabungkan jadi satu.
- D2: Pemain di dalam kapal saat badai tetap aman, tapi tidak ada indikator yang jelas bahwa badai hanya memengaruhi area luar.
- D3: Dunia Bumi di tes tidak menampilkan pohon/fauna dari sudut yang diuji; perlu verifikasi.

## Rencana (urutan prioritas)

1. **Layout HUD mobile (C1–C4):** pindah banner cuaca & toast ke bawah kartu misi, buat bar kanan atas responsif (wrap atau kurangi tombol). Verifikasi di viewport 390×844.
2. **Interior (B1–B3):** buat pintu sebagai panel (buka/tutup) di setiap port, rapikan bunk & rak (hitung ulang offset dari tinggi lantai), pindahkan/bersihkan blok panel kokpit yang menumpuk. Tambahkan screenshot check tiap modul.
3. **Tabrakan terrain (A1, A2, A5):** sweep sederhana pada posisi kapal antar frame, dan set tinggi kaki & fondasi basecamp dari `surfaceRadius` titik pijak.
4. **Gravitasi & orbit stasiun (A3, A4):** stasiun mengorbit Bumi dengan fase yang sama seperti benda orbit lain (pakai `orbit` seperti Body), dan rotasi stasiun dikunci relatif ke planet terdekat saat dekat. Gravitasi buatan di interior stasiun: lompat jatuh balik dengan `g` tetap.
5. **Dermaga (B5):** verifikasi sandar di sudut berbeda; pastikan pipa tidak menembus.
6. **Gameplay polish (D1–D3):** gabungkan peringatan, tambah indikator "di dalam aman".

Setiap langkah: build, tes headless dengan screenshot, lalu commit kecil. Setelah rencana disetujui, saya mulai dari langkah 1.
