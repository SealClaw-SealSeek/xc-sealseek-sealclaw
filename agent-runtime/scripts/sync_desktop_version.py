#!/usr/bin/env python3
"""Sync desktop packaging versions from the Python package version."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = REPO_ROOT / "src" / "sealclaw" / "__version__.py"
TAURI_CONF = REPO_ROOT.parent / "desktop-client" / "src-tauri" / "tauri.conf.json"
CARGO_TOML = REPO_ROOT.parent / "desktop-client" / "src-tauri" / "Cargo.toml"

VERSION_PATTERN = re.compile(r'__version__\s*=\s*"([^"]+)"')
PEP440_PATTERN = re.compile(
    r"^(?P<core>\d+\.\d+\.\d+)"
    r"(?:(?P<stage>a|b|rc)(?P<stage_num>\d+))?$"
)

STAGE_MAP = {
    "a": "alpha",
    "b": "beta",
    "rc": "rc",
}


def read_python_version() -> str:
    content = VERSION_FILE.read_text(encoding="utf-8")
    match = VERSION_PATTERN.search(content)
    if not match:
        raise ValueError(f"Failed to extract __version__ from {VERSION_FILE}")
    return match.group(1)


def pep440_to_desktop_version(version: str) -> str:
    match = PEP440_PATTERN.fullmatch(version)
    if not match:
        raise ValueError(
            "Unsupported Python version format for desktop packaging: "
            f"{version}. Expected final or a/b/rc prerelease, e.g. 1.2.3 or 1.2.3b4."
        )

    core = match.group("core")
    stage = match.group("stage")
    if not stage:
        return core

    stage_num = match.group("stage_num")
    return f"{core}-{STAGE_MAP[stage]}.{stage_num}"


def sync_tauri_conf(version: str) -> None:
    data = json.loads(TAURI_CONF.read_text(encoding="utf-8"))
    if data.get("version") == version:
        return
    data["version"] = version
    TAURI_CONF.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sync_cargo_toml(version: str) -> None:
    content = CARGO_TOML.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'(?m)^(version\s*=\s*")[^"]+(")$',
        rf"\g<1>{version}\2",
        content,
        count=1,
    )
    if count != 1:
        raise ValueError(f"Failed to update Cargo version in {CARGO_TOML}")
    if updated != content:
        CARGO_TOML.write_text(updated, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync desktop build version from agent-runtime __version__.",
    )
    parser.add_argument(
        "--field",
        choices=["python", "desktop"],
        help="Print a single version field and exit.",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Update Tauri/Cargo version fields to the derived desktop version.",
    )
    parser.add_argument(
        "--github-output",
        help="Append python_version and desktop_version to a GitHub Actions output file.",
    )
    args = parser.parse_args()

    python_version = read_python_version()
    desktop_version = pep440_to_desktop_version(python_version)

    if args.sync:
        sync_tauri_conf(desktop_version)
        sync_cargo_toml(desktop_version)

    if args.github_output:
        output_path = Path(args.github_output)
        with output_path.open("a", encoding="utf-8") as fh:
            fh.write(f"python_version={python_version}\n")
            fh.write(f"desktop_version={desktop_version}\n")

    if args.field == "python":
        print(python_version)
    elif args.field == "desktop":
        print(desktop_version)
    elif not args.sync and not args.github_output:
        print(desktop_version)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
