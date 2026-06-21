# HANDOFF — Capa de adquisicion e inteligencia social (Hilo)

Documento de relevo para retomar sin reconstruir contexto.

Branch: `hilo-engine`.

## 1. TL;DR

- Los specs de `docs/specs/` fueron revisados y corregidos: workflow sobre swarm, Firecrawl via adapter, consentimiento/retencion, idempotencia por capa, y separacion caso/contexto.
- La implementacion base de adquisicion ya existe en `lib/acquisition/` y esta verde.
- Los extractores LLM ya estan implementados con SDK nativo de Anthropic, structured outputs y fallback deterministico sin key.
- El smoke test cubre mock provider -> extractor fallback -> extraction_job -> social_risk_event.
- Lineage multi-artifact + revocacion en cascada + helpers de k-anonimato/copy-safe/redaccion (spec 05) ya estan implementados y cubiertos por el smoke test.

## 2. Commits base en `origin/hilo-engine`

Antes de este handoff, estos commits ya estaban en remoto:

```text
da1f7d2 feat(acquisition): Add Firecrawl provider adapter
a53a4b6 feat(acquisition): Add source policy persistence layer
b44edf5 docs(acquisition): Add web intelligence architecture specs
```

Este handoff y los extractores deben quedar en commits posteriores.

## 3. Archivos clave

- `lib/acquisition/types.ts`: tipos del dominio (incluye `SocialEventLineage`, `RevocationPropagationResult`).
- `lib/acquisition/policy.ts`: `evaluateSourcePolicy()` + `acquisitionIdempotencyKey()`.
- `lib/acquisition/safety.ts`: `kAnonymityCheck()`, `validateCopySafety()`, `redactPii()` (spec 05).
- `lib/acquisition/provider.ts`: puerto `WebAcquisitionProvider`.
- `lib/acquisition/providers/firecrawl.ts`: adapter Firecrawl REST v2.
- `lib/acquisition/providers/mock.ts`: provider mock para demo/tests.
- `lib/acquisition/repo.ts`: `AcquisitionRepository` + `attachEventLineage/listEventLineage` + `propagateConsentRevocation()`.
- `lib/acquisition/extractors/client.ts`: config Anthropic/modelos.
- `lib/acquisition/extractors/schemas.ts`: carga schemas canonicos.
- `lib/acquisition/extractors/extract.ts`: extractor structured-output + fallback.
- `scripts/test-acquisition.ts`: smoke test end-to-end en DB en memoria (incluye lineage, revocacion y safety).
- `docs/specs/schemas/*.json`: schemas canonicos.

## 4. Decisiones cerradas

1. Workflow > swarm. Los nodos/workers llenan tablas distintas y necesitan idempotencia.
2. Firecrawl es adapter, no dependencia del dominio.
3. Modular monolith TypeScript + SQLite para MVP.
4. `social_risk_events` es contexto, no caso forense. Fichas van a `records/features`.
5. No hay `UNIQUE(content_hash)` global. La idempotencia vive por capa.
6. PII real requiere consentimiento/base legal y `expires_at`.
7. Extractor LLM no es agente: es una llamada con schema + fallback.

## 5. Modelos y API Anthropic

Verificado contra docs oficiales de Anthropic:

- Default: `claude-haiku-4-5`.
- Escalacion: `claude-opus-4-8`.
- TypeScript SDK: `@anthropic-ai/sdk`.
- Structured outputs: `client.messages.parse()` con `output_config.format`.
- Helper usado: `@anthropic-ai/sdk/helpers/json-schema`.
- No pegar keys en chat. Usar `ANTHROPIC_API_KEY` en env.
- `EXTRACTOR_MODEL` permite override.

Nota: el helper TS instalado esta exportado como `@anthropic-ai/sdk/helpers/json-schema`, no como `@anthropic-ai/sdk/helpers`.

## 6. Estado de extractores

Implementado:

- `extractFromArtifact(artifact, schemaName)`.
- Schemas soportados:
  - `hilo.fake_job_offer.v1`
  - `hilo.social_risk_event.v1`
- Si hay `ANTHROPIC_API_KEY`, llama Anthropic con structured outputs.
- Si no hay key, usa fallback deterministico.
- El fallback usa `detectOffer()` como validador secundario.
- El output incluye `confidence`, `needs_review`, `validator`, `extractor_name`, `extractor_version`.

No corrido todavia:

- Llamada real con API key. Solo correr cuando el usuario exporte `ANTHROPIC_API_KEY`.

## 7. Verificaciones esperadas

```bash
npm run typecheck
npm run test:acquisition
sqlite3 :memory: '.read lib/schema.sql' '.schema social_risk_events'
```

Esperado:

- `typecheck` exit 0.
- `test:acquisition` imprime `✓ acquisition smoke test passed`.
- SQLite crea las tablas nuevas sin error.

Test live (opcional, con API key):

```bash
ANTHROPIC_API_KEY=sk-... npm run test:extractor:live
```

Usa artefactos sinteticos (sin PII, sin fetch externo mas alla de Anthropic). Si no hay key, aborta con exit 2 sin tocar la red.

## 8. Pendientes no bloqueantes

Resueltos en commit posterior:

- Lineage multi-artifact: `social_event_artifact_lineage(event_id, raw_artifact_id, role)` + `attachEventLineage/listEventLineage` + `propagateConsentRevocation()` que purga artifacts, falla extraction_jobs y esconde eventos (directos o via lineage) en una sola transaccion, idempotente.
- k-anonimato / redaccion / copy seguro: `lib/acquisition/safety.ts` con `kAnonymityCheck`, `validateCopySafety` y `redactPii`, derivados del spec 05 y cubiertos por el smoke test. Listos para usarse como lint/validacion cuando la publicacion agregada y la UI existan.

Sigue pendiente (no bloqueante):

- Correr `npm run test:extractor:live` con una `ANTHROPIC_API_KEY` real y dejar registro del output. El script ya existe y usa artefactos sinteticos sin PII.

## 9. No commitear

Estos archivos siguen siendo ajenos/no relacionados salvo que el usuario diga lo contrario:

- `.firecrawl/`
- `.commandcode/`
- `.rtk/`
- `CLAUDE.md`
- `app/ui.html`

