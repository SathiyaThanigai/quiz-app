"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.api.auth import router as auth_router
from app.api.sessions import router as sessions_router
from app.api.questions import router as questions_router
from app.api.export import router as export_router
from app.api.uploads import router as uploads_router
from app.websocket.handlers import router as ws_router

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Pulse - Real-Time Quiz Application",
    description="A real-time quiz application with speed-based scoring and leaderboards",
    version="1.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(questions_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(ws_router)

# Note: images are now uploaded directly to Cloudinary (see app/api/uploads.py)
# and served from Cloudinary's CDN, so no local static file mount is needed.


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Pulse Quiz API is running"}


@app.get("/api/health")
async def health_check():
    """API health check."""
    return {"status": "healthy", "version": "1.0.0"}
