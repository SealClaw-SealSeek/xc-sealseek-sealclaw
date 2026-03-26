import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Form, Input, message, Row, Col, Segmented } from "antd";
import {
  LockOutlined,
  MobileOutlined,
  SafetyOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { authApi } from "../../api/modules/auth";
import { BRAND_LOGO_URL, BRAND_NAME } from "../../constants/brand";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    authApi
      .getStatus()
      .then((res) => {
        setStatusError("");
        if (!res.enabled) {
          navigate("/chat", { replace: true });
          return;
        }
        setHasUsers(res.has_users);
        if (!res.has_users) {
          setIsRegister(true);
        }
      })
      .catch((err) => {
        setStatusError(
          err instanceof Error ? err.message : "User Center is unavailable",
        );
      });
  }, [navigate]);

  // 验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 发送验证码
  const handleSendCode = useCallback(async () => {
    try {
      await form.validateFields(["phone"]);
    } catch {
      return;
    }

    const phone = form.getFieldValue("phone");
    setSendingCode(true);
    try {
      await authApi.sendSmsCode(phone);
      message.success(t("login.codeSent"));
      setCountdown(60);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : t("login.codeSendFailed"),
      );
    } finally {
      setSendingCode(false);
    }
  }, [form, t]);

  const onFinish = async (values: {
    username?: string;
    password: string;
    phone?: string;
    code?: string;
  }) => {
    setLoading(true);
    try {
      const raw = searchParams.get("redirect") || "/chat";
      const redirect =
        raw.startsWith("/") && !raw.startsWith("//") ? raw : "/chat";

      if (isRegister) {
        const res = await authApi.register(
          values.phone!,
          values.password,
          values.code!,
        );
        if (res.token) {
          await authApi.verify(res.token);
          message.success(t("login.registerSuccess"));
          navigate(redirect, { replace: true });
        }
      } else {
        const res = await authApi.login(values.username!, values.password);
        if (res.token) {
          await authApi.verify(res.token);
          navigate(redirect, { replace: true });
        } else {
          message.info(t("login.authNotEnabled"));
          navigate(redirect, { replace: true });
        }
      }
    } catch (err) {
      message.error(
        isRegister
          ? err instanceof Error
            ? err.message
            : t("login.registerFailed")
          : t("login.failed"),
      );
    } finally {
      setLoading(false);
    }
  };

  // 切换登录/注册
  const handleModeSwitch = (value: string) => {
    const toRegister = value === "register";
    setIsRegister(toRegister);
    form.resetFields();
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: 420,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        {/* 顶部品牌区域 */}
        <div
          style={{
            padding: "32px 32px 20px",
            textAlign: "center",
          }}
        >
          <img
            src={BRAND_LOGO_URL}
            alt={BRAND_NAME}
            style={{ height: 52, marginBottom: 12 }}
          />
          <h2
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 22,
              color: "#1a1a2e",
            }}
          >
            {BRAND_NAME}
          </h2>
          {!hasUsers && (
            <p style={{ margin: "8px 0 0", color: "#888", fontSize: 13 }}>
              {t("login.firstUserHint")}
            </p>
          )}
          {statusError && (
            <p style={{ margin: "8px 0 0", color: "#c62828", fontSize: 13 }}>
              {statusError}
            </p>
          )}
        </div>

        {/* 分段切换器 */}
        <div style={{ padding: "0 32px 16px", display: "flex", justifyContent: "center" }}>
          <Segmented
            block
            value={isRegister ? "register" : "login"}
            onChange={handleModeSwitch}
            options={[
              { label: t("login.submit"), value: "login" },
              { label: t("login.register"), value: "register" },
            ]}
            style={{ width: "100%" }}
          />
        </div>

        {/* 表单区域 */}
        <div style={{ padding: "0 32px 32px" }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
            requiredMark={false}
          >
            {isRegister ? (
              <>
                {/* 注册表单：手机号 + 验证码 + 密码 */}
                <Form.Item
                  name="phone"
                  rules={[
                    { required: true, message: t("login.phoneRequired") },
                    {
                      pattern: /^1[3-9]\d{9}$/,
                      message: t("login.phoneInvalid"),
                    },
                  ]}
                >
                  <Input
                    prefix={<MobileOutlined style={{ color: "#999" }} />}
                    placeholder={t("login.phonePlaceholder")}
                    autoFocus
                    maxLength={11}
                    style={{ borderRadius: 8 }}
                  />
                </Form.Item>

                <Form.Item
                  name="code"
                  rules={[
                    { required: true, message: t("login.codeRequired") },
                  ]}
                >
                  <Row gutter={8}>
                    <Col flex="auto">
                      <Input
                        prefix={<SafetyOutlined style={{ color: "#999" }} />}
                        placeholder={t("login.codePlaceholder")}
                        maxLength={6}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col flex="none">
                      <Button
                        onClick={handleSendCode}
                        loading={sendingCode}
                        disabled={countdown > 0}
                        style={{ height: 40, minWidth: 120, borderRadius: 8 }}
                      >
                        {countdown > 0
                          ? t("login.codeCountdown", { seconds: countdown })
                          : t("login.sendCode")}
                      </Button>
                    </Col>
                  </Row>
                </Form.Item>

                <Form.Item
                  name="password"
                  rules={[
                    { required: true, message: t("login.passwordRequired") },
                    { min: 6, max: 32, message: t("login.passwordLengthHint") },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: "#999" }} />}
                    placeholder={t("login.passwordPlaceholder")}
                    style={{ borderRadius: 8 }}
                  />
                </Form.Item>
              </>
            ) : (
              <>
                {/* 登录表单：用户名/手机号 + 密码 */}
                <Form.Item
                  name="username"
                  rules={[
                    { required: true, message: t("login.usernameRequired") },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: "#999" }} />}
                    placeholder={t("login.usernamePlaceholder")}
                    autoFocus
                    style={{ borderRadius: 8 }}
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  rules={[
                    { required: true, message: t("login.passwordRequired") },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: "#999" }} />}
                    placeholder={t("login.passwordPlaceholder")}
                    style={{ borderRadius: 8 }}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 44,
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {isRegister ? t("login.register") : t("login.submit")}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}
