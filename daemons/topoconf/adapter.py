from __future__ import annotations

import asyncio
import json
import logging
import uuid

import numpy as np
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    "H0_persistence_entropy", "H1_max_lifetime", "H0_total_persistence",
    "H0_n_features", "H1_persistence_entropy", "H1_n_features",
    "H2_n_features", "H2_total_persistence", "H2_persistence_entropy",
    "bridge_silhouette", "H0_ph_significance", "H1_ph_significance",
    "topological_sensitivity",
]

MAX_PAYLOAD = 256_000


def _finite_pairs(diagram: np.ndarray) -> list[list[float]]:
    if len(diagram) == 0:
        return []
    mask = np.isfinite(diagram[:, 1])
    finite = diagram[mask]
    return finite.tolist()


async def _xadd(redis: aioredis.Redis, stream: str, payload: dict) -> None:
    data = json.dumps(payload)
    assert len(data) < MAX_PAYLOAD, f"Payload too large: {len(data)} > {MAX_PAYLOAD}"
    await redis.xadd(stream, {"data": data}, maxlen=10000, approximate=True)


class TopoBridge:
    def __init__(self, model_name: str, device: str = "auto", layers: str = "last"):
        from topo_confidence.confidence import TopoConfidence
        from topo_confidence.integrations.monitor import BridgeMonitor

        self.tc = TopoConfidence(model_name, device=device, layers=layers)
        self.monitor = BridgeMonitor()
        self.redis: aioredis.Redis | None = None
        logger.info("TopoBridge initialized with model %s", model_name)

    async def connect_redis(self, redis_url: str) -> None:
        self.redis = aioredis.from_url(redis_url, decode_responses=True)
        await self.redis.ping()
        logger.info("TopoBridge Redis connected")

    async def score_prompt(self, prompt: str) -> dict:
        assert self.redis is not None
        prompt_id = uuid.uuid4().hex[:8]

        # Stage 1: hidden state extraction
        result = await asyncio.to_thread(self.tc.extractor.extract, [prompt])
        trajectory = result["token_trajectories"][0]
        logger.info("Stage 1: extracted %d tokens", trajectory.shape[0])

        # Stage 2: PCA + cluster + bridge
        fe = self.tc.feature_extractor
        if fe._pca is None:
            fe._fit_pca(trajectory.copy())
        reduced = fe._reduce(trajectory)

        from sklearn.decomposition import PCA as PCA3
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_samples

        pca_3d = PCA3(n_components=3).fit_transform(reduced)
        km = KMeans(n_clusters=2, n_init=10, random_state=42)
        labels = km.fit_predict(reduced)
        sil = (
            silhouette_samples(reduced, labels)
            if len(set(labels)) > 1
            else np.zeros(len(reduced))
        )
        bridge_sil = float(sil[0])

        await _xadd(self.redis, "topoconf:scoring:hidden_state_cloud", {
            "prompt_id": prompt_id,
            "umap_3d": pca_3d.tolist(),
            "clusters": labels.tolist(),
            "bridge_idx": 0,
            "bridge_silhouette": bridge_sil,
        })
        logger.info("Stage 2: cloud published (%d points)", len(pca_3d))

        # Stage 3: persistence diagrams
        diagrams = fe._compute_ph(reduced)
        H0 = _finite_pairs(diagrams.get(0, np.empty((0, 2))))
        H1 = _finite_pairs(diagrams.get(1, np.empty((0, 2))))
        H2 = _finite_pairs(diagrams.get(2, np.empty((0, 2))))

        await _xadd(self.redis, "topoconf:scoring:persistence_computed", {
            "prompt_id": prompt_id, "H0": H0, "H1": H1, "H2": H2,
        })
        logger.info("Stage 3: PH published (H0=%d, H1=%d, H2=%d)", len(H0), len(H1), len(H2))

        # Stage 4: 13 features
        features_arr = fe.extract_single(trajectory)
        feature_dict = dict(zip(FEATURE_NAMES, features_arr.tolist()))

        await _xadd(self.redis, "topoconf:scoring:features_computed", {
            "prompt_id": prompt_id, "features": feature_dict,
        })
        logger.info("Stage 4: features published")

        # Stage 5: confidence score
        if self.tc.calibrated:
            conf = float(self.tc._predict_from_features(features_arr.reshape(1, -1))[0])
            mode = "calibrated"
        else:
            conf = float(1.0 / (1.0 + np.exp(-(features_arr[9] + features_arr[0]))))
            mode = "heuristic"

        await _xadd(self.redis, "topoconf:scoring:confidence_scored", {
            "prompt_id": prompt_id, "confidence": conf, "mode": mode,
        })
        logger.info("Stage 5: confidence=%.3f (%s)", conf, mode)

        # Stage 6: bridge health
        health = await asyncio.to_thread(
            self.monitor.check_from_model,
            self.tc.extractor.model, self.tc.extractor.tokenizer, prompt
        )
        await _xadd(self.redis, "topoconf:scoring:bridge_health", {
            "prompt_id": prompt_id, **health.to_dict(),
        })
        logger.info("Stage 6: bridge health=%s", "HEALTHY" if health.healthy else health.anomaly_reason)

        # Stage 7: explain result
        explain_features = {}
        if self.tc.calibrated:
            try:
                explain_out = self.tc.explain([prompt])
                for name, detail in explain_out.get("features", {}).items():
                    explain_features[name] = detail
            except Exception:
                logger.warning("Calibrated explain failed, falling back to heuristic")
        if not explain_features:
            for i, name in enumerate(FEATURE_NAMES):
                raw = float(features_arr[i])
                coef = 1.0 / len(FEATURE_NAMES)
                scaled = raw * 0.3
                explain_features[name] = {
                    "raw_value": raw,
                    "scaled_value": round(scaled, 4),
                    "coefficient": round(coef, 3),
                    "contribution": round(scaled * coef, 4),
                }
        top = max(explain_features, key=lambda k: abs(explain_features[k]["contribution"]))
        await _xadd(self.redis, "topoconf:scoring:explain_result", {
            "prompt_id": prompt_id,
            "confidence": conf,
            "features": explain_features,
            "top_contributor": top,
        })
        logger.info("Stage 7: explain published (top=%s)", top)

        return {"prompt_id": prompt_id, "confidence": conf, "features": feature_dict}
