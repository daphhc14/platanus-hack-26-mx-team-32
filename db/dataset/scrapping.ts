import * as CryptoJS from "crypto-js";
import * as fs from "fs";

const API = "https://apiconsultapublicarnpdno.segob.gob.mx/api";
const TOKEN_KEY = "z427FcQwMSPZuFbIjNWGDqUpw1MEo1DG7cIOBSuI3ps";

const BASE_FILE = "consultapublicarnpdno.json";
const JSONL_FILE = "final_dataset.jsonl";
const JSON_FILE = "final_dataset.json";

const MAX_RETRY = 4;
const TOKEN_REFRESH_MARGIN_S = 120;
const CONCURRENCY = 3;
const PROGRESS_EVERY = 10;

const HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.7",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Connection: "keep-alive",
  Origin: "https://consultapublicarnpdno.segob.gob.mx",
  Referer: "https://consultapublicarnpdno.segob.gob.mx/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "Sec-GPC": "1",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Brave";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "Linux",
};

function b64encode(str: string): string {
  return Buffer.from(str, "latin1").toString("base64");
}

function buildParam(accion: string, data: unknown, key: string): string {
  const now = new Date();
  const payload = {
    fecha: `${now.getDay()}-${now.getMonth()}-${now.getFullYear()}`,
    accion,
    data,
  };
  const json = JSON.stringify(payload);
  const encrypted = CryptoJS.AES.encrypt(json, key).toString();
  return b64encode(encrypted);
}

function decodeExp(token: string): number {
  try {
    const part = token.split(".")[1];
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return Number(payload.exp) || 0;
  } catch {
    return 0;
  }
}

async function fetchToken(): Promise<string> {
  const param = buildParam("token", null, TOKEN_KEY);
  const res = await fetch(`${API}/t/${param}`, { method: "POST", headers: HEADERS });
  if (!res.ok) throw new Error(`token HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as any;
  const tok = body?.result?.data;
  if (typeof tok !== "string" || !tok)
    throw new Error(`unexpected token response: ${JSON.stringify(body).slice(0, 300)}`);
  return tok;
}

class TokenManager {
  private token = "";
  private exp = 0;
  private inflight: Promise<string> | null = null;

  async get(forceRefresh = false): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (!forceRefresh && this.token && this.exp - now > TOKEN_REFRESH_MARGIN_S) {
      return this.token;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.doRefresh();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async doRefresh(): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        this.token = await fetchToken();
        this.exp = decodeExp(this.token);
        console.log(`[token] refreshed (exp ${new Date(this.exp * 1000).toISOString()})`);
        return this.token;
      } catch (e) {
        lastErr = e;
        await sleep(500 * (attempt + 1));
      }
    }
    throw lastErr;
  }
}

async function fetchPdf(
  bearer: string,
  idvictimadirecta: string,
  idreporte: number,
  iddependenciaorigen: number
): Promise<any> {
  const param = buildParam(
    "get_pdf_persona",
    { idvictimadirecta, idreporte, iddependenciaorigen },
    bearer
  );
  const res = await fetch(`${API}/pdf/${param}`, {
    headers: { ...HEADERS, Authorization: `Bearer ${bearer}` },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  if (!res.ok) {
    const err: any = new Error(`pdf HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function isFetchable(rec: any): boolean {
  return (
    String(rec.iddependenciaorigen) !== "CONFIDENCIAL" &&
    String(rec.IDvictimadirecta) !== "CONFIDENCIAL" &&
    String(rec.IDreporte) !== "CONFIDENCIAL" &&
    rec.IDvictimadirecta != null &&
    rec.IDreporte != null &&
    rec.iddependenciaorigen != null
  );
}

function recordKey(rec: any): string {
  return `${rec.IDvictimadirecta}|${rec.IDreporte}|${rec.iddependenciaorigen}`;
}

function flattenPdfData(body: any): Record<string, any> {
  const arr = body?.result?.data;
  if (!Array.isArray(arr)) return {};
  const out: Record<string, any> = {};
  for (const item of arr) {
    if (item && typeof item === "object" && "key" in item && "value" in item) {
      out[item.key] = item.value;
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadBase(): any[] {
  const raw = fs.readFileSync(BASE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return parsed?.result?.data?.data ?? [];
}

function loadCompleted(): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(JSONL_FILE)) return done;
  const content = fs.readFileSync(JSONL_FILE, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj?.key) done.add(obj.key);
    } catch {
      /* skip malformed */
    }
  }
  return done;
}

function appendRecord(record: any): void {
  fs.appendFileSync(JSONL_FILE, JSON.stringify(record) + "\n", "utf8");
}

function assembleAndWrite(totalFetchable: number): number {
  if (!fs.existsSync(JSONL_FILE)) {
    fs.writeFileSync(JSON_FILE, "[]", "utf8");
    return 0;
  }
  const content = fs.readFileSync(JSONL_FILE, "utf8");
  const records: any[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      /* skip malformed */
    }
  }
  records.sort((a, b) => (a.baseIndex ?? 0) - (b.baseIndex ?? 0));
  fs.writeFileSync(JSON_FILE, JSON.stringify(records, null, 2), "utf8");
  const ok = records.filter((r) => !r.failed).length;
  const failed = records.filter((r) => r.failed).length;
  console.log(
    `[done] assembled ${records.length}/${totalFetchable} records into ${JSON_FILE} ` +
      `(${ok} ok, ${failed} failed)`
  );
  return records.length;
}

async function processOne(
  tokenMgr: TokenManager,
  rec: any,
  baseIndex: number
): Promise<any> {
  const idvd = String(rec.IDvictimadirecta);
  const idrep = Number(rec.IDreporte);
  const iddep = Number(rec.iddependenciaorigen);
  const key = recordKey(rec);

  let lastErr: any;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const bearer = await tokenMgr.get();
    try {
      const body = await fetchPdf(bearer, idvd, idrep, iddep);
      const pdfData = flattenPdfData(body);
      return {
        baseIndex,
        key,
        original: rec,
        pdf: body,
        pdfData,
      };
    } catch (e: any) {
      lastErr = e;
      if (e?.status === 401) {
        await tokenMgr.get(true);
        continue;
      }
      const isTransient = !e?.status || e.status >= 500;
      if (!isTransient || attempt === MAX_RETRY - 1) break;
      await sleep(800 * (attempt + 1));
    }
  }
  return {
    baseIndex,
    key,
    original: rec,
    failed: true,
    error: String(lastErr?.message ?? lastErr),
    errorStatus: lastErr?.status ?? null,
  };
}

async function runPool(
  tokenMgr: TokenManager,
  pending: { rec: any; idx: number }[],
  total: number,
  startCount: number
): Promise<void> {
  let cursor = 0;
  let done = startCount;
  let okCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  const worker = async (workerId: number): Promise<void> => {
    while (cursor < pending.length) {
      const { rec, idx } = pending[cursor++];
      done++;
      const label = `${rec.nombre ?? "?"} ${rec.primerapellido ?? ""}`.trim();
      try {
        const result = await processOne(tokenMgr, rec, idx);
        appendRecord(result);
        if (result.failed) {
          failCount++;
          console.log(
            `[${done}/${total}] w${workerId} FAIL baseIndex=${idx} ${label} :: ${result.error}`
          );
        } else {
          okCount++;
          if (okCount % PROGRESS_EVERY === 0 || done === total) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = (okCount / (Number(elapsed) || 1)).toFixed(2);
            console.log(
              `[${done}/${total}] w${workerId} ok ${label} | ` +
                `${okCount} ok, ${failCount} fail | ${rate} rec/s`
            );
          }
        }
      } catch (e: any) {
        failCount++;
        appendRecord({
          baseIndex: idx,
          key: recordKey(rec),
          original: rec,
          failed: true,
          error: `unexpected: ${e?.message ?? e}`,
        });
        console.log(
          `[${done}/${total}] w${workerId} ERROR baseIndex=${idx} ${label} :: ${e?.message ?? e}`
        );
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, (_, i) =>
    worker(i + 1)
  );
  await Promise.all(workers);
  console.log(
    `[pool] finished: ${okCount} ok, ${failCount} failed in ` +
      `${((Date.now() - startTime) / 1000).toFixed(1)}s`
  );
}

function parseLimit(args: Set<string>): number | null {
  for (const a of Array.from(args)) {
    const m = /^--limit=(\d+)$/.exec(a);
    if (m) return Math.max(0, Number(m[1]));
  }
  return null;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const retryFailed = args.has("--retry-failed");
  const assembleOnly = args.has("--assemble");
  const limit = parseLimit(args);

  const base = loadBase();
  const allFetchable = base
    .map((rec, idx) => ({ rec, idx }))
    .filter((x) => isFetchable(x.rec));
  const fetchable =
    limit != null ? allFetchable.slice(0, limit) : allFetchable;

  console.log(
    `[start] base=${base.length} records, fetchable=${fetchable.length}` +
      (limit != null ? ` (limited to first ${limit} most-recent)` : "") +
      `, concurrency=${CONCURRENCY}` +
      (retryFailed ? ", retry-failed mode" : "") +
      (assembleOnly ? ", assemble-only mode" : "")
  );

  if (assembleOnly) {
    assembleAndWrite(fetchable.length);
    return;
  }

  const completed = loadCompleted();
  let pending = fetchable.filter((x) => !completed.has(recordKey(x.rec)));

  if (retryFailed && fs.existsSync(JSONL_FILE)) {
    const content = fs.readFileSync(JSONL_FILE, "utf8");
    const failedKeys = new Set<string>();
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const o = JSON.parse(t);
        if (o?.failed && o?.key) failedKeys.add(o.key);
      } catch {
        /* skip */
      }
    }
    const kept: any[] = [];
    const jsonlLines = content.split("\n").filter((l) => l.trim());
    for (const line of jsonlLines) {
      try {
        const o = JSON.parse(line.trim());
        if (o?.failed && failedKeys.has(o.key)) continue;
        kept.push(line);
      } catch {
        kept.push(line);
      }
    }
    fs.writeFileSync(JSONL_FILE, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
    const redone = fetchable.filter((x) => failedKeys.has(recordKey(x.rec)));
    pending = redone;
    console.log(`[retry-failed] ${failedKeys.size} failed records will be retried`);
  }

  console.log(`[resume] ${completed.size} already done, ${pending.length} pending`);

  if (pending.length === 0) {
    console.log("[resume] nothing pending, assembling final dataset...");
    assembleAndWrite(fetchable.length);
    return;
  }

  const tokenMgr = new TokenManager();
  await runPool(tokenMgr, pending, fetchable.length, completed.size);

  assembleAndWrite(fetchable.length);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
