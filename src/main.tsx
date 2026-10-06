import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import "./index.css";

// Entirely opt-in via VITE_SENTRY_DSN — unset (local dev, this sandbox, any deploy that
// hasn't configured it yet) means Sentry.init() is never called at all, not initialized with
// an empty DSN. See 06-SUPABASE-DEPLOYMENT-CHECKLIST.md for how to create a free Sentry
// project and set this on Netlify.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Conservative — this is a traffic-cost control knob, not a precision one. Revisit once
    // real traffic volume is known.
    tracesSampleRate: 0.1,
  });
}

function UncaughtErrorScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#f8f9fb",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: "white",
          border: "1px solid #fecaca",
          borderRadius: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1
          style={{ color: "#be123c", fontSize: 18, fontWeight: 700, margin: 0 }}
        >
          Something went wrong
        </h1>
        <p style={{ color: "#334155", fontSize: 14, marginTop: 12 }}>
          We've been notified and are looking into it. Try reloading the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            background: "#1b3fa0",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);

// Checked here, before App (and transitively src/lib/supabase.ts) is even imported, so a
// missing config fails as a clear, visible on-page message — not a blank screen with nothing
// but a console error nobody but a developer would think to open. This bit the project once
// already (a Netlify deploy with no env vars set produced exactly that blank page), so it's
// fixed structurally rather than just in that one deployment.
const missing = [
  !import.meta.env.VITE_SUPABASE_URL && "VITE_SUPABASE_URL",
  !import.meta.env.VITE_SUPABASE_ANON_KEY && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean) as string[];

if (missing.length > 0) {
  root.render(
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#f8f9fb",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: "white",
          border: "1px solid #fecaca",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1
          style={{ color: "#be123c", fontSize: 18, fontWeight: 700, margin: 0 }}
        >
          Configuration missing
        </h1>
        <p style={{ color: "#334155", fontSize: 14, marginTop: 12 }}>
          This deployment is missing required environment variable
          {missing.length > 1 ? "s" : ""}: <strong>{missing.join(", ")}</strong>
          .
        </p>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
          Set {missing.length > 1 ? "them" : "it"} in your hosting provider's
          environment variables (Netlify: Site configuration → Environment
          variables), then trigger a new deploy — Vite bakes these in at build
          time, so adding the variable alone isn't enough.
        </p>
      </div>
    </div>,
  );
} else {
  import("./App.tsx").then(({ default: App }) => {
    root.render(
      <StrictMode>
        <Sentry.ErrorBoundary fallback={<UncaughtErrorScreen />}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </Sentry.ErrorBoundary>
      </StrictMode>,
    );
  });
}
