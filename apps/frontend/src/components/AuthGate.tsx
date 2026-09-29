import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { api, getAuthToken, setAuthToken, type AuthUser } from "../api";
import { AuthPage } from "./AuthPage";

interface Props {
  children: (user: AuthUser, logout: () => void) => ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => !!getAuthToken());

  useEffect(() => {
    let active = true;
    const expire = () => {
      setAuthToken(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("papan-auth-expired", expire);
    if (getAuthToken()) {
      api.me()
        .then(({ user: current }) => active && setUser(current))
        .catch(expire)
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
      window.removeEventListener("papan-auth-expired", expire);
    };
  }, []);

  const logout = () => {
    api.logout().catch(() => undefined).finally(() => {
      setAuthToken(null);
      setUser(null);
    });
  };

  if (loading) return <div className="auth-loading"><Loader2 size={28} className="spin" /></div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;
  return <>{children(user, logout)}</>;
}
