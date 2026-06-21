/**
 * Hilo — Facebook Group Scraper (vision-friendly)
 * =================================================
 * Navega grupos de FB con sesión inyectada, descarga IMÁGENES de las fichas,
 * guarda metadata (autor, timestamp, permalink, caption) + la imagen.
 *
 * Para cronjob:
 *   npx tsx scripts/fb-scraper/scrape.ts --group=personasextraviadas --limit=5
 *   npx tsx scripts/fb-scraper/scrape.ts --all --limit=10 --headless
 *
 * Requiere .env con FB_C_USER y FB_XS.
 * Output: data/raw/fb_posts/scrape_<timestamp>/{posts.json, images/}
 */
import { firefox, type Page } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// ═══════════════════════════════════════════════════════════
//  ENV + GROUPS
// ═══════════════════════════════════════════════════════════

function loadFbSession(): { c_user: string; xs: string } {
  const c_user = process.env.FB_C_USER?.trim();
  const xs = process.env.FB_XS?.trim();
  if (!c_user || !xs) {
    throw new Error("FB_C_USER and FB_XS required in .env");
  }
  return { c_user, xs };
}

export const GROUPS: { id: string; url: string; name?: string }[] = [
  { id: "1805287936366188", url: "https://www.facebook.com/groups/1805287936366188/" },
  { id: "1325859701993807", url: "https://www.facebook.com/groups/1325859701993807/" },
  { id: "1767042663531325", url: "https://www.facebook.com/groups/1767042663531325/" },
  { id: "1215105698926369", url: "https://www.facebook.com/groups/1215105698926369/" },
  { id: "personasextraviadas", url: "https://www.facebook.com/groups/personasextraviadas/", name: "Personas Extraviadas" },
  { id: "312567274615390", url: "https://www.facebook.com/groups/312567274615390/" },
  { id: "1252598772778865", url: "https://www.facebook.com/groups/1252598772778865/" },
  { id: "698121155939090", url: "https://www.facebook.com/groups/698121155939090/" },
  { id: "personasdesaparecidas.estadodemexico", url: "https://www.facebook.com/groups/personasdesaparecidas.estadodemexico/", name: "Personas Desaparecidas EdoMex" },
  { id: "1017120493358081", url: "https://www.facebook.com/groups/1017120493358081/" },
  { id: "139865226802302", url: "https://www.facebook.com/groups/139865226802302/" },
  { id: "400494108052656", url: "https://www.facebook.com/groups/400494108052656/" },
  { id: "483702456219930", url: "https://www.facebook.com/groups/483702456219930/" },
  { id: "1070584783092364", url: "https://www.facebook.com/groups/1070584783092364/" },
  { id: "758186889881745", url: "https://www.facebook.com/groups/758186889881745/" },
  { id: "876278420927074", url: "https://www.facebook.com/groups/876278420927074/" },
  { id: "184154792433462", url: "https://www.facebook.com/groups/184154792433462/" },
  { id: "224075550548375", url: "https://www.facebook.com/groups/224075550548375/" },
  { id: "830824604795853", url: "https://www.facebook.com/groups/830824604795853/" },
  { id: "alertaambermexico", url: "https://www.facebook.com/groups/alertaambermexico/", name: "Alerta Amber México" },
  { id: "632812823567978", url: "https://www.facebook.com/groups/632812823567978/" },
  { id: "2780215345581754", url: "https://www.facebook.com/groups/2780215345581754/" },
  { id: "466464038251226", url: "https://www.facebook.com/groups/466464038251226/" },
  { id: "349269099792697", url: "https://www.facebook.com/groups/349269099792697/" },
  { id: "641662411497926", url: "https://www.facebook.com/groups/641662411497926/" },
  { id: "1188760671138154", url: "https://www.facebook.com/groups/1188760671138154/" },
  { id: "502691504446698", url: "https://www.facebook.com/groups/502691504446698/" },
];

// ═══════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════

interface ScrapedPost {
  post_id: string;
  group_id: string;
  group_name: string;
  author: string | null;
  timestamp_raw: string | null;
  permalink: string | null;
  caption: string | null;
  image_url: string | null;
  image_local_path: string | null;
  image_size: number | null;
  all_image_urls: string[];
  captured_at: string;
  schema: "hilo.fb_post.v1";
}

// ═══════════════════════════════════════════════════════════
//  EXTRACTION (corrected — feed children, not role=article)
// ═══════════════════════════════════════════════════════════

interface ExtractedPost {
  author: string | null;
  timestamp: string | null;
  permalink: string | null;
  caption: string | null;
  imageUrls: string[];
  mainImageUrl: string | null;
}

async function extractPostsFromFeed(page: Page): Promise<ExtractedPost[]> {
  return page.evaluate(() => {
    const results: ExtractedPost[] = [];

    // The feed container — its direct children (after the first filter row) are the actual posts
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return results;

    // Skip first child (filter row: "Most relevant", "All topics")
    const children = Array.from(feed.children);

    for (let i = 1; i < children.length; i++) {
      const post = children[i];

      // Find author (h2/h3 link or first link in the post)
      const authorEl = post.querySelector('h2 a, h3 a, a[role="link"] span');
      const author = authorEl?.textContent?.trim() || null;

      // Find timestamp (abbr, time element)
      const timeEl = post.querySelector('abbr, time, [aria-label*="hora"], [aria-label*="time"]');
      const timestamp = timeEl?.getAttribute("title")
        ?? timeEl?.getAttribute("datetime")
        ?? timeEl?.textContent?.trim()
        ?? null;

      // Find permalink
      const permaLink = post.querySelector('a[href*="/posts/"], a[href*="permalink"]') as HTMLAnchorElement | null;
      let permalink: string | null = permaLink?.href || null;
      if (permalink) {
        try { permalink = new URL(permalink).origin + new URL(permalink).pathname; } catch {}
      }

      // Find ALL images in the post
      const allImgs: string[] = [];
      const imgs = post.querySelectorAll("img");
      for (const img of imgs) {
        // Skip profile pics, icons, reactions — look for content images
        const src = img.src || "";
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        const alt = (img.alt || "").toLowerCase();

        // Heuristic: content images are large (usually >300px) and from FB CDN
        const isFbCdn = src.includes("fbcdn.net") || src.includes("fna.fbcdn");
        const isContentSize = w > 200 && h > 200;

        // Skip tiny icons, emoji, profile photos (usually square and small)
        const isLikelyContent = isFbCdn && isContentSize;

        if (isLikelyContent && !allImgs.includes(src)) {
          allImgs.push(src);
        }
      }

      // Pick the largest image as the "main" one (the ficha)
      let mainImageUrl: string | null = null;
      let maxSize = 0;
      for (const src of allImgs) {
        // Higher-res versions have "s960x960" or similar in URL
        const sizeMatch = src.match(/s(\d+)x(\d+)/);
        const size = sizeMatch ? parseInt(sizeMatch[1]) * parseInt(sizeMatch[2]) : 0;
        if (size > maxSize) {
          maxSize = size;
          mainImageUrl = src;
        }
      }

      // If no size info, just take the first one
      if (!mainImageUrl && allImgs.length > 0) mainImageUrl = allImgs[0];

      // Find caption (text content in the post, not in comments)
      // Caption is usually in a div[dir=auto] that comes BEFORE the image
      let caption: string | null = null;
      const textEls = post.querySelectorAll("div[dir=auto], span");
      for (const el of textEls) {
        const text = (el as HTMLElement).innerText?.trim() || "";
        if (text.length > 20 && text.length < 500 && !/^(Like|Comment|Share|Reply)$/i.test(text)) {
          // Skip UI text
          if (!/^(Write something|Anonymous post|Feeling|Activity|Poll)$/i.test(text)) {
            caption = text;
            break;
          }
        }
      }

      results.push({
        author,
        timestamp,
        permalink,
        caption,
        imageUrls: allImgs,
        mainImageUrl,
      });
    }

    return results;
  });
}

// ═══════════════════════════════════════════════════════════
//  IMAGE DOWNLOAD
// ═══════════════════════════════════════════════════════════

async function downloadImage(url: string, destPath: string): Promise<number> {
  try {
    // Use cookies for FB CDN downloads
    const session = loadFbSession();
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
        "cookie": `c_user=${session.c_user}; xs=${session.xs};`,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(destPath, buffer);
    return buffer.length;
  } catch (err) {
    throw new Error(`Failed to download: ${err instanceof Error ? err.message : err}`);
  }
}

// ═══════════════════════════════════════════════════════════
//  SCRAPER
// ═══════════════════════════════════════════════════════════

async function scrapeGroup(
  page: Page,
  groupId: string,
  groupUrl: string,
  limit: number,
  outDir: string,
): Promise<ScrapedPost[]> {
  console.log(`\n  → Navegando a ${groupUrl}`);
  await page.goto(groupUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for feed or login redirect
  await Promise.race([
    page.waitForSelector('[role="feed"]', { timeout: 15000 }),
    page.waitForURL(/login|checkpoint/, { timeout: 15000 }).catch(() => {}),
  ]);

  if (page.url().includes("login") || page.url().includes("checkpoint")) {
    console.log(`  ⚠ Sesión inválida para ${groupId}`);
    return [];
  }

  // Wait for content to load
  await page.waitForTimeout(4000);

  // Scroll to load more posts
  const seen = new Set<string>();
  const allExtracted: ExtractedPost[] = [];

  for (let scroll = 0; scroll < 5; scroll++) {
    const extracted = await extractPostsFromFeed(page);
    for (const post of extracted) {
      const key = post.permalink || post.mainImageUrl || JSON.stringify(post).slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      allExtracted.push(post);
    }
    console.log(`    [scroll ${scroll + 1}] ${allExtracted.length} posts con imagen visibles`);

    if (allExtracted.filter(p => p.mainImageUrl).length >= limit) break;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000 + Math.random() * 2000);
  }

  // Now download images
  const withImages = allExtracted.filter(p => p.mainImageUrl).slice(0, limit);
  console.log(`  ✓ ${withImages.length} posts con imagen — descargando...`);

  const scraped: ScrapedPost[] = [];
  const imgDir = join(outDir, "images", groupId);
  if (!existsSync(imgDir)) mkdirSync(imgDir, { recursive: true });

  for (let i = 0; i < withImages.length; i++) {
    const post = withImages[i];
    const imageFile = join(imgDir, `post_${String(i + 1).padStart(3, "0")}.jpg`);
    let size: number | null = null;

    try {
      size = await downloadImage(post.mainImageUrl!, imageFile);
    } catch (err) {
      console.error(`    ✗ ${i + 1}/${withImages.length}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    scraped.push({
      post_id: post.permalink || `img_${groupId}_${i}`,
      group_id: groupId,
      group_name: GROUPS.find(g => g.id === groupId)?.name || groupId,
      author: post.author,
      timestamp_raw: post.timestamp,
      permalink: post.permalink,
      caption: post.caption,
      image_url: post.mainImageUrl,
      image_local_path: imageFile,
      image_size: size,
      all_image_urls: post.imageUrls,
      captured_at: new Date().toISOString(),
      schema: "hilo.fb_post.v1",
    });
  }

  return scraped;
}

// ═══════════════════════════════════════════════════════════
//  CLI
// ═══════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  let group: string | null = null;
  let all = false;
  let limit = 5;
  let headless = false;

  for (const arg of args) {
    if (arg === "--all") all = true;
    else if (arg.startsWith("--group=")) group = arg.split("=")[1];
    else if (arg.startsWith("--limit=")) limit = parseInt(arg.split("=")[1], 10) || 5;
    else if (arg === "--headless") headless = true;
  }

  if (!group && !all) {
    console.error("Uso:");
    console.error("  npx tsx scripts/fb-scraper/scrape.ts --group=personasextraviadas --limit=5");
    console.error("  npx tsx scripts/fb-scraper/scrape.ts --all --limit=10 --headless");
    process.exit(1);
  }

  return { group, all, limit, headless };
}

async function main() {
  const { group, all, limit, headless } = parseArgs();
  loadFbSession();

  const targets = all ? GROUPS : GROUPS.filter(g => g.id === group);
  if (targets.length === 0) {
    console.error(`Grupo "${group}" no encontrado`);
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = resolve(process.cwd(), "data", "raw", "fb_posts", `scrape_${ts}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`\n━━━ Hilo FB Scraper (vision) ━━━`);
  console.log(`Grupos: ${targets.length}`);
  console.log(`Limit: ${limit} imágenes/grupo`);
  console.log(`Output: ${outDir}`);

  const browser = await firefox.launch({ headless });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
      locale: "es-MX",
      viewport: { width: 1280, height: 1200 },
    });

    const session = loadFbSession();
    await context.addCookies([
      { name: "c_user", value: session.c_user, domain: ".facebook.com", path: "/", httpOnly: true, secure: true, sameSite: "None" },
      { name: "xs", value: session.xs, domain: ".facebook.com", path: "/", httpOnly: true, secure: true, sameSite: "None" },
    ]);

    const allScraped: ScrapedPost[] = [];

    for (let i = 0; i < targets.length; i++) {
      const g = targets[i];
      console.log(`\n[${i + 1}/${targets.length}] Grupo: ${g.id} (${g.name || ""})`);

      const page = await context.newPage();
      try {
        const scraped = await scrapeGroup(page, g.id, g.url, limit, outDir);
        console.log(`  ✓ ${scraped.length} imágenes descargadas`);
        allScraped.push(...scraped);
      } catch (err) {
        console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
      } finally {
        await page.close();
      }

      if (i < targets.length - 1) {
        const delay = 3000 + Math.random() * 4000;
        console.log(`  (esperando ${Math.round(delay / 1000)}s...)`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Save metadata
    const meta = {
      exported_at: new Date().toISOString(),
      total_posts: allScraped.length,
      groups: [...new Set(allScraped.map(p => p.group_id))],
      posts: allScraped,
    };
    const metaPath = join(outDir, "posts.json");
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    console.log(`\n━━━ Resumen ━━━`);
    console.log(`Total posts con imagen: ${allScraped.length}`);
    console.log(`Con autor: ${allScraped.filter(p => p.author).length}`);
    console.log(`Con caption: ${allScraped.filter(p => p.caption).length}`);
    console.log(`Metadata: ${metaPath}`);
    console.log(`Imágenes: ${outDir}/images/`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
