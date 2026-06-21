import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type ExtractionSchemaName = "hilo.fake_job_offer.v1" | "hilo.social_risk_event.v1";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const SCHEMA_DIR = join(ROOT, "docs", "specs", "schemas");

const SCHEMAS: Record<ExtractionSchemaName, unknown> = {
  "hilo.fake_job_offer.v1": readJson("fake_job_offer.schema.json"),
  "hilo.social_risk_event.v1": readJson("social_risk_event.schema.json"),
};

export function getExtractionSchema(name: ExtractionSchemaName): unknown {
  return SCHEMAS[name];
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, file), "utf-8"));
}

