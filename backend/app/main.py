"""Backend papan tulis digital: pengenalan rumus (ONNX, CPU), proxy asisten AI, dan file frontend."""

from __future__ import annotations

import base64
import io
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

from . import ai
from .recognizer import MODEL_SPECS, OnnxFormulaRecognizer, prepare_ink_image

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

MODELS_ROOT = Path(os.getenv("MODELS_ROOT", ROOT_DIR / "models"))
DEFAULT_MODEL = os.getenv("RECOGNIZER_MODEL", "texteller")
THREADS = int(os.getenv("RECOGNIZER_THREADS", "16"))
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

log = logging.getLogger("papan")
recognizers: dict[str, OnnxFormulaRecognizer] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    for key, spec in MODEL_SPECS.items():
        model_dir = MODELS_ROOT / spec.dirname
        if not (model_dir / "decoder_model.onnx").exists():
            log.warning("Model %s tidak ditemukan di %s, dilewati", key, model_dir)
            continue
        recognizers[key] = OnnxFormulaRecognizer(MODELS_ROOT, spec, threads=THREADS)
        log.warning("Model %s dimuat", key)
    yield


app = FastAPI(title="Papan Tulis Digital", lifespan=lifespan)


class RecognizeRequest(BaseModel):
    image: str  # data URL PNG atau base64 mentah
    model: str | None = None


class ChatRequest(BaseModel):
    messages: list[dict]
    board: dict = {}
    lang: str = "id"


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "models": [{"key": k, "name": r.spec.name} for k, r in recognizers.items()],
        "default_model": DEFAULT_MODEL if DEFAULT_MODEL in recognizers else next(iter(recognizers), None),
        "ai": ai.ai_config(),
    }


@app.post("/api/recognize")
def recognize(req: RecognizeRequest):
    key = req.model or DEFAULT_MODEL
    if key not in recognizers:
        key = next(iter(recognizers), None)
    if key is None:
        raise HTTPException(503, "Belum ada model pengenal yang dimuat")
    payload = req.image.split(",", 1)[1] if req.image.startswith("data:") else req.image
    try:
        image = Image.open(io.BytesIO(base64.b64decode(payload)))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Gambar tidak valid: {exc}") from exc
    result = recognizers[key].recognize(prepare_ink_image(image))
    return {
        "latex": result.latex,
        "confidence": result.confidence,
        "elapsed_ms": round(result.elapsed_ms),
        "model": result.model,
    }


@app.post("/api/ai/chat")
async def ai_chat(req: ChatRequest):
    try:
        return await ai.chat(req.messages, req.board, req.lang)
    except ai.AiError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
