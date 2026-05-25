from __future__ import annotations

import re

from substrate.sdk.pack import PackManifest
from substrate.sdk.ports import PortType


def validate_pack_manifests(manifests: list[PackManifest]) -> list[str]:
    """Validate a list of pack manifests per SPEC-v5 Section 8.3.

    Returns a list of error strings. Empty list means all valid.
    """
    errors: list[str] = []

    seen_type_ids: dict[str, str] = {}
    seen_canvas_kind_ids: dict[str, str] = {}
    base_type_names = {t.value for t in PortType}

    for pack in manifests:
        known_port_ids = base_type_names | {p.id for p in pack.ports}
        stream_names = {s.name for s in pack.streams}

        for node in pack.nodes:
            if node.type_id in seen_type_ids:
                errors.append(
                    f"Duplicate NodeDef.type_id '{node.type_id}' "
                    f"in packs '{seen_type_ids[node.type_id]}' and '{pack.id}'"
                )
            seen_type_ids[node.type_id] = pack.id

            for stream in node.subscribed_streams:
                if stream not in stream_names:
                    errors.append(
                        f"Node '{node.type_id}' in pack '{pack.id}' subscribes "
                        f"to unknown stream '{stream}'"
                    )

            for port_ref in [*node.inputs, *node.outputs]:
                if port_ref.type not in known_port_ids:
                    errors.append(
                        f"Node '{node.type_id}' in pack '{pack.id}' references "
                        f"unknown port type '{port_ref.type}'"
                    )

        for ck in pack.canvas_kinds:
            if ck.id in seen_canvas_kind_ids:
                errors.append(
                    f"Duplicate CanvasKindDef.id '{ck.id}' "
                    f"in packs '{seen_canvas_kind_ids[ck.id]}' and '{pack.id}'"
                )
            seen_canvas_kind_ids[ck.id] = pack.id

        if pack.daemon:
            interval = pack.daemon.heartbeat_interval_sec
            if not (1 <= interval <= 600):
                errors.append(
                    f"Pack '{pack.id}' daemon heartbeat_interval_sec={interval} "
                    f"outside [1, 600]"
                )

        if pack.accepts_runtime_range is not None:
            if not re.match(
                r'^[><=!~^]*\d+\.\d+\.\d+', pack.accepts_runtime_range
            ):
                errors.append(
                    f"Pack '{pack.id}' accepts_runtime_range "
                    f"'{pack.accepts_runtime_range}' does not look like a semver range"
                )

    return errors
