import { createHash } from "node:crypto";
import type {
  AcquisitionRunMode,
  SourcePolicyDecision,
  SourcePolicyInput,
} from "./types.js";

const CONSENT_REQUIRED = new Set(["authorized_group", "submitted_by_family", "submitted_by_partner"]);

export function evaluateSourcePolicy(input: SourcePolicyInput): SourcePolicyDecision {
  const retention_days = input.retention_days ?? 30;
  const pii_allowed = input.pii_allowed === true;
  const pii_requested = input.pii_requested === true;
  const requires_human_approval = input.requires_human_approval ?? true;

  if (input.access_type === "private_denied") {
    return deny(input, "source is private or explicitly denied", retention_days, requires_human_approval);
  }

  if (input.access_type === "unknown" && input.mode !== "discovery_search") {
    return deny(input, "unknown sources require discovery review before acquisition", retention_days, requires_human_approval);
  }

  if (!input.allowed_actions.includes(input.mode)) {
    return deny(input, `mode '${input.mode}' is not allowed for this source`, retention_days, requires_human_approval);
  }

  if (pii_requested && !pii_allowed) {
    return deny(input, "PII requested but source policy does not allow PII processing", retention_days, requires_human_approval);
  }

  if (pii_requested && CONSENT_REQUIRED.has(input.access_type) && !input.has_active_consent) {
    return deny(input, "PII processing requires active consent for this source type", retention_days, requires_human_approval);
  }

  if (pii_requested && (!input.legal_basis || input.legal_basis === "not_assessed")) {
    return deny(input, "PII processing requires documented legal basis", retention_days, requires_human_approval);
  }

  return {
    allowed: true,
    reason: "allowed by source policy",
    allowed_actions: input.allowed_actions,
    pii_allowed,
    privacy_level: pii_requested ? "restricted" : "internal",
    retention_days,
    requires_human_approval,
  };
}

export function acquisitionIdempotencyKey(input: {
  provider: string;
  mode: AcquisitionRunMode;
  source_id?: string;
  seed_query?: string;
  seed_url?: string;
}): string {
  const raw = [
    input.provider,
    input.mode,
    input.source_id ?? "",
    normalize(input.seed_query),
    normalize(input.seed_url),
  ].join("\u001f");
  return createHash("sha256").update(raw).digest("hex");
}

function deny(
  input: SourcePolicyInput,
  reason: string,
  retention_days: number,
  requires_human_approval: boolean,
): SourcePolicyDecision {
  return {
    allowed: false,
    reason,
    allowed_actions: input.allowed_actions,
    pii_allowed: input.pii_allowed === true,
    privacy_level: "restricted",
    retention_days,
    requires_human_approval,
  };
}

function normalize(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

