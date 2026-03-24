# SealClaw Desktop

SealClaw 桌面客户端，将 Tauri 桌面外壳与 Python AI Agent 运行时打包为一个安装包。

## 项目结构

```
sealclaw-desktop/
├── desktop-client/        # Tauri 桌面客户端（React + Vite + Tauri 2）
├── agent-runtime/         # Python AI Agent 运行时（SealClaw fork）
└── packages/
    └── shared/            # @sealclaw/shared 前端共享库（API 类型、常量、Store）
```

## 技术栈

| 模块 | 技术 |
|---|---|
| 桌面外壳 | Tauri 2 (Rust) |
| 前端 | React 18 + TypeScript + Vite + Ant Design |
| AI 运行时 | Python + SealClaw (AgentScope) |
| 共享库 | TypeScript + Zustand |

## 功能页面

| 页面 | 说明 |
|---|---|
| Chat | AI 对话（多会话、流式输出、文件上传） |
| Login | 登录 / 手机号注册（短信验证码） |
| Agent | 智能体配置、MCP、技能、工具、工作区 |
| Settings | 模型管理、环境变量、安全规则、Token 消耗 |
| Control | 频道、会话、定时任务、心跳监控 |

## 开发

### 环境要求

- Node.js >= 18
- Rust (最新 stable)
- Python >= 3.10

### 安装依赖

```bash
# 前端依赖（在 sealclaw-desktop/ 根目录）
npm install

# Python 运行时
cd agent-runtime
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 启动开发

```bash
# 启动 Python Agent 运行时（端口 8088）
cd agent-runtime
.venv/bin/python -m sealclaw app

# 仅前端（浏览器模式，端口 1420）
npm run dev:desktop

# Tauri 桌面模式（自动启动 Vite + 编译 Rust）
cd desktop-client
npm run tauri:dev
```

### 构建

```bash
# 构建共享库
npm run build:shared

# 构建前端
npm run build:desktop

# 构建桌面安装包
cd desktop-client
npm run tauri:build
```

## 服务依赖

桌面客户端运行时需要连接两个后端服务：

| 服务 | 默认地址 | 说明 |
|---|---|---|
| agent-runtime | `localhost:8088` | AI 对话、Agent、工具、技能 |
| sealclaw-server | `localhost:18080` | 用户认证、租户管理 |

## 发版

### 添加 GitHub Remote（首次）

```bash
cd /Users/apple/SealClaw/sealclaw-desktop
git remote add github https://github.com/SealClaw-SealSeek/xc-sealseek-sealclaw.git
```

### 发布新版本

```bash
# 1. 修改版本号
#    agent-runtime/src/sealclaw/__version__.py

# 2. 提交代码
git add -A
git commit -m "release: v0.2.0"

# 3. 打 tag
git tag v0.2.0

# 4. 推送到 Gitee（代码仓库）
git push origin dev
git push origin v0.2.0

# 5. 推送到 GitHub（触发自动打包）
git push github dev
git push github v0.2.0
```

推送 tag 后 GitHub Actions 自动完成：构建 → 签名 → 创建 Release → 上传安装包到 GitHub + Gitee。

客户端自动更新：启动后 5 秒自动检查 → 发现新版本弹通知 → 用户点"立即更新" → 下载安装重启。
