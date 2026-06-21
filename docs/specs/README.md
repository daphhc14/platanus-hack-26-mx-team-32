# Hilo Specs: adquisicion web e inteligencia social

Este paquete baja la idea a una arquitectura modular y ejecutable. La regla de diseno es: primero contratos y tablas, luego implementacion.

## Decision corta

Usar un workflow orquestado, no un swarm abierto. Cada capa tiene responsabilidades y tablas distintas:

- `source-registry`: decide si una fuente se puede consultar.
- `acquisition`: busca/scrapea/guarda artefactos crudos.
- `extraction`: convierte paginas, fichas y posts permitidos en datos estructurados.
- `normalization`: limpia y normaliza entidades, fechas, municipios y senas.
- `risk-intel`: produce eventos sociales municipales.
- `matching`: cruza fichas, cuerpos y contexto.
- `review`: valida hallazgos con humanos y audita.

Los "agentes" solo se justifican cuando tienen herramientas y acciones. Una recomendacion que solo lee datos y responde puede ser una llamada LLM/funcion, no un agente.

## Indice

1. [Research scan](./00-research-scan.md): que existe, que falta y que fuentes impactan mas.
2. [Arquitectura](./01-architecture.md): sistema, modulos, decisiones workflow vs swarm.
3. [Modelo de datos](./02-data-model.md): tablas por capa y migracion propuesta.
4. [Workflows](./03-workflows.md): estados, nodos y contratos tipo LangGraph.
5. [Firecrawl](./04-firecrawl-integration.md): integracion por adapter, no acoplada.
6. [Politica de fuentes y seguridad](./05-source-policy-and-safety.md): limites de scraping social.
7. [Plan de implementacion](./06-implementation-plan.md): pasos pequenos para construirlo.
8. [ADRs](./07-adrs.md): decisiones arquitectonicas registradas.

## Estado del repo actual

El proyecto ya tiene el plano forense principal: datos sinteticos calibrados, matcher, verificador, RBAC, auditoria, detector de ofertas falsas y endpoints de demo. Este spec agrega la capa faltante de adquisicion web/social y la separa del core forense para no contaminarlo con scraping, PII o fuentes no autorizadas.

## Criterios de aceptacion del spec

- No se scrapean grupos privados, WhatsApp ni contenido detras de login sin permiso explicito.
- Cada dato derivado guarda provenance: `source_id`, `url`, `run_id`, hash, fecha, extractor y version.
- Ningun dato social sensible publica coordenadas exactas ni acusa a una persona o grupo.
- El demo puede mostrar actividad de agentes/workers, pero produccion debe usar jobs programados e idempotentes.
- Firecrawl es un provider intercambiable detras de un puerto; si falla o se cambia, el dominio no cambia.

