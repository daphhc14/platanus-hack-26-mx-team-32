// lib/types.ts — Canonical types mirroring schema-bndf.md
// Unifies two record types (missing ficha + unidentified body) into one Record.

export type TrustTier = "oficial" | "colectivo_verificado" | "redes_anonimo";
export type RecordType = "missing" | "unidentified";
export type FeatureType =
  | "tatuaje" | "cicatriz" | "lunar" | "marca_nacimiento" | "amputacion"
  | "dental" | "piercing" | "protesis" | "vestimenta" | "otra_sena";
export type BodyRegion =
  | "cabeza" | "cara" | "cuello" | "hombro" | "brazo" | "antebrazo" | "mano" | "dedo"
  | "pecho" | "espalda" | "abdomen" | "cadera" | "muslo" | "pierna" | "rodilla" | "tobillo" | "pie" | "gluteo" | "generico";
export type Laterality = "izquierda" | "derecha" | "central" | "bilateral" | "na";
export type MotifCategory =
  | "nombre_texto" | "fecha_numero" | "religioso" | "nautico" | "animal" | "floral"
  | "simbolo" | "retrato" | "tribal" | "militar" | "deportivo" | "otro";
export type MatchStatus = "proposed" | "in_review" | "confirmed" | "rejected" | "archived";
export type UserRole = "reviewer" | "liaison" | "admin" | "readonly";
export type TipStatus = "nuevo" | "en_triage" | "accionable" | "descartado";

export interface Source {
  id: string;
  name: string;
  kind: string; // registro_oficial | fiscalia | semefo | red_social | tip
  trust_tier: TrustTier;
  notes?: string;
  created_at: string;
}

export interface HiloRecord {
  id: string;
  source_id: string;
  record_type: RecordType;
  external_ref?: string;
  sex?: "M" | "F" | "X";
  age_min?: number;
  age_max?: number;
  height_cm?: number;
  build?: string;
  skin_tone?: string;
  estado?: string;
  municipio?: string;
  event_date?: string; // ISO date
  raw_description?: string;
  photo_url?: string;
  canonical_entity_id?: string;
  pii_minimized: boolean;
  synthetic: boolean; // demo flag
  created_at: string;
}

export interface Feature {
  id: string;
  record_id: string;
  feature_type: FeatureType;
  body_region?: BodyRegion;
  laterality: Laterality;
  motif_category?: MotifCategory;
  description_raw: string;
  tokens?: string[]; // lexical fallback (replaces embedding)
  created_at: string;
}

export interface CandidateMatch {
  id: string;
  missing_record_id: string;
  unidentified_record_id: string;
  overall_score: number; // 0..1
  field_scores: Record<string, number>;
  verifier_evidence?: string;
  verifier_contradictions?: string;
  verifier_tier?: "alta" | "media" | "baja";
  status: MatchStatus;
  created_at: string;
}

export interface AppUser {
  id: string;
  pseudonym: string;
  role: UserRole;
  created_at: string;
}

export interface Review {
  id: string;
  match_id: string;
  reviewer_id: string;
  decision: MatchStatus;
  notes?: string;
  created_at: string;
}

export interface Tip {
  id: string;
  content: string;
  extracted?: any;
  trust_tier: TrustTier;
  sender_metadata_stripped: boolean;
  status: TipStatus;
  created_at: string;
}

export interface SecureLocation {
  id: string;
  kind: string; // punto_busqueda | reporte_fosa | posicion_buscadora
  estado?: string;
  municipio?: string;
  lat: number;
  lng: number;
  fosas?: number;
  cuerpos?: number;
  related_tip_id?: string;
  created_at: string;
}

export interface ContextStats {
  // real aggregate data shown in UI as reality anchor
  total_desaparecidos_no_loc: number;
  total_registros: number;
  peak_year: number | null;
  by_sex: Record<string, number>;
  top_states: { entidad: string; total: number; tasa_por_100k: number | null }[];
  fosas_total_sitios: number;
  fosas_total: number;
  cuerpos_osamentas: number;
}
