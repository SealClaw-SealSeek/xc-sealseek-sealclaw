#!/usr/bin/env bash
set -euo pipefail

lock_dir="${TMPDIR:-/tmp}/sealclaw-cargo-xwin-prewarm.lock"
pid_file="$lock_dir/pid"
log_dir="$(dirname "$0")/../build-logs"
timestamp="$(date '+%Y%m%d-%H%M%S')"
log_file="$log_dir/tauri-prewarm-win-${timestamp}.log"
child_pid=""

cache_dir="${XWIN_CACHE_DIR:-$HOME/.cache/cargo-xwin-msvc}"
sysroot_dir="$cache_dir/windows-msvc-sysroot"
ready_file="$sysroot_dir/.ready"
force_clean="${WIN_PREWARM_FORCE_CLEAN:-0}"

if ! mkdir "$lock_dir" 2>/dev/null; then
  if [ -f "$pid_file" ] && ps -p "$(cat "$pid_file")" >/dev/null 2>&1; then
    echo "Another Windows prewarm is already running. Stop it first." >&2
    exit 1
  fi
  rm -rf "$lock_dir"
  mkdir "$lock_dir"
fi

echo $$ > "$pid_file"

cleanup() {
  if [ -n "${child_pid:-}" ] && ps -p "$child_pid" >/dev/null 2>&1; then
    kill "$child_pid" >/dev/null 2>&1 || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -rf "$lock_dir"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

mkdir -p "$log_dir" "$cache_dir"
touch "$log_file"

log() {
  echo "[win-prewarm] $*" | tee -a "$log_file"
}

source "$HOME/.cargo/env"
source "$(dirname "$0")/github-url-rewrite.sh"
export PATH="$HOME/Library/xPacks/@xpack-dev-tools/clang/21.1.8-1.1/.content/bin:$PATH"
export XWIN_CACHE_DIR="$cache_dir"

origin_archive_url="${WIN_SYSROOT_ORIGIN_URL:-https://github.com/trcrsired/windows-msvc-sysroot/releases/download/2026-01-16/windows-msvc-sysroot.tar.xz}"
archive_path="$cache_dir/windows-msvc-sysroot.tar.xz"

archive_url="$(rewrite_github_url "$origin_archive_url")"

log "log=$log_file"
log "cache=$cache_dir"
log "runner=manual-proxied-sysroot"
log "https_proxy=${HTTPS_PROXY:-unset}"
log "force_clean=$force_clean"
log "github_mirror_prefix=$github_mirror_prefix"
log "origin_archive_url=$origin_archive_url"
log "archive_url=$archive_url"

if [ "$force_clean" = "1" ]; then
  log "phase=clean"
  rm -rf "$sysroot_dir"
  rm -f "$archive_path"
fi

if [ -f "$ready_file" ] \
  && [ -f "$archive_path" ] \
  && [ -d "$sysroot_dir/windows-msvc-sysroot/include" ] \
  && [ -d "$sysroot_dir/windows-msvc-sysroot/lib" ]; then
  log "phase=verify"
  du -sh "$archive_path" "$sysroot_dir" | tee -a "$log_file"
  find "$sysroot_dir/windows-msvc-sysroot" -maxdepth 1 -type d | sort | tee -a "$log_file"
  log "ready=$ready_file"
  exit 0
fi

log "phase=download"
curl -L --retry 6 --retry-delay 2 -C - "$archive_url" -o "$archive_path" >>"$log_file" 2>&1 &
child_pid=$!
wait "$child_pid"
child_pid=""

log "phase=extract"
rm -rf "$sysroot_dir"
mkdir -p "$sysroot_dir"
tar -xJf "$archive_path" -C "$sysroot_dir" >>"$log_file" 2>&1 &
child_pid=$!
wait "$child_pid"
child_pid=""

log "phase=verify"
test -d "$sysroot_dir/windows-msvc-sysroot/include"
test -d "$sysroot_dir/windows-msvc-sysroot/lib"
du -sh "$archive_path" "$sysroot_dir" | tee -a "$log_file"
find "$sysroot_dir/windows-msvc-sysroot" -maxdepth 1 -type d | sort | tee -a "$log_file"
date > "$ready_file"
log "ready=$ready_file"
