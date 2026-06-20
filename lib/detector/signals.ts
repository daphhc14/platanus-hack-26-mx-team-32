// lib/detector/signals.ts — Catálogo de señales de oferta laboral falsa / reclutamiento forzado.
// FUENTE: CRUCE/Iteso + Comisión de Búsqueda Jalisco + Dirección de Juventudes Jalisco
// ("Cómo identificar Reclutamiento Forzado por Ofertas Laborales Falsas", Informe
//  Vicefiscalía de Personas Desaparecidas Jalisco 2017-2025). Randstad (6 indicadores).
// Estas son heurísticas CITABLES, no invenciones.

export type Severity = "info" | "medium" | "high" | "critical";

export interface SignalHit {
  id: string;
  label: string;
  severity: Severity;
  evidence: string;          // what matched
  rationale: string;         // why it matters + source
  category: "texto" | "estructura" | "contexto" | "visual";
}

export interface SignalDef {
  id: string;
  label: string;
  category: SignalHit["category"];
  severity: Severity;
  rationale: string;
  /** returns matched evidence string, or null if not triggered */
  match: (text: string, meta: PostingMeta) => string | null;
}

export interface PostingMeta {
  // optional structured context the detector uses when available
  offerState?: string;        // state where the job is supposedly located
  contactAreaCode?: string;   // phone area code in the ad
  interviewLocation?: string; // stated interview site
  hasImage?: boolean;
}

// --- helpers ---
const has = (text: string, patterns: RegExp[]): string | null => {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
};

export const SIGNALS: SignalDef[] = [
  {
    id: "no_experiencia",
    label: "No solicita experiencia previa",
    category: "texto", severity: "medium",
    rationale: "CRUCE/Jalisco: las ofertas falsas suelen prometer empleo sin experiencia. Combinado con otras señales eleva el riesgo.",
    match: (t) => has(t, [/sin\s+experiencia/i, /no\s+(se\s+)?requiere\s+experiencia/i, /cero\s+experiencia/i, /no\s+experiencia/i, /principiantes\s+bienvenidos/i]),
  },
  {
    id: "contratacion_inmediata",
    label: "Contratación inmediata / urgente",
    category: "texto", severity: "high",
    rationale: "CRUCE: 'contratación inmediata' es una característica frecuente de ofertas falsas (enganche rápido, sin proceso real).",
    match: (t) => has(t, [/contrataci[oó]n\s+inmediata/i, /inmediato/i, /urgente/i, /same\s+day/i, /inicio\s+hoy/i, /ya\s+mismo/i]),
  },
  {
    id: "salario_inusual",
    label: "Salario inusualmente alto o vago",
    category: "texto", severity: "medium",
    rationale: "CRUCE: no solo sueldos altos son alerta; también salarios bajos/vagos lo son. Sueldo muy alto sin requisitos = enganche.",
    match: (t) => {
      const m = t.match(/(\$|mxn|pesos)?\s*(\d[\d.,]*)\s*(mil)?\s*(semanal|quincenal|mensual|al mes|por semana)?/i);
      if (!m) return null;
      const num = parseFloat((m[2] || "").replace(/[,.]/g, "")) * (m[3] ? 1000 : 1);
      // crude: > 25,000 "semanal" or > 60,000 "mensual" phrased as a lure, or vague "gana lo que quieras"
      if (/gana\s+(lo\s+que|cuanto|lo q)/i.test(t)) return "gana lo que quieras (vago)";
      if (/semanal/i.test(t) && num >= 15000) return `${m[0]} (semanal muy alto)`;
      if (num >= 60000) return `${m[0]} (inusual)`;
      return null;
    },
  },
  {
    id: "prestaciones_excesivas",
    label: "Lista excesiva de prestaciones",
    category: "texto", severity: "info",
    rationale: "CRUCE: 'promesas de múltiples prestaciones' como gancho.",
    match: (t) => {
      const kw = /(prestaciones|seguro social|infonavit|vales|aguinaldo|utilidades|bonos|vacaciones)/gi;
      const hits = (t.match(kw) || []).length;
      return hits >= 4 ? `${hits} prestaciones listadas` : null;
    },
  },
  {
    id: "contacto_otra_ciudad",
    label: "Contacto de otra ciudad / código de área distinto",
    category: "contexto", severity: "high",
    rationale: "CRUCE: 'números de contacto de otras ciudades' es señal de riesgo. (Requiere meta.contactAreaCode vs offerState.)",
    match: (_t, meta) => {
      if (!meta.contactAreaCode || !meta.offerState) return null;
      // crude area-code → state check is out of scope; flag if area code mismatch marker provided
      return meta.contactAreaCode !== meta.offerState ? `contacto ${meta.contactAreaCode} vs oferta ${meta.offerState}` : null;
    },
  },
  {
    id: "errores_ortograficos",
    label: "Errores ortográficos en texto atractivo",
    category: "texto", severity: "info",
    rationale: "CRUCE: 'lenguaje atractivo, pero con errores ortográficos'.",
    match: (t) => {
      // crude: common misspellings / lack of accents on formal words in a 'professional' offer
      const common = [/q\s+haya/i, /\bx\b\s+q/i, /empleo\s+garantisado/i, /sireria/i, /nesesita/i, /aventa/i, /aseptamos/i];
      return has(t, common);
    },
  },
  {
    id: "pide_dinero_documentos",
    label: "Pide dinero o documentos personales antes de contratar",
    category: "texto", severity: "critical",
    rationale: "CRUCE: 'nunca entregues dinero ni documentos personales (INE, RFC, comprobantes) antes de confirmar'.",
    match: (t) => has(t, [/paga\s+(cuota|dep[oó]sito|fianza|cooperaci[oó]n)/i, /dep[oó]sito\s+(de\s+)?garant[ií]a/i, /env[ií]a\s+(tu\s+)?ine/i, /manda\s+(tu\s+)?ine/i, /requerimos\s+(tu\s+)?rfc/i, /cuota\s+de\s+inscripci[oó]n/i]),
  },
  {
    id: "ubicacion_sospechosa",
    label: "Entrevista en central de autobuses, hotel o vivienda",
    category: "contexto", severity: "high",
    rationale: "CRUCE: puntos críticos — Central Nueva/Vieja Guadalajara, terminales, hoteles Riu/Aranzazú, viviendas. Evita entrevistas ahí.",
    match: (t, meta) => {
      const loc = meta.interviewLocation ? meta.interviewLocation + " " + t : t;
      return has(loc, [/central\s+(nueva|vieja|de\s+autobuses|camionera)/i, /terminal\s+(de\s+)?(autobuses|camionera)/i, /hotel\s+(riu|aranzaz[uú])/i, /\bcasa\s+particular\b/i, /domicilio\s+particular/i, /central\s+de\s+(gdl|guadalajara)/i]);
    },
  },
  {
    id: "transporte_entrevista",
    label: "Ofrece Uber/Didi para acudir a la entrevista",
    category: "texto", severity: "high",
    rationale: "CRUCE: 'desconfía si te ofrecen transporte mediante plataformas como Uber o Didi para acudir a la entrevista'.",
    match: (t) => has(t, [/te\s+mandamos\s+(un\s+)?uber/i, /te\s+pagamos\s+(el|un)\s+(uber|didi|taxi)/i, /enviamos\s+(uber|didi)/i, /te\s+reservamos\s+(el|un)\s+(uber|didi)/i]),
  },
  {
    id: "agencia_modelaje",
    label: "Agencia de modelaje/fotografía (reclutamiento de mujeres jóvenes)",
    category: "texto", severity: "high",
    rationale: "CRUCE: 'agencias de modelaje y fotografía son medio frecuente para reclutar mujeres jóvenes'.",
    match: (t) => has(t, [/agencia\s+de\s+modelaje/i, /modelos?\s+(femeninas?|buscamos)/i, /sesi[oó]n\s+(de\s+)?fotos?\s+paga/i, /casting\s+(de\s+)?modelos/i]),
  },
  {
    id: "codigos_visuales_crimen",
    label: "Códigos visuales del crimen organizado",
    category: "visual", severity: "high",
    rationale: "CRUCE/Comisión de Búsqueda: códigos que normalizan la violencia — ninja (sicariato), gallo (CJNG), pizza (Chapiza), trébol (marihuana), ojo turco (la maña), casco militar (armas), búho (halconeo).",
    match: (t) => has(t, [/\bninja\b/i, /\bgallo\b/i, /\bpizza\b/i, /tr[eé]bol/i, /ojo\s+turco/i, /ogro\s+japon[eé]s/i, /casco\s+militar/i, /\bb[uú]ho\b/i]),
  },
  {
    id: "perfiles_lure",
    label: "Perfil típico de enganche (call center / guardia / almacenista)",
    category: "texto", severity: "info",
    rationale: "CRUCE: trabajos usados como gancho — call center, asesor ventas, almacenista, restaurantes, guardias seguridad, limpieza, auxiliar general. No son ilegales por sí mismos; peso depende de señales acompañantes.",
    match: (t) => has(t, [/call\s*center/i, /asesor\s+(de\s+)?ventas/i, /almacenista/i, /guardia\s+(de\s+)?seguridad/i, /personal\s+de\s+limpieza/i, /auxiliar\s+general/i]),
  },
  {
    id: "perfiles_tecnicos_crimen",
    label: "Perfil técnico demandado por crimen organizado",
    category: "texto", severity: "medium",
    rationale: "CRUCE: el crimen busca perfiles técnicos — químicos, plomeros, electricistas, médicos/enfermería, ingenieros telecomunicaciones.",
    match: (t) => has(t, [/qu[ií]mico/i, /\bplomer/i, /electricista/i, /(m[eé]dico|enfermer[oa]|enfermer[ií]a)/i, /ingenier[oi]a\s+(en\s+)?telecomunicaciones/i, /instalador\s+de\s+(antenas|radios)/i]),
  },
  {
    id: "diseno_generico",
    label: "Diseño genérico / logo de marca reconocida (requiere imagen)",
    category: "visual", severity: "info",
    rationale: "CRUCE: 'diseños genéricos y plantillas repetitivas' y 'uso de logotipos de marcas reconocidas sin autorización'. (No evaluable en texto — marca para revisión con imagen.)",
    match: () => null, // image-only; surfaced when hasImage
  },
];

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 8, medium: 18, high: 32, critical: 45,
};
