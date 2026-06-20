from supabase import AsyncClient

TABLE = "personas_desaparecidas"

LIST_COLS = (
    "id,nombre,primer_apellido,segundo_apellido,sexo,"
    "edad_actual,estado,municipio,estatus_victima"
)
DETAIL_COLS = (
    LIST_COLS + ",fecha_hechos,fecha_percato,sana_particular,media_filiacion,fotografia"
)


def parse_filiacion(raw: str | None) -> dict[str, str]:
    """media_filiacion is a '<br>'-delimited 'KEY: value' blob."""
    out: dict[str, str] = {}
    for part in (raw or "").split("<br>"):
        if ":" in part:
            key, value = part.split(":", 1)
            if key.strip():
                out[key.strip()] = value.strip()
    return out


def parse_senas(raw: str | None) -> list[str]:
    """sana_particular is '<br>'-delimited; 'NINGUNA' means no marks."""
    items = [s.strip() for s in (raw or "").split("<br>") if s.strip()]
    return [s for s in items if s.upper() != "NINGUNA"]


async def list_personas(
    sb: AsyncClient,
    *,
    estado: str | None,
    sexo: str | None,
    q: str | None,
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    query = sb.table(TABLE).select(LIST_COLS, count="exact")
    if estado:
        query = query.ilike("estado", f"%{estado}%")
    if sexo:
        query = query.eq("sexo", sexo)
    if q:
        query = query.ilike("nombre", f"%{q}%")
    query = query.order("id").range(offset, offset + limit - 1)
    res = await query.execute()
    return res.data, res.count or 0


async def get_persona(sb: AsyncClient, persona_id: int) -> dict | None:
    res = (
        await sb.table(TABLE)
        .select(DETAIL_COLS)
        .eq("id", persona_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None
