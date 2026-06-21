/**
 * bridge-match.test.ts — Unit tests for the bridge-match pipeline helpers.
 *
 * These tests run WITHOUT a real Supabase connection or hilo.db by exercising
 * the pure matching logic (runMatch) with synthetic in-memory records.
 */
import { describe, it, expect } from "vitest";
import { runMatch } from "./bridge-match.js";
import type { HiloRecord } from "../lib/types.js";

// ── fixtures ─────────────────────────────────────────────────────────────────

function makePersona(overrides: Partial<HiloRecord> = {}): HiloRecord {
  return {
    id: "persona-1",
    source_id: "supabase_rnpdno",
    record_type: "missing",
    sex: "M",
    age_min: 30,
    age_max: 30,
    height_cm: 170,
    estado: "JALISCO",
    municipio: "Guadalajara",
    event_date: "2023-01-01",
    raw_description: "tatuaje brazo",
    pii_minimized: true,
    synthetic: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeCuerpo(
  id: string,
  overrides: Partial<HiloRecord> = {},
): HiloRecord {
  return {
    id,
    source_id: "semefo_local",
    record_type: "unidentified",
    sex: "M",
    age_min: 28,
    age_max: 32,
    height_cm: 171,
    estado: "JALISCO",
    municipio: "Guadalajara",
    event_date: "2023-03-15",
    raw_description: "",
    pii_minimized: true,
    synthetic: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("runMatch", () => {
  it("returns scored pairs sorted by overall_score descending", () => {
    const persona = makePersona();
    const cuerpos: HiloRecord[] = [
      makeCuerpo("cuerpo-A", { age_min: 29, age_max: 31, height_cm: 170 }),
      makeCuerpo("cuerpo-B", { age_min: 60, age_max: 65, height_cm: 150, sex: "F" }),
    ];

    const scored = runMatch(persona, cuerpos, []);

    // cuerpo-B is blocked by sex incompatibility, so only cuerpo-A passes
    expect(scored.length).toBeGreaterThanOrEqual(1);
    // Must be sorted descending
    for (let i = 0; i < scored.length - 1; i++) {
      expect(scored[i].overall_score).toBeGreaterThanOrEqual(
        scored[i + 1].overall_score,
      );
    }
  });

  it("blocks pairs with incompatible sex and returns only compatible candidates", () => {
    const persona = makePersona({ sex: "M" });
    const cuerpos: HiloRecord[] = [
      makeCuerpo("male-cuerpo", { sex: "M" }),
      makeCuerpo("female-cuerpo", { sex: "F" }),
    ];

    const scored = runMatch(persona, cuerpos, []);

    const ids = scored.map((s) => s.unidentified.id);
    expect(ids).toContain("male-cuerpo");
    expect(ids).not.toContain("female-cuerpo");
  });

  it("returns empty array when no cuerpos are provided", () => {
    const persona = makePersona();
    const scored = runMatch(persona, [], []);
    expect(scored).toHaveLength(0);
  });
});
