import { useState, type FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, Languages, Loader2, LockKeyhole, PenLine, UserRound } from "lucide-react";
import { api, setAuthToken, type AuthUser } from "../api";
import { useI18n } from "../i18n";

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthPage({ onAuthenticated }: Props) {
  const { lang, setLang } = useI18n();
  const copy = lang === "id" ? ID : EN;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setRegistered(false);
    setPassword("");
    setConfirm("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) {
      setError(copy.passwordMismatch);
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
        setRegistered(true);
        setPassword("");
        setConfirm("");
      } else {
        const result = await api.login(username, password);
        setAuthToken(result.token);
        onAuthenticated(result.user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-lang" role="group" aria-label="Language">
        <Languages size={15} />
        {(["id", "en"] as const).map((item) => (
          <button key={item} className={lang === item ? "active" : ""} onClick={() => setLang(item)}>
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      <section className="auth-hero" aria-label={copy.productName}>
        <div className="auth-brand-mark"><PenLine size={52} /></div>
        <h1>Papan Tulis <span>Digital</span></h1>
        <p>{copy.tagline}</p>
        <div className="auth-math" aria-hidden="true">
          <span className="formula quadratic">y = ax² + bx + c</span>
          <span className="formula circle">A = πr²</span>
          <svg viewBox="0 0 620 430" role="img">
            <g className="grid-lines">
              {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={60 + i * 50} y1="20" x2={60 + i * 50} y2="400" />)}
              {Array.from({ length: 8 }, (_, i) => <line key={`h${i}`} x1="30" y1={40 + i * 50} x2="590" y2={40 + i * 50} />)}
            </g>
            <line className="axis" x1="55" y1="330" x2="565" y2="330" />
            <line className="axis" x1="310" y1="390" x2="310" y2="35" />
            <path className="parabola" d="M150 80 C205 290 255 330 310 330 C365 330 415 290 470 80" />
            <circle className="origin" cx="310" cy="330" r="7" />
            <text x="478" y="95">y = x²</text>
            <text x="322" y="354">(0, 0)</text>
          </svg>
        </div>
        <div className="auth-quote">{copy.quote}</div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          {registered ? (
            <div className="auth-success">
              <CheckCircle2 size={56} />
              <h2>{copy.registrationSuccess}</h2>
              <p>{copy.waitingApproval}</p>
              <button className="auth-submit" onClick={() => switchMode("login")}>{copy.backToLogin}</button>
            </div>
          ) : (
            <>
              <div className="auth-tabs" role="tablist">
                <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>{copy.login}</button>
                <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>{copy.register}</button>
              </div>
              <h2>{mode === "login" ? copy.welcome : copy.createAccount}</h2>
              <p className="auth-subtitle">{mode === "login" ? copy.loginSubtitle : copy.registerSubtitle}</p>
              <form onSubmit={submit}>
                <label>
                  <span>{copy.username}</span>
                  <div className="auth-input">
                    <UserRound size={19} />
                    <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={copy.usernamePlaceholder} required />
                  </div>
                </label>
                <label>
                  <span>{copy.password}</span>
                  <div className="auth-input">
                    <LockKeyhole size={19} />
                    <input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={copy.passwordPlaceholder} minLength={8} required />
                    <button type="button" aria-label={copy.showPassword} onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                {mode === "register" && (
                  <label>
                    <span>{copy.confirmPassword}</span>
                    <div className="auth-input">
                      <LockKeyhole size={19} />
                      <input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={copy.confirmPlaceholder} minLength={8} required />
                    </div>
                  </label>
                )}
                {error && <div className="auth-error" role="alert">{error}</div>}
                <button className="auth-submit" disabled={busy}>
                  {busy && <Loader2 size={18} className="spin" />}
                  {mode === "login" ? copy.login : copy.register}
                </button>
              </form>
              <p className="auth-switch">
                {mode === "login" ? copy.noAccount : copy.hasAccount}{" "}
                <button onClick={() => switchMode(mode === "login" ? "register" : "login")}>
                  {mode === "login" ? copy.register : copy.login}
                </button>
              </p>
              <p className="auth-approval-note">{copy.approvalNote}</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const ID = {
  productName: "Papan Tulis Digital", tagline: "Belajar matematika lebih visual, interaktif, dan mudah.",
  quote: "Matematika membuka lebih banyak kemungkinan.", login: "Masuk", register: "Daftar",
  welcome: "Selamat datang kembali", loginSubtitle: "Masuk untuk melanjutkan ke ruang belajar.",
  createAccount: "Buat akun baru", registerSubtitle: "Daftar untuk menggunakan ruang belajar digital.",
  username: "Username", usernamePlaceholder: "Masukkan username", password: "Kata sandi",
  passwordPlaceholder: "Masukkan kata sandi", confirmPassword: "Konfirmasi kata sandi",
  confirmPlaceholder: "Ulangi kata sandi", showPassword: "Tampilkan kata sandi", passwordMismatch: "Konfirmasi kata sandi tidak sama",
  noAccount: "Belum punya akun?", hasAccount: "Sudah punya akun?",
  approvalNote: "Akun baru perlu disetujui superadmin sebelum dapat masuk.",
  registrationSuccess: "Pendaftaran berhasil", waitingApproval: "Akunmu sedang menunggu persetujuan superadmin.", backToLogin: "Kembali ke halaman masuk",
};

const EN: typeof ID = {
  productName: "Digital Whiteboard", tagline: "Learn mathematics visually, interactively, and easily.",
  quote: "Mathematics opens more possibilities.", login: "Sign in", register: "Register",
  welcome: "Welcome back", loginSubtitle: "Sign in to continue to your learning space.",
  createAccount: "Create an account", registerSubtitle: "Register to use the digital learning space.",
  username: "Username", usernamePlaceholder: "Enter username", password: "Password",
  passwordPlaceholder: "Enter password", confirmPassword: "Confirm password",
  confirmPlaceholder: "Repeat password", showPassword: "Show password", passwordMismatch: "Passwords do not match",
  noAccount: "Don't have an account?", hasAccount: "Already have an account?",
  approvalNote: "New accounts must be approved by a superadmin before signing in.",
  registrationSuccess: "Registration successful", waitingApproval: "Your account is waiting for superadmin approval.", backToLogin: "Back to sign in",
};
