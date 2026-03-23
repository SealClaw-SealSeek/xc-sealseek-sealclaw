# SealClaw Desktop

SealClaw 桌面客户端，将 Tauri 桌面外壳与 Python AI Agent 运行时打包为一个安装包。

## 项目结构

```
sealclaw-desktop/
├── desktop-client/    # Tauri 桌面客户端（React + Vite + Tauri 2）
├── agent-runtime/     # Python AI Agent 运行时（CoPaw fork）
└── packages/
    └── shared/        # @sealclaw/shared 前端共享库（API、常量、Store）
```

## 技术栈

| 模块 | 技术 |
|---|---|
| 桌面外壳 | Tauri 2 (Rust) |
| 前端 | React 18 + TypeScript + Vite + Ant Design |
| AI 运行时 | Python + LangChain |
| 共享库 | TypeScript + Zustand |

## 开发

### 环境要求

- Node.js >= 18
- Rust (最新 stable)
- Python >= 3.11

### 安装依赖

```bash
# 在 sealclaw-desktop/ 目录下
npm install

# Python 运行时依赖
cd agent-runtime
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 启动开发

```bash
# 仅前端（浏览器模式）
npm run dev:desktop

# Tauri 桌面模式
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

- **agent-runtime** (默认 `localhost:5173`) — AI 对话、Agent、工具、技能
- **user-center** (默认 `localhost:18080`) — 用户认证、租户管理
