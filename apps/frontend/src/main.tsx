import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles.css";
import App from "./App";
import { I18nProvider } from "./i18n";
import { AuthGate } from "./components/AuthGate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AuthGate>
        {(user, logout) => <App user={user} onLogout={logout} />}
      </AuthGate>
    </I18nProvider>
  </StrictMode>,
);
