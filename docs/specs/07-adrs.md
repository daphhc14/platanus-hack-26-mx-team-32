# 07. ADRs

## ADR-001: Workflow sobre swarm

Decision: usar workflow orquestado.

Contexto: la adquisicion llena tablas por capas y necesita permisos, retries, idempotencia y auditoria.

Consecuencias:

- Mas facil depurar y demostrar que no esta hardcodeado.
- Menos magia que un swarm.
- Los nodos pueden verse como agentes en demo, pero son workers con contratos.

## ADR-002: Firecrawl via adapter

Decision: Firecrawl se integra detras de `WebAcquisitionProvider`.

Contexto: Firecrawl es util para search/scrape/crawl/map/monitoring, pero no debe contaminar el dominio.

Consecuencias:

- Podemos cambiar proveedor o usar mock sin tocar matching.
- El policy gate vive antes del provider.
- Tests pueden correr sin network ni API key.

## ADR-003: Social scraping con permiso primero

Decision: no scrapear grupos privados, WhatsApp ni fuentes detras de login sin autorizacion.

Contexto: el dominio maneja PII, victimas y riesgo criminal.

Consecuencias:

- Menos cobertura inmediata, pero menor riesgo legal y de dano.
- Los colectivos pueden integrarse via alianzas/imports autorizados.
- El MVP prioriza fuentes oficiales, publicas y consentidas.

## ADR-004: Modular monolith primero

Decision: mantener Node/TypeScript + SQLite en el repo actual para MVP, con modulos internos claros.

Contexto: el proyecto ya corre sin framework pesado y tiene demo end-to-end.

Consecuencias:

- Menor friccion para hackathon.
- Migracion futura a Postgres/Supabase/queue queda disenada pero no bloquea.
- Las tablas nuevas no rompen el core forense.

## ADR-005: Eventos sociales como contexto, no prueba

Decision: balaceras, narcomenudeo, plazas y secuestros entran como senales contextuales con confidence y review.

Contexto: esos datos pueden ser rumor, estar incompletos o causar dano si se publican.

Consecuencias:

- Matching forense no se confirma por contexto social.
- UI usa lenguaje probabilistico.
- Coordenadas exactas quedan prohibidas para datos criminales sensibles.
- Fichas de personas desaparecidas no viven en `social_risk_events`; se enrutan a `records/features` con consentimiento o fuente oficial.

## ADR-006: Recommender no es agente por default

Decision: el recomendador sera funcion/LLM call salvo que tenga herramientas y acciones propias.

Contexto: un agente sin acciones solo agrega complejidad.

Consecuencias:

- Menor costo y mejor observabilidad.
- Si despues necesita consultar fuentes, abrir tareas o reintentar, se convierte en agente/worker.

## ADR-007: Runtime de workflow TypeScript-first

Decision: el MVP usa un runtime de workflow en TypeScript: state machine local o `langgraphjs` si no agrega friccion. LangGraph Python queda como opcion posterior.

Contexto: el repo actual es Node/TypeScript + SQLite y el objetivo de hackathon favorece una sola runtime stack.

Consecuencias:

- Menos friccion de deploy.
- Se preserva la decision workflow sobre swarm.
- Si se necesita Python para LangGraph maduro, se registra como cambio arquitectonico separado.

## ADR-008: Consentimiento y retencion desde MVP

Decision: cualquier ingestion con PII real requiere consentimiento/base legal registrada y `expires_at` desde el primer corte implementable.

Contexto: access type no prueba consentimiento y los artifacts crudos pueden contener datos sensibles de victimas, familiares o terceros.

Consecuencias:

- Se agrega `consents`.
- Cada `raw_artifact` tiene expiracion y ruta de purge.
- La revocacion debe propagarse a artifacts, extracciones, eventos y vistas.

## ADR-009: Idempotencia por capa

Decision: no usar `UNIQUE(content_hash)` global. La idempotencia se define por capa.

Contexto: el mismo contenido puede aparecer en varias fuentes o runs; eso es provenance, no duplicado accidental.

Consecuencias:

- `acquisition_runs.idempotency_key` evita runs repetidos.
- `raw_artifacts` deduplica por `run_id + url + content_hash`.
- `extraction_jobs` deduplica por `artifact + extractor_version + schema`.
