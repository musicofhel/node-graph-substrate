"""Publishes fake linkforge paper pipeline events to Redis Streams + hashes."""

import asyncio
import json
import random
import uuid
from datetime import datetime, timezone

import redis.asyncio as aioredis

CATEGORIES = ["ai-ml", "systems", "security", "databases", "networking", "compilers", "hci"]
CONTENT_TYPES = ["research-paper", "blog-post", "tutorial", "documentation", "tool"]
DOMAINS = ["arxiv.org", "github.com", "blog.example.com", "docs.python.org", "medium.com"]
TITLES = [
    "Scaling Laws for Neural Language Models",
    "Attention Is All You Need",
    "A Survey of Large Language Models",
    "Efficient Transformers: A Survey",
    "Topological Data Analysis for Machine Learning",
    "Graph Neural Networks: A Review",
    "Federated Learning: Challenges and Methods",
    "Diffusion Models Beat GANs on Image Synthesis",
    "Constitutional AI: Harmlessness from AI Feedback",
    "Chain-of-Thought Prompting Elicits Reasoning",
    "LoRA: Low-Rank Adaptation of Large Language Models",
    "Retrieval-Augmented Generation for Knowledge-Intensive NLP",
]


async def publish(r: aioredis.Redis, stream: str, data: dict) -> None:
    await r.xadd(stream, {"payload": json.dumps(data)}, maxlen=10000, approximate=True)


async def set_paper_field(r: aioredis.Redis, queue_id: str, fields: dict[str, str]) -> None:
    key = f"linkforge:paper:{queue_id}"
    await r.hset(key, mapping=fields)
    await r.expire(key, 86400)


async def simulate_paper(r: aioredis.Redis, idx: int, fail: bool = False) -> str:
    qid = str(uuid.uuid4())[:12]
    url = f"https://{random.choice(DOMAINS)}/paper/{qid}"
    title = random.choice(TITLES)
    category = random.choice(CATEGORIES)
    content_type = random.choice(CONTENT_TYPES)
    forge_score = round(random.uniform(0.1, 0.95), 2)
    is_research = content_type == "research-paper"
    arxiv_id = f"2506.{random.randint(10000, 99999)}" if is_research else ""

    stages = [
        ("linkforge:ingested", {
            "queue_id": qid, "url": url,
            "source_type": "url", "source": "discord",
        }, {
            "url": url, "source_type": "url", "source": "discord",
        }),
        ("linkforge:extracted", {
            "queue_id": qid, "title": title,
            "domain": url.split("/")[2], "content_length": random.randint(2000, 50000),
        }, {
            "title": title, "domain": url.split("/")[2],
            "content_length": str(random.randint(2000, 50000)),
            "summary": f"A paper about {category} topics.",
        }),
        ("linkforge:categorized", {
            "queue_id": qid, "category": category,
            "forge_score": forge_score, "content_type": content_type,
        }, {
            "category": category, "forge_score": str(forge_score),
            "content_type": content_type,
        }),
        ("linkforge:embedded", {
            "queue_id": qid, "embedding_dim": 1536,
        }, {
            "embedding_dim": "1536",
        }),
        ("linkforge:stored", {
            "queue_id": qid, "relationship_count": random.randint(3, 20),
            "tag_count": random.randint(2, 10), "tool_count": random.randint(0, 5),
            "concept_count": random.randint(1, 8),
        }, {
            "stored_done": "true",
            "relationship_count": str(random.randint(3, 20)),
            "tag_count": str(random.randint(2, 10)),
            "tool_count": str(random.randint(0, 5)),
            "concept_count": str(random.randint(1, 8)),
        }),
        ("linkforge:chunked", {
            "queue_id": qid, "chunk_size": random.randint(5, 30),
            "coverage_pct": random.randint(85, 100),
        }, {
            "chunk_count": str(random.randint(5, 30)),
            "chunk_size": str(random.randint(5, 30)),
            "coverage_pct": str(random.randint(85, 100)),
        }),
        ("linkforge:auto_related", {
            "queue_id": qid, "match_count": random.randint(0, 15),
            "best_match_url": f"https://example.com/related/{random.randint(100,999)}",
        }, {
            "match_count": str(random.randint(0, 15)),
            "best_match_url": f"https://example.com/related/{random.randint(100,999)}",
        }),
        ("linkforge:research_bridged", {
            "queue_id": qid, "research_relevant": is_research,
            "arxiv_id": arxiv_id,
        }, {
            "research_relevant": str(is_research).lower(),
            "arxiv_id": arxiv_id,
        }),
        ("linkforge:url_discovered", {
            "queue_id": qid, "urls_found": random.randint(0, 20),
            "urls_enqueued": random.randint(0, 5),
        }, {
            "urls_found": str(random.randint(0, 20)),
            "urls_enqueued": str(random.randint(0, 5)),
        }),
    ]

    start_ms = random.randint(500, 8000)
    for stream, event_data, hash_fields in stages:
        await publish(r, stream, event_data)
        await set_paper_field(r, qid, hash_fields)
        await asyncio.sleep(random.uniform(0.15, 0.4))

    if fail:
        completed_event = {
            "queue_id": qid, "success": False,
            "error": "Simulated failure", "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        completed_hash = {
            "success": "false", "error": "Simulated failure",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        completed_event = {
            "queue_id": qid, "success": True, "title": title,
            "category": category, "forge_score": str(forge_score),
            "processing_time_ms": start_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        completed_hash = {
            "success": "true",
            "processing_time_ms": str(start_ms),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

    await publish(r, "linkforge:completed", completed_event)
    await set_paper_field(r, qid, completed_hash)

    return qid


async def main():
    r = aioredis.from_url("redis://localhost:6381/0", decode_responses=True)
    await r.ping()
    print("Synthetic linkforge publisher connected to Redis on port 6381")

    try:
        for i in range(8):
            fail = i == 5
            qid = await simulate_paper(r, i, fail=fail)
            status = "FAIL" if fail else "OK"
            print(f"  Paper {i+1}/8: {qid} [{status}]")
            await asyncio.sleep(0.5)
        print("All 8 papers published. Keeping connection for history queries...")
        await asyncio.sleep(300)
    except KeyboardInterrupt:
        pass
    finally:
        await r.aclose()


if __name__ == "__main__":
    asyncio.run(main())
