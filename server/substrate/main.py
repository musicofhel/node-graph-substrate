from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from substrate.ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

manager = ConnectionManager()
redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_url = "redis://redis:6379/0"
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    await redis_client.ping()
    logger.info("Redis connected")
    yield
    if redis_client:
        await redis_client.aclose()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def stream_reader(canvas_id: str, ws: WebSocket):
    last_id = "$"
    while True:
        try:
            result = await redis_client.xread(
                {"demo:counter": last_id}, block=5000, count=10
            )
            if not result:
                continue
            for stream_name, entries in result:
                for entry_id, fields in entries:
                    last_id = entry_id
                    try:
                        payload = json.loads(fields.get("data", "{}"))
                    except (json.JSONDecodeError, TypeError):
                        payload = fields
                    await manager.send(ws, {
                        "type": "stream_event",
                        "node_id": "n1",
                        "payload": payload,
                    })
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Stream reader error: %s", e)
            await asyncio.sleep(1)


@app.websocket("/ws/canvas/{canvas_id}")
async def ws_endpoint(ws: WebSocket, canvas_id: str):
    await manager.connect(canvas_id, ws)
    reader_task = asyncio.create_task(stream_reader(canvas_id, ws))
    try:
        while True:
            data = await ws.receive_text()
            logger.info("Received from client: %s", data[:200])
    except WebSocketDisconnect:
        pass
    finally:
        reader_task.cancel()
        try:
            await reader_task
        except asyncio.CancelledError:
            pass
        manager.disconnect(canvas_id, ws)
