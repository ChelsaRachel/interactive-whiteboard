Ya. Dari videonya, ini tampaknya **video demonstrasi papan tulis digital/interaktif untuk pembelajaran matematika**.

Durasi videonya sekitar **42 detik**. Seorang presenter mendemokan layar sentuh besar: awalnya menulis fungsi seperti \(y=x^2-3\) dan fungsi sinus, lalu sistem menampilkan grafiknya secara otomatis. Setelah itu ia menggambar bentuk 3D seperti kubus, dan perangkat lunaknya mengubah atau memvisualisasikannya menjadi objek/geometri 3D yang bisa dimanipulasi.

Jadi kemungkinan besar ini adalah **demo teknologi edtech / smart classroom**, mungkin direkam di pameran atau booth produk. Fokus videonya bukan mengajar materi matematika secara penuh, melainkan menunjukkan kemampuan software/papan interaktif seperti:

* handwriting recognition,
* plotting grafik otomatis,
* menggambar dan memvisualisasikan geometri 3D,
* manipulasi objek langsung di layar sentuh.

Kalau kamu mau, saya juga bisa **analisis lebih jauh untuk mencari tahu produk/brand papan digital atau software apa yang sedang didemokan di video itu**.

===

apakah untuk membuat produk seperti itu memerlukan llm? apakah aku harus beli papan tulis digital atau tab? apakah bisa hanya dengan laptop dan mouse?

===

Tidak harus pakai LLM. Untuk produk seperti di video, **LLM justru bukan komponen utama**.

Bagian intinya biasanya lebih seperti ini:

* **Canvas/whiteboard** untuk menggambar dengan mouse, stylus, atau touch.
* **Handwriting / shape recognition** untuk mengenali tulisan seperti `y = x² - 3`, garis, lingkaran, kubus, dan sebagainya.
* **Math parser** untuk mengubah ekspresi menjadi bentuk yang bisa dihitung.
* **Graphing engine** untuk menggambar grafik.
* **Geometry engine** untuk objek 2D/3D dan transformasinya.

LLM baru berguna kalau kamu ingin fitur seperti: “gambar grafik fungsi kuadrat yang titik puncaknya di (2,3)”, “jelaskan kenapa grafik ini naik”, “ubah tulisan saya menjadi soal matematika”, atau tutor AI yang berdialog dengan pengguna.

Jadi arsitekturnya bisa dibayangkan seperti:

`input mouse/stylus → recognition → math/geometry engine → visualisasi`

dan opsional:

`LLM → memahami instruksi bahasa alami / menjelaskan hasil`

### Apakah harus beli papan tulis digital?

**Tidak. Untuk membuat MVP, laptop + mouse sudah cukup.**

Kamu bahkan bisa membuatnya sebagai aplikasi web. Pengguna klik-drag mouse untuk menulis atau menggambar di sebuah canvas.

Misalnya:

`Laptop + browser`
→ HTML Canvas / React
→ user menggambar dengan mouse
→ aplikasi mengenali bentuk/tulisan
→ menampilkan grafik / objek 3D.

Setelah produk sudah berjalan, baru dites dengan hardware lain:

| Hardware                       | Untuk development | Pengalaman pengguna          |
| ------------------------------ | ----------------- | ---------------------------- |
| Laptop + mouse                 | **Sangat cukup**  | Lumayan                      |
| Laptop + drawing tablet        | Sangat bagus      | Bagus                        |
| iPad / Android tablet + stylus | Bagus             | Sangat natural               |
| Interactive whiteboard         | Tidak diperlukan  | Cocok untuk kelas/presentasi |

Jadi saya **tidak akan membeli smartboard dulu**. Smartboard pada dasarnya hanya menjadi perangkat input/display besar. Software-mu seharusnya tetap bisa bekerja walaupun input-nya cuma mouse.

Kalau target akhirnya seperti video, kamu bisa mulai dari versi sangat sederhana:

**V1**
User mengetik `y=x²-3` → grafik muncul.

**V2**
User menulis dengan mouse → tulisan dikenali → grafik muncul.

**V3**
User menggambar segitiga/kubus → sistem mengenali bentuknya.

**V4**
Objek bisa diputar/diubah dalam 2D/3D.

**V5**
Tambahkan AI/LLM sehingga pengguna bisa bilang:
“buat parabola ini lebih lebar”
atau
“jelaskan titik potong grafik ini.”

Untuk stack-nya, versi awal bahkan bisa dibuat cukup ringan: **React/Next.js + HTML Canvas/Konva/Fabric.js + KaTeX/Math.js + Plotly/Desmos-style graphing + Three.js untuk 3D**. Recognition bisa ditambahkan belakangan.

Kalau tujuanmu adalah **membangun sendiri produk seperti yang ada di video**, saya juga bisa bantu memecahnya menjadi arsitektur dan roadmap MVP yang realistis, termasuk mana yang bisa dibuat tanpa AI sama sekali dan mana yang sebaiknya memakai model AI.
