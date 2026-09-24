import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "id" | "en";

const dict = {
  id: {
    appTitle: "Papan Tulis Digital",
    pen: "Pena",
    eraser: "Penghapus",
    lasso: "Pilih (laso)",
    undo: "Urungkan",
    redo: "Ulangi",
    clearBoard: "Bersihkan papan",
    clearConfirm: "Hapus semua isi papan?",
    typeFormula: "Ketik rumus",
    insertSolid: "Sisipkan bangun ruang",
    color: "Warna",
    thickness: "Ketebalan",
    ai: "Asisten AI",
    language: "Bahasa",
    settings: "Pengaturan",
    recognizerModel: "Model pengenal rumus",
    modelTexteller: "TexTeller (lebih akurat, ±1 dtk)",
    modelPix2text: "Pix2Text (lebih cepat, ±0,2 dtk)",
    backendOffline: "Server tidak terhubung",
    // seleksi
    toGraph: "Jadikan grafik",
    toSolid: "Jadikan bangun ruang",
    delete: "Hapus",
    cancel: "Batal",
    recognizing: "Mengenali tulisan…",
    recognizeFailed: "Gagal mengenali tulisan",
    // dialog rumus
    recognizedTitle: "Hasil pengenalan rumus",
    recognizedHint: "Periksa hasilnya. Kamu bisa memperbaiki rumus sebelum digambar.",
    formulaTitle: "Ketik rumus fungsi",
    formulaHint: "Contoh: y = x^2 - 3, y = A sin x + B, y = \\frac{1}{x}",
    formulaPlaceholder: "y = ...",
    plot: "Gambar grafik",
    add: "Tambah",
    save: "Simpan",
    lineN: "Baris",
    confidence: "keyakinan",
    include: "Sertakan",
    // error parser
    err_empty: "Rumus kosong",
    err_not_function: "Hanya mendukung bentuk y = f(x)",
    err_y_on_rhs: "Variabel y tidak boleh ada di ruas kanan",
    err_generic: "Rumus tidak dapat dibaca",
    // grafik
    graph: "Grafik fungsi",
    addFunction: "Tambah fungsi",
    keyPoints: "Titik penting",
    zoomIn: "Perbesar",
    zoomOut: "Perkecil",
    resetView: "Atur ulang tampilan",
    close: "Tutup",
    edit: "Ubah",
    hide: "Sembunyikan",
    show: "Tampilkan",
    root: "titik potong sumbu-x",
    yIntercept: "titik potong sumbu-y",
    extremum: "titik puncak",
    // bangun ruang
    solid_cube: "Kubus",
    solid_cuboid: "Balok",
    solid_squarePyramid: "Limas segi empat",
    solid_triPyramid: "Limas segitiga",
    solid_triPrism: "Prisma segitiga",
    chooseSolid: "Pilih bangun ruang",
    chooseSolidHint: "Sketsa belum yakin dikenali. Pilih bangun yang dimaksud:",
    rotate: "Putar",
    markPoints: "Titik irisan",
    markPointsHint: "Ketuk 3 titik pada rusuk untuk membuat irisan",
    innerSphere: "Bola dalam",
    outerSphere: "Bola luar",
    resetPoints: "Hapus titik",
    labels: "Label titik",
    edgeLength: "rusuk",
    // irisan
    section: "Irisan",
    area: "Luas",
    perimeter: "Keliling",
    angles: "Sudut",
    units: "satuan",
    shape_triangle_equilateral: "Segitiga sama sisi",
    shape_triangle_isosceles: "Segitiga sama kaki",
    shape_triangle_right: "Segitiga siku-siku",
    shape_triangle: "Segitiga",
    shape_square: "Persegi",
    shape_rectangle: "Persegi panjang",
    shape_rhombus: "Belah ketupat",
    shape_parallelogram: "Jajargenjang",
    shape_trapezoid_isosceles: "Trapesium sama kaki",
    shape_trapezoid: "Trapesium",
    shape_quadrilateral: "Segi empat",
    shape_pentagon: "Segi lima",
    shape_hexagon_regular: "Segi enam beraturan",
    shape_hexagon: "Segi enam",
    shape_polygon: "Segi banyak",
    // AI
    aiTitle: "Asisten AI",
    aiPlaceholder: "Tanya atau beri perintah…",
    aiSend: "Kirim",
    aiThinking: "Sedang berpikir…",
    aiNotConfigured: "Asisten AI belum aktif. Isi GEMINI_API_KEY di backend/.env lalu jalankan ulang server.",
    aiError: "Asisten AI gagal menjawab",
    aiWelcome: "Halo! Saya bisa menjelaskan grafik dan irisan di papan, atau mengubahnya. Contoh:",
    aiSuggest1: "Jelaskan grafik di papan",
    aiSuggest2: "Buat parabolanya lebih lebar",
    aiSuggest3: "Apa bentuk irisan kubus ini dan berapa luasnya?",
    aiApplied: "Perubahan diterapkan",
    welcomeTitle: "Tulis rumus atau gambar bangun ruang",
    welcomeBody: "Tulis misalnya y = x² − 3, lalu lingkari dengan alat laso dan pilih “Jadikan grafik”. Gambar kubus lalu pilih “Jadikan bangun ruang”.",
  },
  en: {
    appTitle: "Digital Whiteboard",
    pen: "Pen",
    eraser: "Eraser",
    lasso: "Select (lasso)",
    undo: "Undo",
    redo: "Redo",
    clearBoard: "Clear board",
    clearConfirm: "Clear everything on the board?",
    typeFormula: "Type a formula",
    insertSolid: "Insert a solid",
    color: "Color",
    thickness: "Thickness",
    ai: "AI assistant",
    language: "Language",
    settings: "Settings",
    recognizerModel: "Formula recognition model",
    modelTexteller: "TexTeller (more accurate, ~1 s)",
    modelPix2text: "Pix2Text (faster, ~0.2 s)",
    backendOffline: "Server not connected",
    toGraph: "Make a graph",
    toSolid: "Make a 3D solid",
    delete: "Delete",
    cancel: "Cancel",
    recognizing: "Recognizing handwriting…",
    recognizeFailed: "Could not recognize the handwriting",
    recognizedTitle: "Recognized formulas",
    recognizedHint: "Check the result. You can fix a formula before it is plotted.",
    formulaTitle: "Type a function",
    formulaHint: "Examples: y = x^2 - 3, y = A sin x + B, y = \\frac{1}{x}",
    formulaPlaceholder: "y = ...",
    plot: "Plot",
    add: "Add",
    save: "Save",
    lineN: "Line",
    confidence: "confidence",
    include: "Include",
    err_empty: "The formula is empty",
    err_not_function: "Only y = f(x) is supported",
    err_y_on_rhs: "y cannot appear on the right-hand side",
    err_generic: "The formula could not be read",
    graph: "Function graph",
    addFunction: "Add function",
    keyPoints: "Key points",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetView: "Reset view",
    close: "Close",
    edit: "Edit",
    hide: "Hide",
    show: "Show",
    root: "x-intercept",
    yIntercept: "y-intercept",
    extremum: "turning point",
    solid_cube: "Cube",
    solid_cuboid: "Cuboid",
    solid_squarePyramid: "Square pyramid",
    solid_triPyramid: "Triangular pyramid",
    solid_triPrism: "Triangular prism",
    chooseSolid: "Choose a solid",
    chooseSolidHint: "The sketch was not recognized with confidence. Which solid did you mean?",
    rotate: "Rotate",
    markPoints: "Section points",
    markPointsHint: "Tap 3 points on the edges to make a cross-section",
    innerSphere: "Inscribed sphere",
    outerSphere: "Circumscribed sphere",
    resetPoints: "Clear points",
    labels: "Vertex labels",
    edgeLength: "edge",
    section: "Cross-section",
    area: "Area",
    perimeter: "Perimeter",
    angles: "Angles",
    units: "units",
    shape_triangle_equilateral: "Equilateral triangle",
    shape_triangle_isosceles: "Isosceles triangle",
    shape_triangle_right: "Right triangle",
    shape_triangle: "Triangle",
    shape_square: "Square",
    shape_rectangle: "Rectangle",
    shape_rhombus: "Rhombus",
    shape_parallelogram: "Parallelogram",
    shape_trapezoid_isosceles: "Isosceles trapezoid",
    shape_trapezoid: "Trapezoid",
    shape_quadrilateral: "Quadrilateral",
    shape_pentagon: "Pentagon",
    shape_hexagon_regular: "Regular hexagon",
    shape_hexagon: "Hexagon",
    shape_polygon: "Polygon",
    aiTitle: "AI assistant",
    aiPlaceholder: "Ask a question or give a command…",
    aiSend: "Send",
    aiThinking: "Thinking…",
    aiNotConfigured: "The AI assistant is not active yet. Set GEMINI_API_KEY in backend/.env and restart the server.",
    aiError: "The AI assistant could not answer",
    aiWelcome: "Hi! I can explain the graphs and cross-sections on the board, or change them. For example:",
    aiSuggest1: "Explain the graph on the board",
    aiSuggest2: "Make the parabola wider",
    aiSuggest3: "What shape is this cross-section and what is its area?",
    aiApplied: "Changes applied",
    welcomeTitle: "Write a formula or draw a solid",
    welcomeBody: "Write e.g. y = x² − 3, circle it with the lasso tool and choose “Make a graph”. Draw a cube and choose “Make a 3D solid”.",
  },
} as const;

export type TKey = keyof (typeof dict)["id"];

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
}

const Ctx = createContext<I18n | null>(null);
const STORAGE_KEY = "papan.lang";

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "id" || v === "en") return v;
  } catch {
    /* penyimpanan tidak tersedia */
  }
  return "id";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* abaikan */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = dict[lang].appTitle;
  }, [lang]);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (k) => dict[lang][k] }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n di luar I18nProvider");
  return v;
}

export function formatNumber(v: number, lang: Lang, digits = 2): string {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { maximumFractionDigits: digits }).format(v);
}
