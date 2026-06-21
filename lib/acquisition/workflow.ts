// lib/acquisition/workflow.ts
// Linear implementation of the spec 03 workflow graph. LangGraph stays as a
// future option; for the MVP we keep the runtime TypeScript-first.
//
// Nodes (in order):
//   policy_gate -> discover_urls -> [acquire_artifact -> extract -> classify_risk] -> end
// Errors at any node are logged but do not abort the whole run unless fatal.

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WebAcquisitionProvider } from "./provider.js";
import { AcquisitionRepository } from "./repo.js";
import { acquisitionIdempotencyKey, evaluateSourcePolicy, extractFromArtifact } from "./index.js";
import type {
  AccessType,
  AcquisitionRunMode,
  PrivacyLevel,
  SocialRiskEventType,
  SourcePolicyDecision,
} from "./types.js";

export interface DiscoveryInput {
  source_id: string;
  source_permission_id: string;
  access_type: AccessType;
  mode: AcquisitionRunMode;
  seed_query?: string;
  seed_url?: string;
  allowed_actions: AcquisitionRunMode[];
  legal_basis?: string;
  provider: WebAcquisitionProvider;
  retention_days?: number;
  pii_requested?: boolean;
  /** Override the provider label used for idempotency (defaults to constructor name). */
  provider_name?: string;
}

export interface WorkflowEvent {
  node: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
  ts: string;
}

export interface WorkflowArtifact {
  id: string;
  url: string;
  hash: string;
  title?: string;
}

export interface WorkflowExtraction {
  schema: string;
  extractor: string;
  confidence: number;
  needs_review: boolean;
}

export interface WorkflowResult {
  run_id: string;
  policy: SourcePolicyDecision;
  status: "succeeded" | "blocked_by_policy" | "failed" | "idempotent_skip";
  discovered_urls: string[];
  artifacts: WorkflowArtifact[];
  extractions: WorkflowExtraction[];
  events_created: string[];
  log: WorkflowEvent[];
  error?: string;
}

const DEFAULT_RETENTION_DAYS = 30;

export class AcquisitionWorkflow {
  constructor(
    private db: Database.Database,
    private repo: AcquisitionRepository,
    private emit: (e: WorkflowEvent) => void = () => {},
  ) {}

  async run(input: DiscoveryInput): Promise<WorkflowResult> {
    const log: WorkflowEvent[] = [];
    const ts = () => new Date().toISOString();
    const emit = (node: string, level: WorkflowEvent["level"], message: string, data?: Record<string, unknown>) => {
      const full: WorkflowEvent = { node, level, message, data, ts: ts() };
      log.push(full);
      this.emit(full);
    };

    const providerName = input.provider_name ?? input.provider.constructor.name;
    const idempotency_key = acquisitionIdempotencyKey({
      provider: providerName,
      mode: input.mode,
      source_id: input.source_id,
      seed_query: input.seed_query,
      seed_url: input.seed_url,
    });

    emit("start", "info", "acquisition run started", { mode: input.mode, source: input.source_id });

    // Idempotency: if a run with the same key already exists, do not duplicate.
    const existing = this.db
      .prepare("SELECT id, status FROM acquisition_runs WHERE idempotency_key = ?")
      .get(idempotency_key) as { id: string; status: string } | undefined;
    if (existing) {
      emit("policy_gate", "warn", `idempotent: run ${existing.id} already exists (status=${existing.status})`);
      return {
        run_id: existing.id,
        policy: { allowed: false, reason: "idempotent skip", allowed_actions: [], pii_allowed: false, privacy_level: "restricted", retention_days: 0, requires_human_approval: false },
        status: "idempotent_skip",
        discovered_urls: [],
        artifacts: [],
        extractions: [],
        events_created: [],
        log,
        error: `idempotent: existing run ${existing.id}`,
      };
    }

    // 1. policy_gate
    const policy = evaluateSourcePolicy({
      access_type: input.access_type,
      mode: input.mode,
      allowed_actions: input.allowed_actions,
      pii_requested: input.pii_requested,
      pii_allowed: false,
      has_active_consent: input.access_type !== "official_public",
      legal_basis: input.legal_basis ?? "official_public_source",
      retention_days: input.retention_days ?? DEFAULT_RETENTION_DAYS,
    });

    if (!policy.allowed) {
      emit("policy_gate", "warn", `blocked: ${policy.reason}`);
      this.repo.createRun({
        id: randomUUID(),
        idempotency_key,
        source_id: input.source_id,
        source_permission_id: input.source_permission_id,
        provider: providerName,
        mode: input.mode,
        status: "blocked_by_policy",
        seed_query: input.seed_query,
        seed_url: input.seed_url,
        policy_snapshot: policy,
        error: policy.reason,
      });
      return {
        run_id: "",
        policy,
        status: "blocked_by_policy",
        discovered_urls: [],
        artifacts: [],
        extractions: [],
        events_created: [],
        log,
        error: policy.reason,
      };
    }

    emit("policy_gate", "info", "allowed by policy", {
      privacy_level: policy.privacy_level,
      retention_days: policy.retention_days,
      pii_allowed: policy.pii_allowed,
    });

    const run_id = randomUUID();
    this.repo.createRun({
      id: run_id,
      idempotency_key,
      source_id: input.source_id,
      source_permission_id: input.source_permission_id,
      provider: providerName,
      mode: input.mode,
      status: "running",
      seed_query: input.seed_query,
      seed_url: input.seed_url,
      policy_snapshot: policy,
      started_at: ts(),
    });

    const artifacts: WorkflowArtifact[] = [];
    const extractions: WorkflowExtraction[] = [];
    const eventsCreated: string[] = [];

    try {
      // 2. discover_urls
      let discoveredUrls: string[] = [];
      if (input.seed_url) {
        discoveredUrls = [input.seed_url];
      } else if (input.seed_query) {
        const results = await input.provider.search({
          run_id,
          query: input.seed_query,
          limit: 10,
        });
        discoveredUrls = results.map(r => r.url);
      }
      emit("discover_urls", "info", `discovered ${discoveredUrls.length} url(s)`, { urls: discoveredUrls });

      for (const url of discoveredUrls) {
        // 3. acquire_artifact
        let scraped;
        try {
          scraped = await input.provider.scrape({ run_id, url, formats: ["markdown"] });
        } catch (e: any) {
          emit("acquire_artifact", "error", `failed: ${url}: ${e.message}`);
          continue;
        }

        const artifactId = randomUUID();
        const expires = new Date(Date.now() + policy.retention_days * 86400_000).toISOString();
        this.repo.insertRawArtifact({
          id: artifactId,
          run_id,
          source_id: input.source_id,
          source_permission_id: input.source_permission_id,
          url: scraped.url,
          content_hash: scraped.content_hash,
          content_type: "text/markdown",
          title: scraped.title,
          fetched_at: scraped.fetched_at,
          expires_at: expires,
          provider_metadata: scraped.metadata,
          redaction_status: "not_required",
          privacy_level: policy.privacy_level,
        });
        artifacts.push({
          id: artifactId,
          url: scraped.url,
          hash: scraped.content_hash,
          title: scraped.title,
        });
        emit("acquire_artifact", "info", `acquired ${url}`, {
          artifact_id: artifactId,
          hash: scraped.content_hash.slice(0, 12),
        });

        // 4. extract
        const extraction = await extractFromArtifact(scraped, "hilo.social_risk_event.v1");
        this.repo.createExtractionJob({
          id: randomUUID(),
          raw_artifact_id: artifactId,
          extractor_name: extraction.extractor_name,
          extractor_version: extraction.extractor_version,
          schema_name: extraction.schema_name,
          status: extraction.needs_review ? "needs_review" : "succeeded",
          confidence: extraction.confidence,
          output: extraction.output,
          finished_at: ts(),
        });
        extractions.push({
          schema: extraction.schema_name,
          extractor: extraction.extractor_name,
          confidence: extraction.confidence,
          needs_review: extraction.needs_review,
        });
        emit("extract", "info", `extracted via ${extraction.extractor_name}`, {
          confidence: Number(extraction.confidence.toFixed(2)),
          needs_review: extraction.needs_review,
        });

        // 5. classify_risk + write event
        const output = extraction.output as Record<string, any>;
        const eventType = (output.event_type ?? "otro") as SocialRiskEventType;
        const privacyLevel = (output.privacy_level ?? policy.privacy_level) as PrivacyLevel;
        const eventId = randomUUID();
        this.repo.insertSocialRiskEvent({
          id: eventId,
          source_id: input.source_id,
          raw_artifact_id: artifactId,
          event_type: eventType,
          estado: output.estado,
          municipio: output.municipio,
          locality_approx: output.locality_approx,
          reported_at: ts(),
          confidence: extraction.confidence,
          severity: inferSeverity(eventType),
          privacy_level: privacyLevel,
          review_status: extraction.needs_review ? "pending" : "approved",
          summary_public: typeof output.summary === "string" ? output.summary : undefined,
          evidence: { validator: extraction.validator, extractor: extraction.extractor_name },
        });
        eventsCreated.push(eventId);
        emit("classify_risk", "info", `event created: ${eventType}`, {
          event_id: eventId,
          severity: inferSeverity(eventType),
          review: extraction.needs_review ? "pending" : "approved",
        });
      }

      this.db
        .prepare("UPDATE acquisition_runs SET status = ?, finished_at = ?, updated_at = ? WHERE id = ?")
        .run("succeeded", ts(), ts(), run_id);

      emit("end", "info", `run completed`, {
        artifacts: artifacts.length,
        events: eventsCreated.length,
      });

      return {
        run_id,
        policy,
        status: "succeeded",
        discovered_urls: discoveredUrls,
        artifacts,
        extractions,
        events_created: eventsCreated,
        log,
      };
    } catch (e: any) {
      this.db
        .prepare("UPDATE acquisition_runs SET status = ?, finished_at = ?, error = ?, updated_at = ? WHERE id = ?")
        .run("failed", ts(), e.message, ts(), run_id);
      emit("end", "error", `run failed: ${e.message}`);
      return {
        run_id,
        policy,
        status: "failed",
        discovered_urls: [],
        artifacts,
        extractions,
        events_created: eventsCreated,
        log,
        error: e.message,
      };
    }
  }
}

function inferSeverity(eventType: SocialRiskEventType): 1 | 2 | 3 | 4 | 5 {
  switch (eventType) {
    case "secuestro_levanton":
    case "trata_enganche":
    case "balacera_enfrentamiento":
      return 5;
    case "oferta_laboral_sospechosa":
      return 4;
    case "narcomenudeo_contexto":
    case "control_territorial_contexto":
      return 3;
    default:
      return 1;
  }
}
