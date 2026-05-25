from __future__ import annotations

from fastapi import APIRouter

from substrate.packs.topo_confidence.h1_loop_data import router as _data_router

router = APIRouter(tags=["h1loop"])
router.include_router(_data_router)
