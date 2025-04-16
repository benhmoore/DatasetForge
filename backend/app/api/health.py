from fastapi import APIRouter, Depends
from sqlmodel import Session
from ..db import get_session

router = APIRouter()


@router.get("/health")
async def health_check(session: Session = Depends(get_session)):
    """
    Health check endpoint to verify that the API is working
    and database connection is successful
    """
    try:
        # Test database connection with a simple query
        from sqlalchemy import text
        session.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}