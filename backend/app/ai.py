"""Asisten AI (tahap 5) lewat Gemini API generateContent dengan keluaran JSON terstruktur."""

from __future__ import annotations

import json
import os

import httpx

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_PROMPT = """You are the teaching assistant inside a digital whiteboard for high-school mathematics.
Teachers handwrite functions such as y = x^2 - 3 or y = A sin x + B; the board plots them with sliders
for every parameter (letters other than x). Teachers can also create 3D solids (cube = kubus ABCD.EFGH,
cuboid = balok, square pyramid = limas T.ABCD, triangular prism = prisma ABC.DEF), mark points on edges
and see the cross-section (irisan) polygon with its true shape and interior angles.

You receive the current board state as JSON. Use it: refer to functions by their LaTeX, parameters by
their current values, and cross-sections by their shape, angles and area.

Always answer in the language given by "lang" ("id" = Bahasa Indonesia, "en" = English). Keep answers
short and classroom-friendly (at most about 120 words), and write math in LaTeX wrapped in $...$.

You may change the board by returning actions:
- set_param: change a slider. Needs graph_id, function_id, param, value.
- add_function: plot a new function y = f(x) on an existing graph. Needs graph_id and latex (right-hand
  side only, e.g. "2x^2+1", or a full "y=..." expression).
- update_function: replace a function's formula. Needs graph_id, function_id and latex.
- remove_function: needs graph_id and function_id.
Only return actions the teacher asked for (e.g. "make the parabola wider", "plot y = 2x + 1"). If there
is no graph yet and the teacher asks to plot something, use graph_id "new". Otherwise return an empty
actions list."""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "reply": {"type": "STRING"},
        "actions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "type": {
                        "type": "STRING",
                        "enum": ["set_param", "add_function", "update_function", "remove_function"],
                    },
                    "graph_id": {"type": "STRING"},
                    "function_id": {"type": "STRING"},
                    "param": {"type": "STRING"},
                    "value": {"type": "NUMBER"},
                    "latex": {"type": "STRING"},
                },
                "required": ["type"],
            },
        },
    },
    "required": ["reply", "actions"],
}


class AiError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def ai_config() -> dict:
    return {
        "configured": bool(os.getenv("GEMINI_API_KEY")),
        "model": os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
    }


async def chat(messages: list[dict], board: dict, lang: str) -> dict:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise AiError("GEMINI_API_KEY belum diatur di backend/.env", status=503)
    model = ai_config()["model"]

    contents = []
    for i, m in enumerate(messages[-12:]):
        text = m.get("content", "")
        if i == len(messages[-12:]) - 1 and m.get("role") == "user":
            text = f"lang: {lang}\nboard state:\n{json.dumps(board, ensure_ascii=False)}\n\nteacher: {text}"
        contents.append({"role": "model" if m.get("role") == "assistant" else "user", "parts": [{"text": text}]})

    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
            "temperature": 0.3,
        },
    }
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json=body,
        )
    if resp.status_code == 429:
        raise AiError("Kuota Gemini habis (429). Coba lagi nanti.", status=429)
    if resp.status_code >= 400:
        raise AiError(f"Gemini error {resp.status_code}: {resp.text[:300]}", status=502)

    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise AiError(f"Respons Gemini tidak terbaca: {str(data)[:300]}") from exc
    return {"reply": parsed.get("reply", ""), "actions": parsed.get("actions", []), "model": model}
