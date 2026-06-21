import type { AcquisitionRunMode } from "./types.js";

export type ScrapeFormat = "markdown" | "html" | "rawHtml" | "links" | "screenshot" | "json";

export interface SearchInput {
  run_id: string;
  query: string;
  limit?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  sources?: Array<"web" | "news" | "images">;
  mode?: Extract<AcquisitionRunMode, "discovery_search" | "search">;
}

export interface SearchResult {
  url: string;
  title?: string;
  description?: string;
  position?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface ScrapeInput {
  run_id: string;
  url: string;
  formats?: ScrapeFormat[];
  json_schema?: unknown;
  json_prompt?: string;
  only_main_content?: boolean;
  timeout_ms?: number;
  zero_data_retention?: boolean;
}

export interface RawArtifactPayload {
  url: string;
  title?: string;
  markdown?: string;
  html?: string;
  raw_html?: string;
  json?: unknown;
  links?: string[];
  screenshot_url?: string;
  metadata: Record<string, unknown>;
  fetched_at: string;
  content_hash: string;
}

export interface WebAcquisitionProvider {
  search(input: SearchInput): Promise<SearchResult[]>;
  scrape(input: ScrapeInput): Promise<RawArtifactPayload>;
}

