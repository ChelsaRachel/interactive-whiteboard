"""Penyimpanan riwayat chat per pengguna berbasis satu file JSON."""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
MAX_SESSIONS_PER_USER = 100
MAX_MESSAGES_PER_SESSION = 400
_lock = threading.RLock()


def _history_path() -> Path:
    return Path(os.getenv("CHAT_HISTORY_PATH", BACKEND_DIR / "chat_history.json"))


class ChatStoreError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> dict:
    history_path = _history_path()
    if not history_path.exists():
        return {"version": 1, "sessions": []}
    try:
        data = json.loads(history_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ChatStoreError("File riwayat chat tidak dapat dibaca", status=500) from exc
    if not isinstance(data.get("sessions"), list):
        raise ChatStoreError("Format file riwayat chat tidak valid", status=500)
    return data


def _save(data: dict) -> None:
    history_path = _history_path()
    history_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = history_path.with_suffix(history_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp_path, history_path)


def _title(text: str) -> str:
    clean = " ".join(text.split())
    return clean[:57] + "…" if len(clean) > 58 else clean or "Percakapan baru"


def _summary(session: dict) -> dict:
    return {
        "id": session["id"],
        "title": session["title"],
        "created_at": session["created_at"],
        "updated_at": session["updated_at"],
        "message_count": len(session.get("messages", [])),
    }


def create_session(username: str, first_message: str) -> dict:
    now = _now()
    session = {
        "id": uuid.uuid4().hex,
        "username": username,
        "title": _title(first_message),
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }
    with _lock:
        data = _load()
        own = [item for item in data["sessions"] if item.get("username") == username]
        if len(own) >= MAX_SESSIONS_PER_USER:
            oldest_ids = {item["id"] for item in sorted(own, key=lambda item: item.get("updated_at", ""))[: len(own) - MAX_SESSIONS_PER_USER + 1]}
            data["sessions"] = [item for item in data["sessions"] if item.get("id") not in oldest_ids]
        data["sessions"].append(session)
        _save(data)
    return _summary(session)


def list_sessions(username: str) -> list[dict]:
    with _lock:
        sessions = [item for item in _load()["sessions"] if item.get("username") == username]
        sessions.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
        return [_summary(item) for item in sessions]


def get_session(username: str, session_id: str) -> dict:
    with _lock:
        session = next(
            (item for item in _load()["sessions"] if item.get("id") == session_id and item.get("username") == username),
            None,
        )
        if not session:
            raise ChatStoreError("Sesi chat tidak ditemukan", status=404)
        return {
            **_summary(session),
            "messages": [
                {"role": message["role"], "content": message["content"]}
                for message in session.get("messages", [])
                if message.get("role") in {"user", "assistant"} and isinstance(message.get("content"), str)
            ],
        }


def append_exchange(username: str, session_id: str, user_text: str, assistant_text: str) -> dict:
    with _lock:
        data = _load()
        session = next(
            (item for item in data["sessions"] if item.get("id") == session_id and item.get("username") == username),
            None,
        )
        if not session:
            raise ChatStoreError("Sesi chat tidak ditemukan", status=404)
        session["messages"] = [
            *session.get("messages", []),
            {"role": "user", "content": user_text},
            {"role": "assistant", "content": assistant_text},
        ][-MAX_MESSAGES_PER_SESSION:]
        session["updated_at"] = _now()
        _save(data)
        return _summary(session)


def delete_session(username: str, session_id: str) -> None:
    with _lock:
        data = _load()
        before = len(data["sessions"])
        data["sessions"] = [
            item for item in data["sessions"]
            if not (item.get("id") == session_id and item.get("username") == username)
        ]
        if len(data["sessions"]) == before:
            raise ChatStoreError("Sesi chat tidak ditemukan", status=404)
        _save(data)
