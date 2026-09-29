import { useEffect, useState } from "react";
import { Check, Loader2, ShieldCheck, UserRound, X } from "lucide-react";
import { api, type AuthUser } from "../api";
import { useI18n } from "../i18n";

export function UserManagement({ onClose }: { onClose: () => void }) {
  const { lang } = useI18n();
  const c = lang === "id" ? ID : EN;
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.users().then((result) => setUsers(result.users)).catch((err) => setError((err as Error).message)).finally(() => setLoading(false));
  }, []);

  const approve = async (username: string) => {
    setApproving(username);
    setError("");
    try {
      const { user } = await api.approveUser(username);
      setUsers((current) => current.map((item) => item.username === username ? user : item));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApproving("");
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal user-admin-modal">
        <header className="user-admin-header">
          <div><ShieldCheck size={20} /><h2>{c.title}</h2></div>
          <button className="icon-btn" title={c.close} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="modal-body">
          <p className="muted">{c.description}</p>
          {error && <div className="auth-error">{error}</div>}
          {loading ? <div className="user-admin-loading"><Loader2 size={24} className="spin" /></div> : (
            <div className="user-list">
              {users.map((user) => (
                <div className="user-row" key={user.username}>
                  <div className="user-avatar"><UserRound size={18} /></div>
                  <div className="user-info">
                    <strong>{user.username}</strong>
                    <span>{user.role === "superadmin" ? "Superadmin" : c.registered} · {formatDate(user.created_at, lang)}</span>
                  </div>
                  <span className={`user-status ${user.approved ? "approved" : "pending"}`}>
                    {user.approved ? <Check size={13} /> : null}{user.approved ? c.approved : c.pending}
                  </span>
                  {!user.approved && (
                    <button className="btn approve-btn" disabled={approving === user.username} onClick={() => approve(user.username)}>
                      {approving === user.username ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{c.approve}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string, lang: "id" | "en") {
  if (!value) return "-";
  return new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}

const ID = { title: "Kelola pengguna", description: "Setujui akun baru agar pengguna dapat masuk.", registered: "terdaftar", approved: "Aktif", pending: "Menunggu", approve: "Setujui", close: "Tutup" };
const EN: typeof ID = { title: "Manage users", description: "Approve new accounts so users can sign in.", registered: "registered", approved: "Active", pending: "Pending", approve: "Approve", close: "Close" };
