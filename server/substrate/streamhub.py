from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict

import redis.asyncio as aioredis
from fastapi import WebSocket

from substrate.ws import ConnectionManager

logger = logging.getLogger(__name__)


class StreamHub:
    def __init__(self, redis: aioredis.Redis, manager: ConnectionManager):
        self.redis = redis
        self.manager = manager
        self._subs: dict[str, dict[WebSocket, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._tasks: dict[str, asyncio.Task] = {}
        self._last_ids: dict[str, str] = {}

    def subscribe(self, stream: str, ws: WebSocket, node_id: str) -> None:
        self._subs[stream][ws].add(node_id)
        if stream not in self._tasks or self._tasks[stream].done():
            self._tasks[stream] = asyncio.create_task(
                self._reader(stream), name=f"stream:{stream}"
            )
            logger.info("Started reader for stream: %s", stream)

    def unsubscribe_all(self, ws: WebSocket) -> None:
        empty_streams = []
        for stream, ws_map in self._subs.items():
            ws_map.pop(ws, None)
            if not ws_map:
                empty_streams.append(stream)
        for stream in empty_streams:
            task = self._tasks.pop(stream, None)
            if task and not task.done():
                task.cancel()
                logger.info("Cancelled reader for stream: %s", stream)
            self._subs.pop(stream, None)

    async def _reader(self, stream: str) -> None:
        last_id = self._last_ids.get(stream, "$")
        while True:
            try:
                result = await self.redis.xread(
                    {stream: last_id}, block=5000, count=50
                )
                if not result:
                    continue

                for stream_name, entries in result:
                    for entry_id, fields in entries:
                        last_id = entry_id
                        self._last_ids[stream] = entry_id

                        raw = fields.get("data") or fields.get("payload")
                        try:
                            payload = json.loads(raw) if raw else dict(fields)
                        except (json.JSONDecodeError, TypeError):
                            payload = dict(fields)

                        ws_map = self._subs.get(stream, {})
                        dead: set[WebSocket] = set()
                        for ws, node_ids in list(ws_map.items()):
                            for node_id in list(node_ids):
                                try:
                                    await self.manager.send(ws, {
                                        "type": "stream_event",
                                        "node_id": node_id,
                                        "stream": stream,
                                        "cursor": entry_id,
                                        "payload": payload,
                                        "ts": time.time(),
                                    })
                                except Exception:
                                    dead.add(ws)
                        for ws in dead:
                            self.unsubscribe_all(ws)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("StreamHub reader error for %s: %s", stream, e)
                await asyncio.sleep(1)

    async def shutdown(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        for task in self._tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tasks.clear()
        self._subs.clear()
