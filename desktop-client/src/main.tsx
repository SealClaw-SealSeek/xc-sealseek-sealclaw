import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";

function renderBootstrapMessage(title: string, detail?: string) {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f8fa;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:720px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);padding:24px;">
        <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:12px;">${title}</div>
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#374151;font-size:14px;line-height:1.6;background:#f9fafb;border-radius:12px;padding:16px;">${detail || ""}</pre>
      </div>
    </div>
  `;
}

if (typeof window !== "undefined") {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = function (...args: any[]) {
    const msg = args[0]?.toString() || "";
    if (msg.includes(":first-child") || msg.includes("pseudo class")) {
      return;
    }
    originalError.apply(console, args);
  };

  console.warn = function (...args: any[]) {
    const msg = args[0]?.toString() || "";
    if (
      msg.includes(":first-child") ||
      msg.includes("pseudo class") ||
      msg.includes("potentially unsafe")
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };

  window.addEventListener("error", (event) => {
    const detail =
      event.error?.stack ||
      event.message ||
      "Unknown startup error";
    renderBootstrapMessage("SealClaw failed to start", detail);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const detail =
      reason?.stack ||
      reason?.message ||
      (typeof reason === "string" ? reason : JSON.stringify(reason, null, 2));
    renderBootstrapMessage("SealClaw failed to start", detail);
  });
}

renderBootstrapMessage("Starting SealClaw Desktop", "Loading frontend bundle...");

try {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Missing #root element");
  }
  createRoot(root).render(<App />);
} catch (error) {
  const detail =
    error instanceof Error ? error.stack || error.message : String(error);
  renderBootstrapMessage("SealClaw failed to start", detail);
  throw error;
}
