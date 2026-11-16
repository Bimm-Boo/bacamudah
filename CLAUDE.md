# BacaMudah — Product Requirements Document (PRD)

> Website alat bantu baca berbasis AI untuk penyandang disleksia dan pembaca yang kesulitan memahami teks padat.
> Dibuat untuk lomba **IT RUSH 2026** (HIMATIF UNIB), subtema **5: Pendidikan, Tata Kelola, dan Teknologi Inklusif**.

| Info | Detail |
|---|---|
| Tim | 2 orang (mahasiswa S1) |
| Batas pengumpulan | **Jumat, 20 November 2026, 23.59 WIB** (target kirim sebelum sore) |
| Website harus aktif sampai | 30 November 2026 (pengumuman pemenang) |
| Status dokumen | v1.0 — 16 November 2026 |

---

## 1. Ringkasan

BacaMudah membantu siswa dan mahasiswa yang kesulitan membaca (terutama penyandang disleksia) memahami materi belajar. Pengguna menempelkan teks atau mengunggah PDF, lalu AI mengubahnya menjadi versi yang lebih mudah dipahami: bahasa sederhana, poin-poin ringkas, analogi sehari-hari, atau daftar istilah sulit. Hasilnya ditampilkan dengan pengaturan baca ramah disleksia, bisa dibacakan dengan suara, dan dilengkapi kuis singkat untuk mengecek pemahaman.

## 2. Latar Belakang dan Masalah

- Materi pelajaran dan kuliah sering ditulis dengan kalimat panjang, istilah teknis, dan paragraf padat.
- Penyandang disleksia kesulitan mengenali kata dan mudah kehilangan baris saat membaca. Tampilan teks standar (huruf rapat, latar putih terang) memperberat hal ini.
- Alat bantu yang ada biasanya berbahasa Inggris, berbayar, atau hanya menyelesaikan satu masalah (misalnya hanya text-to-speech).
- Akibatnya, siswa dengan kesulitan membaca tertinggal bukan karena kurang mampu, tetapi karena **akses terhadap materinya tidak setara**. Ini isu pendidikan inklusif.

## 3. Solusi dan Nilai Utama

Satu website gratis, berbahasa Indonesia, tanpa instalasi, yang menggabungkan tiga hal:

1. **Menyederhanakan isi** dengan AI (apa yang dibaca).
2. **Menyesuaikan tampilan** agar nyaman bagi disleksia (bagaimana dibaca).
3. **Mendukung pemahaman** lewat suara dan kuis (apakah sudah paham).

**Kalimat inti untuk proposal dan video:**
"BacaMudah membuat materi belajar apa pun lebih mudah dibaca, didengar, dan dipahami, terutama bagi penyandang disleksia."

## 4. Target Pengguna

| Persona | Kebutuhan |
|---|---|
| **Siswa SMP/SMA dengan disleksia atau kesulitan membaca** | Teks lebih pendek dan sederhana, tampilan nyaman, bisa didengar |
| **Mahasiswa** yang membaca jurnal atau modul padat | Ringkasan poin-poin dan penjelasan istilah |
| **Guru dan pendamping** (guru BK, guru inklusi, orang tua) | Menyiapkan versi materi yang lebih mudah untuk murid |

## 5. Tujuan dan Ukuran Keberhasilan

**Tujuan lomba:** karya lengkap, berfungsi stabil saat diuji juri, dan menonjol di aspek inklusivitas.

| Ukuran | Target |
|---|---|
| Waktu proses AI untuk teks ±1.000 kata | < 15 detik |
| PDF teks hingga 10 halaman | Berhasil diekstrak dan diproses |
| Tampilan di HP (lebar 360px) | Semua fitur bisa dipakai tanpa geser horizontal |
| Error yang tidak tertangani saat demo | 0 (semua error tampil sebagai pesan ramah) |
| Skor aksesibilitas Lighthouse | ≥ 90 |

## 6. Ruang Lingkup

### Termasuk (MVP)
- F1 Input materi (teks dan PDF)
- F2 Pengolahan AI dengan 4 mode
- F3 Pengaturan tampilan ramah disleksia
- F4 Baca nyaring (text-to-speech)
- F5 Kuis pemahaman dari AI
- F6 Salin dan unduh hasil
- Halaman Tentang (penjelasan proyek, cara pakai, penggunaan AI)

### Tidak termasuk (sengaja tidak dibuat)
- Login, akun, atau database pengguna (tidak perlu akun demo, lebih sederhana dan lebih aman)
- Penyimpanan materi di server
- OCR untuk PDF hasil scan (gambar)
- Aplikasi mobile native
- Bahasa selain Indonesia untuk antarmuka

## 7. Fitur dan Kriteria Penerimaan

### F1 — Input Materi
- Pengguna bisa **menempelkan teks** atau **mengunggah PDF**.
- Batas: teks maksimal **15.000 karakter**, PDF maksimal **5 MB**.
- Teks dari PDF ditampilkan di kolom input agar bisa dicek atau diedit sebelum diproses.
- Tersedia tombol **"Coba contoh materi"** yang mengisi teks contoh (untuk juri dan video demo).

**Kriteria penerimaan:**
- [ ] PDF berisi teks berhasil diekstrak dan muncul di kolom input.
- [ ] PDF hasil scan atau kosong menampilkan pesan: "Teks tidak terbaca dari PDF ini. Coba salin teksnya secara manual."
- [ ] Input melebihi batas menampilkan pesan jelas, bukan error server.

### F2 — Pengolahan AI (4 mode)

| Mode | Hasil yang diharapkan |
|---|---|
| **Teks Sederhana** | Kalimat pendek (maks. ±15 kata), kata sehari-hari, paragraf pendek, makna tidak berubah |
| **Poin-Poin** | 5-10 poin utama, masing-masing satu kalimat singkat |
| **Analogi** | Penjelasan konsep utama dengan perumpamaan dari kehidupan sehari-hari |
| **Istilah Sulit** | Daftar istilah dari teks beserta arti sederhananya |

- Semua output dalam **bahasa Indonesia**, tanpa menambah fakta yang tidak ada di teks asli.
- Tampilkan indikator loading saat menunggu AI.

**Kriteria penerimaan:**
- [ ] Keempat mode menghasilkan output sesuai format masing-masing.
- [ ] Jika API gagal atau kuota habis, tampil pesan ramah dan tombol "Coba lagi".
- [ ] Tombol Proses nonaktif saat input kosong atau sedang memproses.

### F3 — Tampilan Ramah Disleksia
Panel pengaturan yang memengaruhi area hasil (dan idealnya seluruh halaman):

- **Font:** OpenDyslexic / Lexend / sans-serif biasa
- **Ukuran huruf:** 16-28px
- **Jarak baris:** 1.5-2.5
- **Jarak antar huruf:** normal / renggang / sangat renggang
- **Warna latar:** krem, kuning pucat, biru muda, gelap lembut (hindari putih murni dan hitam murni)
- **Penggaris baca (fokus baris):** pita sorot yang mengikuti kursor atau sentuhan untuk membantu tidak kehilangan baris
- Pilihan disimpan di `localStorage` sehingga tetap ada saat halaman dibuka lagi.
- Tombol **"Atur ulang"** untuk kembali ke default.

**Kriteria penerimaan:**
- [ ] Setiap pengaturan langsung terlihat efeknya tanpa memuat ulang halaman.
- [ ] Pengaturan tetap tersimpan setelah refresh.
- [ ] Semua kombinasi warna memenuhi kontras minimal WCAG AA.

### F4 — Baca Nyaring (Text-to-Speech)
- Menggunakan **Web Speech API** di browser dengan suara bahasa Indonesia (`id-ID`), tanpa biaya API tambahan.
- Kontrol: putar, jeda, lanjut, berhenti, dan kecepatan (0.75x / 1x / 1.25x).
- **Sorot kalimat** yang sedang dibacakan (fitur unggulan untuk disleksia).

**Kriteria penerimaan:**
- [ ] Bekerja di Chrome desktop dan Android.
- [ ] Jika browser tidak mendukung, tombol disembunyikan dan muncul keterangan singkat.

### F5 — Kuis Pemahaman
- Tombol **"Buat Kuis"** meminta AI membuat **3-5 soal pilihan ganda** dari teks.
- AI mengembalikan **JSON terstruktur** (soal, pilihan, jawaban benar, penjelasan).
- Pengguna memilih jawaban, langsung mendapat umpan balik benar/salah beserta penjelasan, lalu skor akhir.

**Kriteria penerimaan:**
- [ ] JSON dari AI divalidasi di backend. Jika tidak valid, coba ulang sekali, lalu tampilkan pesan ramah.
- [ ] Kuis bisa dikerjakan dengan keyboard dan sentuhan.

### F6 — Salin dan Unduh
- Tombol **Salin** hasil ke clipboard.
- Tombol **Unduh .txt**.

## 8. Alur Pengguna

```
Beranda
  └─ Tempel teks / Upload PDF / "Coba contoh materi"
       └─ Pilih mode (Sederhana / Poin / Analogi / Istilah)
            └─ Klik "Proses" → loading → hasil tampil
                 ├─ Atur tampilan (font, ukuran, warna, penggaris baca)
                 ├─ Dengarkan (baca nyaring + sorot kalimat)
                 ├─ Salin / Unduh
                 └─ "Buat Kuis" → kerjakan → lihat skor
```

## 9. Halaman dan Antarmuka

1. **Beranda / Aplikasi** (satu halaman utama)
   - Header: logo, nama BacaMudah, tautan Tentang
   - Hero singkat: satu kalimat manfaat
   - Kartu input (tab Teks / PDF)
   - Pilihan mode (tombol besar dengan ikon dan label)
   - Area hasil + toolbar (pengaturan tampilan, baca nyaring, salin, unduh, buat kuis)
   - Area kuis
2. **Tentang**: masalah, solusi, cara pakai, teknologi, dan transparansi penggunaan AI.

**Prinsip desain:**
- Bersih, tenang, banyak ruang kosong. Tombol besar dengan label teks (bukan ikon saja).
- Mobile-first dan responsif.
- Warna utama lembut (misalnya biru-hijau tenang), latar krem muda.
- Bahasa antarmuka ramah dan singkat.

## 10. Arsitektur Teknis

| Lapisan | Teknologi |
|---|---|
| Backend | Python 3.11+, **Flask** |
| AI | **Gemini API** (library `google-genai`), model diatur lewat env `GEMINI_MODEL` (default: model Gemini Flash yang tersedia di tier gratis) |
| PDF | `pypdf` |
| Frontend | HTML (Jinja2), CSS, JavaScript vanilla (tanpa framework) |
| Font | OpenDyslexic dan Lexend, di-host sendiri di `static/fonts` (lisensi SIL OFL, dicantumkan di README) |
| TTS | Web Speech API (browser) |
| Server produksi | `gunicorn` |
| Deploy | **Render** (Web Service), cadangan: Railway / PythonAnywhere |
| Versi kode | Git + GitHub (repo **publik**) |

### Endpoint API

| Method | Path | Fungsi |
|---|---|---|
| GET | `/` | Halaman utama |
| GET | `/tentang` | Halaman Tentang |
| POST | `/api/extract-pdf` | Upload PDF → `{ "text": "..." }` |
| POST | `/api/process` | `{ "text", "mode" }` → `{ "result": "..." }` |
| POST | `/api/quiz` | `{ "text" }` → `{ "questions": [...] }` |
| GET | `/health` | Cek status server (untuk deploy) |

Semua error API mengembalikan JSON `{ "error": "pesan ramah" }` dengan status code yang sesuai.

### Struktur Folder

```
bacamudah/
├── app.py                # Flask app & routes
├── ai.py                 # Fungsi pemanggil Gemini + prompt tiap mode
├── prompts.py            # Template prompt (dipisah agar mudah diubah)
├── pdf_utils.py          # Ekstraksi teks PDF
├── templates/
│   ├── base.html
│   ├── index.html
│   └── tentang.html
├── static/
│   ├── css/style.css
│   ├── js/app.js         # Input, proses, hasil
│   ├── js/settings.js    # Pengaturan tampilan + localStorage
│   ├── js/tts.js         # Baca nyaring
│   ├── js/quiz.js        # Kuis
│   └── fonts/
├── sample/contoh.txt     # Materi contoh
├── requirements.txt
├── .env.example          # Contoh variabel (tanpa key asli)
├── .gitignore
├── CLAUDE.md             # Dokumen ini
└── README.md
```

### Variabel Lingkungan

```
GEMINI_API_KEY=...        # wajib, JANGAN di-commit
GEMINI_MODEL=...          # opsional
```

## 11. Desain Prompt AI

- **System instruction umum:** "Kamu adalah asisten baca untuk penyandang disleksia. Gunakan bahasa Indonesia yang sederhana. Jangan menambah informasi yang tidak ada di teks asli. Jangan gunakan markdown berlebihan."
- Setiap mode punya prompt sendiri di `prompts.py` dengan contoh format output.
- Mode kuis wajib mengembalikan JSON dengan skema:
  ```json
  {
    "questions": [
      {
        "question": "string",
        "options": ["A", "B", "C", "D"],
        "answer_index": 0,
        "explanation": "string"
      }
    ]
  }
  ```
- Teks dari pengguna dibungkus pembatas yang jelas, dan AI diinstruksikan untuk memperlakukannya sebagai materi, bukan perintah (mencegah prompt injection sederhana).

## 12. Kebutuhan Non-Fungsional

- **Aksesibilitas (wajib, ini inti tema):** HTML semantik, label pada semua input, navigasi keyboard penuh, fokus terlihat jelas, `aria-live` untuk hasil dan loading, kontras WCAG AA.
- **Performa:** halaman utama ringan (tanpa framework JS), font dan aset kecil.
- **Keamanan:** API key hanya di server, tidak pernah dikirim ke browser. Validasi tipe dan ukuran file. Batasi panjang input. Rate limit sederhana per IP (misalnya 20 permintaan per menit) agar kuota API aman saat dinilai juri.
- **Privasi:** materi pengguna tidak disimpan di server, hanya diproses lalu dibuang. Dijelaskan di halaman Tentang.
- **Keandalan:** website harus tetap aktif sampai 30 November 2026. Endpoint `/health` dipakai untuk memantau.

## 13. Aturan Kerja untuk Claude Code

1. **Pengguna adalah pemula.** Jelaskan setiap langkah dan setiap file dengan bahasa Indonesia yang sederhana. Berikan perintah terminal lengkap untuk macOS.
2. **Kerjakan per tahap** sesuai bagian 14. Jangan menambah fitur di luar PRD tanpa bertanya.
3. Setelah satu tahap selesai: jalankan aplikasi, pastikan tidak ada error, beri tahu pengguna cara mengetesnya, lalu **commit dengan pesan yang jelas** (bahasa Indonesia atau Inggris, konsisten).
4. **Jangan pernah** menghapus atau menulis ulang riwayat commit (aturan lomba). Tidak boleh `git push --force` atau `git rebase` pada branch utama.
5. **Jangan pernah** meng-commit `.env` atau API key.
6. Kode rapi dan konsisten: nama variabel jelas, fungsi kecil, komentar singkat di bagian penting, tanpa kode mati.
7. Utamakan solusi sederhana yang stabil daripada solusi canggih yang rapuh.
8. Jika ada perubahan besar atau ragu, tanya dulu ke pengguna.

## 14. Tahapan dan Jadwal

| Tahap | Isi | Target |
|---|---|---|
| 1 | Setup proyek, Flask, halaman utama, F1 (input teks & PDF), F2 (4 mode AI) | Senin, 16 Nov |
| 2 | F3 pengaturan tampilan ramah disleksia, desain responsif | Senin-Selasa |
| 3 | F4 baca nyaring + sorot kalimat, F6 salin/unduh | Selasa, 17 Nov |
| 4 | F5 kuis pemahaman | Selasa-Rabu |
| 5 | **Deploy pertama ke Render** (jangan ditunda) | Selasa, 17 Nov |
| 6 | Error handling, rate limit, aksesibilitas, halaman Tentang, uji di HP | Rabu, 18 Nov |
| 7 | README, proposal, surat pernyataan, video demo | Kamis, 19 Nov |
| 8 | Cadangan, cek ulang semua link, kirim Google Form | Jumat, 20 Nov (sebelum sore) |

## 15. Pemetaan ke Kriteria Penilaian

| Kriteria (bobot) | Cara BacaMudah memenuhinya |
|---|---|
| Fungsionalitas & kualitas teknis (25%) | Semua fitur berjalan stabil, error ditangani, deploy publik, `/health` |
| Inovasi & ketepatan solusi (20%) | Gabungan AI penyederhanaan + tampilan disleksia + suara bersorot + kuis dalam satu alat berbahasa Indonesia |
| Relevansi tema & dampak (15%) | Pendidikan inklusif: kesetaraan akses materi bagi pembaca dengan kesulitan membaca |
| UI/UX (15%) | Desain tenang, mobile-first, pengaturan baca yang bisa dipersonalisasi |
| Kualitas source code (15%) | Struktur folder jelas, kode modular, commit bertahap dan rapi |
| Dokumentasi (10%) | README lengkap, proposal sesuai template, video 3-5 menit |

## 16. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Kuota API gratis habis saat dinilai | Rate limit, batas panjang input, siapkan API key cadangan |
| Server Render gratis "tidur" sehingga akses pertama lambat | Sebutkan di proposal, tampilkan loading yang jelas, pertimbangkan pinger ke `/health` |
| Suara bahasa Indonesia tidak tersedia di beberapa browser | Deteksi dukungan, beri keterangan, sarankan Chrome |
| Output AI tidak sesuai format (terutama kuis) | Validasi JSON, coba ulang sekali, pesan ramah |
| Waktu sempit | Deploy lebih awal, kerjakan per tahap, fitur di luar MVP tidak dikerjakan |

## 17. Checklist Pengumpulan (dari Guidebook)

- [ ] Website live dan bisa diakses publik (aktif sampai 30 Nov 2026)
- [ ] Repository GitHub **publik**, riwayat commit utuh
- [ ] README mencantumkan: penggunaan **Claude Code** sebagai AI coding assistant, **Gemini API** sebagai fitur AI, serta library, font, dan aset open-source yang dipakai
- [ ] Video demo 3-5 menit (YouTube Unlisted): perkenalan, latar belakang & solusi, demo fitur
- [ ] Proposal PDF: `ITRUSH26_NamaTim_JudulKarya.pdf` (sesuai template panitia, mencantumkan penggunaan AI)
- [ ] Surat Pernyataan Orisinalitas dan AI (PDF)
- [ ] Semua link dicek dari browser lain atau mode incognito sebelum dikirim
