import * as fs from "fs";
import { Pool } from "pg";

const DATA_FILE = "final_dataset.json";
const CACHE_FILE = "geocode_cache.json";
const DATABASE_URL =
  "postgresql://postgres.xhtpgaxndonugpxfvkbk:platanus-super-secret123@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
const TABLE_NAME = "personas_desaparecidas";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const RATE_LIMIT_MS = 1100;

const HEADERS: Record<string, string> = {
  "User-Agent": "platanus-hack-26-mx-team-32/1.0 (research project)",
  Accept: "application/json",
};

function clean(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || s === "SIN DATO") return null;
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type Coords = { lat: number; lon: number; display: string; precision: string };

function loadCache(): Record<string, Coords | null> {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, Coords | null>): void {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function buildQueryKey(q: Record<string, string>): string {
  return Object.entries(q)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

async function geocodeOnce(query: Record<string, string>): Promise<Coords | null> {
  const params = new URLSearchParams({ format: "json", limit: "1", ...query });
  const url = `${NOMINATIM_URL}?${params}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`nominatim HTTP ${res.status}`);
  const arr = (await res.json()) as any[];
  if (!arr || arr.length === 0) return null;
  const r = arr[0];
  return {
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    display: r.display_name ?? "",
    precision: query.street ? "street" : query.q ? "freeform" : "municipality",
  };
}

async function geocodeWithFallback(query: Record<string, string>): Promise<Coords | null> {
  const { street, ...muni } = query;

  if (street) {
    const streetResult = await geocodeOnce(query);
    if (streetResult) return streetResult;
    await sleep(RATE_LIMIT_MS);

    const freeform = { q: `${street}, ${muni.city ?? ""}, ${muni.state ?? ""}, México`.replace(/,\s*,/g, ",") };
    const freeResult = await geocodeOnce(freeform);
    if (freeResult) return freeResult;
    await sleep(RATE_LIMIT_MS);
  }

  const muniResult = await geocodeOnce(muni);
  return muniResult;
}

function buildQueries(records: any[]): { key: string; query: Record<string, string>; idvd: string }[] {
  const out: { key: string; query: Record<string, string>; idvd: string }[] = [];
  for (const rec of records) {
    const d = rec.pdfData;
    const o = rec.original;
    const estado = clean(d.estado);
    const municipio = clean(d.municipio);
    const calle = clean(d.calle);
    const noExt = clean(d.no_exterior ?? d.noexterior);
    const asent = clean(d.nombre_asentamiento ?? d.nombreasentamiento);
    const idvd = clean(d.IDvictimadirecta) ?? clean(o.IDvictimadirecta) ?? "";
    if (!idvd) continue;

    const base: Record<string, string> = { country: "México" };
    if (estado) base.state = estado;
    if (municipio) base.city = municipio;

    if (calle) {
      const street = noExt ? `${calle} ${noExt}` : calle;
      const q = { ...base, street };
      out.push({ key: buildQueryKey(q), query: q, idvd });
    } else {
      const q = { ...base };
      out.push({ key: buildQueryKey(q), query: q, idvd });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const geocodeOnly = args.has("--geocode-only");
  const pushOnly = args.has("--push-only");

  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const allRecords = JSON.parse(raw) as any[];
  const records = allRecords.filter((r) => !r.failed && r.pdfData);

  console.log(`[start] ${records.length} records`);

  const queries = buildQueries(records);
  const uniqueKeys = Array.from(new Set(queries.map((q) => q.key)));
  console.log(`[queries] ${queries.length} total, ${uniqueKeys.length} unique`);

  const cache = loadCache();

  if (!pushOnly) {
    const pending = uniqueKeys.filter((k) => !(k in cache));
    console.log(`[cache] ${uniqueKeys.length - pending.length} cached, ${pending.length} pending`);

    if (pending.length > 0) {
      let done = 0;
      for (const key of pending) {
        done++;
        const q = queries.find((qq) => qq.key === key)!.query;
        try {
          const coords = await geocodeWithFallback(q);
          cache[key] = coords;
          if (coords) {
            console.log(
              `[${done}/${pending.length}] ok: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)} ` +
                `(${coords.precision}) ${q.city ?? "?"}`
            );
          } else {
            console.log(`[${done}/${pending.length}] no result: ${q.city ?? "?"}, ${q.state ?? "?"}`);
          }
        } catch (e: any) {
          console.log(`[${done}/${pending.length}] ERROR: ${e?.message ?? e}`);
          cache[key] = null;
        }
        saveCache(cache);
        if (done < pending.length) await sleep(RATE_LIMIT_MS);
      }
    }

    const found = Object.values(cache).filter(Boolean).length;
    console.log(`[geocode] ${found}/${uniqueKeys.length} unique queries resolved`);
  }

  if (geocodeOnly) {
    console.log("[done] --geocode-only, skipping DB push");
    return;
  }

  console.log(`[push] updating ${TABLE_NAME} with coordinates...`);
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 4,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    await client.query(
      `ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION;`
    );
    await client.query(
      `ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;`
    );
    console.log("[push] columns ready");

    let updated = 0;
    let noCoords = 0;
    for (const q of queries) {
      const coords = cache[q.key];
      if (coords) {
        await client.query(
          `UPDATE ${TABLE_NAME} SET latitud = $1, longitud = $2 WHERE id_victimadirecta = $3`,
          [coords.lat, coords.lon, q.idvd]
        );
        updated++;
      } else {
        noCoords++;
      }
    }

    console.log(`[done] ${updated} records updated with coords, ${noCoords} without coords`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
