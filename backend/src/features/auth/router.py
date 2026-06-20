from fastapi import APIRouter, Depends

from .dependencies import get_current_user
from .schemas import UserOut

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email, role=getattr(user, "role", None))
