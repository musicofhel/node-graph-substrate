from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["auth"])


@router.post("/api/login")
async def login():
    return {"ok": True}


@router.post("/api/logout")
async def logout():
    return {"ok": True}
