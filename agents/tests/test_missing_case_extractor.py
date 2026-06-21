from unittest.mock import MagicMock, patch


def test_fetch_persona_node_found():
    from agents.missing_case_extractor import fetch_persona_node

    mock_row = {
        "id_victimadirecta": "abc-123",
        "nombre": "María",
        "primer_apellido": "García",
        "segundo_apellido": None,
        "sexo": "Mujer",
        "edad_actual": 23,
        "estado": "Jalisco",
        "municipio": "Guadalajara",
        "fecha_hechos": "2023-03-15",
        "sana_particular": "Tatuaje de mariposa en brazo derecho",
        "media_filiacion": "Estatura: 160cm<br>Complexión: Delgada",
    }
    with patch("agents.missing_case_extractor.get_supabase") as mock_sb:
        mock_res = MagicMock()
        mock_res.data = [mock_row]
        mock_sb.return_value.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = mock_res
        state = {
            "task_id": "t1",
            "persona_victima_id": "abc-123",
            "persona_row": None,
            "hilo_record": None,
            "error": None,
        }
        result = fetch_persona_node(state)

    assert result["persona_row"]["id_victimadirecta"] == "abc-123"
    assert result["error"] is None


def test_normalize_node_converts_correctly():
    from agents.missing_case_extractor import normalize_node

    state = {
        "task_id": "t1",
        "persona_victima_id": "abc-123",
        "persona_row": {
            "id_victimadirecta": "abc-123",
            "nombre": "María",
            "primer_apellido": "García",
            "segundo_apellido": None,
            "sexo": "Mujer",
            "edad_actual": 23,
            "estado": "Jalisco",
            "municipio": "Guadalajara",
            "fecha_hechos": "2023-03-15",
            "sana_particular": "Tatuaje de mariposa en brazo derecho",
            "media_filiacion": "Estatura: 160cm<br>Complexión: Delgada",
        },
        "hilo_record": None,
        "error": None,
    }
    result = normalize_node(state)
    rec = result["hilo_record"]
    assert rec["id"] == "abc-123"
    assert rec["sex"] == "F"
    assert rec["estado"] == "Jalisco"
    assert rec["record_type"] == "missing"
    assert rec["height_cm"] == 160


def test_case_extractor_graph_compiles():
    from agents.missing_case_extractor import build_case_extractor_graph
    app = build_case_extractor_graph()
    assert app is not None
