# 00. Research scan

## Fuentes revisadas

- Firecrawl docs: Search, Scrape, Map, Crawl, Monitoring, JSON output y PII Redaction.
- Ley General en Materia de Desaparicion Forzada, Desaparicion cometida por Particulares y Sistema Nacional de Busqueda. Ultima reforma DOF 16-07-2025.
- Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares. Ultima reforma DOF 14-11-2025.
- RNPDNO consulta publica y CNB reporte inicial.
- NamUs: sistema estadounidense de missing/unidentified persons con base segura y comparacion de casos.
- Ushahidi: plataforma de crowdsourcing y mapeo para crisis, derechos humanos y reportes ciudadanos.
- Reportes periodisticos 2025-2026 sobre reclutamiento por falsas ofertas laborales y fallas de investigacion en desapariciones.

## Que ya existe y que aprendemos

| Referente | Que resuelve | Leccion para Hilo |
|---|---|---|
| NamUs | Base unificada para personas desaparecidas, restos no identificados, profesionales, familias y comparacion de casos. | El valor no es solo el algoritmo, es el flujo seguro de caso, evidencia, permisos y revision humana. |
| Ushahidi | Captura ciudadana, moderacion y mapa de eventos en crisis. | Para datos sociales conviene intake + moderacion + geografia aproximada, no scraping ciego. |
| RNPDNO/CNB | Registro y reporte institucional de personas desaparecidas. | Fuente oficial necesaria, pero incompleta y lenta para difusion social. |
| Colectivos y redes sociales | Publicacion rapida de fichas, contexto local y alertas. | Alto valor, pero alto riesgo de PII, rumor, doxxing y represalias. Requiere permisos y minimizacion. |
| Hilo actual | Record-linkage forense, verificador, RBAC, demo sintetico, detector de ofertas falsas. | Ya existe el core. La nueva capa debe alimentar tablas sin romper la politica synthetic-by-default. |

## Impacto de datos por fuente/caso de uso

Ranking para el producto, no para una investigacion penal. "Impacto" significa: posibilidad de mejorar busqueda, matching, alerta temprana o priorizacion humana con bajo dano.

| Prioridad | Dato social | Impacto | Razon | Riesgo |
|---|---|---:|---|---|
| 1 | Ofertas laborales falsas / reclutamiento | Muy alto | Es mecanismo directo de captacion y desaparicion; ademas deja textos, telefonos, salarios, rutas y patrones repetibles. | Alto: puede exponer victimas o redes criminales; guardar evidencia minimizada. |
| 2 | Fichas de desaparecidos publicadas por colectivos/familias | Muy alto | Aportan senas, ropa, ultima ubicacion aproximada, foto y fechas antes que muchas fuentes oficiales. | Muy alto: PII sensible; solo con fuente oficial, fuente autorizada o consentimiento. Se enrutan a `records/features`, no a `social_risk_events`. |
| 3 | Secuestros, levantones, privacion de libertad | Alto | Mecanismo directo o cercano a desaparicion; util para ventanas temporales y zonas. | Alto: rumores y acusaciones; requiere verificacion humana. |
| 4 | Trata, enganche, migracion/coyotaje, traslados | Alto | Explica patrones que no aparecen como "desaparicion" al inicio. | Alto: dificil de validar; manejar en agregado. |
| 5 | Balaceras / enfrentamientos | Medio | Contexto de riesgo territorial y ventanas de desplazamiento; no siempre causal. | Medio: ruido alto, duplicados, panico. |
| 6 | Narcomenudeo / puntos de venta | Bajo-medio | Contexto territorial; puede correlacionar con reclutamiento, extorsion o violencia. | Muy alto: doxxing, represalias, difamacion; solo agregados municipales. |
| 7 | Plazas / control territorial | Bajo para MVP | Es contexto macro, dificil de verificar y peligroso de publicar. | Critico: no almacenar mapas operativos ni atribuciones finas. |

## Influencia estimada en desapariciones

Para modelado de riesgo, las variables mas influyentes deben entrar asi:

1. Reclutamiento mediante falsas ofertas laborales: indicador directo y accionable.
2. Levantones/secuestros/privacion de libertad: indicador directo, pero requiere validacion.
3. Trata, enganche, migracion/coyotaje y traslados: mecanismo de desaparicion o no localizacion.
4. Control territorial/extorsion: variable contextual a nivel municipio/colonia amplia, no coordenada exacta.
5. Omision o colusion institucional: importante para explicar subregistro y falta de seguimiento, pero dificil de operacionalizar en demo.
6. Narcomenudeo y balaceras: senales de ambiente, no pruebas de causalidad.

## Lo que probablemente Claude dejo corto

- Separar "dato de caso" de "dato de contexto". Una ficha de desaparicion no debe vivir igual que un reporte de balacera.
- Crear una tabla de permisos de fuente antes de cualquier scraper.
- Guardar artefactos crudos con hashes, no solo extracciones. Sin provenance no se puede auditar.
- Tener una cola de revision humana para eventos sociales. No todo debe llegar al mapa.
- Diseñar modos: `demo_live`, `scheduled_refresh`, `manual_authorized_import`.
- Evitar que el "mapa de narco" se vuelva producto. Para seguridad, ese contenido solo debe existir como senal agregada y no publica.

## Referencias verificadas

- Firecrawl introduction: https://docs.firecrawl.dev/introduction
- Firecrawl search: https://docs.firecrawl.dev/features/search
- Firecrawl scrape: https://docs.firecrawl.dev/features/scrape
- Firecrawl crawl: https://docs.firecrawl.dev/features/crawl
- Firecrawl map: https://docs.firecrawl.dev/features/map
- Firecrawl monitoring: https://docs.firecrawl.dev/features/monitoring
- Ley General en Materia de Desaparicion Forzada de Personas: https://www.diputados.gob.mx/LeyesBiblio/pdf/LGMDFP.pdf
- Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
- RNPDNO consulta publica: https://consultapublicarnpdno.segob.gob.mx/
- CNB reporte inicial: https://cnbreporteinicial.segob.gob.mx/
- NamUs: https://namus.nij.ojp.gov/
- Ushahidi: https://www.ushahidi.com/
- AP sobre reclutamiento con falsas ofertas en redes: https://apnews.com/article/mexico-jalisco-cartel-el-mencho-drugs-sinaloa-99f755b7173f101d74e6a1eac333cd38
- El Pais sobre reclutamiento en redes, Facebook/TikTok y Teuchitlan: https://elpais.com/mexico/2025-04-06/reclutados-en-redes-por-el-crimen-en-mexico-las-4-letras-de-guadalajara-les-invita-a-trabajar.html
- El Pais sobre registro de desaparecidos y problemas de investigacion: https://elpais.com/mexico/2026-03-28/el-nuevo-registro-de-desaparecidos-evidencia-la-negligencia-de-las-fiscalias-a-la-hora-de-investigar.html
