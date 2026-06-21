/**
 * Hilo — Ficha Extractor (vision)
 * =================================
 * Lee las imágenes descargadas por el scraper y extrae datos estructurados
 * usando un vision model (Gemini, OpenAI GPT-4o, o Anthropic Claude).
 *
 * Output: data/raw/fb_posts/scrape_<timestamp>/extracted.json
 *
 * Configuración:
 *   LLM_API_KEY=<tu key>     (requerido)
 *   LLM_BASE_URL=https://...  (opcional, default según provider)
 *   LLM_MODEL=<modelo>        (opcional, default según provider)
 *
 * Uso:
 *   npx tsx scripts/fb-scraper/extract-fichas.ts <scrape_dir>
 *   npx tsx scripts/fb-scraper/extract-fichas.ts data/raw/fb_posts/scrape_2026-06-21T07-07-21
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";

interface ExtractedFicha {
  schema: "hilo.ficha_extraida.v1";
  tipo: "ficha_busqueda" | "reporte_fosa" | "alerta_amber" | "identidad_sin_nombre" | "otro";
  persona: {
    nombre_completo: string | null;
    alias: string | null;
    edad: number | null;
    sexo: "masculino" | "femenino" | null;
    nacionalidad: string | null;
    fecha_desaparicion: string | null;
    fecha_nacimiento: string | null;
    ubicacion_desaparicion: {
      estado: string | null;
      municipio: string | null;
      localidad: string | null;
    };
  };
  descripcion_fisica: {
    tez: string | null;
    complexion: string | null;
    ojos: string | null;
    cabello: string | null;
    estatura_m: number | null;
    vestimenta: string | null;
  };
  senas_particulares: string[];
  senas_lateralidad: {
    lado: "izquierda" | "derecha" | "ambos" | null;
    descripcion: string;
  }[];
  contacto: {
    telefono: string | null;
    fuente: string | null;
  };
  metadata_extraccion: {
    confianza: number;
    campos_detectados: string[];
    necesita_revision: boolean;
    imagen_origen: string;
    modelo_usado: string;
  };
}

interface VisionResponse {
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const EXTRACTION_PROMPT = `Eres un sistema experto en extracción de datos de fichas de búsqueda de personas desaparecidas en México.

Analiza esta imagen y extrae TODOS los datos estructurados que encuentres. Devuelve SOLO un objeto JSON válido con esta estructura exacta:

{
  "tipo": "ficha_busqueda" | "reporte_fosa" | "alerta_amber" | "identidad_sin_nombre" | "otro",
  "persona": {
    "nombre_completo": string | null,
    "alias": string | null,
    "edad": number | null,
    "sexo": "masculino" | "femenino" | null,
    "nacionalidad": string | null,
    "fecha_desaparicion": "YYYY-MM-DD" | null,
    "fecha_nacimiento": "YYYY-MM-DD" | null,
    "ubicacion_desaparicion": {
      "estado": string | null,
      "municipio": string | null,
      "localidad": string | null
    }
  },
  "descripcion_fisica": {
    "tez": string | null,
    "complexion": string | null,
    "ojos": string | null,
    "cabello": string | null,
    "estatura_m": number | null,
    "vestimenta": string | null
  },
  "senas_particulares": string[],
  "senas_lateralidad": [
    { "lado": "izquierda" | "derecha" | "ambos", "descripcion": string }
  ],
  "contacto": {
    "telefono": string | null,
    "fuente": string | null
  }
}

Reglas importantes:
- "tipo" = "identidad_sin_nombre" si la imagen muestra una persona con foto grande pero sin nombre visible (caso "identidades olvidadas")
- "tipo" = "ficha_busqueda" si tiene todos los datos estructurados (nombre, edad, descripción)
- "tipo" = "reporte_fosa" si habla de restos/huesos/fosa/clandestino
- "tipo" = "alerta_amber" si dice "alerta amber"
- Para fechas, usa formato YYYY-MM-DD. Si no hay año claro, usa solo lo que sepas
- Para estado/municipio, normaliza: "Jalisco", "Zapotlán el Grande", etc.
- En "senas_particulares" pon TODAS las marcas, tatuajes, cicatrices, lunares mencionados
- En "senas_lateralidad" extrae CADA seña con su lado (izq/der/ambos) — es crítico para evitar matches incorrectos
- Si algo no está visible o no se puede leer, devuelve null
- Si no es una ficha de búsqueda (es un meme, foto random, etc.), pon tipo="otro" y todo null
- Devuelve SOLO el JSON, sin texto adicional`;

// ═══════════════════════════════════════════════════════════
//  LLM CLIENTS (vision-capable)
// ═══════════════════════════════════════════════════════════

type Provider = "gemini" | "anthropic" | "openai";

function getConfig() {
  const llmApiKey = process.env.LLM_API_KEY;
  const llmBaseUrl = process.env.LLM_BASE_URL;
  const llmModel = process.env.LLM_MODEL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let provider: Provider = "openai";
  let apiKey: string | undefined;
  let baseUrl = llmBaseUrl;

  if (llmBaseUrl && /googleapis\.com/i.test(llmBaseUrl)) {
    provider = "gemini";
    apiKey = llmApiKey;
  } else if (llmBaseUrl && /anthropic/i.test(llmBaseUrl)) {
    provider = "anthropic";
    apiKey = llmApiKey;
  } else if (llmBaseUrl) {
    provider = "openai";
    apiKey = llmApiKey || openaiKey;
  } else if (anthropicKey) {
    provider = "anthropic";
    apiKey = anthropicKey;
  } else if (openaiKey) {
    provider = "openai";
    apiKey = openaiKey;
  } else if (llmApiKey) {
    provider = "openai";
    apiKey = llmApiKey;
    if (llmApiKey.startsWith("sk-or-")) baseUrl = baseUrl || "https://openrouter.ai/api/v1";
  }

  return { apiKey, baseUrl, model: llmModel, provider, available: !!apiKey };
}

async function extractWithGemini(imageBase64: string, mimeType: string): Promise<VisionResponse> {
  const cfg = getConfig();
  const model = cfg.model || "gemini-2.0-flash";
  const base = cfg.baseUrl!.replace(/\/$/, "").replace(/\/openai\/?$/i, "");
  const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey!)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: EXTRACTION_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ?? "";
  return { text };
}

async function extractWithOpenAIVision(imageBase64: string, mimeType: string, model: string): Promise<VisionResponse> {
  const cfg = getConfig();
  let OpenAI: any;
  try { ({ default: OpenAI } = await import("openai")); }
  catch { throw new Error("openai package not available"); }

  const client = new OpenAI({ apiKey: cfg.apiKey!, baseURL: cfg.baseUrl });
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const resp = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const text = resp.choices?.[0]?.message?.content ?? "";
  return { text };
}

async function extractWithAnthropic(imageBase64: string, mimeType: string, model: string): Promise<VisionResponse> {
  const cfg = getConfig();
  const base = (cfg.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");

  const resp = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: "Extrae los datos de esta ficha." },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as any;
  const text = data?.content?.[0]?.text ?? "";
  return { text };
}

async function extractFicha(imagePath: string): Promise<ExtractedFicha> {
  const buffer = readFileSync(imagePath);
  const base64 = buffer.toString("base64");
  const ext = imagePath.toLowerCase().split(".").pop() || "jpg";
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const cfg = getConfig();
  let text: string;
  let modelUsed: string;

  if (cfg.provider === "gemini") {
    const r = await extractWithGemini(base64, mimeType);
    text = r.text;
    modelUsed = cfg.model || "gemini-2.0-flash";
  } else if (cfg.provider === "anthropic") {
    const r = await extractWithAnthropic(base64, mimeType, cfg.model || "claude-haiku-4-5");
    text = r.text;
    modelUsed = cfg.model || "claude-haiku-4-5";
  } else {
    const r = await extractWithOpenAIVision(base64, mimeType, cfg.model || "gpt-4o-mini");
    text = r.text;
    modelUsed = cfg.model || "gpt-4o-mini";
  }

  // Parse JSON
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]);

  // Determine which fields were detected
  const detected: string[] = [];
  if (parsed.persona?.nombre_completo) detected.push("nombre");
  if (parsed.persona?.edad) detected.push("edad");
  if (parsed.persona?.fecha_desaparicion) detected.push("fecha_desaparicion");
  if (parsed.persona?.ubicacion_desaparicion?.estado) detected.push("estado");
  if (parsed.persona?.ubicacion_desaparicion?.municipio) detected.push("municipio");
  if (parsed.senas_particulares?.length > 0) detected.push("senas");
  if (parsed.contacto?.telefono) detected.push("contacto");
  if (parsed.descripcion_fisica?.tez) detected.push("descripcion_fisica");

  // Confidence based on fields detected
  const totalFields = 7;
  const confidence = Math.min(1, detected.length / totalFields);

  return {
    schema: "hilo.ficha_extraida.v1",
    ...parsed,
    metadata_extraccion: {
      confianza: parseFloat(confidence.toFixed(2)),
      campos_detectados: detected,
      necesita_revision: confidence < 0.4 || parsed.tipo === "otro",
      imagen_origen: imagePath,
      modelo_usado: modelUsed,
    },
  };
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const cfg = getConfig();
  if (!cfg.available) {
    console.error("Error: LLM_API_KEY (o ANTHROPIC_API_KEY/OPENAI_API_KEY) requerida en .env");
    process.exit(1);
  }

  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error("Uso: npx tsx scripts/fb-scraper/extract-fichas.ts <scrape_dir>");
    process.exit(1);
  }

  const postsJsonPath = join(targetDir, "posts.json");
  if (!existsSync(postsJsonPath)) {
    console.error(`No se encontró ${postsJsonPath}`);
    process.exit(1);
  }

  const postsMeta = JSON.parse(readFileSync(postsJsonPath, "utf-8"));
  const posts: any[] = postsMeta.posts || [];

  console.log(`\n━━━ Hilo Ficha Extractor ━━━`);
  console.log(`Scraped dir: ${targetDir}`);
  console.log(`Posts a procesar: ${posts.length}`);
  console.log(`Modelo: ${cfg.model || (cfg.provider === "gemini" ? "gemini-2.0-flash" : "default")}`);

  const extracted: ExtractedFicha[] = [];
  let errors = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (!post.image_local_path || !existsSync(post.image_local_path)) {
      console.log(`  [${i + 1}/${posts.length}] ${post.post_id}: ⚠ no image, saltando`);
      continue;
    }

    process.stdout.write(`  [${i + 1}/${posts.length}] ${basename(post.image_local_path)}... `);
    try {
      const ficha = await extractFicha(post.image_local_path);
      extracted.push(ficha);

      // Display summary
      const p = ficha.persona;
      const summary = p.nombre_completo
        ? `${p.nombre_completo}${p.edad ? ` (${p.edad} años)` : ""}`
        : `(${ficha.tipo})`;
      const loc = p.ubicacion_desaparicion?.municipio
        ? ` — ${p.ubicacion_desaparicion.municipio}, ${p.ubicacion_desaparicion.estado || "?"}`
        : "";
      console.log(`✓ ${summary}${loc} [conf: ${ficha.metadata_extraccion.confianza}]`);
    } catch (err) {
      errors++;
      console.log(`✗ ${err instanceof Error ? err.message.slice(0, 80) : err}`);
    }

    // Small delay to not hammer the API
    await new Promise(r => setTimeout(r, 500));
  }

  // Save extracted data
  const outPath = join(targetDir, "extracted.json");
  const output = {
    schema: "hilo.fb_extraction.v1",
    extracted_at: new Date().toISOString(),
    model: cfg.model || (cfg.provider === "gemini" ? "gemini-2.0-flash" : "default"),
    total_extracted: extracted.length,
    errors,
    stats: {
      fichas_con_nombre: extracted.filter(f => f.persona.nombre_completo).length,
      fichas_con_ubicacion: extracted.filter(f => f.persona.ubicacion_desaparicion.estado).length,
      fichas_con_señas: extracted.filter(f => f.senas_particulares.length > 0).length,
      por_tipo: extracted.reduce((acc, f) => {
        acc[f.tipo] = (acc[f.tipo] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    fichas: extracted,
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n━━━ Resumen ━━━`);
  console.log(`Extraídas: ${extracted.length}/${posts.length} (${errors} errores)`);
  console.log(`Con nombre: ${output.stats.fichas_con_nombre}`);
  console.log(`Con ubicación: ${output.stats.fichas_con_ubicacion}`);
  console.log(`Con señas: ${output.stats.fichas_con_señas}`);
  console.log(`Por tipo: ${JSON.stringify(output.stats.por_tipo)}`);
  console.log(`Output: ${outPath}`);
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
