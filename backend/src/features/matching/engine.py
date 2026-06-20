"""Deterministic matcher: block → score → laterality disqualifier → tier.

Pure functions over plain dicts (no DB). The vector-retrieval and LLM-verify
layers wrap around this later; this layer is what makes the result *correct*.
"""
import re
from datetime import date

from .normalize import estatura_cm, normalize_senas

WEIGHTS = {"senas": 0.5, "estatura": 0.2, "edad": 0.1, "geo": 0.1, "temporal": 0.1}
DISQUALIFIED_CAP = 0.2  # a laterality contradiction caps the total here


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _parse_date(s: str | None) -> date | None:
    s = (s or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)  # M/D/Y (as seen in the data)
    if m:
        a, b, y = int(m[1]), int(m[2]), int(m[3])
        mo, da = (a, b) if a <= 12 else (b, a)
        try:
            return date(y, mo, da)
        except ValueError:
            return None
    return None


def score_senas(cuerpo_senas: list[dict], persona_senas: list[dict]):
    """Best-pair matching. Returns (score, contradictions, evidence)."""
    if not cuerpo_senas or not persona_senas:
        return 0.0, [], []
    contradictions: list[str] = []
    evidence: list[str] = []
    best_scores: list[float] = []
    for c in cuerpo_senas:
        overlaps = sorted(
            ((_jaccard(c["tokens"], p["tokens"]), p) for p in persona_senas),
            key=lambda x: x[0], reverse=True,
        )
        best = overlaps[0][0] if overlaps else 0.0
        best_scores.append(best)
        if best < 0.5:
            continue
        # among content-matching señas, prefer one with COMPATIBLE laterality.
        matching = [p for j, p in overlaps if j >= 0.5]
        compatible = next(
            (p for p in matching if not c["lado"] or not p["lado"] or p["lado"] == c["lado"]),
            None,
        )
        if compatible is not None:
            evidence.append(f"seña coincide: «{c['raw']}» ~ «{compatible['raw']}»")
        else:
            # every content-overlapping seña is on the opposite side → contradiction
            opp = matching[0]
            contradictions.append(f"lateralidad opuesta: «{c['raw']}» vs «{opp['raw']}»")
    return sum(best_scores) / len(best_scores), contradictions, evidence


def block(persona: dict, cuerpo: dict) -> tuple[bool, str | None]:
    """Cheap hard filters. Laterality is NOT here — it's a score cap, so the
    near-miss still surfaces *as rejected* rather than vanishing silently."""
    ps, cs = (persona.get("sexo") or "").upper(), (cuerpo.get("sexo") or "").upper()
    if ps and cs and ps != cs:
        return False, "sexo incompatible"
    dd = _parse_date(persona.get("fecha_percato") or persona.get("fecha_hechos"))
    dh = _parse_date(cuerpo.get("fecha_hallazgo"))
    if dd and dh and dd > dh:
        return False, "desaparición posterior al hallazgo"
    pe = persona.get("edad")
    lo, hi = cuerpo.get("edad_min"), cuerpo.get("edad_max")
    if pe is not None and lo is not None and hi is not None and (pe < lo - 8 or pe > hi + 8):
        return False, "edad fuera de rango"
    return True, None


def score_pair(persona: dict, cuerpo: dict) -> dict:
    senas_s, contradictions, evidence = score_senas(
        normalize_senas(cuerpo.get("sana_particular")),
        normalize_senas(persona.get("sana_particular")),
    )

    est_c, est_p = cuerpo.get("estatura_cm"), estatura_cm(persona.get("media_filiacion"))
    if est_c and est_p:
        estatura_s = max(0.0, 1 - abs(est_c - est_p) / 20)
        if estatura_s > 0.7:
            evidence.append(f"estatura compatible ({est_p}cm ~ {est_c}cm)")
    else:
        estatura_s = 0.0

    pe, lo, hi = persona.get("edad"), cuerpo.get("edad_min"), cuerpo.get("edad_max")
    if pe is not None and lo is not None and hi is not None:
        edad_s = 1.0 if lo <= pe <= hi else max(0.0, 1 - min(abs(pe - lo), abs(pe - hi)) / 10)
    else:
        edad_s = 0.0

    p_est, c_est = (persona.get("estado") or "").upper(), (cuerpo.get("estado") or "").upper()
    geo_s = 1.0 if p_est and p_est == c_est else 0.3
    if geo_s == 1.0:
        evidence.append(f"mismo estado ({persona.get('estado')})")

    dd = _parse_date(persona.get("fecha_percato") or persona.get("fecha_hechos"))
    dh = _parse_date(cuerpo.get("fecha_hallazgo"))
    temporal_s = 1.0 if (dd and dh and dd <= dh) else 0.5

    total = (
        WEIGHTS["senas"] * senas_s
        + WEIGHTS["estatura"] * estatura_s
        + WEIGHTS["edad"] * edad_s
        + WEIGHTS["geo"] * geo_s
        + WEIGHTS["temporal"] * temporal_s
    )
    if contradictions:
        total = min(total, DISQUALIFIED_CAP)

    tier = "alta" if total >= 0.7 else "media" if total >= 0.4 else "baja"
    return {
        "score": round(total, 4),
        "tier": tier,
        "evidencia": evidence,
        "contradicciones": contradictions,
        "subscores": {
            "senas": round(senas_s, 3), "estatura": round(estatura_s, 3),
            "edad": round(edad_s, 3), "geo": round(geo_s, 3), "temporal": round(temporal_s, 3),
        },
    }


def rank_personas_for_cuerpo(cuerpo: dict, personas: list[dict], top_k: int = 5) -> list[dict]:
    scored = []
    for p in personas:
        ok, _ = block(p, cuerpo)
        if not ok:
            continue
        r = score_pair(p, cuerpo)
        r["persona_victima_id"] = p["id_victimadirecta"]
        scored.append(r)
    scored.sort(key=lambda r: r["score"], reverse=True)
    top = scored[:top_k]
    # Always surface disqualified (contradicted) pairs — a strong-surface match
    # that we rejected on laterality is precisely what a reviewer needs to see.
    seen = {id(r) for r in top}
    rejected = [r for r in scored if r["contradicciones"] and id(r) not in seen]
    return top + rejected
