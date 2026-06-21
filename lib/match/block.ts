// lib/match/block.ts — Blocking: cut candidate pairs by cheap filters, not all-vs-all.
// Block on: same/adjacent estado, compatible sex, overlapping age range,
// and the HARD temporal rule: missing.event_date <= unidentified.event_date.

import type { HiloRecord as Rec } from "../types.js";

const ADJACENT: Record<string, string[]> = {
  "ESTADO DE MÉXICO": ["CIUDAD DE MÉXICO", "HIDALGO", "PUEBLA", "TLAXCALA", "MORELOS", "GUERRERO"],
  "CIUDAD DE MÉXICO": ["ESTADO DE MÉXICO", "HIDALGO", "MORELOS", "PUEBLA"],
  "JALISCO": ["MICHOACÁN", "COLIMA", "NAYARIT", "ZACATECAS", "AGUASCALIENTES"],
  "TAMAULIPAS": ["NUEVO LEÓN", "SAN LUIS POTOSÍ", "VERACRUZ"],
  "MICHOACÁN": ["JALISCO", "GUERRERO", "ESTADO DE MÉXICO", "GUANAJUATO", "COLIMA"],
  "GUERRERO": ["MICHOACÁN", "ESTADO DE MÉXICO", "MORELOS", "PUEBLA", "OAXACA"],
};

export function geoCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true; // missing geo -> don't block out
  if (a === b) return true;
  return ADJACENT[a]?.includes(b) || ADJACENT[b]?.includes(a) || false;
}

export function sexCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return a === b;
}

export function ageOverlap(aMin?: number, aMax?: number, bMin?: number, bMax?: number): boolean {
  if ([aMin, aMax, bMin, bMax].some(x => x == null)) return true;
  return (aMax! >= bMin! - 3) && (aMin! <= bMax! + 3); // 3y tolerance on overlap
}

export function temporalValid(missing?: Rec, unidentified?: Rec): boolean {
  if (!missing?.event_date || !unidentified?.event_date) return true;
  // a body cannot be found BEFORE the disappearance
  return new Date(missing.event_date) <= new Date(unidentified.event_date);
}

export interface BlockPair { missing: Rec; unidentified: Rec; }

/** Given all records, produce blocked candidate pairs. */
export function block(records: Rec[]): BlockPair[] {
  const missing = records.filter(r => r.record_type === "missing");
  const unidentified = records.filter(r => r.record_type === "unidentified");
  const pairs: BlockPair[] = [];
  for (const m of missing) {
    for (const u of unidentified) {
      if (!geoCompatible(m.estado, u.estado)) continue;
      if (!sexCompatible(m.sex, u.sex)) continue;
      if (!ageOverlap(m.age_min, m.age_max, u.age_min, u.age_max)) continue;
      if (!temporalValid(m, u)) continue;
      pairs.push({ missing: m, unidentified: u });
    }
  }
  return pairs;
}
