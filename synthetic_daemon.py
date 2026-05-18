"""Throwaway: publishes fake topo-confidence events to Redis Streams every 2s."""

import argparse
import asyncio
import json
import math
import random

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


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drift-at", type=int, default=None, help="Tick number to start drift")
    parser.add_argument("--scenario", choices=["sudden", "gradual", "periodic", "partial"],
                        default="sudden", help="Drift scenario type")
    args = parser.parse_args()

    r = aioredis.from_url("redis://localhost:6381/0", decode_responses=True)
    await r.ping()
    print("Synthetic daemon connected to Redis on port 6381")
    if args.drift_at:
        print(f"  Drift enabled: {args.scenario} shift after tick {args.drift_at}")

    tick = 0
    try:
        while True:
            tick += 1
            pid = f"syn-{tick:04d}"
            drifting = args.drift_at is not None and tick > args.drift_at

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
                    ticks_since = tick - args.drift_at
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
            await r.xadd("topoconf:scoring:explain_result", {
                "data": json.dumps({
                    "prompt_id": pid,
                    "confidence": round(conf, 4),
                    "features": explain_features,
                    "top_contributor": top,
                })
            }, maxlen=10000, approximate=True)

            if tick % 10 == 0:
                print(f"Published tick {tick}")
            await asyncio.sleep(5)
    except KeyboardInterrupt:
        pass
    finally:
        await r.aclose()


if __name__ == "__main__":
    asyncio.run(main())
