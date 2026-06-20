// lib/llm.ts — Unified LLM client.
// Supports:
//   1) NATIVE Google Gemini (new AQ. auth keys need ?key= query param, not Bearer).
//      Detected when baseURL contains "googleapis" or key starts with "AQ.".
//   2) OpenAI-compatible providers (Anthropic/OpenAI/Groq/MiniMax/DeepSeek/...) via the openai SDK.
//   3) Deterministic fallback when no key.
// All paths return JSON (chatJSON) and embeddings (embedTexts).

export interface LLMConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function loadLLMConfig(): LLMConfig & { available: boolean } {
  const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  return { apiKey, baseUrl, model, available: !!apiKey };
}

export function isGeminiNative(cfg = loadLLMConfig()): boolean {
  return !!cfg.baseUrl && /googleapis\.com/i.test(cfg.baseUrl);
}

function geminiKeyParam(cfg = loadLLMConfig()): string {
  return `?key=${encodeURIComponent(cfg.apiKey!)}`;
}

/** Native Gemini chat (generateContent). Returns the text response. */
async function geminiChat(system: string, user: string, cfg = loadLLMConfig()): Promise<string> {
  const model = cfg.model || "gemini-2.5-flash";
  const base = (cfg.baseUrl!.replace(/\/$/, "")).replace(/\/openai\/?$/i, "");
  const url = `${base}/models/${model}:generateContent${geminiKeyParam(cfg)}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`gemini ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ?? "";
}

/** Native Gemini embeddings (batch). Returns number[][] aligned to input. */
export async function geminiEmbed(texts: string[], model?: string, cfg = loadLLMConfig()): Promise<number[][]> {
  const m = model || process.env.EMBED_MODEL || "gemini-embedding-2";
  const base = (cfg.baseUrl!.replace(/\/$/, "")).replace(/\/openai\/?$/i, "");
  const url = `${base}/models/${m}:batchEmbedContents${geminiKeyParam(cfg)}`;
  const body = {
    requests: texts.map((t) => ({
      model: `models/${m}`,
      content: { parts: [{ text: t }] },
    })),
  };
  const resp = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`gemini embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  return (data?.embeddings || []).map((e: any) => e.values);
}

/**
 * Chat call returning parsed JSON. Uses Gemini native if applicable, else openai SDK,
 * else the deterministic fallback.
 */
export async function chatJSON(
  system: string,
  user: string,
  fallback: () => Promise<any> | any,
  cfg = loadLLMConfig(),
): Promise<any> {
  if (!cfg.available) return await fallback();
  try {
    let text: string;
    if (isGeminiNative(cfg)) {
      text = await geminiChat(system, user, cfg);
    } else {
      let OpenAI: any;
      try { ({ default: OpenAI } = await import("openai")); }
      catch { return await fallback(); }
      const client = new OpenAI({ apiKey: cfg.apiKey!, baseURL: cfg.baseUrl });
      const resp = await client.chat.completions.create({
        model: cfg.model || "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0,
      });
      text = resp.choices?.[0]?.message?.content ?? "";
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return await fallback();
    return JSON.parse(m[0]);
  } catch (e) {
    console.warn("[llm] call failed, using deterministic fallback:", (e as Error).message);
    return await fallback();
  }
}

/** Embed texts. Returns null if no key (caller keeps lexical). Gemini native or openai SDK. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const cfg = loadLLMConfig();
  if (!cfg.available) return null;
  try {
    if (isGeminiNative(cfg)) return await geminiEmbed(texts, undefined, cfg);
    let OpenAI: any; try { ({ default: OpenAI } = await import("openai")); }
    catch { return null; }
    const client = new OpenAI({ apiKey: cfg.apiKey!, baseURL: cfg.baseUrl });
    const resp = await client.embeddings.create({
      model: process.env.EMBED_MODEL || "text-embedding-3-small", input: texts,
    });
    return resp.data.map((d: any) => d.embedding);
  } catch (e) {
    console.warn("[embed] failed, keeping lexical tokens:", (e as Error).message);
    return null;
  }
}
