# -*- coding: utf-8 -*-
"""Request identity context for cross-service desktop integration."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


@dataclass(frozen=True)
class RequestIdentity:
    """Normalized request identity forwarded by user-center/desktop-client."""

    user_id: str = ""
    tenant_id: str = ""
    workspace_id: str = ""
    agent_id: str = ""
    scopes: tuple[str, ...] = ()
    feature_flags: tuple[str, ...] = ()


def _split_header_values(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(part.strip() for part in value.split(",") if part.strip())


def build_request_identity(request: Request) -> RequestIdentity:
    """Build request identity from forwarded headers."""
    headers = request.headers
    return RequestIdentity(
        user_id=headers.get("X-User-Id", "").strip(),
        tenant_id=headers.get("X-Tenant-Id", "").strip(),
        workspace_id=headers.get("X-Workspace-Id", "").strip(),
        agent_id=headers.get("X-Agent-Id", "").strip(),
        scopes=_split_header_values(headers.get("X-Scopes")),
        feature_flags=_split_header_values(headers.get("X-Feature-Flags")),
    )


class RequestIdentityMiddleware(BaseHTTPMiddleware):
    """Attach normalized request identity to ``request.state``."""

    async def dispatch(self, request: Request, call_next) -> Any:
        request.state.identity = build_request_identity(request)
        if request.state.identity.user_id and not hasattr(
            request.state,
            "user",
        ):
            request.state.user = request.state.identity.user_id
        return await call_next(request)
