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
  session_id: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatSession extends ChatSessionSummary {
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface AuthUser {
  username: string;
  role: "superadmin" | "user";
  approved: boolean;
  created_at: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

const AUTH_TOKEN_KEY = "papan.auth.token";

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* penyimpanan browser tidak tersedia */
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* bukan JSON */
    }
    if (res.status === 401 && token) {
      setAuthToken(null);
      window.dispatchEvent(new Event("papan-auth-expired"));
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<LoginResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) =>
    request<{ user: AuthUser; message: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  users: () => request<{ users: AuthUser[] }>("/api/auth/users"),
  approveUser: (username: string) =>
    request<{ user: AuthUser }>(`/api/auth/users/${encodeURIComponent(username)}/approve`, { method: "PATCH" }),
  health: () => request<Health>("/api/health"),
  recognize: (image: string, model?: string) =>
    request<RecognizeResult>("/api/recognize", { method: "POST", body: JSON.stringify({ image, model }) }),
  chat: (sessionId: string | null, message: string, board: unknown, lang: string) =>
    request<AiReply>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, message, board, lang }),
    }),
  chatSessions: () => request<{ sessions: ChatSessionSummary[] }>("/api/ai/sessions"),
  chatSession: (sessionId: string) =>
    request<{ session: ChatSession }>(`/api/ai/sessions/${encodeURIComponent(sessionId)}`),
  deleteChatSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/ai/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
};
