from pydantic import BaseModel, ConfigDict, field_validator


class PersonaListItem(BaseModel):
    # The source columns are declared TEXT but the data is untyped and the
    # loader writes mixed scalars across refreshes (edad_actual=18 as int,
    # fotografia=True as bool). Coerce any non-id scalar to str so reads stay
    # robust no matter what the dataset bootstrap produces.
    model_config = ConfigDict(coerce_numbers_to_str=True)

    @field_validator("*", mode="before")
    @classmethod
    def _bool_to_str(cls, v):
        return str(v).lower() if isinstance(v, bool) else v

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
