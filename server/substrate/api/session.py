from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from substrate import crud

router = APIRouter(tags=["session"])


class SessionPatch(BaseModel):
    open_canvas_ids: list[str] = []
    active_canvas_id: str | None = None
    per_canvas_state: dict[str, Any] = {}


@router.get("/api/projects/{project_id}/session")
async def get_session(project_id: str):
    state = await crud.get_session_state(project_id)
    if not state:
        return {
            "project_id": project_id,
            "open_canvas_ids": [],
            "active_canvas_id": None,
            "per_canvas_state": {},
        }
    return state


@router.patch("/api/projects/{project_id}/session")
async def update_session(project_id: str, body: SessionPatch):
    return await crud.upsert_session_state(
        project_id,
        body.open_canvas_ids,
        body.active_canvas_id,
        body.per_canvas_state,
    )
