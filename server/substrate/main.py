from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter

from substrate import crud
from substrate.api import api_router
from substrate.experiment_data import init_experiment_data
from substrate.h1_loop_data import init_h1_data
import substrate.components  # noqa: F401 — registers components
from substrate.db import close_pool, create_pool, run_migrations
from substrate.messages import (
    ClientMessage,
    ComputeRequest,
    ConfigUpdateMsg,
    Resubscribe,
    SubscribeWithResume,
)
from substrate.registry import registry
from substrate.sdk import Component, NodeKind
from substrate.stream_tiers import STREAM_TIERS
from substrate.streamhub import StreamHub
from substrate.ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

manager = ConnectionManager()
redis_client: aioredis.Redis | None = None
stream_hub: StreamHub | None = None
client_msg_adapter = TypeAdapter(ClientMessage)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, stream_hub
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    await redis_client.ping()
    logger.info("Redis connected")

    stream_hub = StreamHub(redis_client, manager, stream_tiers=STREAM_TIERS)

    app.state.redis_client = redis_client
    app.state.stream_hub = stream_hub

    await create_pool()
    await run_migrations()
    init_h1_data()
    init_experiment_data()

    async def _refresh_search_index():
        pool = get_pool()
        while True:
            await asyncio.sleep(30)
            try:
                await pool.execute("REFRESH MATERIALIZED VIEW search_index")
            except Exception:
                pass

    refresh_task = asyncio.create_task(_refresh_search_index())

    yield

    refresh_task.cancel()
    if stream_hub:
        await stream_hub.shutdown()
    await close_pool()
    if redis_client:
        await redis_client.aclose()


app = FastAPI(lifespan=lifespan)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- WebSocket ---


async def handle_compute_request(
    msg: ComputeRequest,
    ws: WebSocket,
    components: dict[str, Component],
) -> None:
    component = components.get(msg.node_id)
    if not component:
        await manager.send(ws, {
            "type": "computation_result",
            "request_id": msg.request_id,
            "node_id": msg.node_id,
            "ok": False,
            "error": f"No component for node {msg.node_id}",
        })
        return

    if component.kind == NodeKind.SUBSCRIBER:
        await manager.send(ws, {
            "type": "computation_result",
            "request_id": msg.request_id,
            "node_id": msg.node_id,
            "ok": False,
            "error": f"Node {msg.node_id} is a subscriber and does not support compute",
        })
        return

    try:
        result = await component.build(**msg.inputs)
        await manager.send(ws, {
            "type": "computation_result",
            "request_id": msg.request_id,
            "node_id": msg.node_id,
            "ok": True,
            "outputs": result,
        })
    except Exception as e:
        logger.error("Compute error for %s: %s", msg.node_id, e)
        await manager.send(ws, {
            "type": "computation_result",
            "request_id": msg.request_id,
            "node_id": msg.node_id,
            "ok": False,
            "error": str(e),
        })


async def handle_config_update(
    msg: ConfigUpdateMsg,
    ws: WebSocket,
    canvas_id: str,
    components: dict[str, Component],
) -> None:
    component = components.get(msg.node_id)
    if component:
        await component.on_config_change(msg.config)

    try:
        await crud.update_node_config(msg.node_id, msg.config)
    except Exception as e:
        logger.warning("Config persist failed for %s: %s", msg.node_id, e)

    await manager.broadcast(canvas_id, {
        "type": "node_state_updated",
        "node_id": msg.node_id,
        "data_patch": {"config": msg.config},
    })


@app.websocket("/ws/canvas/{canvas_id}")
async def ws_endpoint(ws: WebSocket, canvas_id: str):
    await manager.connect(canvas_id, ws)

    components: dict[str, Component] = {}
    component_lock = asyncio.Lock()

    graph = await crud.get_graph(canvas_id) if canvas_id != "demo" else None
    if graph:
        await manager.send(ws, {
            "type": "graph_loaded",
            "graph_id": graph["id"],
            "version": graph["current_version"],
            "nodes": graph["nodes"],
            "edges": graph["edges"],
            "manifests": registry.manifests(),
        })
        for node_data in graph["nodes"]:
            comp = registry.create_instance(
                node_data.get("type_id", ""),
                node_data["id"],
                node_data.get("config"),
            )
            if comp:
                await comp.on_init()
                components[node_data["id"]] = comp
                if comp.kind == NodeKind.SUBSCRIBER and stream_hub:
                    for stream_name in comp.subscribed_streams:
                        stream_hub.subscribe(stream_name, ws, node_data["id"])

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = client_msg_adapter.validate_json(raw)
            except Exception as e:
                logger.warning("Bad WS message: %s", e)
                await manager.send(ws, {
                    "type": "error",
                    "code": "parse_error",
                    "message": str(e),
                })
                continue

            if isinstance(msg, ComputeRequest):
                if msg.node_id not in components:
                    async with component_lock:
                        if msg.node_id not in components:
                            node_meta = next((n for n in graph["nodes"] if n["id"] == msg.node_id), None) if graph else None
                            type_id = node_meta["type_id"] if node_meta else "prompt_input"
                            comp = registry.create_instance(
                                type_id,
                                msg.node_id,
                                node_meta.get("config") if node_meta else None,
                            )
                            if comp:
                                await comp.on_init()
                                components[msg.node_id] = comp
                asyncio.create_task(handle_compute_request(msg, ws, components))
            elif isinstance(msg, ConfigUpdateMsg):
                await handle_config_update(msg, ws, canvas_id, components)
            elif isinstance(msg, Resubscribe):
                if stream_hub:
                    for sub in msg.subscriptions:
                        stream_hub.subscribe(sub["stream"], ws, sub["node_id"])
            elif isinstance(msg, SubscribeWithResume):
                if stream_hub:
                    total_missed = 0
                    for sub in msg.subscriptions:
                        stream_name = sub["stream"]
                        node_id = sub["node_id"]
                        cursor = msg.last_ids.get(stream_name)
                        if cursor:
                            missed, gap = await stream_hub.replay_from_cursor(
                                stream_name, cursor, ws, {node_id}
                            )
                            total_missed += missed
                            if gap:
                                await manager.send(ws, {
                                    "type": "replay_gap",
                                    "node_id": node_id,
                                    "stream": stream_name,
                                    "requested_from": cursor,
                                    "earliest_available": "",
                                })
                        stream_hub.subscribe(stream_name, ws, node_id)
                    await manager.send(ws, {
                        "type": "resumed",
                        "missed_count": total_missed,
                    })

    except WebSocketDisconnect:
        pass
    finally:
        if stream_hub:
            stream_hub.unsubscribe_all(ws)
        for comp in components.values():
            await comp.on_destroy()
        manager.disconnect(canvas_id, ws)
