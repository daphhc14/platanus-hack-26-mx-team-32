from pydantic import BaseModel


class UserOut(BaseModel):
    id: str
    email: str | None = None
    role: str | None = None
