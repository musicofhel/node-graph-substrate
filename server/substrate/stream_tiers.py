from __future__ import annotations

from typing import Literal

StreamTier = Literal["realtime", "interactive", "background"]

STREAM_TIERS: dict[str, StreamTier] = {
    # topo-confidence pack — interactive
    "topoconf:scoring:features_computed": "interactive",
    "topoconf:scoring:hidden_state_cloud": "interactive",
    "topoconf:scoring:persistence_computed": "interactive",
    "topoconf:scoring:confidence_scored": "interactive",
    "topoconf:scoring:bridge_health": "interactive",
    "topoconf:scoring:explain_result": "interactive",
    "topoconf:scoring:breathing_profile": "interactive",
    # link-forge ingestion — interactive
    "linkforge:ingested": "interactive",
    "linkforge:extracted": "interactive",
    "linkforge:categorized": "interactive",
    "linkforge:embedded": "interactive",
    "linkforge:stored": "interactive",
    "linkforge:chunked": "interactive",
    "linkforge:auto_related": "interactive",
    "linkforge:research_bridged": "interactive",
    "linkforge:url_discovered": "interactive",
    "linkforge:completed": "interactive",
    # link-forge — background
    "linkforge:autorel:sweep_completed": "background",
    # research lifecycle — interactive (per manifest; SPEC says background)
    "topoconf:research:triaged": "interactive",
    "topoconf:research:script_generated": "interactive",
    "topoconf:research:experiment_started": "interactive",
    "topoconf:research:experiment_completed": "interactive",
    "topoconf:research:promoted": "interactive",
}

DEFAULT_TIER: StreamTier = "interactive"


def get_tier(stream: str) -> StreamTier:
    return STREAM_TIERS.get(stream, DEFAULT_TIER)
