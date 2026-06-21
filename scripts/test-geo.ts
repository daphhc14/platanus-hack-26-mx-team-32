// Local-only geo smoke test. Two modes:
//   1. With GOOGLE_MAPS_API_KEY set: hits the real Geocoding API.
//   2. Without key: runs against an injected mock fetch so the granularity
//      policy is still exercised (calle/colonia queries must be rejected).
//
// Not committed. Run with: npm run test:geo

import { strict as assert } from "node:assert";
import { HiloDB } from "../lib/db.js";
import type Database from "better-sqlite3";
import { GeoCoder, GeoGranularityError, GeoMissingKeyError } from "../lib/geo/index.js";

const db = new HiloDB(":memory:", "admin").init();
const raw = (db as any).db as Database.Database;
const hasKey = Boolean(process.env.GOOGLE_MAPS_API_KEY);

console.log(`Mode: ${hasKey ? "LIVE (Google Maps API)" : "MOCK (no GOOGLE_MAPS_API_KEY)"}\n`);

if (hasKey) {
  // ---------- LIVE ----------
  const geo = new GeoCoder(raw);

  const cases = [
    { q: "Jalisco", expect: "estado" as const },
    { q: "Ciudad Guzman, Jalisco", expect: "municipio" as const },
    { q: "Sayula, Jalisco", expect: "municipio" as const },
    { q: "Nuevo Leon", expect: "estado" as const },
  ];

  for (const c of cases) {
    const r = await geo.geocode(c.q);
    console.log(`OK   ${c.q.padEnd(28)} -> ${r.granularity.padEnd(9)} ${r.lat.toFixed(3)},${r.lng.toFixed(3)} | ${r.formatted} (cached=${r.cached})`);
    assert.equal(r.granularity, c.expect);
  }

  // Cache hit on second call
  const cached = await geo.geocode("Jalisco");
  assert.equal(cached.cached, true);
  console.log(`\nCache hit on repeat query: OK`);

  // Reject too-precise query
  try {
    await geo.geocode("Av. Vallarta 1234, Guadalajara");
    throw new Error("should have rejected precise query");
  } catch (e) {
    if (e instanceof GeoGranularityError) {
      console.log(`\nReject precise: OK (${e.message})`);
    } else {
      throw e;
    }
  }

  db.close();
  console.log("\n\u2713 geo live test passed");
} else {
  // ---------- MOCK ----------
  // Inject a fake fetch that returns canned Google-style payloads so we can
  // validate the granularity policy without spending API quota.
  const mockResponses: Record<string, any> = {
    "https://maps.googleapis.com/maps/api/geocode/json?address=Jalisco": {
      status: "OK",
      results: [
        {
          formatted_address: "Jalisco, Mexico",
          types: ["administrative_area_level_1", "political"],
          geometry: { location: { lat: 19.95, lng: -103.55 } },
        },
      ],
    },
    "https://maps.googleapis.com/maps/api/geocode/json?address=Ciudad+Guzman%2C+Jalisco": {
      status: "OK",
      results: [
        {
          formatted_address: "Zapotlan el Grande, Jal., Mexico",
          types: ["administrative_area_level_2", "political"],
          geometry: { location: { lat: 19.34, lng: -103.46 } },
        },
      ],
    },
    "https://maps.googleapis.com/maps/api/geocode/json?address=Av.+Vallarta+1234%2C+Guadalajara": {
      status: "OK",
      results: [
        {
          formatted_address: "Av. Vallarta 1234, Guadalajara, Jal., Mexico",
          types: ["street_address", "route", "political"],
          geometry: { location: { lat: 20.67, lng: -103.39 } },
        },
      ],
    },
  };

  const mockFetch = async (url: string) => {
    const addr = new URL(url).searchParams.get("address") ?? "";
    const normKey = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr).replace(/%20/g, "+")}`;
    const hit = mockResponses[normKey];
    if (!hit) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(hit), { status: 200 });
  };

  const geo = new GeoCoder(raw, () => "mock-key", mockFetch as any);

  const jal = await geo.geocode("Jalisco");
  assert.equal(jal.granularity, "estado");
  assert.equal(jal.cached, false);
  console.log(`OK   Jalisco                  -> ${jal.granularity} ${jal.lat},${jal.lng} | ${jal.formatted}`);

  const cg = await geo.geocode("Ciudad Guzman, Jalisco");
  assert.equal(cg.granularity, "municipio");
  console.log(`OK   Ciudad Guzman, Jalisco   -> ${cg.granularity} ${cg.lat},${cg.lng} | ${cg.formatted}`);

  // Cache hit
  const cached = await geo.geocode("Jalisco");
  assert.equal(cached.cached, true);
  console.log(`OK   Jalisco (repeat)         -> cached`);

  // Reject too-precise
  try {
    await geo.geocode("Av. Vallarta 1234, Guadalajara");
    throw new Error("should have rejected precise query");
  } catch (e) {
    if (e instanceof GeoGranularityError) {
      console.log(`OK   Av. Vallarta 1234        -> REJECTED (granularity policy)`);
    } else {
      throw e;
    }
  }

  // Missing key behavior (use a query that is NOT in cache yet)
  const geoNoKey = new GeoCoder(raw, () => undefined, mockFetch as any);
  try {
    await geoNoKey.geocode("Tamaulipas");
    throw new Error("should have thrown missing key");
  } catch (e) {
    if (e instanceof GeoMissingKeyError) {
      console.log(`OK   no-key mode (uncached)    -> GeoMissingKeyError`);
    } else {
      throw e;
    }
  }

  // Batch
  const batch = await geo.geocodeBatch(["Jalisco", "Ciudad Guzman, Jalisco", "Av. Vallarta 1"]);
  assert.equal(batch.filter(b => b.ok).length, 2);
  assert.equal(batch.filter(b => !b.ok).length, 1);
  console.log(`OK   batch (3 queries)        -> 2 ok, 1 rejected`);

  db.close();
  console.log("\n\u2713 geo mock test passed (set GOOGLE_MAPS_API_KEY to run live)");
}
