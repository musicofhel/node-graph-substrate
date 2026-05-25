from __future__ import annotations

from fastapi import APIRouter

from substrate.packs.experiments.data import router as _data_router

router = APIRouter(tags=["experiments"])
router.include_router(_data_router)
