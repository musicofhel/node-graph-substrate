from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pydantic import TypeAdapter

from substrate import crud
from substrate import linkforge_history
import substrate.components  # noqa: F401 — registers components
from substrate.db import close_pool, create_pool, run_migrations
from substrate.messages import (
    ClientMessage,
    ComputeRequest,
    ConfigUpdateMsg,
    Resubscribe,
)
from substrate.registry import registry
from substrate.schemas import ConfigUpdate, GraphCreate, GraphOps, GraphRename, ProjectCreate
from substrate.sdk import Component, NodeKind
from substrate.streamhub import StreamHub
from substrate.ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _serialize_row(row: dict) -> dict:
    return {
        k: str(v) if not isinstance(v, (int, float, bool, type(None))) else v
        for k, v in row.items()
    }

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

    stream_hub = StreamHub(redis_client, manager)

    await create_pool()
    await run_migrations()

    yield

    if stream_hub:
        await stream_hub.shutdown()
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
        return _serialize_row(project)
    except asyncpg.UniqueViolationError:
        existing = await crud.get_project_by_slug(body.slug)
        if existing:
            return _serialize_row(existing)
        raise HTTPException(409, "Project slug already exists")


# --- Graph routes ---


@app.get("/api/projects/{project_id}/graphs")
async def list_graphs(project_id: str):
    graphs = await crud.list_graphs(project_id)
    return [_serialize_row(g) for g in graphs]


@app.post("/api/graphs")
async def create_graph(body: GraphCreate):
    try:
        graph = await crud.create_graph(body.project_id, body.name)
        return _serialize_row(graph)
    except asyncpg.UniqueViolationError:
        existing = await crud.get_graph_by_project_and_name(body.project_id, body.name)
        if existing:
            return existing
        raise HTTPException(409, "Graph already exists")
    except asyncpg.ForeignKeyViolationError:
        raise HTTPException(404, "Project not found")


@app.get("/api/graphs/{graph_id}")
async def get_graph(graph_id: str):
    graph = await crud.get_graph(graph_id)
    if not graph:
        raise HTTPException(404, "Graph not found")
    return graph


@app.patch("/api/graphs/{graph_id}")
async def rename_graph(graph_id: str, body: GraphRename):
    result = await crud.rename_graph(graph_id, body.name)
    if not result:
        raise HTTPException(404, "Graph not found")
    return result


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


# --- Component manifests ---


@app.get("/api/manifests")
async def get_manifests():
    return registry.manifests()


# --- Link-Forge history ---


@app.get("/api/linkforge/history")
async def linkforge_paper_history(
    limit: int = 50,
    offset: int = 0,
    category: str = "",
    research_only: bool = False,
):
    if not redis_client:
        raise HTTPException(503, "Redis not available")
    return await linkforge_history.get_paper_history(
        redis_client, limit, offset, category, research_only
    )


@app.get("/api/linkforge/paper/{queue_id}")
async def linkforge_paper_detail(queue_id: str):
    if not redis_client:
        raise HTTPException(503, "Redis not available")
    paper = await linkforge_history.get_paper_detail(redis_client, queue_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper


@app.get("/api/linkforge/paper/{queue_id}/research")
async def linkforge_paper_research(queue_id: str):
    if not redis_client:
        raise HTTPException(503, "Redis not available")
    paper = await linkforge_history.get_paper_detail(redis_client, queue_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    arxiv_id = paper.get("arxiv_id", "")
    if not arxiv_id:
        return None
    return await linkforge_history.get_research_lifecycle(redis_client, arxiv_id)


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

    except WebSocketDisconnect:
        pass
    finally:
        if stream_hub:
            stream_hub.unsubscribe_all(ws)
        for comp in components.values():
            await comp.on_destroy()
        manager.disconnect(canvas_id, ws)
