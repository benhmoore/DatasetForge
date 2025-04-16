from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlmodel import Session, select
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.security import authenticate_user, logout_user, get_current_user
from ..db import get_session
from ..api.models import User
from ..core.config import settings

router = APIRouter()

# Create rate limiter
limiter = Limiter(key_func=get_remote_address)


@router.post("/login")
@limiter.limit(f"{settings.LOGIN_RATE_LIMIT}/minute")
async def login(
    credentials: HTTPBasicCredentials = Depends(HTTPBasic()),
    session: Session = Depends(get_session),
    request: Request = None
):
    """
    Login endpoint to authenticate users
    Uses HTTP Basic Authentication
    Rate limited to prevent brute force attacks
    """
    try:
        user = authenticate_user(credentials, session)
        return {"message": "Login successful"}
    except HTTPException as e:
        # Re-raise the exception from authenticate_user
        raise e


@router.post("/logout")
async def logout(user: User = Depends(get_current_user)):
    """Logout the current user by invalidating their session"""
    logout_user(user.username)
    return {"message": "Logout successful"}


@router.get("/user/preferences")
async def get_user_preferences(user: User = Depends(get_current_user)):
    """Get current user's preferences"""
    return {
        "name": user.name,
        "default_gen_model": user.default_gen_model,
        "default_para_model": user.default_para_model
    }


@router.put("/user/preferences")
async def update_user_preferences(
    preferences: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update user preferences"""
    # Update user model with new preferences
    if "default_gen_model" in preferences:
        user.default_gen_model = preferences["default_gen_model"]
    if "default_para_model" in preferences:
        user.default_para_model = preferences["default_para_model"]
        
    # Save changes to the database
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return {"message": "Preferences updated successfully"}