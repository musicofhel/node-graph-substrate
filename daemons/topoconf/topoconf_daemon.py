"""Daemon: listens on topoconf:control stream and runs TopoBridge scoring."""

from __future__ import annotations

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis

from adapter import TopoBridge

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("topoconf_daemon")


async def main():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    model_name = os.getenv("MODEL_NAME", "Qwen/Qwen2.5-1.5B-Instruct")
    device = os.getenv("DEVICE", "auto")

    logger.info("Starting topoconf daemon: model=%s device=%s", model_name, device)

    bridge = TopoBridge(model_name, device=device)
    await bridge.connect_redis(redis_url)

    r = aioredis.from_url(redis_url, decode_responses=True)
    await r.ping()

    last_id = "$"
    logger.info("Listening on topoconf:control stream...")

    while True:
        try:
            result = await r.xread({"topoconf:control": last_id}, block=5000, count=1)
            if not result:
                continue

            for stream_name, entries in result:
                for entry_id, fields in entries:
                    last_id = entry_id
                    try:
                        data = json.loads(fields.get("data", "{}"))
                    except (json.JSONDecodeError, TypeError):
                        data = dict(fields)

                    command = data.get("command", "")
                    if command == "score":
                        prompt = data.get("prompt", "")
                        run_id = data.get("run_id", "unknown")
                        logger.info("Scoring prompt (run_id=%s): %s...", run_id, prompt[:80])
                        try:
                            result_data = await bridge.score_prompt(prompt)
                            logger.info("Scoring complete: confidence=%.3f", result_data["confidence"])
                        except Exception as e:
                            logger.error("Scoring failed: %s", e, exc_info=True)
                    else:
                        logger.warning("Unknown command: %s", command)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Control loop error: %s", e, exc_info=True)
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
