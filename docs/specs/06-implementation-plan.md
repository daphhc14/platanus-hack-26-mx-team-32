# 06. Plan de implementacion

## Objetivo del primer sprint

Crear la columna vertebral para adquisicion web segura sin tocar el matcher. El resultado debe poder correr en demo con fuentes synthetic/publicas controladas y mostrar que no esta hardcodeado: run IDs, URLs, hashes, nodos y eventos reales del workflow.

## Fase 0: base de specs

- [x] Research scan.
- [x] Arquitectura modular.
- [x] Modelo de datos propuesto.
- [x] Workflow.
- [x] Integracion Firecrawl.
- [x] Politica de fuentes.

## Fase 1: tablas y tipos

- [ ] Agregar migracion SQLite para `source_permissions`, `acquisition_runs`, `raw_artifacts`, `extraction_jobs`, `social_risk_events`, `risk_event_links`.
- [ ] Agregar `consents`, `event_review_decisions`, `expires_at`, purge metadata e idempotency keys.
- [ ] Crear tipos TS en `lib/acquisition/types.ts`.
- [ ] Crear repositorios pequeños para runs y artifacts.
- [ ] Agregar seeds de fuentes permitidas demo.

## Fase 2: policy gate

- [ ] `SourcePolicyService.evaluate(input)`.
- [ ] Bloquear `unknown` y `private_denied`.
- [ ] Separar `discovery_search` de adquisicion sobre fuente clasificada.
- [ ] Snapshot de policy en cada run.
- [ ] Tests unitarios de fuentes permitidas/bloqueadas, consentimiento revocado, PII denied y ToS/base legal no validada.

## Fase 3: Firecrawl provider

- [ ] Crear `WebAcquisitionProvider`.
- [ ] Crear `FirecrawlProvider`.
- [ ] Soportar `search` y `scrape` primero.
- [ ] Guardar metadata, content hash y errores.
- [ ] Fallback `MockAcquisitionProvider` para demo sin API key.

## Fase 4: extraction

- [ ] Schema extractor para oferta laboral sospechosa.
- [ ] Schema extractor para evento social municipal.
- [ ] Conectar detector actual de ofertas falsas como validator secundario.
- [ ] Guardar `confidence`, `risk_signals`, `privacy_level`.
- [ ] Validar salida contra JSON Schema y tratar texto scrapeado como no confiable.

## Fase 5: API/UI

- [ ] `POST /api/acquisition/runs`.
- [ ] `GET /api/acquisition/runs/:id`.
- [ ] `GET /api/risk-events`.
- [ ] Event stream para demo visual.
- [ ] Mapa con capas: fichas, ofertas sospechosas, contexto municipal.

## Fase 6: produccion responsable

- [ ] Schedules por fuente.
- [ ] Change tracking/hash dedupe.
- [ ] Ejecutar purge de artifacts expirados (DB + blob) con auditoria.
- [ ] RBAC de artifacts restricted.
- [ ] Export audit por `run_id`.

## Orden recomendado de PRs

1. DB/types only.
2. Policy gate + matriz de tests legales/PII.
3. Mock provider + demo event stream.
4. Firecrawl provider behind env.
5. Extractors + detector integration.
6. UI map/workflow visualization.

## Definicion de listo

- Se puede ejecutar un run con un seed URL autorizado.
- Se guarda artifact con hash y provenance.
- Se extrae un evento social o una oferta laboral a schema.
- Nada se publica sin review si tiene PII/riesgo.
- PII real requiere consentimiento registrado o fuente oficial/base legal documentada.
- Todo artifact tiene `expires_at` y puede ser purgado.
- La demo muestra run real con nodos y timestamps.
