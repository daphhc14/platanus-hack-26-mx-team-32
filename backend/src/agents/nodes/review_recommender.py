"""review_recommender — prioritizes match results for human review."""
from agents.state import AgentState
from agents.supabase_client import insert_many


def review_recommender(state: AgentState) -> AgentState:
    """Score and prioritize review tasks based on match results + social context."""
    print(f"  [review_recommender] {len(state.get('match_results', []))} matches to prioritize")

    review_tasks = []
    social_events = state.get("social_events", [])

    for match in state.get("match_results", []):
        ficha_id = match.get("ficha_id")
        overall_score = match.get("overall_score", 0)
        tier = match.get("verifier_tier", "baja")

        ficha = next((f for f in state.get("fichas_to_match", []) if str(f["id"]) == str(ficha_id)), None)
        ficha_estado = ficha.get("estado", "") if ficha else ""

        context_boost = 0.0
        for ev in social_events:
            if ev.get("estado", "").lower() in ficha_estado.lower():
                context_boost = 0.2
                break

        ficha_confidence = float(ficha.get("confianza_extraccion", 0)) if ficha else 0

        priority = min(1.0, overall_score * 0.6 + context_boost + ficha_confidence * 0.2)

        tier_label = {"alta": "ALTA prioridad", "media": "prioridad media", "baja": "baja prioridad"}
        reason_parts = [f"Score {overall_score:.2f} ({tier_label.get(tier, tier)})"]
        if context_boost > 0:
            reason_parts.append("evento social cercano (fosa/balacera en mismo estado)")
        if ficha_confidence > 0.7:
            reason_parts.append("extracción de alta confianza")
        reason = ". ".join(reason_parts)

        review_tasks.append({
            "ficha_id": ficha_id,
            "priority": round(priority, 3),
            "reason": reason,
            "status": "pending",
        })

    review_tasks.sort(key=lambda x: x["priority"], reverse=True)

    if review_tasks:
        try:
            insert_many("review_queue", review_tasks)
            print(f"  [review_recommender] wrote {len(review_tasks)} tasks to review_queue")
        except Exception as e:
            print(f"  [review_recommender] Supabase write error: {e}")
            state["errors"].append(f"review_queue write: {e}")

    state["review_tasks"] = review_tasks
    print(f"  [review_recommender] {len(review_tasks)} review tasks generated")
    return state
