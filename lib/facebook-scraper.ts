import { config } from "dotenv";
config({ path: ".env.local" });
import { chromium, type Browser } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const FACEBOOK_GROUP_URL =
  process.env.FACEBOOK_GROUP_URL ??
  "https://www.facebook.com/groups/1917199411779792/";

export interface ScrapedPost {
  url: string;
  content: string;
  imageUrls: string[];
}

export interface ScrapeSummary {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
  totalPostsSeen: number;
}

interface ClaudePatternExtraction {
  tone_description: string | null;
  tone_keywords: string[];
  image_descriptions: string[];
  location_text: string | null;
}

/**
 * Launch headless chromium with pre-authenticated session cookies (FB_C_USER +
 * FB_XS), navigate directly to the target group, scroll to load posts, and
 * capture [role="article"] elements incrementally (Facebook virtualizes the DOM).
 */
async function fetchFacebookGroupPosts(groupUrl: string): Promise<ScrapedPost[]> {
  const cUser = process.env.FB_C_USER;
  const xs = process.env.FB_XS;
  if (!cUser || !xs) {
    throw new Error(
      "Missing FB_C_USER or FB_XS in environment. Get them from DevTools → Application → Cookies on facebook.com after logging in.",
    );
  }

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

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "languages", { get: () => ["es-ES", "es", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });

    await context.addCookies([
      {
        name: "c_user",
        value: cUser,
        domain: ".facebook.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
      {
        name: "xs",
        value: xs,
        domain: ".facebook.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
      {
        name: "datr",
        value: "mBdsZ-abcdef123456",
        domain: ".facebook.com",
        path: "/",
        secure: true,
        sameSite: "None",
      },
    ]);

    const page = await context.newPage();
    await page.goto(groupUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes("login") || page.url().includes("two_step_verification")) {
      throw new Error("Facebook session cookies expired or invalid.");
    }

    const seenPostTexts = new Map<string, string>();
    let noNewCount = 0;

    for (let i = 0; i < 300; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);

      const articleTexts = await page.$$eval('[role="article"]', (els) =>
        els
          .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter((t) => t.length > 20),
      );

      let newThisScroll = 0;
      for (const text of articleTexts) {
        const key = text.slice(0, 100);
        if (!seenPostTexts.has(key)) {
          seenPostTexts.set(key, text);
          newThisScroll++;
        }
      }

      if (newThisScroll === 0) {
        noNewCount++;
        if (noNewCount >= 15) {
          console.log(`Stopping at scroll ${i + 1}: no new posts for 15 scrolls`);
          break;
        }
      } else {
        noNewCount = 0;
      }

      if ((i + 1) % 25 === 0) {
        console.log(`Scroll ${i + 1}: ${seenPostTexts.size} unique posts captured`);
      }
    }
    console.log(`Scroll complete: ${seenPostTexts.size} unique posts`);

    const posts: ScrapedPost[] = [];
    let idx = 0;
    for (const text of Array.from(seenPostTexts.values())) {
      posts.push({
        url: `${groupUrl}#post-${idx}`,
        content: text.slice(0, 5000),
        imageUrls: [],
      });
      idx += 1;
    }

    return posts;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Parse a relative date string from FB post text (e.g. "3d", "1w", "2m").
 */
function parseRelativeDate(text: string): string | null {
  const matches = Array.from(text.matchAll(/(\d{1,2})(h|d|w|m|y)(?=[A-Z\d\s]|$)/gi));
  if (matches.length === 0) return null;

  const limits = { h: 23, d: 30, w: 52, m: 12, y: 10 };
  let best: { num: number; unit: string } | null = null;
  const unitOrder = { h: 1, d: 2, w: 3, m: 4, y: 5 };

  for (const m of matches) {
    const num = parseInt(m[1]);
    const unit = m[2].toLowerCase();
    if (num > limits[unit as keyof typeof limits]) continue;
    if (!best) {
      best = { num, unit };
      continue;
    }
    const bestRank = unitOrder[best.unit as keyof typeof unitOrder];
    const curRank = unitOrder[unit as keyof typeof unitOrder];
    if (curRank > bestRank || (curRank === bestRank && num > best.num)) {
      best = { num, unit };
    }
  }

  if (!best) return null;
  const now = new Date();
  switch (best.unit) {
    case "h": now.setHours(now.getHours() - best.num); break;
    case "d": now.setDate(now.getDate() - best.num); break;
    case "w": now.setDate(now.getDate() - best.num * 7); break;
    case "m": now.setMonth(now.getMonth() - best.num); break;
    case "y": now.setFullYear(now.getFullYear() - best.num); break;
  }
  return now.toISOString();
}

/**
 * Call Claude API to extract pattern information from a Facebook post.
 */
async function extractPatternWithClaude(post: ScrapedPost): Promise<ClaudePatternExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable");
  }

  const prompt = `Analyze this Facebook-scam-report post from a community group.
Extract:
- tone_description: A short description of the scam tactic (e.g. "WhatsApp recruitment with upfront uniform fee")
- tone_keywords: Array of tags from this exact set only: urgency, job_offer, payment_request, data_harvest, off_platform_contact, high_salary, vague_company, immediate_start, uniform_fee, investment_return, crypto, delivery_job
- image_descriptions: Array describing what the images in the post show
- location_text: Any location mention (city name, URL, neighborhood) — return null if none.

Post text:
${post.content}

Respond as STRICT JSON only (no markdown fences), exactly this shape:
{"tone_description": string|null, "tone_keywords": string[], "image_descriptions": string[], "location_text": string|null}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: "You are a scam-pattern analyst. You output only valid JSON. You never assert specific crimes, persons, or groups — only describe the tactic and pattern.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const textBlock = data.content.find((b) => b.type === "text");
    const raw = textBlock?.text ?? "";
    const sanitized = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(sanitized) as ClaudePatternExtraction;
    return {
      tone_description: parsed.tone_description ?? null,
      tone_keywords: Array.isArray(parsed.tone_keywords) ? parsed.tone_keywords : [],
      image_descriptions: Array.isArray(parsed.image_descriptions) ? parsed.image_descriptions : [],
      location_text: parsed.location_text ?? null,
    };
  } catch {
    return {
      tone_description: null,
      tone_keywords: [],
      image_descriptions: [],
      location_text: null,
    };
  }
}

export async function scrapeAndSeedFacebookPatterns(): Promise<ScrapeSummary> {
  const summary: ScrapeSummary = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    totalPostsSeen: 0,
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let posts: ScrapedPost[] = [];
  try {
    posts = await fetchFacebookGroupPosts(FACEBOOK_GROUP_URL);
  } catch (e) {
    summary.errors.push(`Playwright scrape failed: ${e instanceof Error ? e.message : "unknown"}`);
    summary.failed += 1;
    return summary;
  }

  if (posts.length === 0) {
    summary.errors.push("No posts captured from Facebook group");
    summary.failed += 1;
    return summary;
  }
  summary.totalPostsSeen = posts.length;

  for (const post of posts) {
    try {
      const extraction = await extractPatternWithClaude(post);
      const postDate = parseRelativeDate(post.content);

      const row = {
        id: randomUUID(),
        post_url: post.url,
        post_content: post.content,
        tone_description: extraction.tone_description,
        tone_keywords: extraction.tone_keywords,
        image_urls: post.imageUrls,
        image_descriptions: extraction.image_descriptions,
        location_text: extraction.location_text,
        location_latitude: null,
        location_longitude: null,
        location_region: null,
        scraped_at: new Date().toISOString(),
        post_date: postDate,
      };

      const { error } = await supabase
        .from("facebook_patterns")
        .upsert(row, { onConflict: "post_url" });

      if (error) {
        if (error.code === "23505") {
          summary.skipped += 1;
        } else {
          summary.failed += 1;
          summary.errors.push(`Post ${post.url}: ${error.message}`);
        }
      } else {
        summary.inserted += 1;
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push(`Post ${post.url}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return summary;
}
