from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlmodel import Session, select
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.security import authenticate_user, logout_user, get_current_user
from ..db import get_session, engine
from ..api.models import User
from ..core.config import settings
from sqlalchemy import inspect

router = APIRouter()

# Create rate limiter
limiter = Limiter(key_func=get_remote_address)


@router.get("/setup/status")
async def get_setup_status(session: Session = Depends(get_session)):
    """Check if any users exist in the database."""
    try:
        # Check if the User table exists first
        inspector = inspect(engine)
        if not inspector.has_table(User.__tablename__):
            # If table doesn't exist, setup is definitely needed
            return {"users_exist": False, "needs_setup": True}
        
        # If table exists, check for users
        user_count = session.exec(select(User)).first()
        users_exist = user_count is not None
        return {"users_exist": users_exist, "needs_setup": not users_exist}
    except Exception as e:
        # Log the error for debugging
        print(f"Error checking setup status: {e}") 
        # In case of DB error, assume setup might be needed or something is wrong
        # Returning users_exist: True prevents blocking login if DB is temporarily down
        # but ideally, a more specific error should be handled by the frontend.
        # For now, let's default to assuming users exist to avoid blocking login on DB error.
        return {"users_exist": True, "needs_setup": False, "error": str(e)}


@router.post("/login")
@limiter.limit(f"{settings.LOGIN_RATE_LIMIT}/minute")
async def login(
    credentials: HTTPBasicCredentials = Depends(HTTPBasic(auto_error=False)),
    session: Session = Depends(get_session),
    request: Request = None
):
    """
    Login endpoint to authenticate users
    Uses HTTP Basic Authentication
    Rate limited to prevent brute force attacks
    """
    # Check if credentials were provided
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    # Check if any users exist in the system
    from sqlmodel import text
    user_count = session.exec(select(User)).first()
    if user_count is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No users found in system. Please run 'python backend/app/cli.py create-user' to create a user.",
            headers={"X-Error-Code": "no_users_exist"},  # Removed WWW-Authenticate header
        )
    
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
        "default_para_model": user.default_para_model,
        "gen_model_context_size": user.gen_model_context_size,
        "para_model_context_size": user.para_model_context_size
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
    if "gen_model_context_size" in preferences:
        user.gen_model_context_size = preferences["gen_model_context_size"]
    if "para_model_context_size" in preferences:
        user.para_model_context_size = preferences["para_model_context_size"]
        
    # Save changes to the database
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return {"message": "Preferences updated successfully"}