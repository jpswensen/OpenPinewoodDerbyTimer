from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState


class EventBus:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._clients: set[WebSocket] = set()

    async def register(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.add(websocket)

    async def unregister(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def publish(self, event_type: str, payload: Any) -> None:
        await self.broadcast({"type": event_type, "payload": payload})

    async def broadcast(self, message: dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._clients)

        if not clients:
            return

        dead: list[WebSocket] = []
        for ws in clients:
            try:
                if ws.application_state != WebSocketState.CONNECTED:
                    dead.append(ws)
                    continue
                await ws.send_json(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)


event_bus = EventBus()
