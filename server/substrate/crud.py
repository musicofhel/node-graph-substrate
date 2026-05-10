from __future__ import annotations

import json
from typing import Any

import asyncpg

from substrate.db import get_pool
from substrate.schemas import EdgeData, GraphOps, NodeData


async def create_project(slug: str, display_name: str) -> dict[str, Any]:
    pool = get_pool()
    row = await pool.fetchrow(
        "INSERT INTO projects (slug, display_name) VALUES ($1, $2) RETURNING *",
        slug,
        display_name,
    )
    return dict(row)


async def get_project(project_id: str) -> dict[str, Any] | None:
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM projects WHERE id = $1", project_id)
    return dict(row) if row else None


async def create_graph(project_id: str, name: str) -> dict[str, Any]:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "INSERT INTO graphs (project_id, name) VALUES ($1, $2) RETURNING *",
                project_id,
                name,
            )
            graph = dict(row)
            await conn.execute(
                "INSERT INTO graph_versions (graph_id, version, snapshot) VALUES ($1, 1, $2)",
                graph["id"],
                json.dumps({"nodes": [], "edges": []}),
            )
            return graph


async def get_graph(graph_id: str) -> dict[str, Any] | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        graph_row = await conn.fetchrow("SELECT * FROM graphs WHERE id = $1", graph_id)
        if not graph_row:
            return None

        node_rows = await conn.fetch(
            """SELECT n.*, COALESCE(nc.config, '{}'::jsonb) as config
               FROM nodes n LEFT JOIN node_configs nc ON n.id = nc.node_id
               WHERE n.graph_id = $1""",
            graph_id,
        )
        edge_rows = await conn.fetch(
            "SELECT * FROM edges WHERE graph_id = $1", graph_id
        )

        nodes = [
            NodeData(
                id=r["id"],
                type_id=r["type_id"],
                position_x=r["position_x"],
                position_y=r["position_y"],
                width=r["width"],
                height=r["height"],
                config=json.loads(r["config"]) if isinstance(r["config"], str) else r["config"],
            )
            for r in node_rows
        ]
        edges = [
            EdgeData(
                id=r["id"],
                source=r["source"],
                target=r["target"],
                source_handle=r["source_handle"],
                target_handle=r["target_handle"],
                data=json.loads(r["data"]) if isinstance(r["data"], str) else r["data"],
            )
            for r in edge_rows
        ]

        return {
            "id": str(graph_row["id"]),
            "project_id": str(graph_row["project_id"]),
            "name": graph_row["name"],
            "current_version": graph_row["current_version"],
            "nodes": [n.model_dump() for n in nodes],
            "edges": [e.model_dump() for e in edges],
        }


async def apply_ops(graph_id: str, ops: GraphOps) -> dict[str, Any]:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT current_version FROM graphs WHERE id = $1 FOR UPDATE",
                graph_id,
            )
            if not row:
                raise ValueError("Graph not found")

            current = row["current_version"]
            if current != ops.expected_version:
                raise OptimisticLockError(current)

            new_version = current + 1

            for op in ops.ops:
                if op.op == "upsert_node":
                    await _upsert_node(conn, graph_id, op.data)
                elif op.op == "remove_node":
                    await _remove_node(conn, op.data["id"])
                elif op.op == "upsert_edge":
                    await _upsert_edge(conn, graph_id, op.data)
                elif op.op == "remove_edge":
                    await conn.execute("DELETE FROM edges WHERE id = $1", op.data["id"])

            snapshot = await _build_snapshot(conn, graph_id)
            await conn.execute(
                "INSERT INTO graph_versions (graph_id, version, snapshot, message) VALUES ($1, $2, $3, $4)",
                graph_id,
                new_version,
                json.dumps(snapshot),
                ops.message,
            )
            await conn.execute(
                "UPDATE graphs SET current_version = $1, updated_at = NOW() WHERE id = $2",
                new_version,
                graph_id,
            )

            return {"version": new_version, **snapshot}


async def update_node_config(node_id: str, config: dict[str, Any]) -> None:
    pool = get_pool()
    await pool.execute(
        """INSERT INTO node_configs (node_id, config, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (node_id) DO UPDATE SET config = $2, updated_at = NOW()""",
        node_id,
        json.dumps(config),
    )


async def _upsert_node(conn: asyncpg.Connection, graph_id: str, data: dict) -> None:
    await conn.execute(
        """INSERT INTO nodes (id, graph_id, type_id, position_x, position_y, width, height, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO UPDATE SET
             graph_id = $2, type_id = $3, position_x = $4, position_y = $5, width = $6, height = $7, updated_at = NOW()""",
        data["id"],
        graph_id,
        data.get("type_id", "unknown"),
        data.get("position_x", 0),
        data.get("position_y", 0),
        data.get("width"),
        data.get("height"),
    )
    if "config" in data:
        await conn.execute(
            """INSERT INTO node_configs (node_id, config, updated_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (node_id) DO UPDATE SET config = $2, updated_at = NOW()""",
            data["id"],
            json.dumps(data["config"]),
        )


async def _remove_node(conn: asyncpg.Connection, node_id: str) -> None:
    await conn.execute("DELETE FROM edges WHERE source = $1 OR target = $1", node_id)
    await conn.execute("DELETE FROM nodes WHERE id = $1", node_id)


async def _upsert_edge(conn: asyncpg.Connection, graph_id: str, data: dict) -> None:
    await conn.execute(
        """INSERT INTO edges (id, graph_id, source, target, source_handle, target_handle, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             graph_id = $2, source = $3, target = $4, source_handle = $5, target_handle = $6, data = $7""",
        data["id"],
        graph_id,
        data["source"],
        data["target"],
        data.get("source_handle"),
        data.get("target_handle"),
        json.dumps(data.get("data", {})),
    )


async def _build_snapshot(conn: asyncpg.Connection, graph_id: str) -> dict:
    nodes = await conn.fetch(
        """SELECT n.id, n.type_id, n.position_x, n.position_y, n.width, n.height,
                  COALESCE(nc.config, '{}'::jsonb) as config
           FROM nodes n LEFT JOIN node_configs nc ON n.id = nc.node_id
           WHERE n.graph_id = $1""",
        graph_id,
    )
    edges = await conn.fetch("SELECT * FROM edges WHERE graph_id = $1", graph_id)
    return {
        "nodes": [
            {
                "id": r["id"],
                "type_id": r["type_id"],
                "position_x": r["position_x"],
                "position_y": r["position_y"],
                "width": r["width"],
                "height": r["height"],
                "config": json.loads(r["config"]) if isinstance(r["config"], str) else r["config"],
            }
            for r in nodes
        ],
        "edges": [
            {
                "id": r["id"],
                "source": r["source"],
                "target": r["target"],
                "source_handle": r["source_handle"],
                "target_handle": r["target_handle"],
                "data": json.loads(r["data"]) if isinstance(r["data"], str) else r["data"],
            }
            for r in edges
        ],
    }


class OptimisticLockError(Exception):
    def __init__(self, current_version: int):
        self.current_version = current_version
        super().__init__(f"Version conflict: current={current_version}")
