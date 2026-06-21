// lib/acquisition/providers/facebook.ts
// Facebook group scraper using Playwright with session cookies.
// Scrapes posts from a target Facebook group, extracts scam patterns via
// hilo's unified LLM client, and stores patterns in the facebook_patterns table.
//
// Usage:
//   const scraper = new FacebookScraper();
//   const summary = await scraper.scrapeGroupAndSeed(db);
//
// Environment:
//   FB_C_USER, FB_XS   — Facebook session cookies (get from DevTools)
//   FACEBOOK_GROUP_URL  — Target group URL (optional, has default)

import { chromium, type Browser } from "playwright";
import { randomUUID } from "node:crypto";
import { chatJSON, loadLLMConfig } from "../../llm.js";
import type { HiloDB } from "../../db.js";
import type { FacebookPattern, ScrapedPost, ScrapeSummary, ToneKeyword } from "../types.js";
import { resolveLocation } from "./geocoding.js";

const DEFAULT_GROUP_URL =
  "https://www.facebook.com/groups/1917199411779792/";

function groupUrl(): string {
  return process.env.FACEBOOK_GROUP_URL ?? DEFAULT_GROUP_URL;
}

function fbSession(): { cUser: string; xs: string } {
  const cUser = process.env.FB_C_USER;
  const xs = process.env.FB_XS;
  if (!cUser || !xs) {
    throw new Error(
      "Missing FB_C_USER or FB_XS. Get them from DevTools → Application → Cookies on facebook.com after logging in.",
    );
  }
  return { cUser, xs };
}

// ── DOM Parsing ──

function extractPostsFromPageContent(html: string, text: string): ScrapedPost[] {
  const posts: ScrapedPost[] = [];
  const seen = new Set<string>();

  const imgUrlRegex = /https:\/\/scontent[^"'\s]+\.(?:jpg|png|webp)/gi;
  const allImages = (html ?? "").match(imgUrlRegex) ?? [];

  const rawText = text ?? "";
  const chunks = rawText
    .split(/\nComment as |\nAnswer as /i)
    .map((c) => c.trim())
    .filter((c) => c.length > 20);

  let idx = 0;
  for (const chunk of chunks) {
    const meaningfulLines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== "Facebook");

    const contentStartIdx = meaningfulLines.findIndex(
      (l, i) =>
        i > 0 &&
        !l.match(/^[\d\s\w·: cafAMtPJSgmdnuroelshu]+$/i) &&
        l.length > 10 &&
        ![
          "Like", "Comment", "Share", "All reactions", "View more comments",
          "Reply", "View all", "About", "Discussion", "People", "Events",
          "Media", "Files",
        ].includes(l),
    );

    if (contentStartIdx === -1) {
      idx += 1;
      continue;
    }

    const contentLines: string[] = [];
    let commentLines: string[] = [];
    let inComments = false;

    for (let i = contentStartIdx; i < meaningfulLines.length; i++) {
      const line = meaningfulLines[i];
      if (/^Like$|^Comment$|^Share$|^All reactions/i.test(line)) {
        inComments = true;
        continue;
      }
      if (/^\d+d$|^\d+h$|^\d+w$/i.test(line)) continue;
      if (/^Reply$|^View (more|all)/i.test(line)) continue;
      if (inComments) {
        commentLines.push(line);
      } else {
        contentLines.push(line);
      }
    }

    const content = contentLines.join(" ").trim();
    if (content.length < 10) {
      idx += 1;
      continue;
    }

    const fullContent =
      commentLines.length > 0
        ? `${content}\n\n[Comments: ${commentLines.join(" | ")}]`
        : content;

    const postUrl = `${groupUrl()}#post-${idx}`;
    if (seen.has(postUrl)) continue;
    seen.add(postUrl);

    posts.push({
      url: postUrl,
      content: fullContent.slice(0, 5000),
      imageUrls: allImages.slice(idx * 2, idx * 2 + 3),
    });
    idx += 1;
  }

  return posts;
}

// ── Browser Automation ──

async function fetchFacebookGroupHtml(url: string): Promise<{ html: string; text: string }> {
  const { cUser, xs } = fbSession();
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "es-ES",
    });

    await context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      window.chrome = { runtime: {} };
    `);

    await context.addCookies([
      { name: "c_user", value: cUser, domain: ".facebook.com", path: "/", httpOnly: true, secure: true, sameSite: "None" as const },
      { name: "xs", value: xs, domain: ".facebook.com", path: "/", httpOnly: true, secure: true, sameSite: "None" as const },
      { name: "datr", value: "mBdsZ-abcdef123456", domain: ".facebook.com", path: "/", secure: true, sameSite: "None" as const },
    ]);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes("login") || page.url().includes("two_step_verification")) {
      throw new Error("Facebook session cookies expired. Re-extract FB_C_USER and FB_XS from DevTools.");
    }

    // Scroll to load posts
    for (let i = 0; i < 12; i++) {
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(2000);
    }

    const html = await page.content();
    const text = await page.evaluate("document.body?.innerText ?? ''") as string;
    return { html, text };
  } finally {
    if (browser) await browser.close();
  }
}

// ── LLM Extraction ──

interface ClaudePatternExtraction {
  tone_description: string | null;
  tone_keywords: string[];
  image_descriptions: string[];
  location_text: string | null;
}

async function extractPatternFromPost(post: ScrapedPost): Promise<ClaudePatternExtraction> {
  const system = [
    "You are a scam-pattern analyst. You output only valid JSON.",
    "You never assert specific crimes, persons, or groups — only describe the tactic and pattern.",
  ].join(" ");

  const user = [
    "Analyze this Facebook-scam-report post from a community group.",
    "Extract:",
    "- tone_description: A short description of the scam tactic (e.g. 'WhatsApp recruitment with upfront uniform fee')",
    "- tone_keywords: Array of tags from this exact set only: urgency, job_offer, payment_request, data_harvest, off_platform_contact, high_salary, vague_company, immediate_start, uniform_fee, investment_return, crypto, delivery_job",
    "- image_descriptions: Array describing what images in the post show (e.g. ['screenshot of a WhatsApp chat requesting a deposit'])",
    "- location_text: Any location mention (city name, neighborhood) — return null if none.",
    "",
    "Post text:",
    post.content,
    "",
    "Respond as STRICT JSON only, exactly this shape:",
    '{"tone_description": string|null, "tone_keywords": string[], "image_descriptions": string[], "location_text": string|null}',
  ].join("\n");

  const llm = loadLLMConfig();
  if (!llm.available) {
    return extractPatternFallback(post);
  }

  try {
    const result = await chatJSON(system, user, () => extractPatternFallback(post), llm);

    const validKeywords = [
      "urgency", "job_offer", "payment_request", "data_harvest",
      "off_platform_contact", "high_salary", "vague_company", "immediate_start",
      "uniform_fee", "investment_return", "crypto", "delivery_job",
    ] as const;
    const filteredKeywords = (Array.isArray(result.tone_keywords) ? result.tone_keywords : []).filter(
      (k: string) => (validKeywords as readonly string[]).includes(k),
    );

    return {
      tone_description: typeof result.tone_description === "string" ? result.tone_description : null,
      tone_keywords: filteredKeywords,
      image_descriptions: Array.isArray(result.image_descriptions) ? result.image_descriptions : [],
      location_text: typeof result.location_text === "string" ? result.location_text : null,
    };
  } catch {
    return extractPatternFallback(post);
  }
}

function extractPatternFallback(post: ScrapedPost): ClaudePatternExtraction {
  const lower = post.content.toLowerCase();
  const keywords: string[] = [];

  if (/urgente|inmediato|hoy/i.test(lower)) keywords.push("urgency");
  if (/trabajo|empleo|vacante/i.test(lower)) keywords.push("job_offer");
  if (/pago|cuota|deposito|transferencia/i.test(lower)) keywords.push("payment_request");
  if (/whatsapp|telegram/i.test(lower)) keywords.push("off_platform_contact");
  if (/datos|ine|curp|documento/i.test(lower)) keywords.push("data_harvest");
  if (/\$\s*\d{4,}/i.test(lower)) keywords.push("high_salary");

  return {
    tone_description: keywords.length > 0 ? `Detected signals: ${keywords.join(", ")}` : null,
    tone_keywords: keywords,
    image_descriptions: [],
    location_text: extractLocationText(post.content),
  };
}

function extractLocationText(text: string): string | null {
  const patterns = [
    /(?:en|por|desde|cerca de)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s*,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/,
    /(?:colonia|fracc|fraccionamiento|barrio)\s+([A-ZÁÉÍÓÚÑ][\w\sáéíóúñ.-]{2,60})/i,
    /(?:estado|municipio|ciudad)\s+[de\s]*([A-ZÁÉÍÓÚÑ][\w\sáéíóúñ.-]{2,40})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ── Public API ──

/**
 * Scrape the target Facebook group, extract patterns, and seed the
 * facebook_patterns table. Returns a summary of what happened.
 */
export async function scrapeGroupAndSeed(db: HiloDB): Promise<ScrapeSummary> {
  const summary: ScrapeSummary = {
    inserted: 0, skipped: 0, failed: 0, errors: [], totalPostsSeen: 0,
  };

  const url = groupUrl();
  let pageHtml = "";
  let pageText = "";

  try {
    const result = await fetchFacebookGroupHtml(url);
    pageHtml = result.html;
    pageText = result.text;
  } catch (e) {
    summary.errors.push(`Playwright scrape failed: ${e instanceof Error ? e.message : "unknown"}`);
    summary.failed += 1;
    return summary;
  }

  if (!pageHtml && !pageText) {
    summary.errors.push("Playwright returned empty page (login may have failed)");
    summary.failed += 1;
    return summary;
  }

  const posts = extractPostsFromPageContent(pageHtml, pageText);
  summary.totalPostsSeen = posts.length;

  if (posts.length === 0) {
    summary.errors.push("No posts parsed from Playwright output");
    return summary;
  }

  for (const post of posts) {
    try {
      const extraction = await extractPatternFromPost(post);
      const loc = await resolveLocation(extraction.location_text);

      const row = {
        id: randomUUID(),
        post_url: post.url,
        post_content: post.content,
        tone_description: extraction.tone_description,
        tone_keywords: JSON.stringify(extraction.tone_keywords),
        image_urls: JSON.stringify(post.imageUrls),
        image_descriptions: JSON.stringify(extraction.image_descriptions),
        location_text: loc.text,
        location_latitude: loc.latitude,
        location_longitude: loc.longitude,
        location_region: loc.region,
        scraped_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const rawDb = (db as any).db as import("better-sqlite3").Database;
      try {
        rawDb.prepare(`INSERT INTO facebook_patterns
          (id, post_url, post_content, tone_description, tone_keywords, image_urls,
           image_descriptions, location_text, location_latitude, location_longitude,
           location_region, scraped_at, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          row.id, row.post_url, row.post_content, row.tone_description, row.tone_keywords,
          row.image_urls, row.image_descriptions, row.location_text, row.location_latitude,
          row.location_longitude, row.location_region, row.scraped_at, row.created_at,
        );
        summary.inserted += 1;
      } catch (insertErr: any) {
        if (insertErr?.message?.includes("UNIQUE constraint")) {
          summary.skipped += 1;
        } else {
          summary.failed += 1;
          summary.errors.push(`Post ${post.url}: ${insertErr?.message ?? "unknown"}`);
        }
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push(`Post ${post.url}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return summary;
}

/**
 * Match a case against known Facebook patterns. Extracts tone keywords from
 * the case text and scores against stored patterns by keyword overlap.
 */
export function matchFacebookPatterns(
  rawDb: import("better-sqlite3").Database,
  caseText: string,
  limit = 5,
): Array<{ pattern: FacebookPattern; score: number; reason: string }> {
  const rows = rawDb.prepare("SELECT * FROM facebook_patterns ORDER BY scraped_at DESC LIMIT 500").all() as any[];
  if (rows.length === 0) return [];

  const patterns: FacebookPattern[] = rows.map(normalizePattern);
  const caseKeywords = extractToneKeywords(caseText);
  const matches: Array<{ pattern: FacebookPattern; score: number; reason: string }> = [];

  for (const pattern of patterns) {
    let score = 0;
    const reasons: string[] = [];

    if (caseKeywords.length > 0 && pattern.tone_keywords.length > 0) {
      const overlap = caseKeywords.filter((k) => pattern.tone_keywords.includes(k));
      const toneScore = overlap.length / Math.max(caseKeywords.length, pattern.tone_keywords.length);
      if (toneScore > 0) {
        score += toneScore * 0.6;
        reasons.push(`tone overlap ${(toneScore * 100).toFixed(0)}%`);
      }
    }

    const triggerPatterns = [
      /pago|cuota|costo|inversion|deposito|transferen|fee|payment|deposit/i,
      /urgente|inmediato|hoy(\s+mismo)?|limited|secret/i,
      /whatsapp only|solo whatsapp|telegram|signal/i,
      /datos personales|ine|curp|rfc|documento/i,
    ];
    if (triggerPatterns.some((p) => p.test(caseText))) {
      score += 0.15;
      reasons.push("case text triggers scam signatures");
    }

    if (score >= 0.3) {
      matches.push({ pattern, score: Math.min(score, 1), reason: reasons.join("; ") });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

function extractToneKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const checks: Array<[ToneKeyword, RegExp]> = [
    ["payment_request", /pago|cuota|costo|deposito|fee|payment|deposit|inversion/i],
    ["urgency", /urgente|inmediato|hoy|limited|secret/i],
    ["off_platform_contact", /whatsapp|telegram|signal/i],
    ["data_harvest", /ine|curp|rfc|documento|datos personales/i],
    ["job_offer", /buscamos|se necesita|vacante|empleo|trabajo/i],
    ["high_salary", /(\$|pesos)\s*\d{4,}|sueldo/i],
    ["vague_company", /grupo empresarial|empresa líder|compañía reconocida/i],
    ["immediate_start", /inmediato|mañana|inicia hoy/i],
    ["uniform_fee", /uniforme|credencial|gafete/i],
    ["investment_return", /invierte|rendimiento|retorno|ganancia/i],
    ["crypto", /bitcoin|crypto|usdt|binance/i],
    ["delivery_job", /repartidor|domicilios|uber|rappi|didi/i],
  ];
  for (const [kw, regex] of checks) {
    if (regex.test(lower)) found.push(kw);
  }
  return found;
}

function normalizePattern(row: any): FacebookPattern {
  return {
    id: row.id,
    post_url: row.post_url,
    post_content: row.post_content,
    tone_description: row.tone_description ?? null,
    tone_keywords: row.tone_keywords ? JSON.parse(row.tone_keywords) : [],
    image_urls: row.image_urls ? JSON.parse(row.image_urls) : [],
    image_descriptions: row.image_descriptions ? JSON.parse(row.image_descriptions) : [],
    location_text: row.location_text ?? null,
    location_latitude: row.location_latitude ?? null,
    location_longitude: row.location_longitude ?? null,
    location_region: row.location_region ?? null,
    scraped_at: row.scraped_at,
    created_at: row.created_at,
  };
}

export { extractPatternFallback, extractToneKeywords };
