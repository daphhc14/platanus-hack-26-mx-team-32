from datetime import datetime

from pydantic import BaseModel

from ..personas.schemas import PersonaDetail


class VinculoIn(BaseModel):
    persona_victima_id: str
    parentesco: str | None = None


class Vinculo(BaseModel):
    id: str
    persona_victima_id: str
    parentesco: str | None = None
    created_at: datetime


class VinculoOut(BaseModel):
    """The link plus the linked person's full ficha (for the profile screen)."""
    vinculo: Vinculo
    persona: PersonaDetail | None = None
    chat_unlocked: bool = False
