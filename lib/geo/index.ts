// lib/geo/index.ts
// Geocoding adapter with a hard municipio-granularity policy.
//
// Per spec 05 ("Politica de fuentes y seguridad"):
//   "degradar ubicacion a municipio/region, nunca coordenada exacta"
//
// This module is the ONLY sanctioned path from a municipio/estado name to a
// coordinate in Hilo. It rejects any query that resolves to something finer
// than administrative_area_level_2 (municipio) and caches results so we do
// not re-hit Google for stable names.

import type Database from "better-sqlite3";

export type GeoGranularity = "estado" | "municipio";

export interface GeocodeResult {
  query: string;
  lat: number;
  lng: number;
  granularity: GeoGranularity;
  formatted: string;
  cached: boolean;
  fetched_at: string;
}

export class GeoGranularityError extends Error {
  constructor(
    public query: string,
    public actual: string,
  ) {
    super(`geocode query too precise: "${query}" resolved to ${actual}; only estado/municipio allowed per spec 05`);
    this.name = "GeoGranularityError";
  }
}

export class GeoMissingKeyError extends Error {
  constructor() {
    super("GOOGLE_MAPS_API_KEY not set; geocode() unavailable");
    this.name = "GeoMissingKeyError";
  }
}

const TYPE_TO_GRANULARITY: Record<string, GeoGranularity> = {
  administrative_area_level_1: "estado",
  administrative_area_level_2: "municipio",
};

const CACHE_DDL = `
CREATE TABLE IF NOT EXISTS geocode_cache (
  query TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  granularity TEXT NOT NULL CHECK (granularity IN ('estado','municipio')),
  formatted TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export class GeoCoder {
  constructor(
    private db: Database.Database,
    private apiKeySupplier: () => string | undefined = () => process.env.GOOGLE_MAPS_API_KEY,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.db.prepare(CACHE_DDL).run();
  }

  hasKey(): boolean {
    return Boolean(this.apiKeySupplier());
  }

  /**
   * Geocode a query to municipio or estado granularity only.
   * Throws GeoGranularityError if Google would return a finer result.
   * Throws GeoMissingKeyError if no API key is configured.
   */
  async geocode(query: string): Promise<GeocodeResult> {
    const normalized = query.trim();
    if (!normalized) throw new Error("geocode: empty query");

    const cached = this.lookupCache(normalized);
    if (cached) return { ...cached, cached: true };

    const apiKey = this.apiKeySupplier();
    if (!apiKey) throw new GeoMissingKeyError();

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", normalized);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("components", "country:MX");
    url.searchParams.set("language", "es");

    const res = await this.fetchImpl(url.toString());
    if (!res.ok) throw new Error(`geocode HTTP ${res.status} for "${normalized}"`);
    const payload = (await res.json()) as GoogleGeocodePayload;

    if (payload.status !== "OK" || !Array.isArray(payload.results) || payload.results.length === 0) {
      throw new Error(`geocode: ${payload.status ?? "no results"} for "${normalized}"`);
    }

    // Pick the most precise result that is STILL allowed by policy.
    const result = pickAllowedResult(payload.results);
    if (!result) {
      throw new GeoGranularityError(normalized, describeMostPrecise(payload.results));
    }

    const granularity = granularityOf(result);
    const formatted: string = result.formatted_address ?? normalized;
    const loc = result.geometry?.location ?? { lat: 0, lng: 0 };
    const fetched_at = new Date().toISOString();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO geocode_cache (query, lat, lng, granularity, formatted, fetched_at)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(normalized, loc.lat, loc.lng, granularity, formatted, fetched_at);

    return {
      query: normalized,
      lat: loc.lat,
      lng: loc.lng,
      granularity,
      formatted,
      cached: false,
      fetched_at,
    };
  }

  /**
   * Bulk geocode with one round-trip awareness; cache makes subsequent calls free.
   * Continues past granularity errors so a single bad query doesn't sink a batch.
   */
  async geocodeBatch(
    queries: string[],
  ): Promise<Array<{ query: string; ok: true; result: GeocodeResult } | { query: string; ok: false; error: string }>> {
    const out: Array<{ query: string; ok: true; result: GeocodeResult } | { query: string; ok: false; error: string }> = [];
    for (const q of queries) {
      try {
        const r = await this.geocode(q);
        out.push({ query: q, ok: true, result: r });
      } catch (e: any) {
        out.push({ query: q, ok: false, error: e.message });
      }
    }
    return out;
  }

  listCache(): GeocodeResult[] {
    const rows = this.db
      .prepare("SELECT query, lat, lng, granularity, formatted, fetched_at FROM geocode_cache ORDER BY fetched_at DESC")
      .all() as GeocodeResult[];
    return rows.map(r => ({ ...r, cached: true }));
  }

  private lookupCache(query: string): Omit<GeocodeResult, "cached"> | undefined {
    const row = this.db
      .prepare("SELECT query, lat, lng, granularity, formatted, fetched_at FROM geocode_cache WHERE query = ?")
      .get(query) as Omit<GeocodeResult, "cached"> | undefined;
    return row;
  }
}

interface GoogleGeocodePayload {
  status: string;
  results: Array<{
    formatted_address?: string;
    types?: string[];
    geometry?: { location?: { lat: number; lng: number } };
  }>;
}

function pickAllowedResult(
  results: GoogleGeocodePayload["results"],
): GoogleGeocodePayload["results"][number] | undefined {
  // Prefer municipio (level_2) over estado (level_1) when both are returned.
  for (const r of results) if (hasType(r, "administrative_area_level_2")) return r;
  for (const r of results) if (hasType(r, "administrative_area_level_1")) return r;
  return undefined;
}

function hasType(result: GoogleGeocodePayload["results"][number], t: string): boolean {
  return Array.isArray(result.types) && result.types.includes(t);
}

function granularityOf(result: GoogleGeocodePayload["results"][number]): GeoGranularity {
  return hasType(result, "administrative_area_level_2") ? "municipio" : "estado";
}

function describeMostPrecise(results: GoogleGeocodePayload["results"]): string {
  const all = results.flatMap(r => r.types ?? []);
  return all.length ? Array.from(new Set(all)).slice(0, 5).join(", ") : "unknown";
}
