"""Calculator-mode daemon: publishes topo-confidence events only when
a score command arrives on topoconf:control (triggered by Analyze button).

With --math500-cache: serves real MATH-500 breathing heatmaps from pre-computed data.
Without: falls back to fake random data."""

import argparse
import asyncio
import json
import math
import random
from pathlib import Path
from typing import Any

import redis.asyncio as aioredis

FEATURE_NAMES = [
    "H0_persistence_entropy", "H1_max_lifetime", "H0_total_persistence",
    "H0_n_features", "H1_persistence_entropy", "H1_n_features",
    "H2_n_features", "H2_total_persistence", "H2_persistence_entropy",
    "bridge_silhouette", "H0_ph_significance", "H1_ph_significance",
    "topological_sensitivity",
]


def fake_point_cloud(n: int = 50) -> list[list[float]]:
    points = []
    for i in range(n):
        cluster = 0 if i < n // 2 else 1
        cx, cy, cz = (0, 0, 0) if cluster == 0 else (3, 3, 0)
        points.append([
            cx + random.gauss(0, 0.8),
            cy + random.gauss(0, 0.8),
            cz + random.gauss(0, 0.5),
        ])
    return points


def fake_persistence_diagrams() -> dict:
    def pairs(n: int) -> list[list[float]]:
        result = []
        for _ in range(n):
            b = random.uniform(0, 2)
            d = b + random.expovariate(2)
            result.append([b, d])
        return result
    return {"H0": pairs(15), "H1": pairs(5), "H2": pairs(2)}


def fake_breathing_profile() -> dict:
    correct = random.random() > 0.3
    base_pr = [13.5, 14.0, 18.0, 23.0, 30.0, 28.0, 22.0, 4.0 if correct else 12.0]

    heatmap = []
    for pos_idx, bpr in enumerate(base_pr):
        row = []
        for layer in range(28):
            layer_factor = math.exp(-0.5 * ((layer - 19) / 6) ** 2)
            pr = bpr * (0.4 + 0.6 * layer_factor) + random.gauss(0, 0.5)
            row.append(round(max(0, min(35, pr)), 1))
        heatmap.append(row)

    l19_values = [row[19] for row in heatmap]
    peak = max(l19_values) if l19_values else 1
    collapse_ratio = round(l19_values[-1] / peak, 3) if peak > 0 else 0.0

    return {
        "heatmap": heatmap,
        "l19_values": l19_values,
        "correctness": correct,
        "collapse_ratio": collapse_ratio,
    }


def real_breathing_profile(cache: dict, math_idx: int) -> dict:
    problems = cache["problems"]
    p = problems[math_idx % len(problems)]
    return {
        "heatmap": p["heatmap"],
        "l19_values": p["l19_values"],
        "correctness": p["correct"],
        "collapse_ratio": p["collapse_ratio"],
        "math_prompt": p.get("math_prompt", "")[:200],
        "subject": p.get("subject", ""),
        "level": p.get("level", ""),
        "math_idx": p["idx"],
    }


def load_math500_cache(path: str) -> dict | None:
    p = Path(path)
    if not p.exists():
        print(f"  WARNING: Cache not found at {p}, using fake data")
        return None
    with open(p) as f:
        cache = json.load(f)
    n = len(cache.get("problems", []))
    nc = sum(1 for p in cache.get("problems", []) if p.get("correct"))
    print(f"  Loaded {n} MATH-500 problems from cache ({nc} correct, {n-nc} incorrect)")
    return cache


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drift-at", type=int, default=None,
                        help="Request number to start drift")
    parser.add_argument("--scenario",
                        choices=["sudden", "gradual", "periodic", "partial"],
                        default="sudden", help="Drift scenario type")
    parser.add_argument("--math500-cache", type=str,
                        default="data/math500_breathing_cache.json",
                        help="Path to pre-computed MATH-500 breathing cache")
    args = parser.parse_args()

    r = aioredis.from_url("redis://localhost:6381/0", decode_responses=True)
    await r.ping()
    print("Synthetic daemon connected to Redis on port 6381 (calculator mode)")

    cache = load_math500_cache(args.math500_cache)
    use_real = cache is not None

    print("  Waiting for score commands on topoconf:control...")
    if args.drift_at:
        print(f"  Drift enabled: {args.scenario} shift after request {args.drift_at}")

    last_id = "$"
    request_count = 0

    try:
        while True:
            result = await r.xread({"topoconf:control": last_id}, block=0, count=1)
            if not result:
                continue

            for stream_name, entries in result:
                for entry_id, fields in entries:
                    last_id = entry_id
                    try:
                        msg = json.loads(fields.get("data", "{}"))
                    except json.JSONDecodeError:
                        continue
                    if msg.get("command") != "score":
                        continue

                    request_count += 1
                    pid = msg.get("run_id", f"syn-{request_count:04d}")
                    prompt = msg.get("prompt", "")
                    math_idx = msg.get("math_idx")
                    drifting = args.drift_at is not None and request_count > args.drift_at

                    if use_real and math_idx is not None:
                        prob = cache["problems"][math_idx % len(cache["problems"])]
                        is_correct = prob["correct"]
                        print(f"[{request_count}] MATH-500 #{math_idx}: {prob.get('subject','')} L{prob.get('level','')} (correct={is_correct}, run_id={pid})")
                    else:
                        is_correct = None
                        print(f"[{request_count}] Scoring: {prompt[:60]!r} (run_id={pid})")

                    cloud = fake_point_cloud(60)
                    clusters = [0 if i < 30 else 1 for i in range(60)]
                    await r.xadd("topoconf:scoring:hidden_state_cloud", {
                        "data": json.dumps({
                            "prompt_id": pid,
                            "umap_3d": cloud,
                            "clusters": clusters,
                            "bridge_idx": 0,
                            "bridge_silhouette": random.uniform(-0.2, 0.8),
                        })
                    }, maxlen=10000, approximate=True)

                    diagrams = fake_persistence_diagrams()
                    await r.xadd("topoconf:scoring:persistence_computed", {
                        "data": json.dumps({"prompt_id": pid, **diagrams})
                    }, maxlen=10000, approximate=True)

                    features = {}
                    for i, name in enumerate(FEATURE_NAMES):
                        base_lo, base_hi = -2, 5
                        if drifting:
                            ticks_since = request_count - args.drift_at
                            if args.scenario == "sudden":
                                features[name] = round(random.uniform(1, 8), 4)
                            elif args.scenario == "gradual":
                                t = min(ticks_since / 30.0, 1.0)
                                lo = base_lo + t * 3.0
                                hi = base_hi + t * 3.0
                                features[name] = round(random.uniform(lo, hi), 4)
                            elif args.scenario == "periodic":
                                phase = math.sin(2 * math.pi * ticks_since / 40)
                                shift = max(0, phase) * 3.0
                                features[name] = round(random.uniform(base_lo + shift, base_hi + shift), 4)
                            elif args.scenario == "partial":
                                if i < 3:
                                    features[name] = round(random.uniform(1, 8), 4)
                                else:
                                    features[name] = round(random.uniform(base_lo, base_hi), 4)
                            else:
                                features[name] = round(random.uniform(base_lo, base_hi), 4)
                        else:
                            features[name] = round(random.uniform(base_lo, base_hi), 4)
                    await r.xadd("topoconf:scoring:features_computed", {
                        "data": json.dumps({"prompt_id": pid, "features": features})
                    }, maxlen=10000, approximate=True)

                    # Confidence tuned by real correctness when available
                    if is_correct is True:
                        conf = random.uniform(0.65, 0.95)
                    elif is_correct is False:
                        conf = random.uniform(0.2, 0.6)
                    else:
                        conf = random.uniform(0.6, 0.99) if drifting else random.uniform(0.2, 0.95)
                    await r.xadd("topoconf:scoring:confidence_scored", {
                        "data": json.dumps({"prompt_id": pid, "confidence": round(conf, 4), "mode": "heuristic"})
                    }, maxlen=10000, approximate=True)

                    layers = {"7": True, "14": True, "24": random.choice([True, False])}
                    await r.xadd("topoconf:scoring:bridge_health", {
                        "data": json.dumps({
                            "prompt_id": pid,
                            "healthy": all(layers.values()),
                            "bridge_at_pos0": layers,
                            "silhouette_by_layer": {k: round(random.uniform(-0.3, 0.9), 3) for k in layers},
                            "mean_silhouette_by_layer": {k: round(random.uniform(0.1, 0.7), 3) for k in layers},
                            "crystallization": round(random.uniform(0.3, 1.0), 3),
                            "anomaly_reason": None if all(layers.values()) else "Layer 24 bridge missing",
                        })
                    }, maxlen=10000, approximate=True)

                    explain_features = {}
                    for name in FEATURE_NAMES:
                        raw = features[name]
                        coef = round(random.uniform(-1, 1), 3)
                        explain_features[name] = {
                            "raw_value": raw,
                            "scaled_value": round(raw * 0.3, 4),
                            "coefficient": coef,
                            "contribution": round(raw * 0.3 * coef, 4),
                        }
                    top = max(explain_features, key=lambda k: abs(explain_features[k]["contribution"]))
                    explain_payload: dict[str, Any] = {
                        "prompt_id": pid,
                        "confidence": round(conf, 4),
                        "features": explain_features,
                        "top_contributor": top,
                        "correctness": is_correct,
                    }
                    if use_real and math_idx is not None:
                        prob = cache["problems"][math_idx % len(cache["problems"])]
                        explain_payload["subject"] = prob.get("subject", "")
                        explain_payload["level"] = prob.get("level", "")
                        explain_payload["math_idx"] = math_idx
                    await r.xadd("topoconf:scoring:explain_result", {
                        "data": json.dumps(explain_payload)
                    }, maxlen=10000, approximate=True)

                    # Breathing profile: real data from cache or fake
                    if use_real and math_idx is not None:
                        breathing = real_breathing_profile(cache, math_idx)
                    else:
                        breathing = fake_breathing_profile()
                    await r.xadd("topoconf:scoring:breathing_profile", {
                        "data": json.dumps({"prompt_id": pid, **breathing})
                    }, maxlen=10000, approximate=True)

                    print(f"  Published to 7 streams")
    except KeyboardInterrupt:
        pass
    finally:
        await r.aclose()


if __name__ == "__main__":
    asyncio.run(main())
