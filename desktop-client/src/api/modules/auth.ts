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

// 内置测试账号（后端未部署时使用，跳过 User Center 认证）
const TEST_USER = { username: "test", password: "test123" };

function mockLoginResponse(): LoginResponse {
  return {
    token: "test-token-sealclaw-desktop",
    username: TEST_USER.username,
    tenantId: "default",
    scopes: ["admin"],
    featureFlags: [],
  };
}

function isTestAccount(username: string, password: string): boolean {
  return username === TEST_USER.username && password === TEST_USER.password;
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    // 测试账号直接通过，不走后端
    if (isTestAccount(username, password)) {
      const mapped = mockLoginResponse();
      setAuthContext({
        token: mapped.token,
        username: mapped.username,
        tenantId: mapped.tenantId,
        scopes: mapped.scopes,
        featureFlags: mapped.featureFlags,
      });
      return mapped;
    }
    return authenticate("/auth/login", username, password);
  },

  sendSmsCode: async (phone: string): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(getUserCenterApiUrl("/auth/sms/send"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err, "Failed to send code"));
    }
    return res.json();
  },

  register: async (phone: string, password: string, code: string): Promise<LoginResponse> => {
    const res = await fetch(getUserCenterApiUrl("/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password, code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err, "Registration failed"));
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
  },

  getStatus: async (): Promise<AuthStatusResponse> => {
    // 桌面端：直接返回启用状态，让用户用测试账号登录
    // 后端部署后改回真实请求
    return { enabled: true, has_users: true };
  },

  verify: async (token: string = getApiToken()): Promise<VerifyResponse> => {
    // 测试 token 直接通过，不走后端验证
    if (token === "test-token-sealclaw-desktop") {
      const mockUser = {
        valid: true,
        user: {
          id: "test-user-id",
          username: TEST_USER.username,
          displayName: "Test User",
          tenantId: "default",
          scopes: ["admin"],
          featureFlags: [],
        },
      };
      updateAuthContext({
        token,
        userId: mockUser.user.id,
        username: mockUser.user.username,
        displayName: mockUser.user.displayName,
        tenantId: mockUser.user.tenantId,
        scopes: mockUser.user.scopes,
        featureFlags: mockUser.user.featureFlags,
      });
      return mockUser;
    }
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
