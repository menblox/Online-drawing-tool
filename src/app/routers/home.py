from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(
    tags=["Home page"]
)

STATIC_DIR = Path(__file__).parent.parent / "static"


@router.get("/")
async def home_page():
    return FileResponse(STATIC_DIR / "home.html")