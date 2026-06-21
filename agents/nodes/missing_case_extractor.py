"""missing_case_extractor — calls the TS bridge to match fichas against cuerpos."""
import json
import os
import subprocess
from agents.state import AgentState
from agents.config import DATABASE_URL


def missing_case_extractor(state: AgentState) -> AgentState:
    """For each ficha, call the TS bridge to run block→score→verify."""
    print(f"  [missing_case_extractor] {len(state.get('fichas_to_match', []))} fichas to match")

    all_results = []
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env = {
        **os.environ,
        "DATABASE_URL": DATABASE_URL,
    }

    for ficha in state.get("fichas_to_match", []):
        ficha_id = str(ficha["id"])
        try:
            result = subprocess.run(
                ["npx", "tsx", "scripts/bridge-match.ts", ficha_id],
                capture_output=True, text=True, timeout=30,
                cwd=project_root,
                env=env,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                matches = data.get("matches", [])
                all_results.extend(matches)
                name = ficha.get("nombre_completo", "?")[:30]
                print(f"    ✓ {name}: {len(matches)} matches")
            else:
                err = result.stderr[:100]
                print(f"    ✗ ficha {ficha_id}: {err}")
                state["errors"].append(f"bridge {ficha_id}: {err}")
        except subprocess.TimeoutExpired:
            print(f"    ✗ ficha {ficha_id}: timeout")
            state["errors"].append(f"bridge {ficha_id}: timeout")
        except Exception as e:
            print(f"    ✗ ficha {ficha_id}: {e}")
            state["errors"].append(f"bridge {ficha_id}: {e}")

    state["match_results"] = all_results
    print(f"  [missing_case_extractor] total matches: {len(all_results)}")
    return state
