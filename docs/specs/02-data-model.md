# 02. Modelo de datos

El esquema actual de Hilo ya cubre `sources`, `records`, `features`, `candidate_matches`, `reviews`, `tips`, `secure_locations` y `audit_log`. La capa de adquisicion web/social agrega tablas nuevas sin modificar el significado del core forense.

## Separacion critica

Hay dos rutas distintas:

- Dato de caso: fichas de desaparicion, senas, ropa, fotos, datos ante mortem. Entra a `records` y `features` solo con fuente oficial, consentimiento o acuerdo autorizado.
- Dato de contexto: ofertas sospechosas, balaceras, secuestros reportados, trata/enganche, narcomenudeo contextual y control territorial macro. Entra a `social_risk_events` y nunca confirma un match.

`social_risk_events` no guarda fichas de personas desaparecidas como casos. Si una fuente trae una ficha, la ruta correcta es `missing-case-extractor -> records/features -> human review`.

## Capas y propiedad de datos

| Capa | Llena | Lee | No debe hacer |
|---|---|---|---|
| `source-registry` | `source_permissions`, `consents` | `sources` | Scrapear. |
| `acquisition` | `acquisition_runs`, `raw_artifacts` | `source_permissions`, `consents` | Extraer PII a entidades finales. |
| `extraction` | `extraction_jobs` | `raw_artifacts` | Publicar o confirmar. |
| `normalization` | `features`, entidades normalizadas internas | `extraction_jobs` | Decidir verdad factual. |
| `risk-intel` | `social_risk_events`, `risk_event_links` | entidades normalizadas | Guardar coordenadas exactas de riesgo criminal. |
| `review` | `reviews`, `event_review_decisions`, `audit_log` | todo via RBAC | Saltarse consentimiento. |

## Tablas nuevas

| Tabla | Proposito | Constraint clave |
|---|---|---|
| `source_permissions` | Versiona que acciones permite cada fuente y bajo que base legal/ToS. | `effective_from/effective_to`, `policy_version`. |
| `consents` | Prueba auditable de consentimiento, alcance y revocacion. | `revoked_at`, `scope_json`, `privacy_notice_version`. |
| `acquisition_runs` | Ejecuciones idempotentes de discovery, scrape, crawl, monitor o import. | `idempotency_key UNIQUE`. |
| `raw_artifacts` | Artefacto crudo por fetch/sighting con provenance completa. | `UNIQUE (run_id, url, content_hash)`. |
| `extraction_jobs` | Extracciones versionadas sobre artefactos. | `UNIQUE (raw_artifact_id, extractor_version, schema_name)`. |
| `social_risk_events` | Eventos contextuales, no casos forenses. | `privacy_level DEFAULT restricted`, `severity 1..5`. |
| `event_review_decisions` | Historial append-only de cambios de revision. | `event_id`, `from_status`, `to_status`. |
| `risk_event_links` | Links contextuales hacia records. | Sin `possible_same_case`; no cambia estado forense. |

## Idempotencia y provenance

No usar `UNIQUE(content_hash)` global. El mismo contenido puede aparecer en dos fuentes o en dos runs distintos y eso es informacion util. La regla queda:

- `raw_artifacts`: una fila por fetch/sighting permitido.
- `content_hash`: sirve para dedupe y change tracking, pero no borra provenance.
- `UNIQUE (run_id, url, content_hash)`: evita duplicar retries dentro del mismo run.
- `extraction_jobs`: idempotente por artifact + version de extractor + schema.

## Consentimiento, retencion y cancelacion

`access_type` no es suficiente para probar consentimiento. Por eso se agrega `consents`:

- quien otorgo permiso, expresado como rol, no identidad publica;
- alcance del consentimiento en `scope_json`;
- version del aviso de privacidad;
- fecha de otorgamiento, expiracion y revocacion;
- evidencia restringida en `evidence_uri`.

Cada artifact tiene `expires_at`; un purge debe borrar fila/logica y blob asociado, dejando solo auditoria minima de borrado cuando aplique. Hashes de contenido con PII no deben tratarse como inocuos: pueden funcionar como fingerprint re-identificable.

## Defaults seguros

- `raw_artifacts.privacy_level` default: `restricted`.
- `raw_artifacts.redaction_status` default: `pending`.
- `social_risk_events.privacy_level` default: `restricted`.
- Nada baja a `internal` o `public_aggregate` sin policy/review.

## Futuro Postgres

Cuando el demo pase a producto:

- Postgres + JSONB para `evidence_json`, `output_json`, `provider_metadata_json`.
- `pgvector` para similitud semantica de textos/ofertas/fichas.
- PostGIS para geografias con precision degradada por politica.
- Object storage para HTML, markdown, screenshots y PDFs.
- RLS real para `raw_artifacts`, `secure_locations`, `consents` y PII.

## Principio de minimizacion

No todo lo que se puede extraer debe entrar a tablas finales. Guardar raw restringido, extraer campos minimizados y publicar solo agregados aprobados con umbrales de anonimato.
