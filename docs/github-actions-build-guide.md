# SealClaw Desktop — GitHub Actions 打包部署指南

## 概述

本文档说明如何通过 GitHub Actions 自动构建 SealClaw Desktop 安装包：
- **macOS**：`.app` 打包为 `.zip`（Tauri 原生窗口 + conda-pack Python 环境）
- **Windows**：NSIS `.exe` 安装包（Tauri 原生窗口 + conda-pack Python 环境）

构建产物可自动上传到 GitHub Release，也可选配置上传到 Gitee Release。

---

## 前置条件

| 项目 | 说明 |
|------|------|
| GitHub 账号 | 用于创建仓库和运行 Actions |
| Gitee 仓库 | 已有：`gitee.com/xc-sealseek-ai/sealseek-sealclaw-desktop` |
| 本地 Git | 已配置好 push 权限 |

---

## 第一步：在 GitHub 创建仓库

1. 打开 https://github.com/new
2. 填写仓库信息：
   - **Repository name**：`sealclaw-desktop`（建议与 Gitee 保持对应）
   - **Visibility**：选 **Private**（私有）或 **Public**（公开），按需选择
3. **不要勾选**任何初始化选项（README / .gitignore / license），因为我们要推送已有代码
4. 点击 **Create repository**
5. 记下仓库地址，形如：`https://github.com/<用户名>/sealclaw-desktop.git`

---

## 第二步：添加 GitHub Remote 并推送代码

在终端中执行以下命令（将 `<用户名>` 替换为你的 GitHub 用户名）：

```bash
cd /Users/apple/SealClaw/sealclaw-desktop

# 1. 添加 GitHub 作为第二个远程仓库（origin 是 Gitee，github 是 GitHub）
git remote add github https://github.com/<用户名>/sealclaw-desktop.git

# 2. 暂存并提交当前改动
git add -A
git commit -m "feat: integrate Tauri binary with conda-pack packaging"

# 3. 推送到 GitHub（dev 和 main 两个分支都推）
git push github dev
git push github main
```

> **验证**：打开 `https://github.com/<用户名>/sealclaw-desktop`，确认代码已上传，
> 且 `.github/workflows/desktop-release.yml` 文件存在于仓库根目录。

---

## 第三步：手动触发 Actions 构建

1. 打开 GitHub 仓库页面，点击顶部 **Actions** 标签
2. 左侧 Workflows 列表中，找到 **SealClaw Desktop Build**
3. 点击进入后，右侧会出现 **Run workflow** 按钮
4. 选择分支（如 `dev`），点击 **Run workflow**
5. 等待构建完成（预计 15–25 分钟，首次可能更久因为无缓存）

> 手动触发只会产出 Artifacts，不会上传 GitHub Release，也不会生成 `latest.json`。

### 构建过程说明

CI 会自动完成以下步骤（macOS 和 Windows 并行）：

| 步骤 | macOS (macos-14) | Windows (windows-latest) |
|------|-------------------|--------------------------|
| 1 | Checkout 代码 | Checkout 代码 |
| 2 | 安装 Node 20 | 安装 Node 20 |
| 3 | 安装 Rust 工具链 | 安装 Rust 工具链 |
| 4 | 安装 Miniconda (Python 3.12) | 安装 Miniconda (Python 3.12) |
| 5 | — | 安装 NSIS |
| 6 | 根目录执行 `npm ci`（workspace 依赖只安装一次） | 根目录执行 `npm ci`（workspace 依赖只安装一次） |
| 7 | 同步桌面端版本（从 `__version__.py` 派生 semver） | 同步桌面端版本（从 `__version__.py` 派生 semver） |
| 8 | 构建 Python wheel + conda-pack 环境 | 构建 Python wheel + conda-pack 环境 |
| 9 | 编译 Tauri 二进制并组装产物 | 编译 Tauri 二进制并组装产物 |

---

## 第四步：下载构建产物

1. Actions 页面中，点击已完成的那次构建运行（绿色 ✓）
2. 页面底部 **Artifacts** 区域会列出：

| 产物名称 | 内容 |
|----------|------|
| `SealClaw-Desktop-macOS-0.1.0-beta.3` | `SealClaw-0.1.0-beta.3-macOS.zip`，解压得到 `SealClaw.app` |
| `SealClaw-Desktop-Windows-0.1.0-beta.3` | `SealClaw-Setup-0.1.0-beta.3.exe` NSIS 安装包 |

3. 点击下载即可

### macOS 使用方式

```bash
# 解压
unzip SealClaw-0.1.0-beta.3-macOS.zip

# 移除隔离属性（未签名应用需要）
xattr -cr SealClaw.app

# 双击打开 SealClaw.app，或：
open SealClaw.app
```

### Windows 使用方式

双击 `SealClaw-Setup-0.1.0-beta.3.exe`，按安装向导完成安装。
安装后从开始菜单或桌面快捷方式启动 **SealClaw Desktop**。

---

## 第五步（可选）：将产物转换为 DMG

如果需要 macOS DMG 格式，下载 .zip 后在本地执行：

```bash
# 解压 .app
unzip SealClaw-0.1.0-beta.3-macOS.zip

# 制作 DMG
hdiutil create \
  -volname "SealClaw Desktop" \
  -srcfolder SealClaw.app \
  -ov \
  -format UDZO \
  SealClaw-0.1.0-beta.3-macOS.dmg
```

如需 CI 中自动生成 DMG，可在 workflow 的 macOS job 中添加此步骤。

---

## 第六步（可选）：配置 Gitee Release 自动上传

### 6.1 生成 Gitee 私人令牌

1. 打开 https://gitee.com/profile/personal_access_tokens
2. 点击 **生成新令牌**
3. 权限至少勾选 `projects`
4. 生成后**立即复制**（只显示一次）

### 6.2 在 GitHub 仓库中配置 Secrets 和 Variables

进入 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**

**Secrets**（点 New repository secret）：

| Name | Value |
|------|-------|
| `GITEE_TOKEN` | 上一步生成的 Gitee 私人令牌 |

**Variables**（切到 Variables 标签，点 New repository variable）：

| Name | Value |
|------|-------|
| `GITEE_OWNER` | `xc-sealseek-ai` |
| `GITEE_REPO` | `sealseek-sealclaw-desktop` |

### 6.3 触发方式

Gitee 上传仅在 **tag 发布** 时触发，不在 `workflow_dispatch` 手动触发时执行。
流程：推送匹配版本的 tag → CI 构建 → 自动上传到 GitHub Release + Gitee Release。

---

## 第七步（可选）：配置 Gitee → GitHub 镜像同步

实现 Gitee 推送代码后自动同步到 GitHub，从而触发 GitHub Actions。

### 方式 A：Gitee 仓库镜像管理（推荐）

1. 打开 Gitee 仓库 → **管理** → **仓库镜像管理**
2. 添加镜像：
   - **镜像方向**：推送（Push）
   - **镜像仓库地址**：`https://github.com/<用户名>/sealclaw-desktop.git`
   - **个人令牌**：GitHub Personal Access Token（需要 `repo` 权限）
3. 保存后，每次推送到 Gitee 会自动同步到 GitHub

### 方式 B：GitHub Actions repo-sync

在 GitHub 仓库添加一个定时同步的 workflow，定期从 Gitee 拉取：

```yaml
# .github/workflows/sync-from-gitee.yml
name: Sync from Gitee
on:
  schedule:
    - cron: '0 */6 * * *'  # 每 6 小时同步一次
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Pull from Gitee
        run: |
          git remote add gitee https://gitee.com/xc-sealseek-ai/sealseek-sealclaw-desktop.git
          git fetch gitee
          git merge gitee/main --no-edit
          git push origin main
```

---

## 发布新版本的完整流程

日常工作流：

```
1. 在 Gitee 上开发、提交代码
2. 修改 agent-runtime/src/sealclaw/__version__.py 中的版本号
3. 代码同步到 GitHub（手动 push 或镜像自动同步）
4. 推送 Git tag：
   - Python 版本若为 `0.1.0b3`，桌面端版本会派生为 `0.1.0-beta.3`
   - 标签名必须是 `v0.1.0-beta.3`
5. 推送 tag 后自动触发 CI 构建与发布
6. 构建完成后产物自动附加到 GitHub Release
7. 如果配置了 Gitee Token，产物也会上传到 Gitee Release
```

---

## 故障排查

### CI 构建失败

1. 点击失败的 Actions 运行，查看具体哪个 step 报错
2. 常见问题：

| 错误 | 原因 | 解决 |
|------|------|------|
| `conda-pack` 失败 | Python 依赖安装问题 | 检查 `pyproject.toml` 中的依赖是否能在 CI 环境中安装 |
| `cargo build` 失败 | Rust 编译错误 | 本地先 `cargo check` 确认编译通过再推送 |
| `npm ci` 失败 | Node 依赖问题 | 检查 `package-lock.json` 是否已提交，且 workspace 依赖定义与锁文件一致 |
| `makensis` 失败 | NSIS 脚本错误 | 查看 NSIS 输出日志定位具体错误 |
| Artifact 为空 | 产物路径不匹配 | 检查 `dist/` 目录下是否有对应文件名 |

### macOS .app 打开闪退

```bash
# 查看日志
cat ~/.sealclaw/desktop.log

# 检查签名问题
xattr -cr SealClaw.app
```

### Windows 安装后无法启动

- 以管理员身份运行
- 检查 Windows Defender 是否拦截了未签名程序
- 查看安装目录下是否有 `python.exe` 和 `SealClaw Desktop.exe`

---

## 文件结构参考

### 最终 macOS .app 结构

```
SealClaw.app/Contents/
├── MacOS/
│   └── SealClaw              ← Tauri 二进制（原生窗口 + 前端编译在内）
├── Resources/
│   ├── env/                   ← conda-pack Python 环境
│   │   ├── bin/python
│   │   ├── lib/
│   │   └── ...
│   └── icon.icns
└── Info.plist
```

### 最终 Windows 安装目录结构

```
%LOCALAPPDATA%\SealClaw\
├── SealClaw Desktop.exe       ← Tauri 二进制（原生窗口 + 前端编译在内）
├── python.exe                 ← conda-pack Python 环境
├── Scripts/
├── Lib/
├── icon.ico
└── Uninstall.exe
```
