from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["streams"])


@router.get("/api/streams")
async def list_streams():
    return []


@router.get("/api/streams/{stream_name}/tail")
async def tail_stream(stream_name: str, n: int = 10):
    return []
