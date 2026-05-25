from __future__ import annotations

from fastapi import HTTPException, Request
import redis.asyncio as aioredis


async def get_redis(request: Request) -> aioredis.Redis:
    client = request.app.state.redis_client
    if client is None:
        raise HTTPException(503, "Redis not available")
    return client
