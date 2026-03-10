from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).parent.parent

load_dotenv(BASE_DIR / ".env")

from tryon_router import router as tryon_router  # noqa: E402 (must load after dotenv)

# Ensure required directories exist
(BASE_DIR / "uploads").mkdir(exist_ok=True)
(BASE_DIR / "The result").mkdir(exist_ok=True)

app = FastAPI(title="Virtual Fitting Room")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tryon_router, prefix="/api")

# Serve result images
app.mount("/results", StaticFiles(directory=str(BASE_DIR / "The result")), name="results")

# Serve frontend (must be last)
app.mount("/", StaticFiles(directory=str(BASE_DIR / "frontend"), html=True), name="frontend")
