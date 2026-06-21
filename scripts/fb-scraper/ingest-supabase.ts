/**
 * Hilo — Ingester: extracted.json → Supabase
 * ============================================
 * Lee el output del vision extractor y lo inserta en Supabase.
 * Dedupe automático via unique index (permalink o nombre+fecha+estado).
 *
 * Uso:
 *   npx tsx scripts/fb-scraper/ingest-supabase.ts <scrape_dir>
 *   npx tsx scripts/fb-scraper/ingest-supabase.ts data/raw/fb_posts/scrape_2026-06-21T07-07-21
 *
 * Requiere .env con:
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_KEY=eyJxxx...   (service_role key para escribir)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

interface ExtractedFile {
  schema: string;
  extracted_at: string;
  model: string;
  total_extracted: number;
  errors: number;
  stats: Record<string, unknown>;
  fichas: Ficha[];
}

interface Ficha {
  schema: string;
  tipo: string;
  persona: {
    nombre_completo: string | null;
    alias: string | null;
    edad: number | null;
    sexo: string | null;
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
  senas_lateralidad: { lado: string; descripcion: string }[];
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

// ═══════════════════════════════════════════════════════════
//  SUPABASE CLIENT (raw REST, sin dependencias extra)
// ═══════════════════════════════════════════════════════════

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL y SUPABASE_KEY requeridos en .env");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseInsert(table: string, rows: Record<string, unknown>[]): Promise<{ inserted: number; errors: number; duplicates: number }> {
  const { url, key } = getSupabaseConfig();

  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": key,
      "authorization": `Bearer ${key}`,
      "content-type": "application/json",
      "prefer": "return=representation,resolution=ignore-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    inserted: Array.isArray(data) ? data.length : 0,
    errors: 0,
    duplicates: 0,
  };
}

// ═══════════════════════════════════════════════════════════
//  MAPPING: ficha → row de Supabase
// ═══════════════════════════════════════════════════════════

function fichaToRow(ficha: Ficha, postsMeta: Record<string, unknown>[]): Record<string, unknown> {
  const p = ficha.persona;
  const df = ficha.descripcion_fisica;
  const u = p.ubicacion_desaparicion;
  const c = ficha.contacto;
  const m = ficha.metadata_extraccion;

  // Buscar metadata del post original (permalink, group_id, image_url)
  const postMatch = postsMeta.find(
    (post: any) => post.image_local_path === m.imagen_origen
  );

  return {
    tipo: ficha.tipo,
    nombre_completo: p.nombre_completo,
    alias: p.alias,
    edad: p.edad,
    sexo: p.sexo,
    nacionalidad: p.nacionalidad || "mexicana",
    fecha_desaparicion: p.fecha_desaparicion,
    fecha_nacimiento: p.fecha_nacimiento,
    estado: u?.estado,
    municipio: u?.municipio,
    localidad: u?.localidad,
    tez: df?.tez,
    complexion: df?.complexion,
    ojos: df?.ojos,
    cabello: df?.cabello,
    estatura_m: df?.estatura_m,
    vestimenta: df?.vestimenta,
    senas_particulares: JSON.stringify(ficha.senas_particulares || []),
    senas_lateralidad: JSON.stringify(ficha.senas_lateralidad || []),
    telefono_contacto: c?.telefono,
    fuente: c?.fuente,
    fb_group_id: (postMatch as any)?.group_id || null,
    fb_group_name: (postMatch as any)?.group_name || null,
    fb_permalink: (postMatch as any)?.permalink || null,
    fb_image_url: (postMatch as any)?.image_url || null,
    fb_captured_at: (postMatch as any)?.captured_at || null,
    confianza_extraccion: m?.confianza || 0,
    modelo_extraccion: m?.modelo_usado,
    necesita_revision: m?.necesita_revision ?? true,
    campos_detectados: JSON.stringify(m?.campos_detectados || []),
    status: "pendiente",
  };
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error("Uso: npx tsx scripts/fb-scraper/ingest-supabase.ts <scrape_dir>");
    process.exit(1);
  }

  const extractedPath = join(targetDir, "extracted.json");
  const postsPath = join(targetDir, "posts.json");

  if (!existsSync(extractedPath)) {
    console.error(`No se encontró ${extractedPath}`);
    console.error("¿Corriste extract-fichas.ts primero?");
    process.exit(1);
  }

  const extracted: ExtractedFile = JSON.parse(readFileSync(extractedPath, "utf-8"));
  const postsMeta: Record<string, unknown>[] = existsSync(postsPath)
    ? (JSON.parse(readFileSync(postsPath, "utf-8")).posts || [])
    : [];

  console.log(`\n━━━ Hilo Supabase Ingester ━━━`);
  console.log(`Scrape dir: ${targetDir}`);
  console.log(`Fichas a insertar: ${extracted.fichas.length}`);
  console.log(`Modelo: ${extracted.model}`);

  // Mapear fichas → rows
  const rows = extracted.fichas.map(f => fichaToRow(f, postsMeta));

  // Filtrar filas vacías (tipo "otro" sin datos)
  const validRows = rows.filter(r => r.tipo !== "otro" || r.nombre_completo);
  const skipped = rows.length - validRows.length;

  console.log(`Válidas: ${validRows.length} (${skipped} descartadas por ser vacías/otro)`);
  console.log(`Con nombre: ${validRows.filter(r => r.nombre_completo).length}`);
  console.log(`Con ubicación: ${validRows.filter(r => r.estado).length}`);

  // Insertar en Supabase
  console.log(`\nInsertando en Supabase...`);
  try {
    const result = await supabaseInsert("fichas", validRows);
    console.log(`\n✓ ${result.inserted} fichas insertadas`);
  } catch (err) {
    console.error(`\n✗ Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`\n━━━ Resumen ━━━`);
  console.log(`Insertadas: ${validRows.length}`);
  console.log(`Descartadas: ${skipped}`);
  console.log(`\nLangGraph puede ahora query:`);
  console.log(`  select * from fichas where estado = 'Baja California';`);
  console.log(`  select * from fichas_safe where necesita_revision = false;`);
  console.log(`  select * from fichas where senas_particulares @> '["tatuaje"]';`);
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
