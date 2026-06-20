from pydantic import BaseModel


class PersonaListItem(BaseModel):
    id: int
    nombre: str | None = None
    primer_apellido: str | None = None
    segundo_apellido: str | None = None
    sexo: str | None = None
    edad_actual: str | None = None
    estado: str | None = None
    municipio: str | None = None
    estatus_victima: str | None = None


class Filiacion(BaseModel):
    raw: str | None = None
    parsed: dict[str, str] = {}


class PersonaDetail(PersonaListItem):
    fecha_hechos: str | None = None
    fecha_percato: str | None = None
    fotografia: str | None = None
    senas: list[str] = []
    filiacion: Filiacion = Filiacion()


class PersonaList(BaseModel):
    items: list[PersonaListItem]
    total: int
    limit: int
    offset: int
