// lib/acquisition/safety.ts
// K-anonymity, copy-safety and redaction helpers derived from
// docs/specs/05-source-policy-and-safety.md. They are pure functions so they
// can double as lint primitives when aggregated publication ships.

export const DEFAULT_K_ANONYMITY = 5;

export interface KAnonymityResult {
  ok: boolean;
  count: number;
  k: number;
}

/**
 * Minimum-cell-count rule for aggregated publication. A count below `k` must
 * not be published as-is (spec 05: "Publicacion agregada").
 */
export function kAnonymityCheck(count: number, k: number = DEFAULT_K_ANONYMITY): KAnonymityResult {
  const safeCount = Math.max(0, Math.floor(count));
  const safeK = Math.max(1, Math.floor(k));
  return { ok: safeCount >= safeK, count: safeCount, k: safeK };
}

// Spec 05 "Copy seguro para UI": forbidden framings.
const FORBIDDEN_PHRASES = [
  "culpable",
  "plaza de x en esta calle",
  "plaza de ",
  "este caso est\u00e1 conectado",
  "este caso esta conectado",
  "confirmado por ia",
  "confirmado por la ia",
];

// Spec 05 "Copy seguro para UI": recommended uncertainty language.
const RECOMMENDED_PHRASES = [
  "posible patr\u00f3n",
  "se\u00f1al contextual",
  "pendiente de revisi\u00f3n",
  "pendiente de revision",
  "no constituye conclusi\u00f3n",
  "no constituye conclusion",
  "fuente p\u00fablica/autorizada",
  "fuente publica/autorizada",
];

export interface CopySafetyResult {
  ok: boolean;
  forbidden_hits: string[];
  uses_recommended: boolean;
}

/**
 * Validates UI/copy text against the safe-language policy in spec 05.
 * Returns `ok=false` when any forbidden framing is present.
 */
export function validateCopySafety(text: string): CopySafetyResult {
  const lower = text.toLowerCase();
  const forbidden_hits = FORBIDDEN_PHRASES.filter(p => lower.includes(p));
  const uses_recommended = RECOMMENDED_PHRASES.some(p => lower.includes(p));
  return {
    ok: forbidden_hits.length === 0,
    forbidden_hits,
    uses_recommended,
  };
}

// PII patterns for "redaccion antes de pasar a prompts cuando sea posible".
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?\b\d{10}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface RedactionResult {
  redacted_text: string;
  phone_count: number;
  email_count: number;
  total_redacted: number;
}

/**
 * Replaces obvious phone/email tokens with stable placeholders before the
 * text reaches an LLM prompt. Intentionally conservative: it does NOT attempt
 * to redact names, addresses or other free-form PII.
 */
export function redactPii(text: string): RedactionResult {
  let phone_count = 0;
  let email_count = 0;

  const afterPhones = text.replace(PHONE_RE, () => {
    phone_count++;
    return "[telefono_redactado]";
  });
  const redacted_text = afterPhones.replace(EMAIL_RE, () => {
    email_count++;
    return "[email_redactado]";
  });

  return {
    redacted_text,
    phone_count,
    email_count,
    total_redacted: phone_count + email_count,
  };
}
