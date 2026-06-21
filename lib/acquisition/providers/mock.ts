import { createHash } from "node:crypto";
import type {
  RawArtifactPayload,
  ScrapeInput,
  SearchInput,
  SearchResult,
  WebAcquisitionProvider,
} from "../provider.js";

export class MockAcquisitionProvider implements WebAcquisitionProvider {
  constructor(private pages: Record<string, { title?: string; markdown: string }> = {}) {}

  async search(input: SearchInput): Promise<SearchResult[]> {
    return Object.entries(this.pages)
      .filter(([, page]) => page.title?.toLowerCase().includes(input.query.toLowerCase()) || page.markdown.toLowerCase().includes(input.query.toLowerCase()))
      .slice(0, input.limit ?? 10)
      .map(([url, page], i) => ({
        url,
        title: page.title,
        description: page.markdown.slice(0, 160),
        position: i + 1,
        category: "mock",
      }));
  }

  async scrape(input: ScrapeInput): Promise<RawArtifactPayload> {
    const page = this.pages[input.url];
    if (!page) throw new Error(`Mock page not found: ${input.url}`);

    const body = JSON.stringify({ url: input.url, markdown: page.markdown, title: page.title });
    return {
      url: input.url,
      title: page.title,
      markdown: page.markdown,
      metadata: { provider: "mock", sourceURL: input.url },
      fetched_at: new Date().toISOString(),
      content_hash: createHash("sha256").update(body).digest("hex"),
    };
  }
}

