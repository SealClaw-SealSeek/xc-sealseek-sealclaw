import {
  getApiToken,
  getUserCenterApiUrl,
  setAuthContext,
  updateAuthContext,
  type AuthContext,
} from "../config";

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  username: string;
  tenantId?: string;
  scopes?: string[];
  featureFlags?: string[];
  message?: string;
}

export interface AuthStatusResponse {
  enabled: boolean;
  has_users: boolean;
}

export interface VerifyResponse {
  valid: boolean;
  user: {
    id: string;
    username: string;
    displayName: string;
    tenantId: string;
    scopes: string[];
    featureFlags: string[];
  };
}

function mapLoginResponse(payload: any): LoginResponse {
  return {
    token: payload.accessToken,
    refreshToken: payload.refreshToken,
    username: payload.username,
    tenantId: payload.tenantId,
    scopes: payload.scopes || [],
    featureFlags: payload.featureFlags || [],
  };
}

function extractErrorMessage(payload: any, fallback: string): string {
  return payload?.message || payload?.detail || payload?.error || fallback;
}

async function authenticate(
  path: string,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(getUserCenterApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(err, "Authentication failed"));
  }
  const mapped = mapLoginResponse(await res.json());
  const context: AuthContext = {
    token: mapped.token,
    refreshToken: mapped.refreshToken,
    username: mapped.username,
    tenantId: mapped.tenantId,
    scopes: mapped.scopes,
    featureFlags: mapped.featureFlags,
  };
  setAuthContext(context);
  return mapped;
}

export const authApi = {
  login: (username: string, password: string): Promise<LoginResponse> =>
    authenticate("/auth/login", username, password),

  register: (username: string, password: string): Promise<LoginResponse> =>
    authenticate("/auth/register", username, password),

  getStatus: async (): Promise<AuthStatusResponse> => {
    const res = await fetch(getUserCenterApiUrl("/auth/status"));
    if (!res.ok) throw new Error("Failed to check auth status");
    const payload = await res.json();
    return {
      enabled: !!payload.enabled,
      has_users: !!payload.hasUsers,
    };
  },

  verify: async (token: string = getApiToken()): Promise<VerifyResponse> => {
    const res = await fetch(getUserCenterApiUrl("/auth/verify"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err, "Token verification failed"));
    }
    const payload = (await res.json()) as VerifyResponse;
    updateAuthContext({
      token,
      userId: payload.user.id,
      username: payload.user.username,
      displayName: payload.user.displayName,
      tenantId: payload.user.tenantId,
      scopes: payload.user.scopes,
      featureFlags: payload.user.featureFlags,
    });
    return payload;
  },
};
