#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/github-url-rewrite.sh"

mode="${1:-exe}"
lock_dir="${TMPDIR:-/tmp}/sealclaw-cargo-xwin.lock"
pid_file="$lock_dir/pid"
log_dir="$(dirname "$0")/../build-logs"
timestamp="$(date '+%Y%m%d-%H%M%S')"
log_file="$log_dir/tauri-build-win-${mode}-${timestamp}.log"
origin_sysroot_url="${WIN_SYSROOT_ORIGIN_URL:-https://github.com/trcrsired/windows-msvc-sysroot/releases/download/2026-01-16/windows-msvc-sysroot.tar.xz}"
rewritten_sysroot_url="$(rewrite_github_url "$origin_sysroot_url")"

if ! mkdir "$lock_dir" 2>/dev/null; then
  if [ -f "$pid_file" ] && ps -p "$(cat "$pid_file")" >/dev/null 2>&1; then
    echo "Another Windows build is already running. Stop it first." >&2
    exit 1
  fi
  rm -rf "$lock_dir"
  mkdir "$lock_dir"
fi

echo $$ > "$pid_file"

cleanup() {
  rm -rf "$lock_dir"
}

trap cleanup EXIT

mkdir -p "$log_dir"
touch "$log_file"

export PATH="/usr/bin:$HOME/Library/xPacks/@xpack-dev-tools/clang/21.1.8-1.1/.content/bin:$PATH"
export XWIN_CROSS_COMPILER=clang
export XWIN_CACHE_DIR="$HOME/.cache/cargo-xwin-msvc"
export XWIN_MSVC_SYSROOT_DOWNLOAD_URL="$rewritten_sysroot_url"
export CC_x86_64_pc_windows_msvc="/usr/bin/clang"
export CXX_x86_64_pc_windows_msvc="/usr/bin/clang++"

echo "[win-build] mode=$mode"
echo "[win-build] log=$log_file"
echo "[win-build] cache=$XWIN_CACHE_DIR"
echo "[win-build] github_mirror_prefix=$github_mirror_prefix"
echo "[win-build] origin_sysroot_url=$origin_sysroot_url"
echo "[win-build] sysroot_url=$XWIN_MSVC_SYSROOT_DOWNLOAD_URL"
echo "[win-build] cc_x86_64_pc_windows_msvc=$CC_x86_64_pc_windows_msvc"
echo "[win-build] cxx_x86_64_pc_windows_msvc=$CXX_x86_64_pc_windows_msvc"
echo "[win-build] sysroot_ready=$([ -f "$XWIN_CACHE_DIR/windows-msvc-sysroot/.ready" ] && echo yes || echo no)"

cd "$(dirname "$0")/.."

case "$mode" in
  exe)
    echo "[win-build] phase=tauri-build-no-bundle"
    npx tauri build --no-bundle --runner cargo-xwin --target x86_64-pc-windows-msvc 2>&1 | tee -a "$log_file"
    ;;
  nsis)
    echo "[win-build] phase=tauri-build-nsis"
    npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --config src-tauri/tauri.windows.nsis.conf.json 2>&1 | tee -a "$log_file"
    ;;
  *)
    echo "Unknown mode: $mode" >&2
    exit 1
    ;;
esac
