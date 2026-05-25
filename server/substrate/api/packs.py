from __future__ import annotations

from fastapi import APIRouter, HTTPException

from substrate import crud
from substrate.api.utils import serialize_row
from substrate.registry import registry
from substrate.schemas import PackUpgrade

router = APIRouter(tags=["packs"])


@router.get("/api/manifests")
async def get_manifests():
    return registry.manifests()


@router.get("/api/packs")
async def list_packs():
    return []


@router.get("/api/packs/{pack_id}")
async def get_pack(pack_id: str):
    raise HTTPException(404, "Not implemented")


@router.post("/api/graphs/{graph_id}/pack-upgrade")
async def upgrade_pack_versions(graph_id: str, body: PackUpgrade):
    graph = await crud.get_graph(graph_id)
    if not graph:
        raise HTTPException(404, "Graph not found")
    result = await crud.update_graph_pack_versions(graph_id, body.pack_versions)
    return serialize_row(result)
