from __future__ import annotations

from fastapi import APIRouter, HTTPException

from substrate.registry import registry

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
