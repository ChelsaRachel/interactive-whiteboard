# Papan Tulis Digital

Riset internal: papan tulis digital untuk matematika SMA, meniru demo di `docs/linkedin-video-191kbps.mp4`.

- **Tulis rumus → grafik.** Tulis `y = x² − 3` atau `y = A sin x + B` dengan pena/mouse, lingkari dengan alat laso, pilih **Jadikan grafik**. Huruf selain `x` otomatis menjadi slider. Titik penting (titik potong sumbu, titik puncak) bisa ditampilkan.
- **Sketsa → bangun ruang 3D.** Gambar kubus/balok/limas, laso, pilih **Jadikan bangun ruang**. Bangun bisa diputar, rusuk tersembunyi putus-putus, titik diberi label gaya buku (ABCD.EFGH).
- **Irisan bidang.** Mode **Titik irisan**: ketuk 3 titik pada rusuk (menempel ke ujung/tengah/sepertiga rusuk). Irisan muncul di bangun dan sebagai bangun datar sebenarnya lengkap dengan sudut, panjang sisi, luas, keliling, dan nama bangunnya.
- **Bola dalam / bola luar** untuk kubus (dan bola luar untuk balok).
- **Asisten AI** (Gemini) yang membaca isi papan, menjelaskan, dan bisa mengubah grafik ("buat parabolanya lebih lebar").
- **Dua bahasa** (Indonesia/Inggris) lewat tombol ID | EN.
- **Perintah suara** (tombol 🎤 atau tombol `M`, Chrome/Edge). Hemat token: hanya pertanyaan bebas yang dikirim ke Gemini.
  - Dikte rumus, diproses lokal: "y sama dengan x kuadrat kurang tiga", "y sama dengan a sin x tambah b", "y equals x squared minus 3".
  - Perintah, diproses lokal: "urungkan", "ulangi", "hapus papan", "buat kubus/balok/limas/prisma", "bola dalam", "bola luar", "hilangkan bola", "hapus titik", "putar ke kiri/kanan/atas/bawah", "tampilkan titik penting", "perbesar", "perkecil", "pena", "penghapus", "laso", "diam".
  - Pertanyaan ("jelaskan grafik ini") → asisten AI, dan jawabannya dibacakan (tombol 🔊 di tiap jawaban). Rumus dibacakan sebagai kata ("x kuadrat kurang 3").
  - Pengenal suara memakai Web Speech API bawaan browser (gratis, tapi butuh internet; di Chrome audio diproses server Google). Mikrofon hanya diizinkan di `localhost` atau HTTPS.

## Menjalankan

```bash
./scripts/start.sh          # build frontend, lalu backend di http://0.0.0.0:8770
```

Saat ini berjalan di tmux: sesi `riset-chelsa`, window `papan-tulis-digital`
(`tmux attach -t riset-chelsa`). Untuk restart: `Ctrl+C` di window itu lalu `./scripts/start.sh`.

Mode pengembangan frontend (hot reload, proxy `/api` ke port 8770): `cd frontend && npm run dev` → http://localhost:5190

## Konfigurasi (`backend/.env`, salin dari `backend/.env.example`)

| Variabel | Default | Keterangan |
|---|---|---|
| `GEMINI_API_KEY` | — | Wajib untuk asisten AI. Gratis dari https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Model Gemini |
| `RECOGNIZER_MODEL` | `texteller` | `texteller` (lebih akurat, ±1 dtk) atau `pix2text` (±0,2 dtk) |
| `RECOGNIZER_THREADS` | `16` | Thread CPU untuk ONNX Runtime |

Catatan: tier gratis Gemini boleh dipakai Google untuk pengembangan produknya — jangan kirim data pribadi siswa.

## Arsitektur

```
frontend/ (React + Vite + TypeScript)
  src/ink/          kanvas tinta (perfect-freehand), laso, penghapus, pemisah baris rumus
  src/math/         parser LaTeX → fungsi (toleran terhadap keluaran model), titik penting
  src/geometry/     bangun ruang, irisan bidang, pengenal sketsa (aturan geometri)
  src/widgets/      widget grafik, bangun ruang (Three.js), irisan
  src/voice/        pengenal suara (Web Speech API), penafsir perintah/dikte rumus, pembaca jawaban
  src/i18n.tsx      kamus ID/EN
backend/ (FastAPI, uv, Python 3.12)
  app/recognizer.py pengenal rumus ONNX (encoder–decoder, greedy decoding, CPU)
  app/ai.py         proxy Gemini generateContent dengan keluaran JSON terstruktur (4 pesan terakhir saja)
models/             model yang diunduh (tidak di-commit)
  pix2text-mfr-1.5/ MIT
  texteller/        Apache-2.0
  TAMER/            checkpoint riset (belum dipakai; data latih CROHME/HME100K berlisensi non-komersial)
```

Alur pengenalan: goresan terpilih → dipisah per baris → dirender hitam-di-atas-putih (PNG) → `/api/recognize` → LaTeX → dialog konfirmasi (bisa dikoreksi) → grafik.

Pengenalan rumus berjalan lokal di CPU (tanpa GPU, tanpa internet). Hanya asisten AI yang membutuhkan internet.
