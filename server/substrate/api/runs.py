from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["runs"])


@router.get("/api/canvases/{canvas_id}/runs")
async def list_canvas_runs(canvas_id: str):
    return []


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    raise HTTPException(404, "Not implemented")


@router.get("/api/runs/{run_id}/events")
async def get_run_events(run_id: str, since_ts: str = ""):
    return []


@router.post("/api/runs/compare")
async def compare_runs():
    return {}
