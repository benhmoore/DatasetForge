from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel

from .api import (
    health,
    templates,
    datasets,
    generate,
    paraphrase,
    export_templates,
    workflows,
    filter,
)
from .core.config import settings
from .core.logging import LoggingMiddleware
from .db import create_db_and_tables
from .db_migration import migrate_database

# Initialize FastAPI app
app = FastAPI(
    title="DatasetForge API",
    description="API for generating fine-tuning datasets",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware
app.add_middleware(LoggingMiddleware)

# Include API routers
app.include_router(health.router, tags=["health"])
app.include_router(templates.router, tags=["templates"])
app.include_router(datasets.router, tags=["datasets"])
app.include_router(generate.router, tags=["generate"])
app.include_router(paraphrase.router, tags=["paraphrase"])
app.include_router(export_templates.router, tags=["export_templates"])
app.include_router(workflows.router, tags=["workflows"])
app.include_router(filter.router, tags=["filter"])


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the exception (already handled by LoggingMiddleware)

    # Return a standardized error response
    if isinstance(exc, HTTPException):
        # Keep FastAPI's HTTPExceptions as is
        raise exc

    # Convert other exceptions to 500 errors
    return HTTPException(status_code=500, detail=f"Internal server error: {str(exc)}")


@app.on_event("startup")
def on_startup():
    """Run when the application starts"""
    # Create database tables
    create_db_and_tables()
    # Run database migrations
    migrate_database()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
