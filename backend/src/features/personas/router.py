from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import AsyncClient

from ...deps import get_supabase
from . import service
from .schemas import Filiacion, PersonaDetail, PersonaList

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("", response_model=PersonaList)
async def list_personas(
    estado: str | None = None,
    sexo: str | None = None,
    q: str | None = Query(None, description="Busca por nombre"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sb: AsyncClient = Depends(get_supabase),
):
    items, total = await service.list_personas(
        sb, estado=estado, sexo=sexo, q=q, limit=limit, offset=offset
    )
    return PersonaList(items=items, total=total, limit=limit, offset=offset)


@router.get("/{persona_id}", response_model=PersonaDetail)
async def get_persona(
    persona_id: int,
    sb: AsyncClient = Depends(get_supabase),
):
    row = await service.get_persona(sb, persona_id)
    if not row:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    return PersonaDetail(
        **{
            k: row.get(k)
            for k in (
                "id", "nombre", "primer_apellido", "segundo_apellido", "sexo",
                "edad_actual", "estado", "municipio", "estatus_victima",
                "fecha_hechos", "fecha_percato", "fotografia",
            )
        },
        senas=service.parse_senas(row.get("sana_particular")),
        filiacion=Filiacion(
            raw=row.get("media_filiacion"),
            parsed=service.parse_filiacion(row.get("media_filiacion")),
        ),
    )
