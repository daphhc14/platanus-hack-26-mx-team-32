// lib/embed/image.ts — Image embeddings (multimodal) via native Gemini.
// Use case: match RECENT photos (Alerta Ámber / living persons) by embedding cosine.
// ⚠ NOT for decomposed/skeletal bodies over years — embeddings collapse there.
// For long-term forensic ID, use señas (tatuajes/cicatrices) — see lib/match/.

import { loadLLMConfig } from "../llm.js";

function geminiKeyParam(cfg = loadLLMConfig()): string {
  return `?key=${encodeURIComponent(cfg.apiKey!)}`;
}

/** Embed a single image (base64, no data: prefix) → vector. */
export async function embedImage(b64: string, mimeType: string, cfg = loadLLMConfig()): Promise<number[]> {
  const model = process.env.EMBED_MODEL || "gemini-embedding-2";
  const base = (cfg.baseUrl!.replace(/\/$/, "")).replace(/\/openai\/?$/i, "");
  const url = `${base}/models/${model}:embedContent${geminiKeyParam(cfg)}`;
  const body = {
    content: { parts: [{ inlineData: { mimeType, data: b64 } }] },
  };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`gemini image embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  return data?.embedding?.values ?? [];
}

/** Joint text+image embedding (same vector space) — caption + photo. */
export async function embedTextImage(text: string, b64: string, mimeType: string, cfg = loadLLMConfig()): Promise<number[]> {
  const model = process.env.EMBED_MODEL || "gemini-embedding-2";
  const base = (cfg.baseUrl!.replace(/\/$/, "")).replace(/\/openai\/?$/i, "");
  const url = `${base}/models/${model}:embedContent${geminiKeyParam(cfg)}`;
  const body = { content: { parts: [{ text }, { inlineData: { mimeType, data: b64 } }] } };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`gemini joint embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  return data?.embedding?.values ?? [];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
