"""Deterministic matcher: block → score → laterality disqualifier → tier.

Pure functions over plain dicts (no DB). Every tunable lives in tuning.CONFIG —
this module only reads it, so retuning never means hunting through the logic.
"""
import re
from datetime import date

from .normalize import estatura_cm, normalize_senas, plausible_estatura
from .tuning import CONFIG

_NEUTRAL = 0.5  # score for a field we simply can't compare (missing data ≠ mismatch)


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
    thr = CONFIG.senas_match_threshold
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
        if best < thr:
            continue
        matching = [p for j, p in overlaps if j >= thr]
        compatible = next(
            (p for p in matching if not c["lado"] or not p["lado"] or p["lado"] == c["lado"]),
            None,
        )
        if compatible is not None:
            evidence.append(f"seña coincide: «{c['raw']}» ~ «{compatible['raw']}»")
        else:
            contradictions.append(f"lateralidad opuesta: «{c['raw']}» vs «{matching[0]['raw']}»")
    return sum(best_scores) / len(best_scores), contradictions, evidence


def block(persona: dict, cuerpo: dict) -> tuple[bool, str | None]:
    """Cheap hard filters. Laterality is NOT here — it's a score cap, so a
    near-miss still surfaces *as rejected* rather than vanishing silently."""
    if CONFIG.block_on_sexo:
        ps, cs = (persona.get("sexo") or "").upper(), (cuerpo.get("sexo") or "").upper()
        if ps and cs and ps != cs:
            return False, "sexo incompatible"
    if CONFIG.block_on_temporal:
        dd = _parse_date(persona.get("fecha_percato") or persona.get("fecha_hechos"))
        dh = _parse_date(cuerpo.get("fecha_hallazgo"))
        if dd and dh and dd > dh:
            return False, "desaparición posterior al hallazgo"
    pe = persona.get("edad")
    lo, hi = cuerpo.get("edad_min"), cuerpo.get("edad_max")
    m = CONFIG.age_block_margin
    if pe is not None and lo is not None and hi is not None and (pe < lo - m or pe > hi + m):
        return False, "edad fuera de rango"
    return True, None


def score_pair(persona: dict, cuerpo: dict) -> dict:
    """All evidence/contradictions here are COMPUTED (deterministic) — the LLM
    never restates them. Uncomparable fields score _NEUTRAL, not 0."""
    senas_c = normalize_senas(cuerpo.get("sana_particular"))
    senas_p = normalize_senas(persona.get("sana_particular"))
    senas_s, contradictions, evidence = score_senas(senas_c, senas_p)
    if not (senas_c and senas_p):
        senas_s = _NEUTRAL  # body or ficha has no marks listed → can't compare

    # sexo (survivors already passed the block, so state it as a fact)
    ps, cs = persona.get("sexo"), cuerpo.get("sexo")
    if ps and cs and ps.upper() == cs.upper():
        evidence.append(f"sexo coincide: {ps}")

    est_c = plausible_estatura(cuerpo.get("estatura_cm"))
    est_p = estatura_cm(persona.get("media_filiacion"))
    if est_c and est_p:
        estatura_s = max(0.0, 1 - abs(est_c - est_p) / CONFIG.estatura_tolerance_cm)
        evidence.append(f"estatura {'compatible' if estatura_s > 0.6 else 'difiere'}: {est_p}cm vs {est_c}cm")
    else:
        estatura_s = _NEUTRAL

    pe, lo, hi = persona.get("edad"), cuerpo.get("edad_min"), cuerpo.get("edad_max")
    if pe is not None and lo is not None and hi is not None:
        edad_s = 1.0 if lo <= pe <= hi else max(
            0.0, 1 - min(abs(pe - lo), abs(pe - hi)) / CONFIG.edad_decay_years
        )
        evidence.append(f"edad {'compatible' if edad_s >= 0.8 else 'parcial'}: ficha {pe}, cuerpo {lo}-{hi}")
    else:
        edad_s = _NEUTRAL

    p_est, c_est = (persona.get("estado") or "").upper(), (cuerpo.get("estado") or "").upper()
    if p_est and c_est:
        geo_s = 1.0 if p_est == c_est else CONFIG.geo_other_state_score
        if geo_s == 1.0:
            evidence.append(f"mismo estado: {persona.get('estado')}")
    else:
        geo_s = _NEUTRAL

    dd = _parse_date(persona.get("fecha_percato") or persona.get("fecha_hechos"))
    dh = _parse_date(cuerpo.get("fecha_hallazgo"))
    if dd and dh:
        temporal_s = 1.0 if dd <= dh else 0.0
        if dd <= dh:
            evidence.append(f"temporal coherente: desaparición {dd}, hallazgo {dh} ({(dh - dd).days} días)")
    else:
        temporal_s = _NEUTRAL

    total = (
        CONFIG.w_senas * senas_s
        + CONFIG.w_estatura * estatura_s
        + CONFIG.w_edad * edad_s
        + CONFIG.w_geo * geo_s
        + CONFIG.w_temporal * temporal_s
    )
    if contradictions:
        total = min(total, CONFIG.disqualified_cap)

    tier = "alta" if total >= CONFIG.tier_alta else "media" if total >= CONFIG.tier_media else "baja"
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


def rank_personas_for_cuerpo(cuerpo: dict, personas: list[dict], top_k: int | None = None) -> list[dict]:
    k = CONFIG.top_k if top_k is None else top_k
    scored = []
    for p in personas:
        ok, _ = block(p, cuerpo)
        if not ok:
            continue
        r = score_pair(p, cuerpo)
        r["persona_victima_id"] = p["id_victimadirecta"]
        scored.append(r)
    scored.sort(key=lambda r: r["score"], reverse=True)
    top = scored[:k]
    # Always surface disqualified (contradicted) pairs — a strong-surface match
    # that we rejected on laterality is precisely what a reviewer needs to see.
    seen = {id(r) for r in top}
    rejected = [r for r in scored if r["contradicciones"] and id(r) not in seen]
    return top + rejected
