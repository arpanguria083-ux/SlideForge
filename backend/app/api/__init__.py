from fastapi import APIRouter
from .admin import router as admin_router
from .history import router as history_router
from .ocr import router as ocr_router
from .settings import router as settings_router
from .gpu import router as gpu_router

api_router = APIRouter()
api_router.include_router(admin_router)
api_router.include_router(history_router)
api_router.include_router(ocr_router)
api_router.include_router(settings_router)
api_router.include_router(gpu_router)
