declare const BASE_URL: string;
declare const USER_CENTER_BASE: string;
declare const TOKEN: string;

const AUTH_TOKEN_KEY = "copaw_auth_token";
const AUTH_CONTEXT_KEY = "sealclaw_auth_context";

export interface AuthContext {
  token: string;
  refreshToken?: string;
  username?: string;
  tenantId?: string;
  scopes?: string[];
  featureFlags?: string[];
  userId?: string;
  displayName?: string;
}

function normaliseBaseUrl(value: string | undefined): string {
  return (value || "").replace(/\/+$/, "");
}

export function getRuntimeBaseUrl(): string {
  return normaliseBaseUrl(BASE_URL || "");
}

export function getUserCenterBaseUrl(): string {
  return normaliseBaseUrl(USER_CENTER_BASE || "");
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getRuntimeBaseUrl()}/api/v1${normalizedPath}`;
}

export function getUserCenterApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getUserCenterBaseUrl()}/api/v1${normalizedPath}`;
}

export function getAuthContext(): AuthContext | null {
  const raw = localStorage.getItem(AUTH_CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthContext;
  } catch {
    return null;
  }
}

export function getApiToken(): string {
  const context = getAuthContext();
  if (context?.token) return context.token;
  const stored = localStorage.getItem(AUTH_TOKEN_KEY);
  if (stored) return stored;
  return typeof TOKEN !== "undefined" ? TOKEN : "";
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  const context = getAuthContext() || { token };
  context.token = token;
  localStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context));
}

export function setAuthContext(context: AuthContext): void {
  localStorage.setItem(AUTH_TOKEN_KEY, context.token);
  localStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context));
}

export function updateAuthContext(patch: Partial<AuthContext>): void {
  const current = getAuthContext() || { token: getApiToken() };
  const next = { ...current, ...patch };
  if (next.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, next.token);
  }
  localStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(next));
}

export function getRuntimeHeaders(extra?: HeadersInit): Headers {
  const headers = extra instanceof Headers ? extra : new Headers(extra);
  const token = getApiToken();
  const context = getAuthContext();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (context?.userId) {
    headers.set("X-User-Id", context.userId);
  }
  if (context?.tenantId) {
    headers.set("X-Tenant-Id", context.tenantId);
  }
  if (context?.scopes?.length) {
    headers.set("X-Scopes", context.scopes.join(","));
  }
  if (context?.featureFlags?.length) {
    headers.set("X-Feature-Flags", context.featureFlags.join(","));
  }
  headers.set("X-Workspace-Id", "default");

  try {
    const agentStorage = localStorage.getItem("copaw-agent-storage");
    if (agentStorage) {
      const parsed = JSON.parse(agentStorage);
      const selectedAgent = parsed?.state?.selectedAgent;
      if (selectedAgent) {
        headers.set("X-Agent-Id", selectedAgent);
      }
    }
  } catch (error) {
    console.warn("Failed to get selected agent from storage:", error);
  }

  return headers;
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_CONTEXT_KEY);
}
