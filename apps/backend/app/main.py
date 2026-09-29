"""Backend papan tulis digital: pengenalan rumus (ONNX, CPU), proxy asisten AI, dan file frontend."""

from __future__ import annotations

import base64
import io
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field

from . import ai, auth, chat_store
from .recognizer import MODEL_SPECS, OnnxFormulaRecognizer, prepare_ink_image

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent.parent
load_dotenv(BACKEND_DIR / ".env")

MODELS_ROOT = Path(os.getenv("MODELS_ROOT", ROOT_DIR / "models"))
DEFAULT_MODEL = os.getenv("RECOGNIZER_MODEL", "texteller")
THREADS = int(os.getenv("RECOGNIZER_THREADS", "16"))
FRONTEND_DIST = ROOT_DIR / "apps" / "frontend" / "dist"

log = logging.getLogger("papan")
recognizers: dict[str, OnnxFormulaRecognizer] = {}
bearer = HTTPBearer(auto_error=False)


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
    message: str | None = None
    session_id: str | None = None
    messages: list[dict] = Field(default_factory=list)  # kompatibilitas client lama
    board: dict = Field(default_factory=dict)
    lang: str = "id"


class CredentialsRequest(BaseModel):
    username: str
    password: str


def auth_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Silakan masuk terlebih dahulu")
    return credentials.credentials


def current_user(token: str = Depends(auth_token)) -> dict:
    user = auth.user_for_token(token)
    if not user:
        raise HTTPException(401, "Sesi tidak valid atau sudah berakhir")
    return user


def superadmin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "superadmin":
        raise HTTPException(403, "Akses hanya untuk superadmin")
    return user


@app.post("/api/auth/register", status_code=201)
def register(req: CredentialsRequest):
    try:
        return {"user": auth.register(req.username, req.password), "message": "Pendaftaran berhasil. Tunggu persetujuan superadmin."}
    except auth.AuthError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.post("/api/auth/login")
def login(req: CredentialsRequest):
    try:
        token, user = auth.login(req.username, req.password)
        return {"token": token, "user": user}
    except auth.AuthError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)):
    return {"user": user}


@app.post("/api/auth/logout")
def logout(token: str = Depends(auth_token)):
    auth.logout(token)
    return {"ok": True}


@app.get("/api/auth/users")
def users(_: dict = Depends(superadmin)):
    return {"users": auth.list_users()}


@app.patch("/api/auth/users/{username}/approve")
def approve_user(username: str, _: dict = Depends(superadmin)):
    try:
        return {"user": auth.approve_user(username)}
    except auth.AuthError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.get("/api/health")
def health(_: dict = Depends(current_user)):
    return {
        "ok": True,
        "models": [{"key": k, "name": r.spec.name} for k, r in recognizers.items()],
        "default_model": DEFAULT_MODEL if DEFAULT_MODEL in recognizers else next(iter(recognizers), None),
        "ai": ai.ai_config(),
    }


@app.post("/api/recognize")
def recognize(req: RecognizeRequest, _: dict = Depends(current_user)):
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
async def ai_chat(req: ChatRequest, user: dict = Depends(current_user)):
    try:
        user_text = (req.message or next(
            (str(item.get("content", "")) for item in reversed(req.messages) if item.get("role") == "user"),
            "",
        )).strip()
        if not user_text:
            raise HTTPException(400, "Pesan tidak boleh kosong")

        if req.session_id:
            session = chat_store.get_session(user["username"], req.session_id)
            history = session["messages"]
            session_id = req.session_id
        else:
            # Client lama tetap membawa konteksnya; client baru memulai sesi kosong.
            history = req.messages[:-1] if req.messages else []
            session_id = ""

        result = await ai.chat([*history, {"role": "user", "content": user_text}], req.board, req.lang)
        if not session_id:
            session_id = chat_store.create_session(user["username"], user_text)["id"]
        chat_store.append_exchange(user["username"], session_id, user_text, result["reply"])
        return {**result, "session_id": session_id}
    except (ai.AiError, chat_store.ChatStoreError) as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.get("/api/ai/sessions")
def ai_sessions(user: dict = Depends(current_user)):
    return {"sessions": chat_store.list_sessions(user["username"])}


@app.get("/api/ai/sessions/{session_id}")
def ai_session(session_id: str, user: dict = Depends(current_user)):
    try:
        return {"session": chat_store.get_session(user["username"], session_id)}
    except chat_store.ChatStoreError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@app.delete("/api/ai/sessions/{session_id}")
def delete_ai_session(session_id: str, user: dict = Depends(current_user)):
    try:
        chat_store.delete_session(user["username"], session_id)
        return {"ok": True}
    except chat_store.ChatStoreError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
