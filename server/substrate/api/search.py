from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["search"])


@router.get("/api/search")
async def search(q: str = "", scope: str = ""):
    return []
