#!/usr/bin/env bash
# Build a wheel package. Optionally includes console frontend if console/ exists.
# Run from repo root: bash scripts/wheel_build.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONSOLE_DIR="$REPO_ROOT/console"
CONSOLE_DEST="$REPO_ROOT/src/sealclaw/console"

# Tauri 方案下前端由二进制提供，console/ 目录可能不存在
if [[ -d "$CONSOLE_DIR" ]]; then
  echo "[wheel_build] Building console frontend..."
  (cd "$CONSOLE_DIR" && npm ci)
  (cd "$CONSOLE_DIR" && npm run build)

  echo "[wheel_build] Copying console/dist/* -> src/sealclaw/console/..."
  rm -rf "$CONSOLE_DEST"/*
  mkdir -p "$CONSOLE_DEST"
  cp -R "$CONSOLE_DIR/dist/"* "$CONSOLE_DEST/"
else
  echo "[wheel_build] console/ not found, skipping frontend build (Tauri mode)"
  mkdir -p "$CONSOLE_DEST"
fi

echo "[wheel_build] Building wheel + sdist..."
python3 -m pip install --quiet build
rm -rf dist/*
python3 -m build --outdir dist .

echo "[wheel_build] Done. Wheel(s) in: $REPO_ROOT/dist/"
