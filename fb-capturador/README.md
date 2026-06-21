# Hilo Capturador — Extensión Firefox

**Standalone.** No depende del resto del proyecto Hilo. Esta carpeta se puede copiar/zipar y usar independientemente.

Captura pasiva de posts sobre fosas y desapariciones mientras navegas grupos de Facebook. PII redactada en tiempo real. Para investigación de derechos humanos (ONG).

## Instalación (Firefox)

1. Abre Firefox y ve a `about:debugging#/runtime/this-firefox`
2. Click **"Cargar extensión temporal"**
3. Selecciona el archivo `manifest.json` de esta carpeta
4. El icono 🧵 aparece en la barra de herramientas

## Uso

1. **Navega a cualquier grupo de Facebook** (`facebook.com/groups/...`)
2. La extensión captura automáticamente los posts visibles mientras haces scroll
3. Cada post se procesa:
   - **PII redactada** (teléfonos, emails, URLs de perfiles → `[TELÉFONO]`, `[EMAIL]`, etc.)
   - **Clasificación**: ¿posible fosa? ¿punto de desaparición? ¿con ubicación?
   - **Geolocalización**: detecta estado, municipio, localidad
4. Posts relevantes muestran un **badge rojo/naranja** con el tipo de evento y confidence
5. Click en el icono 🧵 para ver stats y exportar

## Exportar datos

Desde el popup (click en el icono):

- **Exportar JSON** — Todos los posts capturados con metadata completa. Compatible con `lib/acquisition/` de Hilo.
- **Exportar CSV** — Solo posts con señales de fosa/desaparición + ubicación detectada. Filas: `event_type, estado, municipio, locality_approx, confidence, signals...`

## Estructura de datos

Cada post capturado sigue el schema `hilo.fb_post.v1`:

```json
{
  "post_id": "permalink o hash",
  "group_id": "alertaambermexico",
  "group_name": "ALERTA AMBER MEXICO",
  "author_hash": "h_abc123",
  "timestamp_raw": "hace 3 horas",
  "permalink": "https://facebook.com/groups/.../permalink/...",
  "captured_at": "2026-06-21T...",
  "captured_url": "https://facebook.com/groups/alertaambermexico",
  "schema": "hilo.fb_post.v1",

  "event_type": "posible_fosa | punto_desaparicion | otro",
  "fosa_signals": ["fosa", "huesos", "entierro"],
  "desap_signals": ["desaparecido", "alerta_amber"],
  "ubi_signals": ["municipio", "carretera"],
  "fosa_score": 12,
  "desap_score": 7,
  "confidence": 0.85,

  "estado": "Jalisco",
  "municipio": "Zapotlán el Grande",
  "locality_approx": "carretera Guadalajara - Colima",

  "text_redacted": "Encontraron fosa clandestina cerca de... [TELÉFONO]",
  "pii_redactions": [{"type": "phone", "original_length": 10}],
  "needs_review": false
}
```

## Keywords de detección

### Fosas (score → `event_type: posible_fosa`)
`fosa`, `fosa clandestina`, `narcofosa`, `huesos`, `restos óseos`, `osamenta`, `cadáver`, `enterrado`, `clandestino`, `hallazgo de restos`, `fosa común`, `pozo + cuerpos`

### Desaparición (score → `event_type: punto_desaparicion`)
`desaparecido/a`, `extraviado/a`, `ausente`, `no localizado`, `levantón`, `privado de libertad`, `alerta amber`, `alerta plata`, `se desconoce paradero`, `última vez visto`, `se lo llevaron`, `ayuda/compartan/difundan`

### Ubicación
Detecta: `municipio`, `colonia`, `carretera`, `km`, `calle`, `poblado`, `zona`, coordenadas GPS, Google Maps links + los 32 estados de México.

## Privacidad

- **PII se redacta antes de tocar storage**: teléfonos, emails, URLs de WhatsApp, URLs de perfiles de FB
- **Autor se hashea**: no se guarda el nombre, solo `h_abc123`
- **Todo se guarda localmente** en `browser.storage.local` — no sale de tu máquina
- **Exportación es manual** — tú decides cuándo y a quién entregar los datos
- **No hay texto crudo** — solo `text_redacted`

## Debugging

- Console de la página de FB: busca logs `[Hilo]`
- `about:debugging` → Inspeccionar extensión para ver storage y console del background
- Los badges visuales (`HILO: posible_fosa (85%)`) aparecen en los posts detectados

## Limitaciones conocidas

- Facebook cambia su DOM frecuentemente — los selectores pueden necesitar ajuste
- Algunos posts requieren "Ver más" click — el text completo puede no capturarse
- Las imágenes/videos NO se procesan (solo texto)
- El timestamp de FB suele ser relativo ("hace 2 horas") — se guarda crudo
