from __future__ import annotations

import asyncio


async def open_tcp_connection(host: str, port: int, timeout_seconds: float = 3.0):
    """Open an asyncio TCP connection with a timeout."""

    return await asyncio.wait_for(asyncio.open_connection(host=host, port=port), timeout=timeout_seconds)
