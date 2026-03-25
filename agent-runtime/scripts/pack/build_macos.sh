#!/usr/bin/env bash
# One-click build: wheel -> conda-pack -> Tauri binary -> SealClaw.app
# Requires: conda, node/npm, Rust/cargo. Optional: icon.icns in assets/.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
PACK_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="${DIST:-dist}"
ARCHIVE="${DIST}/sealclaw-env.tar.gz"
APP_NAME="SealClaw"
APP_DIR="${DIST}/${APP_NAME}.app"

echo "== Building wheel (includes console frontend) =="
# Skip wheel_build if dist already has a wheel for current version
VERSION_FILE="${REPO_ROOT}/src/sealclaw/__version__.py"
CURRENT_VERSION=""
if [[ -f "${VERSION_FILE}" ]]; then
  CURRENT_VERSION="$(
    sed -n 's/^__version__[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
      "${VERSION_FILE}" 2>/dev/null
  )"
fi
if [[ -n "${CURRENT_VERSION}" ]]; then
  shopt -s nullglob
  whls=("${REPO_ROOT}/dist/sealclaw-${CURRENT_VERSION}-"*.whl)
  if [[ ${#whls[@]} -gt 0 ]]; then
    echo "dist/ already has wheel for version ${CURRENT_VERSION}, skipping."
  else
    # Clean up old wheels to avoid confusion
    old_whls=("${REPO_ROOT}/dist/sealclaw-"*.whl)
    if [[ ${#old_whls[@]} -gt 0 ]]; then
      echo "Removing old wheel files: ${old_whls[*]}"
      rm -f "${old_whls[@]}"
    fi
    bash scripts/wheel_build.sh
  fi
else
  bash scripts/wheel_build.sh
fi

echo "== Building conda-packed env =="
python "${PACK_DIR}/build_common.py" --output "$ARCHIVE" --format tar.gz --extras "ollama"

echo "== Building .app bundle =="
rm -rf "$APP_DIR"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Unpack conda env into Resources/env
mkdir -p "${APP_DIR}/Contents/Resources/env"
tar -xzf "$ARCHIVE" -C "${APP_DIR}/Contents/Resources/env" --strip-components=0

# Fix paths for portability (required or app will crash on launch)
if [[ -x "${APP_DIR}/Contents/Resources/env/bin/conda-unpack" ]]; then
  (cd "${APP_DIR}/Contents/Resources/env" && ./bin/conda-unpack)
fi

# 编译 Tauri 二进制（custom-protocol 会将前端编译进二进制）
DESKTOP_CLIENT_DIR="${REPO_ROOT}/../desktop-client"
echo "== Building Tauri binary =="
(cd "$DESKTOP_CLIENT_DIR" && npm install && npm run build)
(cd "$DESKTOP_CLIENT_DIR/src-tauri" && cargo build --release)

# 将 Tauri 二进制复制到 .app/Contents/MacOS/（替换 bash 脚本启动器）
TAURI_BIN="${DESKTOP_CLIENT_DIR}/src-tauri/target/release/sealclaw-desktop"
if [[ ! -f "$TAURI_BIN" ]]; then
  echo "ERROR: Tauri binary not found at $TAURI_BIN"
  exit 1
fi
cp "$TAURI_BIN" "${APP_DIR}/Contents/MacOS/${APP_NAME}"
chmod +x "${APP_DIR}/Contents/MacOS/${APP_NAME}"

# Icon: use pre-generated icon.icns
if [[ -f "${PACK_DIR}/assets/icon.icns" ]]; then
  echo "== Using pre-generated icon.icns =="
else
  echo "Warning: icon.icns not found at ${PACK_DIR}/assets/icon.icns"
  echo "Generate it first: bash scripts/pack/generate_icons.sh"
fi

# Info.plist (include icon key if icon.icns exists)
# Prioritize version from __version__.py to ensure accuracy
VERSION="${CURRENT_VERSION}"
if [[ -z "${VERSION}" ]]; then
  # Fallback: try to get version from packed env metadata
  VERSION="$("${APP_DIR}/Contents/Resources/env/bin/python" -c \
    "from importlib.metadata import version; print(version('sealclaw'))" 2>/dev/null \
    || echo "0.0.0")"
  echo "Using version from packed env metadata: ${VERSION}"
else
  echo "Version determined from __version__.py: ${VERSION}"
fi
ICON_PLIST=""
if [[ -f "${PACK_DIR}/assets/icon.icns" ]]; then
  cp "${PACK_DIR}/assets/icon.icns" "${APP_DIR}/Contents/Resources/"
  ICON_PLIST="<key>CFBundleIconFile</key><string>icon.icns</string>
  "
fi
cat > "${APP_DIR}/Contents/Info.plist" << INFOPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" \
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.sealclaw.desktop</string>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  ${ICON_PLIST}<key>NSHighResolutionCapable</key><true/>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSDesktopFolderUsageDescription</key><string>SealClaw may access files in your Desktop folder if you use file-related features. You can choose Don'\''t Allow; the app will still run with limited file access.</string>
</dict>
</plist>
INFOPLIST

echo "== Built ${APP_DIR} =="
# Optional: create zip for distribution (set CREATE_ZIP=1)
if [[ -n "${CREATE_ZIP}" ]]; then
  ZIP_NAME="${DIST}/SealClaw-${VERSION}-macOS.zip"
  ditto -c -k --sequesterRsrc --keepParent "${APP_DIR}" "${ZIP_NAME}"
  echo "== Created ${ZIP_NAME} =="
fi

# Optional: create DMG for distribution (set CREATE_DMG=1)
if [[ -n "${CREATE_DMG}" ]]; then
  DMG_NAME="${DIST}/SealClaw-${VERSION}-macOS.dmg"
  # create-dmg 在目标文件已存在时会报错，先清理
  rm -f "$DMG_NAME"
  # create-dmg 对 "no icons found" 等非致命问题返回退出码 2，需容错
  create-dmg \
    --volname "SealClaw ${VERSION}" \
    --volicon "${PACK_DIR}/assets/icon.icns" \
    --window-pos 200 120 \
    --window-size 660 400 \
    --icon-size 80 \
    --icon "SealClaw.app" 180 200 \
    --app-drop-link 480 200 \
    --no-internet-enable \
    "$DMG_NAME" \
    "$APP_DIR" \
    || test $? -eq 2
  echo "== Created ${DMG_NAME} =="
fi
