from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict

import redis.asyncio as aioredis
from fastapi import WebSocket

from substrate.stream_tiers import DEFAULT_TIER, StreamTier, get_tier
from substrate.ws import ConnectionManager

logger = logging.getLogger(__name__)

TIER_BLOCK_MS: dict[StreamTier, int] = {
    "realtime": 100,
    "interactive": 5000,
    "background": 30000,
}

TIER_FLUSH_SEC: dict[StreamTier, float] = {
    "interactive": 0.5,
    "background": 5.0,
}


def _parse_payload(fields: dict[str, str]) -> dict:
    raw = fields.get("data") or fields.get("payload")
    try:
        return json.loads(raw) if raw else dict(fields)
    except (json.JSONDecodeError, TypeError):
        return dict(fields)


class StreamHub:
    def __init__(
        self,
        redis: aioredis.Redis,
        manager: ConnectionManager,
        stream_tiers: dict[str, StreamTier] | None = None,
    ):
        self.redis = redis
        self.manager = manager
        self._subs: dict[str, dict[WebSocket, set[str]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._last_ids: dict[str, str] = {}

        self._stream_tier_map: dict[str, StreamTier] = dict(stream_tiers) if stream_tiers else {}
        self._tier_streams: dict[StreamTier, set[str]] = {
            "realtime": set(),
            "interactive": set(),
            "background": set(),
        }
        self._tier_readers: dict[str, asyncio.Task] = {}
        self._tier_flushers: dict[str, asyncio.Task] = {}
        self._buffers: dict[StreamTier, dict[tuple[str, str, int], tuple[str, dict, WebSocket]]] = {
            "interactive": {},
            "background": {},
        }

    def _get_tier(self, stream: str) -> StreamTier:
        if stream in self._stream_tier_map:
            return self._stream_tier_map[stream]
        return get_tier(stream)

    def subscribe(self, stream: str, ws: WebSocket, node_id: str) -> None:
        self._subs[stream][ws].add(node_id)
        tier = self._get_tier(stream)
        is_new = stream not in self._tier_streams[tier]
        if is_new:
            self._tier_streams[tier].add(stream)
        self._ensure_tier_running(tier, restart_reader=is_new)

    def _ensure_tier_running(self, tier: StreamTier, restart_reader: bool = False) -> None:
        reader = self._tier_readers.get(tier)
        if restart_reader and reader and not reader.done():
            reader.cancel()
            reader = None
        if not reader or reader.done():
            self._tier_readers[tier] = asyncio.create_task(
                self._tier_reader(tier), name=f"tier:{tier}:reader"
            )
            logger.info("Started %s tier reader", tier)

        if tier in TIER_FLUSH_SEC:
            flusher = self._tier_flushers.get(tier)
            if not flusher or flusher.done():
                self._tier_flushers[tier] = asyncio.create_task(
                    self._tier_flusher(tier, TIER_FLUSH_SEC[tier]),
                    name=f"tier:{tier}:flusher",
                )

    def unsubscribe_all(self, ws: WebSocket) -> None:
        empty_streams: list[str] = []
        for stream, ws_map in list(self._subs.items()):
            ws_map.pop(ws, None)
            if not ws_map:
                empty_streams.append(stream)
        for stream in empty_streams:
            tier = self._get_tier(stream)
            self._tier_streams[tier].discard(stream)
            self._subs.pop(stream, None)
        ws_id = id(ws)
        for buf in self._buffers.values():
            to_delete = [k for k in buf if k[2] == ws_id]
            for k in to_delete:
                del buf[k]

    async def replay_from_cursor(
        self, stream: str, cursor: str, ws: WebSocket, node_ids: set[str]
    ) -> tuple[int, bool]:
        """Replay missed events from cursor. Returns (count, gap_detected)."""
        missed = 0
        gap = False
        try:
            check = await self.redis.xrange(stream, min=cursor, max=cursor, count=1)
            result = await self.redis.xread({stream: cursor}, count=10000)
            if not check and result:
                gap = True
            if result:
                for _stream_name, entries in result:
                    for entry_id, fields in entries:
                        missed += 1
                        payload = _parse_payload(fields)
                        for node_id in node_ids:
                            await self.manager.send(ws, {
                                "type": "stream_event",
                                "node_id": node_id,
                                "stream": stream,
                                "cursor": entry_id,
                                "payload": payload,
                                "ts": time.time(),
                            })
        except Exception as e:
            logger.error("Replay failed for %s from %s: %s", stream, cursor, e)
        return missed, gap

    async def _tier_reader(self, tier: StreamTier) -> None:
        block_ms = TIER_BLOCK_MS[tier]
        is_realtime = tier == "realtime"

        while True:
            try:
                streams = {
                    s for s in self._tier_streams.get(tier, set()) if self._subs.get(s)
                }
                if not streams:
                    await asyncio.sleep(1)
                    continue

                read_map = {s: self._last_ids.get(s, "$") for s in streams}
                result = await self.redis.xread(read_map, block=block_ms, count=50)
                if not result:
                    continue

                for stream_name, entries in result:
                    for entry_id, fields in entries:
                        self._last_ids[stream_name] = entry_id
                        payload = _parse_payload(fields)

                        if is_realtime:
                            await self._dispatch(stream_name, entry_id, payload)
                        else:
                            self._buffer_event(tier, stream_name, entry_id, payload)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("StreamHub %s reader error: %s", tier, e)
                await asyncio.sleep(1)

    def _buffer_event(
        self, tier: StreamTier, stream: str, entry_id: str, payload: dict
    ) -> None:
        buf = self._buffers[tier]
        ws_map = self._subs.get(stream, {})
        for ws, node_ids in list(ws_map.items()):
            ws_id = id(ws)
            for node_id in node_ids:
                buf[(stream, node_id, ws_id)] = (entry_id, payload, ws)

    async def _dispatch(self, stream: str, entry_id: str, payload: dict) -> None:
        ws_map = self._subs.get(stream, {})
        snapshot = [(ws, list(nids)) for ws, nids in list(ws_map.items())]
        dead: set[WebSocket] = set()
        for ws, node_ids in snapshot:
            for node_id in node_ids:
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

    async def _tier_flusher(self, tier: StreamTier, interval: float) -> None:
        while True:
            try:
                await asyncio.sleep(interval)
                buf = self._buffers.get(tier)
                if not buf:
                    continue
                snapshot = dict(buf)
                buf.clear()

                dead: set[WebSocket] = set()
                for (stream, node_id, _ws_id), (entry_id, payload, ws) in snapshot.items():
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
                logger.error("StreamHub %s flusher error: %s", tier, e)

    async def shutdown(self) -> None:
        all_tasks = list(self._tier_readers.values()) + list(self._tier_flushers.values())
        for task in all_tasks:
            task.cancel()
        for task in all_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tier_readers.clear()
        self._tier_flushers.clear()
        self._subs.clear()
        for buf in self._buffers.values():
            buf.clear()
