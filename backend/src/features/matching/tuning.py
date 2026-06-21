"""ONE place to tune the matcher. Edit CONFIG and re-run the matcher.

Bias for this domain: favor RECALL (don't miss anyone) over precision — a human
reviews every candidate, so surfacing a few extra is cheap; missing a true match
is not. To cast a WIDER net, the arrows below show which way to move each knob.

NOTE: the laterality disqualifier is deliberately NOT softenable here — left vs
right is a hard contradiction and the safety anchor. Everything else is fair game.
"""
from dataclasses import dataclass


@dataclass
class MatchConfig:
    # --- retrieval breadth -------------------------------------------------
    retrieve_k: int = 50          # vector candidates pulled before scoring   (↑ = wider)
    top_k: int = 8                # candidates kept per body                   (↑ = more shown)
    llm_verify_top_n: int = 3     # only the top N get an LLM narrative        (↓ = faster/cheaper)

    # --- señas matching ----------------------------------------------------
    senas_match_threshold: float = 0.4   # token overlap to count as a match  (↓ = looser)

    # --- field weights (roughly sum to 1) ----------------------------------
    w_senas: float = 0.45
    w_estatura: float = 0.20
    w_edad: float = 0.10
    w_geo: float = 0.15
    w_temporal: float = 0.10

    # --- tolerances (how forgiving each field is) --------------------------
    estatura_tolerance_cm: float = 25.0   # full credit within this gap       (↑ = wider)
    edad_decay_years: float = 12.0        # age score decays over this span    (↑ = wider)
    geo_other_state_score: float = 0.40   # credit when states differ          (↑ = wider)

    # --- tiers (lower = more candidates labeled higher) --------------------
    tier_alta: float = 0.65
    tier_media: float = 0.35

    # --- laterality disqualifier (KEEP STRICT) -----------------------------
    disqualified_cap: float = 0.20        # contradicted pairs capped here

    # --- hard blocking (these EXCLUDE — widen to avoid missing people) -----
    block_on_sexo: bool = True
    block_on_temporal: bool = True        # disappearance must precede hallazgo
    age_block_margin: int = 12            # years of slack before age excludes  (↑ = wider)


# Edit this instance to retune the whole pipeline.
CONFIG = MatchConfig()
