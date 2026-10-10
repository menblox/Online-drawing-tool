from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(
    tags=["Drawing page"]
)

STATIC_DIR = Path(__file__).parent.parent / "static"

@router.get("/drawing")
async def drawing():
    return FileResponse(STATIC_DIR / "index.html")