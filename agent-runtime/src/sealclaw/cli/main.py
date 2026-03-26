# -*- coding: utf-8 -*-
from __future__ import annotations

import importlib
import logging
import sys
import time

import click

# On Windows, force UTF-8 for stdout/stderr so cron and other commands
# can handle Chinese and other non-ASCII (Linux is UTF-8 by default).
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

logger = logging.getLogger(__name__)
# Store init timings so app_cmd can re-log after setting log level to debug.
_init_timings: list[tuple[str, float]] = []
_t0_main = time.perf_counter()
_init_timings.append(("main.py loaded", 0.0))

from ..config.utils import read_last_api  # noqa: E402
from ..__version__ import __version__  # noqa: E402

_init_timings.append(("base imports", time.perf_counter() - _t0_main))


def log_init_timings() -> None:
    """Emit init timing debug lines after setup_logger(debug) in app_cmd."""
    for label, elapsed in _init_timings:
        logger.debug("%.3fs %s", elapsed, label)


# 子命令懒加载映射：(模块路径, 导出名)
# 只有在用户实际调用对应子命令时才 import 对应模块，
# 避免 `sealclaw app` 时加载全部 14 个子命令的依赖链
_LAZY_COMMANDS: dict[str, tuple[str, str]] = {
    "app": (".app_cmd", "app_cmd"),
    "channels": (".channels_cmd", "channels_group"),
    "chats": (".chats_cmd", "chats_group"),
    "daemon": (".daemon_cmd", "daemon_group"),
    "clean": (".clean_cmd", "clean_cmd"),
    "cron": (".cron_cmd", "cron_group"),
    "env": (".env_cmd", "env_group"),
    "init": (".init_cmd", "init_cmd"),
    "models": (".providers_cmd", "models_group"),
    "skills": (".skills_cmd", "skills_group"),
    "uninstall": (".uninstall_cmd", "uninstall_cmd"),
    "desktop": (".desktop_cmd", "desktop_cmd"),
    "update": (".update_cmd", "update_cmd"),
    "shutdown": (".shutdown_cmd", "shutdown_cmd"),
    "auth": (".auth_cmd", "auth_group"),
}


class LazyGroup(click.Group):
    """按需加载子命令：只在用户实际调用时才 import 对应模块。"""

    def __init__(self, *args, lazy_commands: dict | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._lazy_commands = lazy_commands or {}

    def list_commands(self, ctx: click.Context) -> list[str]:
        # 合并已注册命令和懒加载命令
        base = list(super().list_commands(ctx))
        lazy = sorted(self._lazy_commands.keys())
        return base + [c for c in lazy if c not in base]

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        # 先检查已注册的命令
        cmd = super().get_command(ctx, cmd_name)
        if cmd is not None:
            return cmd
        # 懒加载
        if cmd_name in self._lazy_commands:
            module_path, attr_name = self._lazy_commands[cmd_name]
            t = time.perf_counter()
            mod = importlib.import_module(module_path, package=__package__)
            elapsed = time.perf_counter() - t
            _init_timings.append((f"lazy:{module_path}", elapsed))
            logger.debug("%.3fs lazy import %s", elapsed, module_path)
            return getattr(mod, attr_name)
        return None


@click.group(
    cls=LazyGroup,
    lazy_commands=_LAZY_COMMANDS,
    context_settings={"help_option_names": ["-h", "--help"]},
)
@click.version_option(version=__version__, prog_name="SealClaw")
@click.option("--host", default=None, help="API Host")
@click.option(
    "--port",
    default=None,
    type=int,
    help="API Port",
)
@click.pass_context
def cli(ctx: click.Context, host: str | None, port: int | None) -> None:
    """SealClaw CLI."""
    # default from last run if not provided
    last = read_last_api()
    if host is None or port is None:
        if last:
            host = host or last[0]
            port = port or last[1]

    # final fallback
    host = host or "127.0.0.1"
    port = port or 8088

    ctx.ensure_object(dict)
    ctx.obj["host"] = host
    ctx.obj["port"] = port
