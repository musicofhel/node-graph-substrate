from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from substrate import crud
from substrate.db import close_pool, create_pool, run_migrations
from substrate.schemas import ConfigUpdate, GraphCreate, GraphOps, ProjectCreate
from substrate.ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

manager = ConnectionManager()
redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    await redis_client.ping()
    logger.info("Redis connected")

    await create_pool()
    await run_migrations()

    yield

    await close_pool()
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


# --- Project routes ---


@app.post("/api/projects")
async def create_project(body: ProjectCreate):
    try:
        project = await crud.create_project(body.slug, body.display_name)
        return {k: str(v) for k, v in project.items()}
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(409, "Project slug already exists")
        raise


# --- Graph routes ---


@app.post("/api/graphs")
async def create_graph(body: GraphCreate):
    graph = await crud.create_graph(body.project_id, body.name)
    return {k: str(v) for k, v in graph.items()}


@app.get("/api/graphs/{graph_id}")
async def get_graph(graph_id: str):
    graph = await crud.get_graph(graph_id)
    if not graph:
        raise HTTPException(404, "Graph not found")
    return graph


@app.patch("/api/graphs/{graph_id}/ops")
async def apply_graph_ops(graph_id: str, body: GraphOps):
    try:
        result = await crud.apply_ops(graph_id, body)
        return result
    except crud.OptimisticLockError as e:
        current_graph = await crud.get_graph(graph_id)
        raise HTTPException(409, detail={
            "error": "version_conflict",
            "current_version": e.current_version,
            "current_state": current_graph,
        })
    except ValueError as e:
        raise HTTPException(404, str(e))


# --- Node config ---


@app.patch("/api/nodes/{node_id}/config")
async def update_config(node_id: str, body: ConfigUpdate):
    await crud.update_node_config(node_id, body.config)
    return {"ok": True}


# --- WebSocket ---


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
