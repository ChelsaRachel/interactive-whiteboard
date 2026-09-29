"""Autentikasi berbasis satu file JSON untuk penggunaan lokal/prototipe."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(os.getenv("AUTH_CONFIG_PATH", BACKEND_DIR / "auth_config.json"))
USERNAME_RE = re.compile(r"^[a-z0-9_.-]{3,32}$")
PBKDF2_ITERATIONS = 310_000

_lock = threading.RLock()
_sessions: dict[str, str] = {}


class AuthError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _load_config() -> dict:
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"File auth tidak ditemukan: {CONFIG_PATH}") from exc
    if not isinstance(data.get("users"), list):
        raise RuntimeError("Format auth_config.json tidak valid")
    return data


def _save_config(data: dict) -> None:
    temp_path = CONFIG_PATH.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp_path, CONFIG_PATH)


def _normalize_username(username: str) -> str:
    return username.strip().lower()


def _public_user(user: dict) -> dict:
    return {
        "username": user["username"],
        "role": user["role"],
        "approved": bool(user["approved"]),
        "created_at": user.get("created_at", ""),
    }


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, raw_iterations, salt_hex, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            bytes.fromhex(salt_hex),
            int(raw_iterations),
        ).hex()
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def register(username: str, password: str) -> dict:
    username = _normalize_username(username)
    if not USERNAME_RE.fullmatch(username):
        raise AuthError("Username harus 3–32 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung")
    if len(password) < 8:
        raise AuthError("Kata sandi minimal 8 karakter")
    if len(password) > 128:
        raise AuthError("Kata sandi terlalu panjang")

    with _lock:
        data = _load_config()
        if any(u["username"].lower() == username for u in data["users"]):
            raise AuthError("Username sudah digunakan", status=409)
        user = {
            "username": username,
            "password_hash": _hash_password(password),
            "role": "user",
            "approved": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        data["users"].append(user)
        _save_config(data)
        return _public_user(user)


def login(username: str, password: str) -> tuple[str, dict]:
    username = _normalize_username(username)
    with _lock:
        data = _load_config()
        user = next((u for u in data["users"] if u["username"].lower() == username), None)
        if not user or not _verify_password(password, user.get("password_hash", "")):
            raise AuthError("Username atau kata sandi salah", status=401)
        if not user.get("approved"):
            raise AuthError("Akun masih menunggu persetujuan superadmin", status=403)
        token = secrets.token_urlsafe(48)
        _sessions[token] = user["username"]
        return token, _public_user(user)


def user_for_token(token: str) -> dict | None:
    username = _sessions.get(token)
    if not username:
        return None
    with _lock:
        data = _load_config()
        user = next((u for u in data["users"] if u["username"] == username and u.get("approved")), None)
        return _public_user(user) if user else None


def logout(token: str) -> None:
    _sessions.pop(token, None)


def list_users() -> list[dict]:
    with _lock:
        return [_public_user(user) for user in _load_config()["users"]]


def approve_user(username: str) -> dict:
    username = _normalize_username(username)
    with _lock:
        data = _load_config()
        user = next((u for u in data["users"] if u["username"].lower() == username), None)
        if not user:
            raise AuthError("Pengguna tidak ditemukan", status=404)
        if user["role"] == "superadmin":
            raise AuthError("Status superadmin tidak dapat diubah")
        user["approved"] = True
        user["approved_at"] = datetime.now(timezone.utc).isoformat()
        _save_config(data)
        return _public_user(user)
