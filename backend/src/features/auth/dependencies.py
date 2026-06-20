from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import AsyncClient

from ...deps import get_supabase

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    sb: AsyncClient = Depends(get_supabase),
):
    """Verify the Supabase-issued JWT and return the authenticated user.

    Works for any provider (Google included): we ask Supabase to validate the
    token rather than verifying the signature locally.
    """
    try:
        res = await sb.auth.get_user(creds.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")
    if not res or not res.user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")
    return res.user
