"""Throwaway: publishes fake topo-confidence events to Redis Streams every 2s."""

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
    r = aioredis.from_url("redis://localhost:6381/0", decode_responses=True)
    await r.ping()
    print("Synthetic daemon connected to Redis on port 6381")

    tick = 0
    try:
        while True:
            tick += 1
            pid = f"syn-{tick:04d}"

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

            features = {name: round(random.uniform(-2, 5), 4) for name in FEATURE_NAMES}
            await r.xadd("topoconf:scoring:features_computed", {
                "data": json.dumps({"prompt_id": pid, "features": features})
            }, maxlen=10000, approximate=True)

            if tick % 10 == 0:
                print(f"Published tick {tick}")
            await asyncio.sleep(2)
    except KeyboardInterrupt:
        pass
    finally:
        await r.aclose()


if __name__ == "__main__":
    asyncio.run(main())
