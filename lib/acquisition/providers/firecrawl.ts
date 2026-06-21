import { createHash } from "node:crypto";
import type {
  RawArtifactPayload,
  ScrapeFormat,
  ScrapeInput,
  SearchInput,
  SearchResult,
  WebAcquisitionProvider,
} from "../provider.js";

type FirecrawlConfig = {
  api_key?: string;
  api_url?: string;
};

type FirecrawlResponse = {
  success?: boolean;
  data?: unknown;
  error?: string;
};

export class FirecrawlProvider implements WebAcquisitionProvider {
  private apiKey?: string;
  private apiUrl: string;

  constructor(config: FirecrawlConfig = {}) {
    this.apiKey = config.api_key ?? process.env.FIRECRAWL_API_KEY;
    this.apiUrl = (config.api_url ?? process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev").replace(/\/$/, "");
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const payload: Record<string, unknown> = {
      query: input.query,
      limit: input.limit ?? 10,
    };
    if (input.include_domains?.length) payload.includeDomains = input.include_domains;
    if (input.exclude_domains?.length) payload.excludeDomains = input.exclude_domains;
    if (input.sources?.length) payload.sources = input.sources;

    const response = await this.post("/v2/search", payload);
    return normalizeSearchResults(response.data);
  }

  async scrape(input: ScrapeInput): Promise<RawArtifactPayload> {
    const formats = buildFormats(input.formats ?? ["markdown"], input.json_schema, input.json_prompt);
    const payload: Record<string, unknown> = {
      url: input.url,
      formats,
    };
    if (input.only_main_content !== undefined) payload.onlyMainContent = input.only_main_content;
    if (input.timeout_ms !== undefined) payload.timeout = input.timeout_ms;
    if (input.zero_data_retention !== undefined) payload.zeroDataRetention = input.zero_data_retention;

    const response = await this.post("/v2/scrape", payload);
    return normalizeScrapeResult(input.url, response.data);
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<FirecrawlResponse> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({})) as FirecrawlResponse;
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `Firecrawl request failed with ${res.status}`);
    }
    return json;
  }
}

function buildFormats(formats: ScrapeFormat[], jsonSchema?: unknown, jsonPrompt?: string): unknown[] {
  const out: unknown[] = [];
  for (const format of formats) {
    if (format !== "json") {
      out.push(format);
      continue;
    }
    const jsonFormat: Record<string, unknown> = { type: "json" };
    if (jsonSchema) jsonFormat.schema = jsonSchema;
    if (jsonPrompt) jsonFormat.prompt = jsonPrompt;
    out.push(jsonFormat);
  }
  return out;
}

function normalizeSearchResults(data: unknown): SearchResult[] {
  if (Array.isArray(data)) return data.map(normalizeSearchResult).filter(hasUrl);
  if (!isRecord(data)) return [];

  const groups = ["web", "news", "images"];
  const results: SearchResult[] = [];
  for (const group of groups) {
    const items = data[group];
    if (Array.isArray(items)) results.push(...items.map(normalizeSearchResult).filter(hasUrl));
  }
  return results;
}

function normalizeSearchResult(item: unknown): SearchResult {
  const row = isRecord(item) ? item : {};
  return {
    url: String(row.url ?? row.sourceURL ?? ""),
    title: typeof row.title === "string" ? row.title : undefined,
    description: typeof row.description === "string" ? row.description : typeof row.snippet === "string" ? row.snippet : undefined,
    position: typeof row.position === "number" ? row.position : undefined,
    category: typeof row.category === "string" ? row.category : undefined,
    metadata: row,
  };
}

function normalizeScrapeResult(inputUrl: string, data: unknown): RawArtifactPayload {
  const row = isRecord(data) ? data : {};
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const url = String(metadata.sourceURL ?? row.url ?? inputUrl);
  const title = typeof metadata.title === "string" ? metadata.title : typeof row.title === "string" ? row.title : undefined;
  const markdown = typeof row.markdown === "string" ? row.markdown : undefined;
  const html = typeof row.html === "string" ? row.html : undefined;
  const raw_html = typeof row.rawHtml === "string" ? row.rawHtml : undefined;
  const links = Array.isArray(row.links) ? row.links.filter((v): v is string => typeof v === "string") : undefined;
  const screenshot_url = typeof row.screenshot === "string" ? row.screenshot : undefined;
  const json = row.json;

  return {
    url,
    title,
    markdown,
    html,
    raw_html,
    json,
    links,
    screenshot_url,
    metadata,
    fetched_at: new Date().toISOString(),
    content_hash: createHash("sha256").update(JSON.stringify({ url, title, markdown, html, raw_html, json, links })).digest("hex"),
  };
}

function hasUrl(result: SearchResult): boolean {
  return result.url.length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

