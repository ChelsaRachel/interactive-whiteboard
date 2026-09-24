export interface Health {
  ok: boolean;
  models: { key: string; name: string }[];
  default_model: string | null;
  ai: { configured: boolean; model: string };
}

export interface RecognizeResult {
  latex: string;
  confidence: number;
  elapsed_ms: number;
  model: string;
}

export interface AiAction {
  type: "set_param" | "add_function" | "update_function" | "remove_function";
  graph_id?: string;
  function_id?: string;
  param?: string;
  value?: number;
  latex?: string;
}

export interface AiReply {
  reply: string;
  actions: AiAction[];
  model: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* bukan JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  recognize: (image: string, model?: string) =>
    request<RecognizeResult>("/api/recognize", { method: "POST", body: JSON.stringify({ image, model }) }),
  chat: (messages: { role: "user" | "assistant"; content: string }[], board: unknown, lang: string) =>
    request<AiReply>("/api/ai/chat", { method: "POST", body: JSON.stringify({ messages, board, lang }) }),
};
