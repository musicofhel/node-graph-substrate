from fastapi import APIRouter

from substrate.api.auth import router as auth_router
from substrate.api.canvases import router as canvases_router
from substrate.api.daemons import router as daemons_router
from substrate.api.experiments import router as experiments_router
from substrate.api.h1_loops import router as h1_loops_router
from substrate.api.packs import router as packs_router
from substrate.api.projects import router as projects_router
from substrate.api.runs import router as runs_router
from substrate.api.search import router as search_router
from substrate.api.session import router as session_router
from substrate.api.streams import router as streams_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(projects_router)
api_router.include_router(canvases_router)
api_router.include_router(runs_router)
api_router.include_router(streams_router)
api_router.include_router(packs_router)
api_router.include_router(daemons_router)
api_router.include_router(session_router)
api_router.include_router(search_router)
api_router.include_router(experiments_router)
api_router.include_router(h1_loops_router)
