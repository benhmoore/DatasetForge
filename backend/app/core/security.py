import os
import base64
import bcrypt
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlmodel import Session, select
from ..api.models import User
from ..db import get_session
from .config import settings

# Set up HTTP Basic Auth with auto_error=False to prevent browser prompt
# This allows our frontend to handle the redirect to login page
security = HTTPBasic(auto_error=False)

# In-memory session store
# Format: {"username": {"valid_until": datetime, "key": derived_key}}
active_sessions: Dict[str, Dict] = {}


def get_password_hash(password: str, salt: bytes = None) -> tuple:
    """Generate password hash and salt"""
    if salt is None:
        salt = bcrypt.gensalt()
    
    # Hash the password with the salt
    password_hash = bcrypt.hashpw(password.encode(), salt).decode()
    salt_str = salt.decode() if isinstance(salt, bytes) else salt
    
    # Print debugging info to help troubleshoot
    print(f"Created hash: salt={salt_str}, hash_length={len(password_hash)}")
    
    return password_hash, salt_str


def verify_password(plain_password: str, hashed_password: str, salt: str) -> bool:
    """Verify a password against a hash"""
    try:
        # Salt is stored separately but should be encoded as part of the hash comparison
        salt_bytes = salt.encode() if isinstance(salt, str) else salt
        password_bytes = plain_password.encode()
        hash_bytes = hashed_password.encode()
        
        # For debugging
        print(f"Verifying password: salt length={len(salt_bytes)}, hash length={len(hash_bytes)}")
        
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except Exception as e:
        print(f"Password verification error: {str(e)}")
        return False


def authenticate_user(
    credentials: HTTPBasicCredentials = Depends(security),
    session: Session = Depends(get_session)
) -> User:
    """Authenticate user with HTTP Basic Auth"""
    # Handle case when no credentials are provided
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
        
    # Query for user
    user = session.exec(
        select(User).where(User.username == credentials.username)
    ).first()
    
    # Check if user exists and password is correct
    if not user or not verify_password(
        credentials.password, user.password_hash, user.salt
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    # Create session with 30-minute expiry
    now = datetime.utcnow()
    active_sessions[user.username] = {
        "valid_until": now + timedelta(minutes=settings.SESSION_TIMEOUT),
        "user_id": user.id,
    }
    
    return user


def get_current_user(
    credentials: HTTPBasicCredentials = Depends(security),
    session: Session = Depends(get_session)
) -> User:
    """Get the current authenticated user or raise 401"""
    # Handle case when no credentials are provided
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
        
    # Check if user has an active session
    user_session = active_sessions.get(credentials.username)
    
    if not user_session or datetime.utcnow() > user_session["valid_until"]:
        # Session expired or doesn't exist
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
        )
    
    # Refresh session expiry time
    user_session["valid_until"] = datetime.utcnow() + timedelta(minutes=settings.SESSION_TIMEOUT)
    
    # Get user from database
    user = session.exec(
        select(User).where(User.id == user_session["user_id"])
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    return user


def derive_encryption_key(user_password: str, user_salt: str) -> bytes:
    """Derive encryption key from password and salts"""
    # Decode the base64 salt from settings
    global_salt = base64.b64decode(settings.SECRET_SALT)
    
    # Create a key using PBKDF2HMAC with both user salt and global salt
    key = hashlib.pbkdf2_hmac(
        'sha256',
        user_password.encode('utf-8'),
        user_salt.encode('utf-8') + global_salt,
        100000,  # iterations
        32  # key length in bytes
    )
    
    return key


def logout_user(username: str) -> None:
    """Remove a user's session"""
    if username in active_sessions:
        del active_sessions[username]