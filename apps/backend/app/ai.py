"""Asisten AI lewat OpenAI Responses API dengan keluaran JSON terstruktur.

Semua keputusan (pertanyaan vs perintah edit) diserahkan ke model.
Backend hanya melakukan validasi skema aksi, tidak lagi mendeteksi maksud lewat regex.
"""

from __future__ import annotations

import json
import os
import re

import httpx

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.4-mini"
HISTORY_LIMIT = 40

SYSTEM_PROMPT = """You are the teaching assistant inside a digital whiteboard for high-school mathematics.
Teachers handwrite functions such as y = x^2 - 3 or y = A sin x + B; the board plots them with sliders
for every parameter (letters other than x). Teachers can also create 3D solids (cube = kubus ABCD.EFGH,
cuboid = balok, square pyramid = limas T.ABCD, triangular prism = prisma ABC.DEF, cylinder, cone,
sphere), mark points on edges, and see the cross-section polygon with its true shape and interior
angles. Curved solids have their own section modes (plane, horizontal, vertical, oblique, throughApex,
parallelSlant, parallelAxis) which produce circle/ellipse/rectangle/triangle/parabola/hyperbola.

You receive the current board state as JSON. Use it: refer to functions by their LaTeX, parameters by
their current values, and cross-sections by their shape, angles, and area.

Always answer in the language given by "lang" ("id" = Bahasa Indonesia, "en" = English). Keep answers
short and classroom-friendly (at most about 120 words), and write math in LaTeX wrapped in $...$.

## How to decide between answering and editing

Every response returns `{reply, actions}`.
- If the teacher asks a question ("what is this", "explain", "why", "how", "apa itu", "kenapa", "berapa",
  "jelaskan"), or comments/reflects without asking to change anything → answer in `reply` and set
  `actions: []`. Do NOT edit the board.
- If the teacher explicitly asks the board to change ("plot y=…", "make the parabola wider", "add a
  cube", "ganti dengan bintang", "buatkan grafik love", "ubah warna"), return matching actions AND a
  short confirming reply that truthfully describes what you changed.
- Words like "gambar" or "graph" can be nouns ("in the picture", "di gambar", "warna di gambar") or
  verbs. Only treat them as an edit request when the teacher clearly asks you to draw/plot something.
- Negative feedback about a drawn graph ("jelek", "still the same", "coba lagi", "cari yang lebih
  bagus") is an edit request → replace with a visibly different, supported equation and confirm.
- Never claim in `reply` that you edited something when `actions: []`. Never leave `reply` empty.

## Available actions

- `set_param`: change a slider. Requires graph_id, function_id, param (the letter), value.
- `add_function`: plot a new expression on an existing graph. Requires graph_id (use "new" if none yet)
  and latex. Accepts explicit functions (`2x^2+1`), implicit equations (`x^2+y^2=4`), and polar
  equations (`r=1+0.4cos(5theta)`). Parametric equations, inequalities, coordinate lists, and prose
  are NOT valid.
- `update_function`: replace a graph expression. Requires graph_id, function_id, latex.
- `remove_function`: needs graph_id and function_id.

Suggested formulas for common visual requests (use polar/implicit when it makes the picture nicer):
- Heart / love: `(x^2+y^2-1)^3-x^2y^3=0` or `x^2+(y-|x|^(2/3))^2=1`.
- Five-point star: `r=(|cos(5theta/4)|^(1/2)+|sin(5theta/4)|^(1/2))^-2`.
- If you must produce an alternative to an already-drawn equation, pick a structurally different one
  from the board's current formulas."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["set_param", "add_function", "update_function", "remove_function"],
                    },
                    "graph_id": {"type": ["string", "null"]},
                    "function_id": {"type": ["string", "null"]},
                    "param": {"type": ["string", "null"]},
                    "value": {"type": ["number", "null"]},
                    "latex": {"type": ["string", "null"]},
                },
                "required": ["type", "graph_id", "function_id", "param", "value", "latex"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["reply", "actions"],
    "additionalProperties": False,
}


class AiError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def ai_config() -> dict:
    return {
        "configured": bool(os.getenv("OPENAI_API_KEY")),
        "model": os.getenv("OPENAI_MODEL") or DEFAULT_MODEL,
        "provider": "openai",
    }


def _supported_formula(latex: object) -> bool:
    """Validator skema minimum: latex tidak kosong, bila ada `=` cukup satu."""
    if not isinstance(latex, str) or not latex.strip():
        return False
    compact = re.sub(r"\s+", "", latex)
    if "=" in compact:
        if compact.count("=") != 1:
            return False
        left, right = compact.split("=", 1)
        return bool(left and right)
    return True


def _clean_actions(raw_actions: object) -> list[dict]:
    """Buang aksi yang skemanya tidak valid; jangan menebak-nebak intent."""
    actions: list[dict] = []
    if not isinstance(raw_actions, list):
        return actions
    for raw in raw_actions:
        if not isinstance(raw, dict):
            continue
        action_type = raw.get("type")
        if action_type not in {"set_param", "add_function", "update_function", "remove_function"}:
            continue
        if action_type in {"add_function", "update_function"} and not _supported_formula(raw.get("latex")):
            continue
        actions.append({k: v for k, v in raw.items() if v is not None})
    return actions


async def chat(messages: list[dict], board: dict, lang: str) -> dict:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise AiError("OPENAI_API_KEY belum diatur di apps/backend/.env", status=503)
    model = ai_config()["model"]

    recent = messages[-HISTORY_LIMIT:]
    inputs = []
    for i, m in enumerate(recent):
        text = m.get("content", "")
        if i == len(recent) - 1 and m.get("role") == "user":
            text = f"lang: {lang}\nboard state:\n{json.dumps(board, ensure_ascii=False)}\n\nteacher: {text}"
        inputs.append({"role": "assistant" if m.get("role") == "assistant" else "user", "content": text})

    body = {
        "model": model,
        "instructions": SYSTEM_PROMPT,
        "input": inputs,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "whiteboard_assistant_response",
                "strict": True,
                "schema": RESPONSE_SCHEMA,
            }
        },
        "max_output_tokens": 1200,
        "store": False,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            OPENAI_RESPONSES_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body,
        )
    if resp.status_code == 401:
        raise AiError("OPENAI_API_KEY ditolak oleh OpenAI (401).", status=401)
    if resp.status_code == 429:
        raise AiError("Batas penggunaan atau kuota OpenAI tercapai (429). Coba lagi nanti.", status=429)
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("error", {}).get("message", resp.text[:300])
        except (ValueError, AttributeError):
            detail = resp.text[:300]
        raise AiError(f"OpenAI error {resp.status_code}: {detail}", status=502)

    data = resp.json()
    try:
        output_text = next(
            content["text"]
            for item in data.get("output", [])
            if item.get("type") == "message"
            for content in item.get("content", [])
            if content.get("type") == "output_text"
        )
        parsed = json.loads(output_text)
    except (KeyError, StopIteration, json.JSONDecodeError, TypeError) as exc:
        raise AiError(f"Respons OpenAI tidak terbaca (status: {data.get('status', 'unknown')}).") from exc

    return {
        "reply": parsed.get("reply", ""),
        "actions": _clean_actions(parsed.get("actions", [])),
        "model": model,
    }
