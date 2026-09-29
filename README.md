# Papan Tulis Digital

Riset internal: papan tulis digital untuk matematika SMA, meniru demo di `docs/linkedin-video-191kbps.mp4`.

- **Tulis rumus → grafik.** Mendukung fungsi eksplisit seperti `y = x² − 3`, kurva implisit seperti `x² + y² = 4`, serta persamaan polar seperti `r = 1 + 0.4 cos(5 theta)`. Huruf parameter otomatis menjadi slider. Titik penting fungsi eksplisit bisa ditampilkan.
- **Sketsa → bangun ruang 3D.** Gambar kubus/balok/limas, laso, pilih **Jadikan bangun ruang**. Bangun bisa diputar, rusuk tersembunyi putus-putus, titik diberi label gaya buku (ABCD.EFGH).
- **Irisan bidang.** Mode **Titik irisan**: ketuk 3 titik pada rusuk (menempel ke ujung/tengah/sepertiga rusuk). Irisan muncul di bangun dan sebagai bangun datar sebenarnya lengkap dengan sudut, panjang sisi, luas, keliling, dan nama bangunnya.
- **Bangun ruang lengkung: kerucut, tabung, bola.** Bisa diputar seperti bangun lainnya.
- **Volume dan luas permukaan** untuk semua bangun, langsung tampil dan berubah saat ukuran diubah.
- **Slider ukuran** (rusuk, jari-jari, tinggi, panjang/lebar) untuk mengubah bangun secara langsung.
- **Irisan bidang untuk bangun lengkung.** Bola → lingkaran. Tabung → lingkaran, persegi panjang, atau elips (miring). Kerucut → seluruh irisan kerucut: lingkaran, elips, parabola, hiperbola, dan segitiga (lewat puncak). Widget irisan menampilkan bentuk sebenarnya lengkap dengan luas, keliling, dan jari-jari/sumbu.
- **Jaring-jaring (net)** dengan slider untuk membentangkan sisi bangun polihedron dari 3D ke 2D.
- **Bola dalam / bola luar** untuk kubus (dan bola luar untuk balok).
- **Asisten AI** (OpenAI) yang membaca isi papan, menjelaskan, dan langsung mengubah grafik, termasuk kurva tertutup/implisit.
- **Memory dan riwayat chat per pengguna.** Percakapan disimpan lokal tanpa database di `apps/backend/chat_history.json`, bisa dibuka kembali, dilanjutkan, atau dihapus dari panel Asisten AI.
- **Dua bahasa** (Indonesia/Inggris) lewat tombol ID | EN.
- **Login dan RBAC.** Pengguna mendaftar terlebih dahulu dan baru bisa masuk setelah disetujui superadmin. Akun disimpan lokal tanpa database di `apps/backend/auth_config.json` dengan kata sandi ter-hash PBKDF2.
- **Perintah suara** (tombol 🎤 atau tombol `M`, Chrome/Edge). Hemat token: hanya pertanyaan bebas yang dikirim ke OpenAI.
  - Dikte rumus, diproses lokal: "y sama dengan x kuadrat kurang tiga", "y sama dengan a sin x tambah b", "y equals x squared minus 3".
  - Perintah, diproses lokal: "urungkan", "ulangi", "hapus papan", "buat kubus/balok/limas/prisma", "bola dalam", "bola luar", "hilangkan bola", "hapus titik", "putar ke kiri/kanan/atas/bawah", "tampilkan titik penting", "perbesar", "perkecil", "pena", "penghapus", "laso", "diam".
  - Pertanyaan ("jelaskan grafik ini") → asisten AI, dan jawabannya dibacakan (tombol 🔊 di tiap jawaban). Rumus dibacakan sebagai kata ("x kuadrat kurang 3").
  - Pengenal suara memakai Web Speech API bawaan browser (gratis, tapi butuh internet; di Chrome audio diproses server Google). Mikrofon hanya diizinkan di `localhost` atau HTTPS.

## Menjalankan

```bash
./scripts/start.sh          # build frontend, lalu backend di http://0.0.0.0:8770
RESTART=1 ./scripts/start.sh # hentikan instance proyek yang aktif, build, lalu jalankan ulang
PORT=8771 ./scripts/start.sh # gunakan port lain
```

Login awal superadmin:

```text
username: superadmin
password: chelsacantik
```

Pengguna biasa memilih **Daftar** pada halaman masuk. Setelah itu superadmin dapat membuka tombol perisai di kanan atas dan menyetujui akun tersebut. Token sesi tersimpan di browser dan akan berakhir saat backend dijalankan ulang.

Saat ini berjalan di tmux: sesi `riset-chelsa`, window `papan-tulis-digital`
(`tmux attach -t riset-chelsa`). Untuk restart: `Ctrl+C` di window itu lalu `./scripts/start.sh`.

Mode pengembangan frontend (hot reload, proxy `/api` ke port 8770): `cd apps/frontend && npm run dev` → http://localhost:5190

## Konfigurasi (`apps/backend/.env`, salin dari `apps/backend/.env.example`)

| Variabel | Default | Keterangan |
|---|---|---|
| `OPENAI_API_KEY` | — | Wajib untuk asisten AI. Buat dari dashboard OpenAI API |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Model OpenAI untuk Responses API |
| `RECOGNIZER_MODEL` | `texteller` | `texteller` (lebih akurat, ±1 dtk) atau `pix2text` (±0,2 dtk) |
| `RECOGNIZER_THREADS` | `16` | Thread CPU untuk ONNX Runtime |
| `AUTH_CONFIG_PATH` | `apps/backend/auth_config.json` | Lokasi alternatif file akun dan role |
| `CHAT_HISTORY_PATH` | `apps/backend/chat_history.json` | Lokasi alternatif file memory dan riwayat sesi AI |

Catatan: state papan dikirim ke OpenAI ketika guru memakai asisten AI. Request memakai `store: false`; tetap jangan kirim data pribadi siswa.

## Arsitektur

```
apps/
  frontend/ (React + Vite + TypeScript)
    src/ink/          kanvas tinta (perfect-freehand), laso, penghapus, pemisah baris rumus
    src/math/         parser LaTeX → fungsi (toleran terhadap keluaran model), titik penting
    src/geometry/     bangun ruang, irisan bidang, pengenal sketsa (aturan geometri)
    src/widgets/      widget grafik, bangun ruang (Three.js), irisan
    src/voice/        pengenal suara (Web Speech API), penafsir perintah/dikte rumus, pembaca jawaban
    src/i18n.tsx      kamus ID/EN
  backend/ (FastAPI, uv, Python 3.12)
    auth_config.json   penyimpanan akun, role, hash kata sandi, dan status persetujuan
    chat_history.json  memory dan riwayat sesi AI per pengguna (dibuat otomatis, tidak di-commit)
    app/auth.py        autentikasi file-based, sesi, dan RBAC
    app/chat_store.py  penyimpanan sesi chat file-based
    app/recognizer.py pengenal rumus ONNX (encoder–decoder, greedy decoding, CPU)
    app/ai.py         proxy OpenAI Responses API dengan Structured Outputs (hingga 40 pesan terakhir)
models/             model yang diunduh (tidak di-commit)
  pix2text-mfr-1.5/ MIT
  texteller/        Apache-2.0
  TAMER/            checkpoint riset (belum dipakai; data latih CROHME/HME100K berlisensi non-komersial)
```

Alur pengenalan: goresan terpilih → dipisah per baris → dirender hitam-di-atas-putih (PNG) → `/api/recognize` → LaTeX → dialog konfirmasi (bisa dikoreksi) → grafik.

Pengenalan rumus berjalan lokal di CPU (tanpa GPU, tanpa internet). Hanya asisten AI yang membutuhkan internet.
