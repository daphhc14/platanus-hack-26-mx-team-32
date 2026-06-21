# 04. Integracion Firecrawl

## Decision

Integrar Firecrawl como provider de adquisicion, no como dependencia del dominio. El core de Hilo habla con un puerto `WebAcquisitionProvider`; Firecrawl es una implementacion.

## Capacidades relevantes

| Firecrawl | Uso en Hilo |
|---|---|
| `/search` | Descubrir fuentes publicas: fiscalias, comisiones, boletines, notas, paginas de colectivos autorizadas. |
| `/scrape` | Convertir una URL conocida en markdown/html/json; sirve para fichas, comunicados, PDFs y paginas publicas. |
| JSON mode | Extraer schema especifico: oferta laboral sospechosa, evento social contextual o ficha autorizada que se enruta a `records/features`. |
| `/map` | Descubrir URLs dentro de un sitio oficial o colectivo autorizado. |
| `/crawl` | Recorrer secciones aprobadas de sitios oficiales. |
| Monitoring/change tracking | Detectar cambios sin scrapear todo cada vez. |
| PII redaction | Reducir exposicion antes de pasar artefactos a LLM o UI interna. Es defensa adicional, no frontera unica de seguridad. |

## Puerto TypeScript

```ts
export type ProviderAction = "search" | "scrape" | "map" | "crawl" | "monitor";
export type AcquisitionRunMode = ProviderAction | "discovery_search" | "manual_import";

export type SourcePolicyDecision = {
  allowed: boolean;
  reason: string;
  allowedActions: AcquisitionRunMode[];
  piiAllowed: boolean;
  privacyLevel: "public_aggregate" | "internal" | "restricted";
  retentionDays: number;
};

export type SearchInput = {
  runId: string;
  query: string;
  limit: number;
  includeDomains?: string[];
  excludeDomains?: string[];
};

export type ScrapeInput = {
  runId: string;
  url: string;
  formats: Array<"markdown" | "html" | "json" | "screenshot" | "links">;
  jsonSchema?: unknown;
  redactPii?: boolean;
};

export type RawArtifactPayload = {
  url: string;
  title?: string;
  markdown?: string;
  html?: string;
  json?: unknown;
  screenshotUrl?: string;
  links?: string[];
  metadata: Record<string, unknown>;
  fetchedAt: string;
  contentHash: string;
};

export interface WebAcquisitionProvider {
  search(input: SearchInput): Promise<Array<{ url: string; title?: string; description?: string }>>;
  scrape(input: ScrapeInput): Promise<RawArtifactPayload>;
  map?(input: { runId: string; url: string }): Promise<string[]>;
  crawl?(input: { runId: string; url: string; limit: number }): Promise<RawArtifactPayload[]>;
}
```

## Firecrawl adapter

Variables:

```bash
FIRECRAWL_API_KEY=fc-...
FIRECRAWL_API_URL=https://api.firecrawl.dev
```

Reglas:

- El adapter no decide si una fuente se puede consultar; eso lo hace `policy_gate`.
- El adapter no escribe a la base directo; devuelve payloads.
- El servicio `RawArtifactRepository` calcula hash, deduplica y persiste.
- Si se pide JSON, usar schemas versionados de `docs/specs/schemas/`.
- Si se activa PII redaction, guardar `redaction_status`.

## Schemas iniciales para JSON mode

Los schemas canónicos viven en archivos versionados para evitar drift entre docs, TS y SQL:

- `docs/specs/schemas/fake_job_offer.schema.json`
- `docs/specs/schemas/social_risk_event.schema.json`

El markdown no debe duplicar esos JSON completos. Si cambia un enum, `privacy_level`, `additionalProperties` o un campo requerido, se actualiza primero el archivo canónico y luego los tipos/validadores generados desde ahi.

## Fuentes aptas para Firecrawl en MVP

1. Sitios oficiales: CNB, comisiones estatales, fiscalias, boletines.
2. Paginas web publicas de colectivos cuando existe permiso, acuerdo o base legal/ToS validada. Visible no significa autorizado.
3. Medios y comunicados publicos para contexto municipal.
4. Links enviados por familias/colectivos/admins con consentimiento.

## Discovery vs acquisition

`discovery_search` puede buscar candidatos de fuente en web abierta con limites estrictos, pero no debe persistir raw sensible ni extraer PII. Su salida es una cola de `source_candidates` para revision. `search`, `scrape`, `map`, `crawl` y `monitor` requieren fuente clasificada y policy aprobada.

## Fuentes no aptas para Firecrawl en MVP

- Grupos privados de Facebook.
- WhatsApp.
- Contenido detras de login sin autorizacion.
- Cuentas falsas, evasion de CAPTCHA, paywalls o controles anti-bot.
- Mapas operativos de narcomenudeo/plazas con coordenadas finas.

## Prompt injection

El contenido scrapeado es datos no confiables. Los extractores deben:

- mantener instrucciones del sistema separadas del texto de la pagina;
- validar salida contra JSON Schema;
- no aceptar `confidence` del LLM como unica senal;
- registrar extractor/version/prompt policy;
- mandar a review cualquier salida con PII, acusacion criminal o instrucciones sospechosas.

## Primer corte implementable

1. Crear `lib/acquisition/types.ts`.
2. Crear `lib/acquisition/policy.ts`.
3. Crear `lib/acquisition/providers/firecrawl.ts`.
4. Crear `lib/acquisition/raw-artifacts.ts`.
5. Agregar endpoint `POST /api/acquisition/runs`.
6. Agregar endpoint `GET /api/acquisition/runs/:id`.
7. Mostrar stream de eventos en UI demo.
