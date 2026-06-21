// lib/db.ts — SQLite adapter with role-based access control (RBAC).
// Replaces Postgres RLS: a `readonly` session CANNOT read secure_locations or tips.
// This is the safety property we demo live. Enforced structurally, not hoped for.

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  UserRole, Source, HiloRecord, Feature, CandidateMatch, AppUser, Review, Tip, SecureLocation,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = join(__dirname, "schema.sql");

export class HiloDB {
  private db: Database.Database;
  role: UserRole;

  constructor(path: string, role: UserRole = "readonly") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.role = role;
  }

  init() {
    this.db.exec(readFileSync(SCHEMA_PATH, "utf-8"));
    return this;
  }

  /** Return a session scoped to a role. The same connection; access checked per-call. */
  as(role: UserRole): HiloDB {
    return Object.create(HiloDB.prototype, {
      db: { value: this.db }, role: { value: role, writable: true },
    }) as HiloDB;
  }

  private canReadSecure(): boolean {
    return this.role === "reviewer" || this.role === "liaison" || this.role === "admin";
  }

  audit(action: string, entity?: string | null, detail?: unknown) {
    this.db.prepare(
      "INSERT INTO audit_log (actor, action, entity, detail) VALUES (?,?,?,?)"
    ).run(this.role, action, entity ?? null, detail ? JSON.stringify(detail) : null);
  }

  // ---- sources
  insertSource(s: Omit<Source, "created_at">): void {
    this.db.prepare(`INSERT INTO sources (id,name,kind,trust_tier,notes) VALUES (?,?,?,?,?)`)
      .run(s.id, s.name, s.kind, s.trust_tier, s.notes ?? null);
  }

  // ---- records
  insertRecord(r: Omit<HiloRecord, "created_at">): void {
    this.db.prepare(`INSERT INTO records
      (id,source_id,record_type,external_ref,sex,age_min,age_max,height_cm,build,skin_tone,
       estado,municipio,event_date,raw_description,photo_url,canonical_entity_id,pii_minimized,synthetic)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      r.id, r.source_id, r.record_type, r.external_ref ?? null, r.sex ?? null,
      r.age_min ?? null, r.age_max ?? null, r.height_cm ?? null, r.build ?? null, r.skin_tone ?? null,
      r.estado ?? null, r.municipio ?? null, r.event_date ?? null, r.raw_description ?? null,
      r.photo_url ?? null, r.canonical_entity_id ?? null, r.pii_minimized ? 1 : 0, r.synthetic ? 1 : 0);
  }

  getRecord(id: string): HiloRecord | undefined {
    const r = this.db.prepare("SELECT * FROM records WHERE id=?").get(id) as any;
    return r ? normalizeRecord(r) : undefined;
  }

  allRecords(type?: "missing" | "unidentified"): HiloRecord[] {
    const rows = type
      ? this.db.prepare("SELECT * FROM records WHERE record_type=?").all(type)
      : this.db.prepare("SELECT * FROM records").all();
    return (rows as any[]).map(normalizeRecord);
  }

  // ---- features
  insertFeature(f: Omit<Feature, "created_at">): void {
    this.db.prepare(`INSERT INTO features
      (id,record_id,feature_type,body_region,laterality,motif_category,description_raw,tokens)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      f.id, f.record_id, f.feature_type, f.body_region ?? null, f.laterality ?? "na",
      f.motif_category ?? null, f.description_raw, f.tokens ? JSON.stringify(f.tokens) : null);
  }

  featuresFor(recordId: string): Feature[] {
    const rows = this.db.prepare("SELECT * FROM features WHERE record_id=?").all(recordId) as any[];
    return rows.map(r => ({ ...r, laterality: r.laterality ?? "na", tokens: r.tokens ? JSON.parse(r.tokens) : [] }));
  }

  // ---- candidate matches
  insertMatch(m: Omit<CandidateMatch, "created_at">): void {
    this.db.prepare(`INSERT INTO candidate_matches
      (id,missing_record_id,unidentified_record_id,overall_score,field_scores,
       verifier_evidence,verifier_contradictions,verifier_tier,status)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(m.id, m.missing_record_id, m.unidentified_record_id, m.overall_score,
        JSON.stringify(m.field_scores), m.verifier_evidence ?? null,
        m.verifier_contradictions ?? null, m.verifier_tier ?? null, m.status);
    this.audit("match_proposed", m.id, { score: m.overall_score });
  }

  updateMatchStatus(id: string, status: CandidateMatch["status"], evidence?: string, contradictions?: string, tier?: string): void {
    this.db.prepare(`UPDATE candidate_matches SET status=?, verifier_evidence=COALESCE(?,verifier_evidence),
      verifier_contradictions=COALESCE(?,verifier_contradictions), verifier_tier=COALESCE(?,verifier_tier) WHERE id=?`)
      .run(status, evidence ?? null, contradictions ?? null, tier ?? null, id);
  }

  matchesByStatus(status: CandidateMatch["status"]): CandidateMatch[] {
    const rows = this.db.prepare("SELECT * FROM candidate_matches WHERE status=? ORDER BY overall_score DESC").all(status) as any[];
    return rows.map(normalizeMatch);
  }

  // ---- users
  insertUser(u: Omit<AppUser, "created_at">): void {
    this.db.prepare("INSERT INTO app_users (id,pseudonym,role) VALUES (?,?,?)").run(u.id, u.pseudonym, u.role);
  }
  getUserByPseudonym(p: string): AppUser | undefined {
    return this.db.prepare("SELECT * FROM app_users WHERE pseudonym=?").get(p) as any;
  }

  // ---- reviews (the ONLY path to confirmed)
  confirmMatch(matchId: string, reviewerId: string, notes?: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO reviews (id,match_id,reviewer_id,decision,notes) VALUES (?,?,?,?,?)")
        .run(randomUUID(), matchId, reviewerId, "confirmed", notes ?? null);
      this.db.prepare("UPDATE candidate_matches SET status='confirmed' WHERE id=?").run(matchId);
      this.audit("review_confirmed", matchId, { reviewer: reviewerId });
    });
    tx();
  }
  rejectMatch(matchId: string, reviewerId: string, notes?: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO reviews (id,match_id,reviewer_id,decision,notes) VALUES (?,?,?,?,?)")
        .run(randomUUID(), matchId, reviewerId, "rejected", notes ?? null);
      this.db.prepare("UPDATE candidate_matches SET status='rejected' WHERE id=?").run(matchId);
      this.audit("review_rejected", matchId, { reviewer: reviewerId });
    });
    tx();
  }

  // ---- tips (RBAC: readonly denied)
  insertTip(t: Omit<Tip, "created_at">): void {
    this.db.prepare(`INSERT INTO tips (id,content,extracted,trust_tier,sender_metadata_stripped,status)
      VALUES (?,?,?,?,?,?)`).run(t.id, t.content, t.extracted ? JSON.stringify(t.extracted) : null,
      t.trust_tier, t.sender_metadata_stripped ? 1 : 0, t.status);
    this.audit("tip_ingested", t.id);
  }
  listTips(): Tip[] {
    if (!this.canReadSecure()) {
      this.audit("access_denied", "tips", { role: this.role });
      throw new AccessDeniedError("tips", this.role);
    }
    this.audit("tips_read", null, { role: this.role });
    return this.db.prepare("SELECT * FROM tips").all() as any[];
  }

  // ---- secure locations (RBAC: readonly denied — the headline safety demo)
  insertSecureLocation(l: Omit<SecureLocation, "created_at">): void {
    this.db.prepare(`INSERT INTO secure_locations (id,kind,estado,municipio,lat,lng,fosas,cuerpos,related_tip_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(l.id, l.kind, l.estado ?? null, l.municipio ?? null,
      l.lat, l.lng, l.fosas ?? null, l.cuerpos ?? null, l.related_tip_id ?? null);
  }
  listSecureLocations(): SecureLocation[] {
    if (!this.canReadSecure()) {
      this.audit("access_denied", "secure_locations", { role: this.role });
      throw new AccessDeniedError("secure_locations", this.role);
    }
    this.audit("location_accessed", null, { role: this.role });
    return this.db.prepare("SELECT * FROM secure_locations").all() as any[];
  }

  auditLog(): any[] {
    return this.db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all() as any[];
  }

  close() { this.db.close(); }
}

export class AccessDeniedError extends Error {
  constructor(public resource: string, public role: UserRole) {
    super(`DENIED: role '${role}' cannot read '${resource}'`);
    this.name = "AccessDeniedError";
  }
}

function normalizeRecord(r: any): HiloRecord {
  return { ...r, pii_minimized: !!r.pii_minimized, synthetic: !!r.synthetic };
}
function normalizeMatch(r: any): CandidateMatch {
  return { ...r, field_scores: JSON.parse(r.field_scores) };
}
