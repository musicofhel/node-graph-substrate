from __future__ import annotations

import asyncpg
from fastapi import APIRouter, HTTPException

from substrate import crud
from substrate.api.utils import serialize_row
from substrate.schemas import ProjectCreate

router = APIRouter(tags=["projects"])


@router.post("/api/projects")
async def create_project(body: ProjectCreate):
    try:
        project = await crud.create_project(body.slug, body.display_name)
        return serialize_row(project)
    except asyncpg.UniqueViolationError:
        existing = await crud.get_project_by_slug(body.slug)
        if existing:
            return serialize_row(existing)
        raise HTTPException(409, "Project slug already exists")


@router.get("/api/projects/{project_id}/graphs")
async def list_graphs(project_id: str):
    graphs = await crud.list_graphs(project_id)
    return [serialize_row(g) for g in graphs]
