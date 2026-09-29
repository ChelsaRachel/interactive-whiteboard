"""Asisten AI lewat OpenAI Responses API dengan keluaran JSON terstruktur."""

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
cuboid = balok, square pyramid = limas T.ABCD, triangular prism = prisma ABC.DEF), mark points on edges
and see the cross-section (irisan) polygon with its true shape and interior angles.

You receive the current board state as JSON. Use it: refer to functions by their LaTeX, parameters by
their current values, and cross-sections by their shape, angles and area.

Always answer in the language given by "lang" ("id" = Bahasa Indonesia, "en" = English). Keep answers
short and classroom-friendly (at most about 120 words), and write math in LaTeX wrapped in $...$.

You may change the board by returning actions:
- set_param: change a slider. Always include graph_id, function_id, param (the letter) and value.
- add_function: plot an explicit function, implicit equation, or polar equation on an existing graph.
  Needs graph_id and latex (e.g. "2x^2+1", "x^2+y^2=4", or "r=1+0.4cos(5theta)").
- update_function: replace a graph expression. Needs graph_id, function_id and latex.
- remove_function: needs graph_id and function_id.
Only return actions the teacher asked for (e.g. "make the parabola wider", "plot y = 2x + 1"). If there
is no graph yet and the teacher asks to plot something, use graph_id "new". Otherwise return an empty
actions list.

Board-action contract (critical):
- When the latest message asks to edit, change, draw, plot, add, remove, apply, or "langsung edit" the
  board, return one or more actions in the same response. Resolve words like "it", "that formula", or
  "grafiknya" from the recent conversation. Do not ask again when the requested shape/formula is clear.
- Treat negative feedback about a graph (for example "jelek", "kurang bagus", "masih sama", "cari yang
  lebih bagus", "ugly", "still the same", or "make it better") as an edit request. Choose and apply a
  visibly different supported equation immediately; do not merely suggest it and do not ask the teacher
  to choose a formula.
- add_function/update_function accepts both explicit functions (`2x^2+1` or `y=2x^2+1`) and implicit
  equations (`x^2+y^2=4`) as well as polar equations (`r=1+0.4cos(5theta)`). Use implicit equations
  directly for closed curves and polar equations for radial shapes. Do not unnecessarily split a curve.
- Supported heart/love alternatives include `(x^2+y^2-1)^3-x^2y^3=0` and
  `x^2+(y-|x|^(2/3))^2=1`. If the teacher asks for another/better/different heart, do not return an
  equation already present on the board. Replace the existing heart expression, not an unrelated function.
- For a five-point star/bintang, use the supported polar superformula
  `r=(|cos(5theta/4)|^(1/2)+|sin(5theta/4)|^(1/2))^-2`. A diamond such as `|x|+|y|=1`
  is NOT a star and must never be returned for a star request.
- Parametric equations, inequalities, coordinate lists, domains, and prose are not valid latex actions;
  polar equations are valid.
- If the teacher says to edit/replace an existing graph, update its first relevant function, add any extra
  branches, and remove obsolete functions when needed. Use exact graph_id/function_id values from board state.
- The reply must truthfully match the actions. Never claim that the board was edited when actions is empty."""

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


EDIT_REQUEST_RE = re.compile(
    r"\b(edit|ubah|ganti|terapkan|gambar(?:kan)?|plot|tambahkan|hapus|setel|cari|coba|ulang|lagi|"
    r"jelek|buruk|bagus|beda|sama|apply|change|replace|draw|add|remove|find|ugly|"
    r"better|different|same)\b",
    re.IGNORECASE,
)

ALTERNATIVE_REQUEST_RE = re.compile(
    r"\b(cari|alternatif|lain|beda|berbeda|lebih\s+(?:bagus|baik|halus)|jelek|buruk|"
    r"masih\s+sama|(?:belum|tidak|ga(?:k)?)\s+berubah|kok\s+sama|coba\s+lagi|ulang(?:i)?|"
    r"persamaan(?:nya)?\s+(?:kamu\s+)?sama|another|alternative|different|better|nicer|"
    r"smoother|ugly|still\s+the\s+same|not\s+changed|try\s+again)\b",
    re.IGNORECASE,
)

HEART_RE = re.compile(r"\b(love|hati|heart)\b", re.IGNORECASE)
STAR_RE = re.compile(r"\b(bintang|star)\b", re.IGNORECASE)
STAR_FORMULA = "r=(|cos(5theta/4)|^(1/2)+|sin(5theta/4)|^(1/2))^-2"


def _explicit_edit_request(messages: list[dict]) -> bool:
    latest = next((str(message.get("content", "")) for message in reversed(messages) if message.get("role") == "user"), "")
    return bool(EDIT_REQUEST_RE.search(latest) or ALTERNATIVE_REQUEST_RE.search(latest))


def _latest_user_text(messages: list[dict]) -> str:
    return next((str(message.get("content", "")) for message in reversed(messages) if message.get("role") == "user"), "")


def _alternative_request(messages: list[dict]) -> bool:
    return bool(ALTERNATIVE_REQUEST_RE.search(_latest_user_text(messages)))


def _star_request(messages: list[dict]) -> bool:
    return bool(STAR_RE.search(_latest_user_text(messages)))


def _normalize_formula(value: object) -> str:
    if not isinstance(value, str):
        return ""
    compact = value.lower().replace("\\left", "").replace("\\right", "").replace("\\cdot", "*")
    compact = compact.replace("{", "(").replace("}", ")").replace("*", "")
    compact = re.sub(r"[\s\\]", "", compact)
    return re.sub(r"\^\(([-+]?\d+(?:/\d+)?)\)", r"^\1", compact)


def _board_formulas(board: dict) -> set[str]:
    return {
        normalized
        for graph in board.get("graphs", [])
        for function in graph.get("functions", [])
        if (normalized := _normalize_formula(function.get("latex")))
    }


def _is_star_formula(value: object) -> bool:
    normalized = _normalize_formula(value)
    return normalized.startswith("r=") and "theta" in normalized and ("cos(5" in normalized or "sin(5" in normalized)


def _supported_formula(latex: object) -> bool:
    if not isinstance(latex, str) or not latex.strip():
        return False
    compact = re.sub(r"\s+", "", latex)
    if "=" in compact:
        if compact.count("=") != 1:
            return False
        left, right = compact.split("=", 1)
        return bool(left and right)
    return True


def _clean_actions(raw_actions: object, forbidden_formulas: set[str] | None = None) -> tuple[list[dict], bool]:
    actions: list[dict] = []
    invalid_formula = False
    if not isinstance(raw_actions, list):
        return actions, invalid_formula
    for raw in raw_actions:
        if not isinstance(raw, dict):
            continue
        action = {key: value for key, value in raw.items() if value is not None}
        if action.get("type") in {"add_function", "update_function"} and not _supported_formula(action.get("latex")):
            invalid_formula = True
            continue
        if (
            forbidden_formulas
            and action.get("type") in {"add_function", "update_function"}
            and _normalize_formula(action.get("latex")) in forbidden_formulas
        ):
            invalid_formula = True
            continue
        actions.append(action)
    return actions, invalid_formula


def _heart_alternative_action(board: dict) -> tuple[list[dict], str] | None:
    """Fallback deterministik agar feedback bentuk hati selalu benar-benar mengubah papan."""
    graphs = board.get("graphs", [])
    if not graphs:
        return ([{"type": "add_function", "graph_id": "new", "latex": "x^2+(y-|x|^(2/3))^2=1"}], "x^2+(y-|x|^(2/3))^2=1")

    existing = _board_formulas(board)
    candidates = ["x^2+(y-|x|^(2/3))^2=1", "(x^2+y^2-1)^3-x^2y^3=0"]
    latex = next((candidate for candidate in candidates if _normalize_formula(candidate) not in existing), candidates[0])
    graph = graphs[0]
    functions = graph.get("functions", [])
    target = next((function for function in reversed(functions) if function.get("kind") == "implicit"), None)
    if not target and functions:
        target = functions[-1]
    if target:
        return ([{
            "type": "update_function",
            "graph_id": graph.get("graph_id"),
            "function_id": target.get("function_id"),
            "latex": latex,
        }], latex)
    return ([{"type": "add_function", "graph_id": graph.get("graph_id"), "latex": latex}], latex)


def _replace_graph_with_star(board: dict) -> list[dict]:
    """Fallback semantik: permintaan bintang harus menghasilkan bintang, bukan sekadar aksi valid."""
    graphs = board.get("graphs", [])
    if not graphs:
        return [{"type": "add_function", "graph_id": "new", "latex": STAR_FORMULA}]
    graph = graphs[0]
    functions = graph.get("functions", [])
    if not functions:
        return [{"type": "add_function", "graph_id": graph.get("graph_id"), "latex": STAR_FORMULA}]
    actions = [{
        "type": "update_function",
        "graph_id": graph.get("graph_id"),
        "function_id": functions[0].get("function_id"),
        "latex": STAR_FORMULA,
    }]
    actions.extend({
        "type": "remove_function",
        "graph_id": graph.get("graph_id"),
        "function_id": function.get("function_id"),
    } for function in functions[1:])
    return actions


async def chat(messages: list[dict], board: dict, lang: str) -> dict:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise AiError("OPENAI_API_KEY belum diatur di apps/backend/.env", status=503)
    model = ai_config()["model"]

    # Konteks sesi disimpan di server; batasi jendela agar permintaan tetap terkendali.
    recent = messages[-HISTORY_LIMIT:]
    inputs = []
    for i, m in enumerate(recent):
        text = m.get("content", "")
        if i == len(recent) - 1 and m.get("role") == "user":
            text = f"lang: {lang}\nboard state:\n{json.dumps(board, ensure_ascii=False)}\n\nteacher: {text}"
        inputs.append({"role": "assistant" if m.get("role") == "assistant" else "user", "content": text})

    explicit_edit = _explicit_edit_request(recent)
    wants_alternative = _alternative_request(recent)
    wants_star = _star_request(recent)
    forbidden_formulas = _board_formulas(board) if wants_alternative else set()
    instructions = SYSTEM_PROMPT
    parsed: dict = {}
    actions: list[dict] = []
    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(2):
            body = {
                "model": model,
                "instructions": instructions,
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

            actions, invalid_formula = _clean_actions(parsed.get("actions", []), forbidden_formulas)
            if wants_star and not any(
                action.get("type") in {"add_function", "update_function"} and _is_star_formula(action.get("latex"))
                for action in actions
            ):
                actions = []
                invalid_formula = True
            needs_retry = attempt == 0 and (invalid_formula or (explicit_edit and not actions))
            if not needs_retry:
                break
            retry_detail = (
                " The new equation must be structurally different from every equation in the current board state."
                if wants_alternative else ""
            )
            instructions = SYSTEM_PROMPT + f"""

Your previous attempt could not be applied. Return the requested board edit now with at least one action.
Use a valid explicit function or implicit equation as described in the board-action contract.{retry_detail}"""

    conversation_text = " ".join(str(message.get("content", "")) for message in recent)
    if explicit_edit and wants_star and not actions:
        actions = _replace_graph_with_star(board)
        parsed["reply"] = (
            f"Saya langsung mengganti grafik dengan bintang lima menggunakan persamaan polar ${STAR_FORMULA}$."
            if lang == "id"
            else f"I replaced the graph with a five-point star using the polar equation ${STAR_FORMULA}$."
        )
    if explicit_edit and not actions and wants_alternative and HEART_RE.search(conversation_text):
        fallback = _heart_alternative_action(board)
        if fallback:
            actions, latex = fallback
            parsed["reply"] = (
                f"Saya langsung ganti dengan persamaan love yang berbeda: ${latex}$."
                if lang == "id"
                else f"I replaced it with a different heart equation: ${latex}$."
            )

    if explicit_edit and not actions:
        parsed["reply"] = (
            "Maaf, perubahan belum dapat diterapkan karena rumus yang dihasilkan tidak didukung papan."
            if lang == "id"
            else "Sorry, the change could not be applied because the generated formula is not supported by the board."
        )
    return {"reply": parsed.get("reply", ""), "actions": actions, "model": model}
