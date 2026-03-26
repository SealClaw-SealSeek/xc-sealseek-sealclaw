import { createGlobalStyle } from "antd-style";
import { ConfigProvider, bailianTheme } from "@agentscope-ai/design";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import jaJP from "antd/locale/ja_JP";
import ruRU from "antd/locale/ru_RU";
import type { Locale } from "antd/es/locale";
import { Button, theme as antdTheme } from "antd";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/ja";
import "dayjs/locale/ru";
import MainLayout from "./layouts/MainLayout";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { UpdateProvider } from "./contexts/UpdateContext";
import { getRuntimeBaseUrl } from "./api/config";
import { BRAND_NAME, BRAND_LOGO_URL } from "./constants/brand";
import "./styles/layout.css";
import "./styles/form-override.css";

const antdLocaleMap: Record<string, Locale> = {
  zh: zhCN,
  en: enUS,
  ja: jaJP,
  ru: ruRU,
};

const dayjsLocaleMap: Record<string, string> = {
  zh: "zh-cn",
  en: "en",
  ja: "ja",
  ru: "ru",
};

const GlobalStyle = createGlobalStyle`
* {
  margin: 0;
  box-sizing: border-box;
}
`;

/** 轮询等待 Python 后端就绪（最多 maxWait 毫秒） */
async function waitForRuntime(
  signal: { cancelled: boolean },
  onStatus: (msg: string) => void,
  maxWait = 30000,
  interval = 800,
): Promise<boolean> {
  const runtimeBase = getRuntimeBaseUrl();
  // 用根路径探测后端——任何 HTTP 响应（包括 404）都说明后端已就绪
  const healthUrl = runtimeBase;
  const start = Date.now();
  let attempt = 0;
  while (!signal.cancelled && Date.now() - start < maxWait) {
    attempt++;
    onStatus(`正在等待后端启动... (${attempt})`);
    try {
      await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      // 收到任何 HTTP 响应都说明后端已就绪（包括 404、500 等）
      return true;
    } catch {
      // 连接失败，继续轮询
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

function StartupScreen({
  message,
  error,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #0f1117 0%, #1a1d2e 60%, #0d1520 100%)",
        gap: 0,
        userSelect: "none",
      }}
    >
      {/* logo */}
      <img
        src={BRAND_LOGO_URL}
        alt={BRAND_NAME}
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          boxShadow: "0 8px 32px rgba(99,179,237,0.25)",
          marginBottom: 20,
          animation: error ? "none" : "logoFloat 3s ease-in-out infinite",
        }}
      />

      {/* 品牌名 */}
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "#e8eaf6",
          letterSpacing: 2,
          marginBottom: 8,
        }}
      >
        {BRAND_NAME}
      </div>

      {/* 状态区 */}
      {error ? (
        <>
          <div
            style={{
              fontSize: 13,
              color: "#fc8181",
              marginBottom: 6,
              maxWidth: 320,
              textAlign: "center",
            }}
          >
            {message}
          </div>
          <Button
            type="primary"
            size="small"
            style={{ marginTop: 16, borderRadius: 8 }}
            onClick={() => window.location.reload()}
          >
            重试
          </Button>
        </>
      ) : (
        <>
          {/* 动态点 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, marginTop: 6 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#63b3ed",
                  display: "inline-block",
                  animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#718096" }}>{message}</div>
        </>
      )}

      {/* 内联 keyframes */}
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-8px); opacity: 1; }
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "unavailable" | "ok">("loading");
  const [statusMessage, setStatusMessage] = useState("正在启动后端服务...");

  useEffect(() => {
    let cancelled = false;
    const signal = { cancelled: false };
    (async () => {
      const ready = await waitForRuntime(signal, (msg) => {
        if (!cancelled) setStatusMessage(msg);
      });
      if (cancelled) return;
      if (!ready) {
        setStatus("unavailable");
      } else {
        setStatus("ok");
      }
    })();
    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return <StartupScreen message={statusMessage} />;
  }
  if (status === "unavailable") {
    return (
      <StartupScreen
        message="后端服务未能在规定时间内启动，请检查安装是否完整。"
        error
      />
    );
  }
  return <>{children}</>;
}

function getRouterBasename(pathname: string): string | undefined {
  return /^\/console(?:\/|$)/.test(pathname) ? "/console" : undefined;
}

function AppInner() {
  const basename = getRouterBasename(window.location.pathname);
  const { i18n } = useTranslation();
  const { isDark } = useTheme();
  const lang = i18n.resolvedLanguage || i18n.language || "en";
  const [antdLocale, setAntdLocale] = useState<Locale>(
    antdLocaleMap[lang] ?? enUS,
  );

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      const shortLng = lng.split("-")[0];
      setAntdLocale(antdLocaleMap[shortLng] ?? enUS);
      dayjs.locale(dayjsLocaleMap[shortLng] ?? "en");
    };

    // Set initial dayjs locale
    dayjs.locale(dayjsLocaleMap[lang.split("-")[0]] ?? "en");

    i18n.on("languageChanged", handleLanguageChanged);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [i18n]);

  return (
    <BrowserRouter basename={basename}>
      <GlobalStyle />
      <ConfigProvider
        {...bailianTheme}
        prefix="copaw"
        prefixCls="copaw"
        locale={antdLocale}
        theme={{
          ...(bailianTheme as any)?.theme,
          algorithm: isDark
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        }}
      >
        <Routes>
          <Route
            path="/*"
            element={
              <AuthGuard>
                <MainLayout />
              </AuthGuard>
            }
          />
        </Routes>
      </ConfigProvider>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <UpdateProvider>
        <AppInner />
      </UpdateProvider>
    </ThemeProvider>
  );
}

export default App;
