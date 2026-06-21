// Live extractor smoke test against the real Anthropic API.
//
// Run with:
//   ANTHROPIC_API_KEY=sk-... npm run test:extractor:live
//   # optional: EXTRACTOR_MODEL=claude-haiku-4-5
//
// Uses two short, fully-synthetic markdown artifacts (no PII, no network
// fetch beyond the Anthropic call). It validates that the structured-output
// path produces the expected schema fields and that the secondary validator
// (detectOffer) merges its hits.

import { strict as assert } from "node:assert";
import { extractFromArtifact } from "../lib/acquisition/index.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set. Skipping live extractor test.");
  process.exit(2);
}

const suspicious = {
  url: "synthetic://suspicious-offer",
  title: "Oferta de prueba (sintetica)",
  markdown: [
    "Vacante de guardia de seguridad. Contratacion inmediata, sin experiencia.",
    "Sueldo $18000 semanal. Te mandamos Uber para entrevista en central de autobuses.",
    "Contacto por WhatsApp.",
  ].join(" "),
  metadata: {},
};

const benign = {
  url: "synthetic://benign-offer",
  title: "Oferta de prueba (benigna)",
  markdown:
    "Empresa establecida busca ingeniero de software con 3 anos de experiencia. Sueldo mensual acorde al mercado. Enviar CV al portal de empleo.",
  metadata: {},
};

console.log("-> extracting suspicious artifact with", process.env.EXTRACTOR_MODEL ?? "default model");
const suspiciousResult = await extractFromArtifact(suspicious, "hilo.fake_job_offer.v1");
console.log(JSON.stringify(suspiciousResult, null, 2));

assert.equal(suspiciousResult.extractor_name, "anthropic-structured-output");
assert.equal(typeof suspiciousResult.output.is_job_offer, "boolean");
assert.ok(Array.isArray(suspiciousResult.output.risk_signals));
assert.ok(suspiciousResult.confidence >= 0 && suspiciousResult.confidence <= 1);
assert.ok(
  suspiciousResult.output.privacy_level === "restricted" || suspiciousResult.output.privacy_level === "internal",
);
assert.ok(suspiciousResult.validator, "secondary validator (detectOffer) should always be present");
assert.ok(
  suspiciousResult.validator!.score >= 0,
  `unexpected validator score: ${suspiciousResult.validator!.score}`,
);

console.log("\n-> extracting benign artifact");
const benignResult = await extractFromArtifact(benign, "hilo.fake_job_offer.v1");
console.log(JSON.stringify({ score: benignResult.validator?.score, is_job_offer: benignResult.output.is_job_offer }, null, 2));
assert.equal(benignResult.extractor_name, "anthropic-structured-output");

console.log("\n\u2713 live extractor test passed");
