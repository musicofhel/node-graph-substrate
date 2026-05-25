from __future__ import annotations


def serialize_row(row: dict) -> dict:
    return {
        k: str(v) if not isinstance(v, (int, float, bool, type(None))) else v
        for k, v in row.items()
    }
