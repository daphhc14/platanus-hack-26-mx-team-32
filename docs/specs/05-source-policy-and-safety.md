# 05. Politica de fuentes y seguridad

## Principio central

Que algo sea tecnicamente scrapeable no lo vuelve aceptable. Hilo trabaja con personas desaparecidas, familias, colectivos y datos que pueden causar represalias. La politica de fuentes es una parte del producto.

## Clasificacion de fuentes

| Access type | Ejemplos | Acciones permitidas |
|---|---|---|
| `official_public` | CNB, RNPDNO, fiscalias, comisiones estatales. | search, scrape, map, crawl, monitor, store raw, extract con base legal documentada. |
| `public_web` | Medios, boletines, paginas publicas. | discovery/search y contexto minimizado; PII requiere base legal adicional. |
| `authorized_group` | Colectivo o grupo que da permiso explicito. | import/scrape limitado segun acuerdo y consentimiento registrado. |
| `submitted_by_family` | Link, ficha o captura enviada por familiar. | store restricted, extract minimizado, human review. |
| `submitted_by_partner` | ONG/colectivo/clinica/aliado. | segun convenio. |
| `private_denied` | WhatsApp, grupos privados, perfiles cerrados. | no fetch; solo registrar que esta bloqueado si hace falta. |
| `unknown` | Fuente sin clasificar. | no scrape; requiere revision. |

## Reglas para social media

- Facebook Groups: solo contenido publico y permitido por ToS/base legal, o via alianza/admin/consentimiento. No cuentas falsas, no scraping detras de login, no evasion.
- Instagram/TikTok/X: solo posts publicos y autorizados; guardar URL y fecha; no descargar mas de lo necesario. Publico/visible no equivale a permitido.
- WhatsApp: no scraping. Solo intake voluntario de capturas/links por un usuario autorizado.
- Comentarios: por defecto no ingerir comentarios, porque elevan PII, rumores y doxxing.

## Datos criminales sensibles

Casos como narcomenudeo, plazas, secuestros y balaceras deben tratarse como contexto de riesgo, no como mapa operativo.

| Dato | Guardar exacto | Mostrar publico | Nota |
|---|---:|---:|---|
| Oferta laboral sospechosa | No telefono completo en vistas publicas | No, solo patron agregado | Interno/restringido para revision. |
| Desaparicion/ficha | Solo con permiso o fuente oficial | Segun consentimiento | Nunca autoconfirmar. |
| Secuestro/levanton | No | Agregado municipal | Requiere verificacion. |
| Balacera | Ubicacion aproximada | Agregado temporal/municipal | No usar como prueba causal. |
| Narcomenudeo | No | No detalles; solo score agregado | Alto riesgo de dano. |
| Plaza/control territorial | No | No | Mantener fuera del MVP salvo contexto macro. |

## PII y retencion

- Raw artifacts con PII: `privacy_level='restricted'`.
- Retencion corta por default: 30 dias, salvo consentimiento/convenio.
- Hashes de contenido con PII pueden ser re-identificables; no tratarlos como metadata inocua.
- Redaccion antes de pasar a prompts cuando sea posible.
- Ningun prompt debe pedir inferir culpables o identificar personas privadas.
- Cada artifact con PII requiere `expires_at`, ruta de purge y auditoria minima de borrado.
- Consentimiento y revocacion viven en `consents`; `access_type` por si solo no prueba permiso.

## Consentimiento y derechos ARCO

Para `submitted_by_family`, `submitted_by_partner` y `authorized_group`, registrar:

- rol de quien otorga permiso;
- alcance: que datos, que uso, que fuentes, que retencion;
- version del aviso de privacidad;
- fecha de otorgamiento, expiracion y revocacion;
- propagacion de revocacion a artifacts, extracciones, eventos y vistas.

No implementar ingestion con PII real antes de tener esta ruta.

## Revision humana

Todo evento social con `confidence < 0.85`, PII, acusacion criminal o localizacion sensible entra en `review_status='pending'`.

Solo se publica si:

- fuente permitida;
- privacy level compatible;
- evento no expone persona privada;
- ubicacion degradada a municipio/area amplia;
- una revisora lo aprueba.

## Publicacion agregada

Un agregado municipal no siempre anonimiza. Reglas minimas:

- no publicar celdas con conteo menor a `k` definido por politica;
- agrupar por ventana temporal mas amplia si el municipio/localidad es pequeno;
- degradar ubicacion a municipio/region, nunca coordenada exacta;
- no publicar series que permitan identificar un caso unico por fecha, edad, oficio o descripcion.

## Copy seguro para UI

Usar lenguaje de incertidumbre:

- "posible patron"
- "senal contextual"
- "pendiente de revision"
- "no constituye conclusion"
- "fuente publica/autorizada"

Evitar:

- "culpable"
- "plaza de X en esta calle"
- "este caso esta conectado"
- "confirmado por IA"
