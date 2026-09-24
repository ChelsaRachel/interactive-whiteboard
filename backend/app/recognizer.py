"""Pengenal rumus tulisan tangan berbasis model VisionEncoderDecoder (TrOCR) dalam format ONNX.

Mendukung Pix2Text MFR 1.5 (default) dan TexTeller. Hanya butuh onnxruntime + tokenizers,
tanpa PyTorch/transformers.
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from tokenizers import Tokenizer


@dataclass(frozen=True)
class ModelSpec:
    name: str
    dirname: str
    # "square": resize langsung ke size x size (TrOCRProcessor).
    # "pad": resize menjaga rasio (sisi panjang = size), lalu pad kanan/bawah (TexTeller).
    resize: str
    size: int
    channels: int
    mean: float
    std: float
    start_id: int
    eos_id: int


MODEL_SPECS = {
    "pix2text": ModelSpec("pix2text-mfr-1.5", "pix2text-mfr-1.5", "square", 384, 3, 0.5, 0.5, 1, 2),
    "texteller": ModelSpec("texteller-3", "texteller", "pad", 448, 1, 0.9545467, 0.15394445, 0, 2),
}


@dataclass
class RecognitionResult:
    latex: str
    confidence: float
    elapsed_ms: float
    model: str


class OnnxFormulaRecognizer:
    def __init__(self, models_root: Path, spec: ModelSpec, max_new_tokens: int = 200, threads: int = 8):
        self.spec = spec
        model_dir = Path(models_root) / spec.dirname
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        providers = ["CPUExecutionProvider"]
        self.encoder = ort.InferenceSession(str(model_dir / "encoder_model.onnx"), opts, providers=providers)
        self.decoder = ort.InferenceSession(str(model_dir / "decoder_model.onnx"), opts, providers=providers)
        self.tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        self.max_new_tokens = max_new_tokens
        self._lock = threading.Lock()

    def _preprocess(self, image: Image.Image) -> np.ndarray:
        s = self.spec
        image = image.convert("RGB" if s.channels == 3 else "L")
        if s.resize == "square":
            image = image.resize((s.size, s.size), Image.BICUBIC)
            arr = np.asarray(image, dtype=np.float32) / 255.0
            arr = (arr - s.mean) / s.std
        else:
            w, h = image.size
            scale = min((s.size - 1) / min(w, h), s.size / max(w, h))
            image = image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BICUBIC)
            small = (np.asarray(image, dtype=np.float32) / 255.0 - s.mean) / s.std
            arr = np.zeros((s.size, s.size) + small.shape[2:], dtype=np.float32)
            arr[: small.shape[0], : small.shape[1]] = small
        if arr.ndim == 2:
            arr = arr[:, :, None]
        return arr.transpose(2, 0, 1)[None].astype(np.float32)

    def recognize(self, image: Image.Image) -> RecognitionResult:
        t0 = time.perf_counter()
        pixel_values = self._preprocess(image)
        with self._lock:
            hidden = self.encoder.run(None, {"pixel_values": pixel_values})[0]
            ids = [self.spec.start_id]
            logprobs: list[float] = []
            for _ in range(self.max_new_tokens):
                logits = self.decoder.run(
                    None,
                    {"input_ids": np.array([ids], dtype=np.int64), "encoder_hidden_states": hidden},
                )[0][0, -1]
                logits = logits - logits.max()
                probs = np.exp(logits)
                probs /= probs.sum()
                nxt = int(probs.argmax())
                logprobs.append(float(np.log(probs[nxt] + 1e-12)))
                if nxt == self.spec.eos_id:
                    break
                ids.append(nxt)
        text = self.tokenizer.decode(ids[1:], skip_special_tokens=True)
        confidence = float(np.exp(np.mean(logprobs))) if logprobs else 0.0
        return RecognitionResult(
            latex=normalize_latex(text),
            confidence=confidence,
            elapsed_ms=(time.perf_counter() - t0) * 1000,
            model=self.spec.name,
        )


def prepare_ink_image(image: Image.Image, pad_ratio: float = 0.08) -> Image.Image:
    """Ubah gambar goresan menjadi tinta gelap di atas latar putih, dipotong rapat lalu diberi margin."""
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    gray = Image.alpha_composite(background, rgba).convert("L")
    # Kalau latar gelap (tinta terang), balik warnanya.
    if np.asarray(gray).mean() < 128:
        gray = ImageOps.invert(gray)
    bbox = ImageOps.invert(gray).getbbox()
    if bbox:
        gray = gray.crop(bbox)
    w, h = gray.size
    pad = int(max(w, h) * pad_ratio) + 4
    canvas = Image.new("L", (w + 2 * pad, h + 2 * pad), 255)
    canvas.paste(gray, (pad, pad))
    return canvas.convert("RGB")


def normalize_latex(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())
