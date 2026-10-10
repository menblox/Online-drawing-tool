from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.routers.home import router as home_router
from app.routers.draw import router as drawing_router

app = FastAPI(title="DrawApp")


STATIC_DIR = Path(__file__).parent / "static"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

app.include_router(home_router)
app.include_router(drawing_router)