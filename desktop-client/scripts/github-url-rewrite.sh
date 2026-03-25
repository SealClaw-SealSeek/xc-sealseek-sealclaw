#!/usr/bin/env bash

github_mirror_prefix="${GITHUB_MIRROR_PREFIX:-https://v6.gh-proxy.org/}"

rewrite_github_url() {
  local input_url="$1"
  local normalized_prefix="${github_mirror_prefix%/}/"

  if [[ "$input_url" == https://gh-proxy.com/https://* ]] \
    || [[ "$input_url" == https://v6.gh-proxy.org/https://* ]] \
    || [[ "$input_url" == https://edgeone.gh-proxy.com/https://* ]] \
    || [[ "$input_url" == https://ghfast.top/https://* ]] \
    || [[ "$input_url" == https://ghproxy.net/https://* ]]; then
    printf '%s\n' "$input_url"
    return 0
  fi

  if [[ "$input_url" == https://github.com/* ]] \
    || [[ "$input_url" == https://raw.githubusercontent.com/* ]] \
    || [[ "$input_url" == https://objects.githubusercontent.com/* ]] \
    || [[ "$input_url" == https://github-releases.githubusercontent.com/* ]] \
    || [[ "$input_url" == https://api.github.com/* ]]; then
    printf '%s%s\n' "$normalized_prefix" "$input_url"
    return 0
  fi

  printf '%s\n' "$input_url"
}
