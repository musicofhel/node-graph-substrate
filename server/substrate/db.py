from __future__ import annotations

import logging
import os

import asyncpg

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    global _pool
    dsn = os.getenv(
        "DATABASE_URL",
        "postgresql://substrate:substrate@postgres:5432/substrate",
    )
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    logger.info("Postgres pool created")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Postgres pool closed")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def run_migrations() -> None:
    pool = get_pool()
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    migrations_dir = os.path.abspath(migrations_dir)

    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)

        applied = {r["filename"] for r in await conn.fetch("SELECT filename FROM _migrations")}

        import glob

        for path in sorted(glob.glob(os.path.join(migrations_dir, "*.sql"))):
            filename = os.path.basename(path)
            if filename in applied:
                continue
            logger.info("Applying migration: %s", filename)
            with open(path) as f:
                sql = f.read()
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO _migrations (filename) VALUES ($1)", filename
            )
            logger.info("Migration applied: %s", filename)
