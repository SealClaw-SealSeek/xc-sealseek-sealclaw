import { createGlobalStyle } from "antd-style";
import { ConfigProvider, bailianTheme } from "@agentscope-ai/design";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import jaJP from "antd/locale/ja_JP";
import ruRU from "antd/locale/ru_RU";
import type { Locale } from "antd/es/locale";
import { Button, Result, Spin, theme as antdTheme } from "antd";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/ja";
import "dayjs/locale/ru";
import MainLayout from "./layouts/MainLayout";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { UpdateProvider } from "./contexts/UpdateContext";
import LoginPage from "./pages/Login";
import { authApi } from "./api/modules/auth";
import {
  getApiToken,
  clearAuthToken,
  getRuntimeBaseUrl,
} from "./api/config";
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

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
    onStatus(`Waiting for backend to start... (${attempt})`);
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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<
    "loading" | "auth-required" | "backend-unavailable" | "ok"
  >("loading");
  const [statusMessage, setStatusMessage] = useState("Starting backend...");

  useEffect(() => {
    let cancelled = false;
    const signal = { cancelled: false };
    (async () => {
      // 先等 Python 后端就绪
      const ready = await waitForRuntime(signal, (msg) => {
        if (!cancelled) setStatusMessage(msg);
      });
      if (cancelled) return;
      if (!ready) {
        setStatus("backend-unavailable");
        return;
      }

      try {
        setStatusMessage("Checking login service...");
        const res = await withTimeout(
          authApi.getStatus(),
          5000,
          "User Center did not respond in time",
        );
        if (cancelled) return;
        if (!res.enabled) {
          setStatus("ok");
          return;
        }
        const token = getApiToken();
        if (!token) {
          setStatus("auth-required");
          return;
        }
        try {
          setStatusMessage("Verifying login session...");
          await withTimeout(
            authApi.verify(token),
            5000,
            "Session verification timed out",
          );
          if (cancelled) return;
          setStatus("ok");
        } catch {
          if (!cancelled) {
            clearAuthToken();
            setStatus("auth-required");
          }
        }
      } catch {
        if (!cancelled) setStatus("backend-unavailable");
      }
    })();
    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <Result
        icon={<Spin size="large" />}
        title="Starting SealClaw Desktop"
        subTitle={statusMessage}
      />
    );
  }
  if (status === "backend-unavailable") {
    return (
      <Result
        status="warning"
        title="Backend unavailable"
        subTitle={`SealClaw backend did not start in time. Please check if the application is installed correctly.`}
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (status === "auth-required")
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
        replace
      />
    );
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
          <Route path="/login" element={<LoginPage />} />
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
