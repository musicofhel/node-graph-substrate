from __future__ import annotations

from fastapi import APIRouter, Query as FQuery

from substrate.db import get_pool

router = APIRouter(tags=["search"])

MAX_RESULTS = 20


def _build_url(kind: str, row_id: str, project_id: str | None, canvas_id: str | None) -> str:
    if kind == "project":
        return f"/p/{project_id}/c/" if project_id else "/"
    if kind == "canvas":
        return f"/p/{project_id}/c/{row_id}" if project_id else "/"
    if kind == "run":
        return f"/p/{project_id}/c/{canvas_id}" if project_id and canvas_id else "/"
    return "/"


@router.get("/api/search")
async def search(
    q: str = FQuery("", min_length=0),
    scope: str = FQuery(""),
):
    q = q.strip()
    if not q:
        return []

    pool = get_pool()

    allowed = {"project", "canvas", "run"}
    kinds = (
        sorted({s.strip() for s in scope.split(",") if s.strip()} & allowed)
        if scope
        else sorted(allowed)
    )

    words = [w for w in q.split() if w]
    if not words:
        return []
    tsquery_str = " & ".join(f"{w}:*" for w in words)

    rows = await pool.fetch(
        """
        SELECT si.kind, si.id, si.label, si.sublabel,
               COALESCE(g_canvas.project_id::text, g_run.project_id::text) AS project_id,
               r.canvas_id::text AS canvas_id,
               ts_rank(si.tsv, to_tsquery('simple', $1)) AS rank
        FROM search_index si
        LEFT JOIN graphs g_canvas
            ON si.kind = 'canvas' AND si.id = g_canvas.id::text
        LEFT JOIN runs r
            ON si.kind = 'run' AND si.id = r.id::text
        LEFT JOIN graphs g_run
            ON si.kind = 'run' AND r.canvas_id = g_run.id
        WHERE si.tsv @@ to_tsquery('simple', $1)
          AND si.kind = ANY($2::text[])
        ORDER BY
            (si.label ILIKE $3) DESC,
            rank DESC
        LIMIT $4
        """,
        tsquery_str,
        kinds,
        f"%{q}%",
        MAX_RESULTS,
    )

    results = []
    for r in rows:
        pid = r["project_id"]
        cid = r["canvas_id"]
        kind = r["kind"]
        row_id = r["id"]
        if kind == "project":
            pid = row_id
        results.append({
            "kind": kind,
            "id": row_id,
            "label": r["label"],
            "sublabel": r["sublabel"],
            "url": _build_url(kind, row_id, pid, cid),
        })
    return results
