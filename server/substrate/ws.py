from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._locks: dict[int, asyncio.Lock] = {}

    async def connect(self, canvas_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[canvas_id].add(ws)
        self._locks[id(ws)] = asyncio.Lock()
        logger.info("WS connected: canvas=%s, total=%d", canvas_id, len(self._connections[canvas_id]))

    def disconnect(self, canvas_id: str, ws: WebSocket) -> None:
        self._connections[canvas_id].discard(ws)
        self._locks.pop(id(ws), None)
        if not self._connections[canvas_id]:
            del self._connections[canvas_id]
        logger.info("WS disconnected: canvas=%s", canvas_id)

    async def send(self, ws: WebSocket, data: dict) -> None:
        lock = self._locks.get(id(ws))
        if lock is None:
            return
        async with lock:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                logger.warning("Failed to send to WS %s", id(ws))

    async def broadcast(self, canvas_id: str, data: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections.get(canvas_id, set()).copy():
            try:
                await self.send(ws, data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(canvas_id, ws)

    def get_connections(self, canvas_id: str) -> set[WebSocket]:
        return self._connections.get(canvas_id, set())
