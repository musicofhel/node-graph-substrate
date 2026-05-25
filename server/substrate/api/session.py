from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["session"])


@router.get("/api/projects/{project_id}/session")
async def get_session(project_id: str):
    return {}


@router.patch("/api/projects/{project_id}/session")
async def update_session(project_id: str):
    return {}
