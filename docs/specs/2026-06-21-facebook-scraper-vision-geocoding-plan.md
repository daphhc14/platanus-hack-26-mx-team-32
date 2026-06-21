# Facebook Scraper Vision OCR + Geocoding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `lib/facebook-scraper.ts` to screenshot post images via Playwright, OCR them with Claude Sonnet vision, geocode extracted location text with Google Maps, and save coordinates to Supabase.

**Architecture:** All changes are confined to `lib/facebook-scraper.ts`. The Playwright scroll loop is updated to capture image screenshots as base64 alongside text. `extractPatternWithClaude` gains vision content blocks. A new `geocodeLocation` function calls the Maps Geocoding API. The main loop wires geocoding between Claude extraction and Supabase upsert.

**Tech Stack:** TypeScript, Playwright (chromium), Anthropic API (claude-sonnet-4-6), Google Maps Geocoding API, Supabase JS client, Node.js `crypto`

## Global Constraints

- Modify only `lib/facebook-scraper.ts` — no new files, no DB schema changes
- Max 5 images per post (token budget)
- Model: `claude-sonnet-4-6`
- `GOOGLE_MAPS_API_KEY` read from `process.env.GOOGLE_MAPS_API_KEY`
- If `GOOGLE_MAPS_API_KEY` is missing: log a warning, skip geocoding for all posts (don't throw)
- On any image screenshot failure: skip that image, continue
- On Google Maps zero results or error: save `location_text` but leave lat/lng/region null

---

### Task 1: Capture image screenshots in Playwright

**Files:**
- Modify: `lib/facebook-scraper.ts` — `ScrapedPost` interface + `fetchFacebookGroupPosts`

**Interfaces:**
- Produces: `ScrapedPost { url: string; content: string; imageBase64: string[] }`

- [ ] **Step 1: Update `ScrapedPost` interface**

Replace `imageUrls: string[]` with `imageBase64: string[]`:

```ts
export interface ScrapedPost {
  url: string;
  content: string;
  imageBase64: string[];
}
```

- [ ] **Step 2: Rewrite the article capture loop**

The existing loop uses `$$eval` (runs in browser, returns serialized data). Replace it with `page.$$` (returns ElementHandles in Node) so we can call `screenshot()` on child `<img>` elements.

Replace the entire inner loop body (from `const articleTexts = ...` to the `noNewCount` logic) with:

```ts
const articleHandles = await page.$$('[role="article"]');

let newThisScroll = 0;
for (const article of articleHandles) {
  const text = await article
    .evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .catch(() => "");
  if (text.length <= 20) continue;

  const key = text.slice(0, 100);
  if (seenPosts.has(key)) continue;

  // Screenshot up to 5 Facebook CDN images in this article
  const imageBase64: string[] = [];
  try {
    const imgHandles = await article.$$('img[src*="scontent"]');
    for (const img of imgHandles.slice(0, 5)) {
      try {
        const bytes = await img.screenshot({ type: "png" });
        imageBase64.push(Buffer.from(bytes).toString("base64"));
      } catch {
        // element detached or not visible — skip
      }
    }
  } catch {
    // $$() failed — continue without images
  }

  seenPosts.set(key, { text, imageBase64 });
  newThisScroll++;
}
```

- [ ] **Step 3: Update `seenPosts` map type and final post assembly**

Change `seenPostTexts` → `seenPosts` with value type `{ text: string; imageBase64: string[] }`:

```ts
const seenPosts = new Map<string, { text: string; imageBase64: string[] }>();
```

Update the post assembly after the scroll loop:

```ts
const posts: ScrapedPost[] = [];
let idx = 0;
for (const { text, imageBase64 } of Array.from(seenPosts.values())) {
  posts.push({
    url: `${groupUrl}#post-${idx}`,
    content: text.slice(0, 5000),
    imageBase64,
  });
  idx += 1;
}
```

- [ ] **Step 4: Fix the `noNewCount` reference**

The `noNewCount` logic now references `newThisScroll` (same variable name). Update the condition block to match:

```ts
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
  console.log(`Scroll ${i + 1}: ${seenPosts.size} unique posts captured`);
}
```

- [ ] **Step 5: Manual smoke test**

Temporarily add a `console.log` after the post assembly to verify image capture:

```ts
console.log(`Images captured: ${posts.map(p => p.imageBase64.length).join(', ')}`);
```

Run:
```bash
npx tsx scripts/scrape-facebook.ts 2>&1 | head -30
```

Expected: script starts, logs scroll progress, and on exit logs image counts (some posts should have > 0 images if the group has image posts). Remove the debug `console.log` after verifying.

- [ ] **Step 6: Commit**

```bash
git add lib/facebook-scraper.ts
git commit -m "feat(scraper): capture post image screenshots as base64 in Playwright"
```

---

### Task 2: Update Claude call to use vision content blocks

**Files:**
- Modify: `lib/facebook-scraper.ts` — `extractPatternWithClaude`

**Interfaces:**
- Consumes: `ScrapedPost { content: string; imageBase64: string[] }`
- Produces: `ClaudePatternExtraction` (unchanged shape)

- [ ] **Step 1: Update `extractPatternWithClaude` signature**

The function already accepts `ScrapedPost`. No signature change needed — it now uses `post.imageBase64` instead of the unused `post.imageUrls`.

- [ ] **Step 2: Build vision content blocks**

Replace the existing `messages` array construction with one that prepends image blocks:

```ts
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } };

const imageBlocks: ContentBlock[] = post.imageBase64.map((data) => ({
  type: "image",
  source: { type: "base64", media_type: "image/png", data },
}));

const textBlock: ContentBlock = { type: "text", text: prompt };

const content: ContentBlock[] = [...imageBlocks, textBlock];
```

- [ ] **Step 3: Update the prompt to reference images**

Replace the existing `prompt` string with:

```ts
const prompt = `Analyze this Facebook scam-report post. The images attached (if any) are screenshots from the post — OCR them and use their text in your analysis.

Extract:
- tone_description: A short description of the scam tactic (e.g. "WhatsApp recruitment with upfront uniform fee")
- tone_keywords: Array of tags from this exact set only: urgency, job_offer, payment_request, data_harvest, off_platform_contact, high_salary, vague_company, immediate_start, uniform_fee, investment_return, crypto, delivery_job
- image_descriptions: Array describing what each image shows
- location_text: The most specific location signal found in the post text OR images (address, neighborhood, landmark, city name, directions) — return null if none found.

Post text:
${post.content}

Respond as STRICT JSON only (no markdown fences), exactly this shape:
{"tone_description": string|null, "tone_keywords": string[], "image_descriptions": string[], "location_text": string|null}`;
```

- [ ] **Step 4: Pass content array in the API call**

Update the `body` of the fetch call:

```ts
body: JSON.stringify({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: "You are a scam-pattern analyst. You output only valid JSON. You never assert specific crimes, persons, or groups — only describe the tactic and pattern.",
  messages: [{ role: "user", content }],
}),
```

- [ ] **Step 5: Commit**

```bash
git add lib/facebook-scraper.ts
git commit -m "feat(scraper): send post images to Claude vision for OCR and location extraction"
```

---

### Task 3: Add Google Maps geocoding function

**Files:**
- Modify: `lib/facebook-scraper.ts` — add `geocodeLocation` function

**Interfaces:**
- Produces: `geocodeLocation(locationText: string): Promise<{ lat: number; lng: number; region: string } | null>`

- [ ] **Step 1: Add the `geocodeLocation` function**

Add this function before `scrapeAndSeedFacebookPatterns`:

```ts
interface GeocodeResult {
  lat: number;
  lng: number;
  region: string;
}

async function geocodeLocation(locationText: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", locationText);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "es");
  url.searchParams.set("region", "mx");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json() as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        address_components: Array<{ long_name: string; types: string[] }>;
      }>;
    };

    if (data.status !== "OK" || data.results.length === 0) return null;

    const first = data.results[0];
    const { lat, lng } = first.geometry.location;

    const regionComponent = first.address_components.find((c) =>
      c.types.includes("administrative_area_level_1"),
    );
    const region = regionComponent?.long_name ?? "";

    return { lat, lng, region };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add missing API key warning at scrape start**

At the top of `scrapeAndSeedFacebookPatterns`, after the Supabase client is created, add:

```ts
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn("Warning: GOOGLE_MAPS_API_KEY not set — geocoding will be skipped");
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/facebook-scraper.ts
git commit -m "feat(scraper): add Google Maps geocoding function"
```

---

### Task 4: Wire geocoding into the main loop and populate DB row

**Files:**
- Modify: `lib/facebook-scraper.ts` — `scrapeAndSeedFacebookPatterns` inner loop

**Interfaces:**
- Consumes: `geocodeLocation` from Task 3, `ClaudePatternExtraction.location_text`
- Produces: `facebook_patterns` row with populated `location_latitude`, `location_longitude`, `location_region`

- [ ] **Step 1: Call `geocodeLocation` after Claude extraction**

In the `for (const post of posts)` loop, after `const extraction = await extractPatternWithClaude(post)`, add:

```ts
let geocode: { lat: number; lng: number; region: string } | null = null;
if (extraction.location_text) {
  geocode = await geocodeLocation(extraction.location_text);
  if (geocode) {
    console.log(`Geocoded "${extraction.location_text}" → ${geocode.lat}, ${geocode.lng} (${geocode.region})`);
  }
}
```

- [ ] **Step 2: Populate lat/lng/region in the DB row**

Update the `row` object to use geocode values:

```ts
const row = {
  id: randomUUID(),
  post_url: post.url,
  post_content: post.content,
  tone_description: extraction.tone_description,
  tone_keywords: extraction.tone_keywords,
  image_urls: [],
  image_descriptions: extraction.image_descriptions,
  location_text: extraction.location_text,
  location_latitude: geocode?.lat ?? null,
  location_longitude: geocode?.lng ?? null,
  location_region: geocode?.region ?? null,
  scraped_at: new Date().toISOString(),
  post_date: postDate,
};
```

- [ ] **Step 3: Full end-to-end verification**

Run the scraper against the real Facebook group:

```bash
npx tsx scripts/scrape-facebook.ts
```

Expected output includes lines like:
```
Geocoded "Colonia Centro, CDMX" → 19.432608, -99.133208 (Ciudad de México)
=== Scrape Summary ===
Total posts seen: N
Inserted: N
Skipped: 0
Failed: 0
```

Then verify in Supabase that at least some rows have non-null `location_latitude` and `location_region`:

```sql
select post_url, location_text, location_latitude, location_longitude, location_region
from facebook_patterns
where location_latitude is not null
limit 5;
```

- [ ] **Step 4: Commit**

```bash
git add lib/facebook-scraper.ts
git commit -m "feat(scraper): wire geocoding into main loop and persist coordinates to DB"
```
