from __future__ import annotations

import asyncpg
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException

from substrate import crud, linkforge_history
from substrate.api.deps import get_redis
from substrate.api.utils import serialize_row
from substrate.schemas import ConfigUpdate, GraphCreate, GraphOps, GraphRename

router = APIRouter(tags=["canvases"])


@router.post("/api/graphs")
async def create_graph(body: GraphCreate):
    try:
        graph = await crud.create_graph(body.project_id, body.name, body.kind, body.pack_id)
        return serialize_row(graph)
    except asyncpg.UniqueViolationError:
        existing = await crud.get_graph_by_project_and_name(body.project_id, body.name)
        if existing:
            return existing
        raise HTTPException(409, "Graph already exists")
    except asyncpg.ForeignKeyViolationError:
        raise HTTPException(404, "Project not found")


@router.get("/api/graphs/{graph_id}")
async def get_graph(graph_id: str):
    graph = await crud.get_graph(graph_id)
    if not graph:
        raise HTTPException(404, "Graph not found")
    return graph


@router.patch("/api/graphs/{graph_id}")
async def rename_graph(graph_id: str, body: GraphRename):
    result = await crud.rename_graph(graph_id, body.name)
    if not result:
        raise HTTPException(404, "Graph not found")
    return result


@router.patch("/api/graphs/{graph_id}/ops")
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


@router.patch("/api/nodes/{node_id}/config")
async def update_config(node_id: str, body: ConfigUpdate):
    await crud.update_node_config(node_id, body.config)
    return {"ok": True}


@router.get("/api/linkforge/history")
async def linkforge_paper_history(
    redis: aioredis.Redis = Depends(get_redis),
    limit: int = 50,
    offset: int = 0,
    category: str = "",
    research_only: bool = False,
):
    return await linkforge_history.get_paper_history(
        redis, limit, offset, category, research_only
    )


@router.get("/api/linkforge/paper/{queue_id}")
async def linkforge_paper_detail(
    queue_id: str,
    redis: aioredis.Redis = Depends(get_redis),
):
    paper = await linkforge_history.get_paper_detail(redis, queue_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper


@router.get("/api/linkforge/paper/{queue_id}/research")
async def linkforge_paper_research(
    queue_id: str,
    redis: aioredis.Redis = Depends(get_redis),
):
    paper = await linkforge_history.get_paper_detail(redis, queue_id)
    if not paper:
        raise HTTPException(404, "Paper not found")
    arxiv_id = paper.get("arxiv_id", "")
    if not arxiv_id:
        return None
    return await linkforge_history.get_research_lifecycle(redis, arxiv_id)
