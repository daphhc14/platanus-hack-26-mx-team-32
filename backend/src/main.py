from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import acreate_client

from .config import settings
from .features.personas.router import router as personas_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.supabase = await acreate_client(settings.supabase_url, settings.supabase_key)
    yield


app = FastAPI(title="Hilo Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(personas_router)
