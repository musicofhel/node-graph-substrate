"""Throwaway demo: publishes incrementing counter to Redis Stream every 1s."""

import asyncio
import json

import redis.asyncio as aioredis


async def main():
    r = aioredis.from_url("redis://localhost:6381/0", decode_responses=True)
    await r.ping()
    print("Connected to Redis on port 6381")

    counter = 0
    try:
        while True:
            counter += 1
            await r.xadd(
                "demo:counter",
                {"data": json.dumps({"counter": counter})},
                maxlen=10000,
                approximate=True,
            )
            if counter % 10 == 0:
                print(f"Published counter={counter}")
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        await r.aclose()


if __name__ == "__main__":
    asyncio.run(main())
