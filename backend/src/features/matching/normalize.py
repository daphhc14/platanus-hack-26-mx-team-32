"""Normalize free-text señas / filiación into structured, comparable features.

Deterministic and pure — no DB, no LLM. The laterality token is extracted
explicitly because it is the disqualifier signal in scoring.
"""
import re

_LAT = {
    "IZQUIERDO": "IZQ", "IZQUIERDA": "IZQ", "IZQ": "IZQ",
    "DERECHO": "DER", "DERECHA": "DER", "DER": "DER",
}
_STOP = {"LADO", "O", "Y", "DE", "DEL", "EL", "LA", "EN", "CON"}


def _tokens(text: str | None) -> list[str]:
    return [t for t in re.split(r"[^A-ZÁÉÍÓÚÑ0-9]+", (text or "").upper()) if t]


def normalize_sena(text: str) -> dict:
    toks = _tokens(text)
    lado = next((_LAT[t] for t in toks if t in _LAT), None)
    content = {t for t in toks if t not in _STOP and t not in _LAT}
    return {"raw": text, "lado": lado, "tokens": content}


def normalize_senas(raw: str | list | None) -> list[dict]:
    if isinstance(raw, str):
        items = [s.strip() for s in raw.split("<br>") if s.strip()]
    else:
        items = [str(s).strip() for s in (raw or []) if s and str(s).strip()]
    return [normalize_sena(s) for s in items if s.upper() != "NINGUNA"]


def parse_filiacion(raw: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in (raw or "").split("<br>"):
        if ":" in part:
            key, value = part.split(":", 1)
            if key.strip():
                out[key.strip()] = value.strip()
    return out


def estatura_cm(raw: str | None) -> int | None:
    m = re.search(r"ESTATURA:\s*([\d.,]+)", raw or "")
    if not m:
        return None
    digits = re.search(r"(\d{2,3})", m.group(1))
    return int(digits.group(1)) if digits else None
