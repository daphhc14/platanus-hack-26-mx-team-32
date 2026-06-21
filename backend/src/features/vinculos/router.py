from fastapi import APIRouter, Depends, HTTPException, Response, status
from starlette.concurrency import run_in_threadpool
from supabase import AsyncClient

from ...db import get_db
from ...deps import get_supabase
from ..auth.dependencies import get_current_user
from ..personas import service as personas_service
from ..personas.schemas import PersonaDetail
from . import service
from .schemas import Vinculo, VinculoIn, VinculoOut

router = APIRouter(prefix="/me", tags=["vinculos"])


async def _persona_detail(sb: AsyncClient, victima_id: str) -> PersonaDetail | None:
    row = await personas_service.get_persona_by_victima(sb, victima_id)
    return PersonaDetail(**personas_service.build_detail(row)) if row else None


@router.get("/vinculo", response_model=VinculoOut | None)
async def my_vinculo(
    user=Depends(get_current_user),
    db=Depends(get_db),
    sb: AsyncClient = Depends(get_supabase),
):
    """The person the current MB is linked to (with full ficha), or null."""
    row = await run_in_threadpool(service.get_vinculo, db, user.id)
    if not row:
        return None
    persona = await _persona_detail(sb, row["persona_victima_id"])
    return VinculoOut(vinculo=Vinculo(**row), persona=persona)


@router.post("/vinculo", response_model=VinculoOut, status_code=status.HTTP_201_CREATED)
async def create_vinculo(
    body: VinculoIn,
    user=Depends(get_current_user),
    db=Depends(get_db),
    sb: AsyncClient = Depends(get_supabase),
):
    """Onboarding result: link the MB to a persona by id_victimadirecta."""
    persona = await _persona_detail(sb, body.persona_victima_id)
    if not persona:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Persona no encontrada")
    await run_in_threadpool(service.upsert_usuario, db, user.id, user.email)
    row = await run_in_threadpool(
        service.set_vinculo, db, user.id, body.persona_victima_id, body.parentesco
    )
    return VinculoOut(vinculo=Vinculo(**row), persona=persona)


@router.delete("/vinculo", status_code=status.HTTP_204_NO_CONTENT)
async def remove_vinculo(user=Depends(get_current_user), db=Depends(get_db)):
    await run_in_threadpool(service.delete_vinculo, db, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
