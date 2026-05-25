from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic import BaseModel


class SocketType(str, Enum):
    PROMPT = "prompt"
    EXTRACTION = "extraction"
    FEATURES = "features"
    CONFIDENCE = "confidence"
    BRIDGE_HEALTH = "bridge_health"
    EXPLANATION = "explanation"
    DIAGRAMS = "diagrams"


class NodeKind(str, Enum):
    COMPUTED = "computed"
    SUBSCRIBER = "subscriber"
    STATE = "state"


@dataclass
class Socket:
    id: str
    type: SocketType
    label: str = ""


class PortType(str, Enum):
    JSON = "json"
    TENSOR = "tensor"
    TIMESERIES = "timeseries"
    TABULAR = "tabular"
    IMAGE = "image"
    TEXT = "text"
    EVENT = "event"


class PortRef(BaseModel):
    id: str
    type: str
    label: str = ""


class PortDef(BaseModel):
    id: str
    base_type: PortType
    color: str
    tags: list[str] = []


def ports_compatible(
    a_type: str,
    b_type: str,
    a_tags: list[str] | None = None,
    b_tags: list[str] | None = None,
) -> bool:
    """Check port compatibility per SPEC-v5 Section 8.2.

    Allowed when port IDs match exactly or base types match with no
    exclusive tag mismatch.
    """
    if a_type == b_type:
        return True

    a_set = set(a_tags) if a_tags else set()
    b_set = set(b_tags) if b_tags else set()

    if not a_set or not b_set:
        return True

    if a_set & b_set:
        return True

    if a_set <= b_set or b_set <= a_set:
        return True

    return False
