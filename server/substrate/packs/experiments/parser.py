"""Parsers for topo-confidence NEXT_EXPERIMENTS.md and FINDINGS.md.

Extracts structured experiment/finding metadata for the Experiments tab
API endpoints. Reads markdown files from ~/topo-confidence/ — the running
server never imports topo-confidence Python code.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

TOPO_ROOT = Path.home() / "topo-confidence"

_EXPERIMENT_HEADER = re.compile(
    r"^### (P\d+-FE\d+|P\d+-FE\d+\w*|P\d+) \((?P<pathway>P\d+)\)"
    r" — \[ROI: (?P<roi>\d+(?:\.\d+)?), (?P<status>\w+), (?P<priority>\w+)\]",
    re.MULTILINE,
)
_FIELD = re.compile(r"\*\*(\w[\w\s]*):\*\*\s*(.+?)(?=\n\*\*|\n###|\Z)", re.DOTALL)
_FN_REFS = re.compile(r"F-(\d+)")

_FINDING_HEADER = re.compile(r"^### (F-\d+):\s*(.+?)$", re.MULTILINE)
_STRENGTH = re.compile(
    r"\*\*Strength:\*\*\s*(STRONG|MODERATE|PRELIMINARY)\s*\(([^)]+)\)",
)
_AUROC_SCORE = re.compile(r"AUROC\s+([\d.]+)")


def parse_next_experiments(path: Path | None = None) -> list[dict]:
    path = path or TOPO_ROOT / "NEXT_EXPERIMENTS.md"
    if not path.exists():
        logger.warning("NEXT_EXPERIMENTS.md not found at %s", path)
        return []

    text = path.read_text()
    entries: list[dict] = []

    headers = list(_EXPERIMENT_HEADER.finditer(text))
    for i, m in enumerate(headers):
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        block = text[m.start() : end]

        fields: dict[str, str] = {}
        for fm in _FIELD.finditer(block):
            fields[fm.group(1).strip().lower()] = fm.group(2).strip()

        depends_raw = fields.get("depends on", "")
        would_update_raw = fields.get("would update", "")

        entries.append({
            "id": m.group(1),
            "pathway": m.group("pathway"),
            "roi": float(m.group("roi")),
            "status": m.group("status"),
            "priority": m.group("priority"),
            "what": _first_line(fields.get("what", "")),
            "cost": fields.get("cost", ""),
            "depends_on": _FN_REFS.findall(depends_raw),
            "would_update": _FN_REFS.findall(would_update_raw),
            "blocked_by": fields.get("blocked by", ""),
        })

    entries.sort(key=lambda e: (-e["roi"], e["id"]))
    return entries


def parse_findings(path: Path | None = None) -> list[dict]:
    path = path or TOPO_ROOT / "FINDINGS.md"
    if not path.exists():
        logger.warning("FINDINGS.md not found at %s", path)
        return []

    text = path.read_text()
    entries: list[dict] = []

    headers = list(_FINDING_HEADER.finditer(text))
    for i, m in enumerate(headers):
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        block = text[m.start() : end]

        strength_m = _STRENGTH.search(block)
        strength = strength_m.group(1) if strength_m else "UNKNOWN"
        strength_qual = strength_m.group(2) if strength_m else ""

        aurocs = _AUROC_SCORE.findall(block)
        key_metric = float(aurocs[0]) if aurocs else None

        entries.append({
            "id": m.group(1),
            "headline": m.group(2).strip(),
            "strength": strength,
            "strength_qualifier": strength_qual,
            "key_auroc": key_metric,
        })

    return entries


def _first_line(text: str) -> str:
    line = text.split("\n")[0].strip()
    if len(line) > 200:
        return line[:197] + "..."
    return line
