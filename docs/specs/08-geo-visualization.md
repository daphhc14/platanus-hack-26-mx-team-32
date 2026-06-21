# 08. Visualizacion geografica y Maps

## Principio rector

Spec 05: "degradar ubicacion a municipio/region, nunca coordenada exacta".

Maps existe en Hilo **solo como capa de visualizacion agregada**. No es fuente de coordenadas para la base forense, no pinta casos individuales, no expone precision menor a municipio.

## Que se dibuja

| Capa | Dato | Granularidad | Condicion |
|---|---|---|---|
| Coropleta estatal | conteo agregado de desaparecidos por estado | estado | solo cifras oficiales agregadas |
| Coropleta municipal | conteo agregado por municipio | municipio | pasa k-anonimato (k configurable, default 5) |
| Marcador regional | alerta contextual (oferta laboral, etc.) | municipio | evento con `review_status=approved` |
| Zona de busqueda | area amplia definida por colectivo o fiscalia | municipio/region | solo en vista interna (RLS) |

## Que NO se dibuja

- Coordenadas exactas (lat/lng con precision de calle).
- Eventos individuales con `confidence < 0.85`.
- Eventos en `review_status=pending` o `hidden`.
- Casos individuales con fotos/señas en el mapa publico.
- Series temporales que permitan reidentificar un caso unico por fecha + edad + oficio + descripcion.

## Stack

- **Google Maps JavaScript API** — render de coropletas via `Data layer` con GeoJSON.
- **Google Maps Geocoding API** — nombre de municipio/estado -> centroide. Caché obligatorio (`geocode_cache`).
- **GeoJSON de Mexico** — INEGI Marco Geoestadistico Nacional (abierto) o mirror open-license. **No viene de Google.**
- **Filter k-anonimato** — `kAnonymityCheck(count, k=5)` bloquea celdas pequenas.

## Politica de granularity (lib/geo)

`GeoCoder.geocode(query)` solo acepta queries que resuelven a:
- `administrative_area_level_1` (estado), o
- `administrative_area_level_2` (municipio).

Rechaza (lanza `GeoGranularityError`):
- `street_address`, `route`, `intersection`
- `neighborhood`, `sublocality`, `colonia`
- `postal_code`
- `premise`, `point_of_interest`

Esto cubre el caso en que el input del usuario o el LLM produzca una query mas fina de lo permitido.

## Flujo de un punto en el mapa

```
evento approved (municipio, estado)
  -> GeoCoder.geocode("${municipio}, ${estado}")
  -> si granularity == municipio: centroide cacheado
  -> si granularity == estado: centroide del estado (mas amplio)
  -> UI recibe {lat, lng, granularity}
  -> coropleta o marcador con label agregado
```

## Caché

- Tabla: `geocode_cache(query PK, lat, lng, granularity, formatted, fetched_at)`.
- Nombres de municipio/estado son estables; rara vez cambia su centroide.
- No cacheamos queries rechazadas (no tendria sentido).
- TTL: sin expiracion forzada en MVP; manual purge si INEGI publica nuevo marco.

## API keys (env)

- Backend: `GOOGLE_MAPS_API_KEY` con restriction por IP/servicio (solo Geocoding API).
- Frontend: **key distinta** con restriction por HTTP referrer (Maps JS API). Nunca se commitea.
- Las dos keys se rotan independientemente.

## Pendiente

- GeoJSON de Mexico: conseguir y servir local (INEGI MGN o mirror). Sin esto, Maps JS no tiene poligonos para coropletas.
- Decidir umbral k: default 5, ajustable por configuracion.
- Agregar `event_nature: directo | reporte_sobre` (ver HANDOFF) antes de pintar marcadores individuales.
- Capa interna (RLS) para `secure_locations` con coords exactas: queda fuera de este MVP.
