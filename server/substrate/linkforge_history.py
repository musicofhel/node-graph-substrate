from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis


async def get_paper_history(
    redis: aioredis.Redis,
    limit: int = 50,
    offset: int = 0,
    category: str = "",
    research_only: bool = False,
) -> list[dict[str, Any]]:
    keys = []
    cursor = "0"
    while True:
        cursor, batch = await redis.scan(cursor, match="linkforge:paper:*", count=200)
        keys.extend(batch)
        if cursor == "0" or cursor == b"0":
            break

    papers = []
    for key in keys:
        data = await redis.hgetall(key)
        if not data:
            continue
        if category and data.get("category", "") != category:
            continue
        if research_only and data.get("research_relevant", "false") != "true":
            continue
        queue_id = key.split(":")[-1] if isinstance(key, str) else key.decode().split(":")[-1]
        papers.append({"queue_id": queue_id, **data})

    papers.sort(key=lambda p: p.get("completed_at", ""), reverse=True)
    return papers[offset : offset + limit]


async def get_paper_detail(
    redis: aioredis.Redis,
    queue_id: str,
) -> dict[str, Any] | None:
    data = await redis.hgetall(f"linkforge:paper:{queue_id}")
    if not data:
        return None
    return {"queue_id": queue_id, **data}


async def get_research_lifecycle(
    redis: aioredis.Redis,
    arxiv_id: str,
) -> dict[str, Any] | None:
    data = await redis.hgetall(f"topoconf:research:{arxiv_id}")
    if not data:
        return None
    return {"arxiv_id": arxiv_id, **data}
