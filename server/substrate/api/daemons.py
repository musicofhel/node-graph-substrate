from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["daemons"])


@router.get("/api/daemons")
async def list_daemons():
    return []
