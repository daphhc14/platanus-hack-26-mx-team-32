/**
 * Hilo — Detector de señales para fosas, desapariciones y ubicación.
 * Calibrado para el contexto mexicano de personas desaparecidas.
 *
 * Exportado como global `HiloDetector` para uso en content.js y popup.js.
 */
(function (global) {
  "use strict";

  // ═══════════════════════════════════════════════════════════
  //  KEYWORDS — FOSAS / RESTOS
  // ═══════════════════════════════════════════════════════════
  const FOSAS_PATTERNS = [
    // Sustantivos directos
    { id: "fosa", pattern: /\b(fosa|fosas)\b/i, weight: 3 },
    { id: "fosa_clandestina", pattern: /fosa\s+(clandestin|com[uú]n|narco)/i, weight: 5 },
    { id: "narcofosa", pattern: /narco\s*fosa/i, weight: 5 },
    { id: "huesos", pattern: /\b(hueso|huesos|restos?\s+[oó]seos?|osamenta|osamentas)\b/i, weight: 4 },
    { id: "cadaver", pattern: /\b(cad[eá]ver|cad[eá]veres|cuerpo\s+muerto|cuerpos?\s+muertos?|restos?\s+mortales?)\b/i, weight: 4 },
    { id: "entierro", pattern: /\b(enterr[oa]d[oa]s?|entierro|enterramientos?|sepulturas?|inhumaci[oó]n)\b/i, weight: 3 },
    { id: "clandestino", pattern: /\bclandestin[oa]s?\b/i, weight: 2 },
    { id: "hallazgo_restos", pattern: /(hallaron|encontraron|localizaron|aparecieron)\s+(?:unos?\s+)?(?:restos?|huesos?|cuerpos?|cad[eá]veres|osamentas?)/i, weight: 5 },
    { id: "fosa_comun", pattern: /fosa\s+com[uú]n/i, weight: 4 },
    { id: "pozo", pattern: /\bpozo\b.*\b(cuerpos?|restos?|huesos?)\b/i, weight: 4 },
  ];

  // ═══════════════════════════════════════════════════════════
  //  KEYWORDS — DESAPARICIÓN
  // ═══════════════════════════════════════════════════════════
  const DESAPARICION_PATTERNS = [
    { id: "desaparecido", pattern: /\bdesaparecid[oa]s?\b/i, weight: 3 },
    { id: "extraviado", pattern: /\bextraviad[oa]s?\b/i, weight: 3 },
    { id: "ausente", pattern: /\bausentes?\b/i, weight: 2 },
    { id: "no_localizado", pattern: /\bno\s+localizad[oa]s?\b/i, weight: 3 },
    { id: "levanton", pattern: /\blevant[oó]n|levantad[oa]s?\b/i, weight: 4 },
    { id: "privado_libertad", pattern: /privad[oa]s?\s+de\s+(la\s+)?libertad/i, weight: 4 },
    { id: "alerta_amber", pattern: /alerta\s+amber/i, weight: 4 },
    { id: "alerta_plata", pattern: /alerta\s+de\s+plata|alerta\s+plata/i, weight: 4 },
    { id: "desconoce_paradero", pattern: /se\s+desconoce\s+(su\s+)?paradero/i, weight: 4 },
    { id: "ultima_vez_visto", pattern: /(u[uú]ltim[ao]\s+(vez|lugar|hora)|vista?\s+por\s+[uú]ltim[ao]|fue\s+vist[oa]\s+por\s+[uú]ltim[ao])/i, weight: 4 },
    { id: "se_lo_llevaron", pattern: /se\s+lo\s+llevaron|se\s+la\s+llevaron|se\s+los\s+llevaron/i, weight: 4 },
    { id: "ayuda_familia", pattern: /(ayuda|ayuden|ay[uú]dame|por\s+favor\s+ayuden|compartan|difundan)\b/i, weight: 1 },
    { id: "datos_persona", pattern: /(?:tiene|tiene|de|aprox\.?\s*)(\d+)\s+años?/i, weight: 1 },
  ];

  // ═══════════════════════════════════════════════════════════
  //  ESTADOS DE MÉXICO (32) — para geolocalización
  // ═══════════════════════════════════════════════════════════
  const ESTADOS_MEXICO = [
    "Aguascalientes", "Baja California", "Baja California Sur",
    "Campeche", "Chiapas", "Chihuahua", "CDMX", "Ciudad de M[eé]xico", "Coahuila",
    "Colima", "Durango", "Estado de M[eé]xico", "Edomex", "Guanajuato",
    "Guerrero", "Hidalgo", "Jalisco", "Michoac[aá]n", "Morelos", "Nayarit",
    "Nuevo Le[oó]n", "Oaxaca", "Puebla", "Quer[eé]taro", "Quintana Roo",
    "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas",
    "Tlaxcala", "Veracruz", "Yucat[aá]n", "Zacatecas",
  ];

  // Abreviaciones comunes en redes sociales
  const ESTADOS_ABBR = {
    "BC": "Baja California", "BCS": "Baja California Sur",
    "CDMX": "Ciudad de México", "Edomex": "Estado de México",
    "NL": "Nuevo León", "QRO": "Querétaro", "SLP": "San Luis Potosí",
    "QR": "Quintana Roo", "MTY": "Nuevo León", "GDL": "Jalisco",
  };

  // ═══════════════════════════════════════════════════════════
  //  KEYWORDS — UBICACIÓN / GEOGRAFÍA
  // ═══════════════════════════════════════════════════════════
  const UBICACION_PATTERNS = [
    { id: "municipio", pattern: /\b(municipio|municipios|alcald[ií]a|demarcaci[oó]n)\b/i },
    { id: "colonia", pattern: /\b(colonia|col\.?|fraccionamiento|fracc\.?|unidad\s+habitacional)\b/i },
    { id: "carretera", pattern: /\b(carretera|carretera\s+nacional|autopista|libramiento)\b/i },
    { id: "km", pattern: /\bkm\.?\s*\d+/i },
    { id: "calle", pattern: /\b(calle|c\.\s|avenida|av\.?|boulevard|blvd\.?|privada|callej[oó]n)\b/i },
    { id: "poblado", pattern: /\b(poblado|pueblo|comunidad|localidad|ejido|rancho|paraje|predio|rancher[ií]a)\b/i },
    { id: "zona", pattern: /\b(zona|regi[oó]n|sector|cuadrante|periferico|anillo)\b/i },
    { id: "coordenadas", pattern: /\b(-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+)\b/ },
    { id: "central_camiones", pattern: /\b(central\s+de\s+(autobuses|camiones)|terminal\s+(de\s+)?autobuses)\b/i },
    { id: "google_maps", pattern: /(maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl)/i },
  ];

  // ═══════════════════════════════════════════════════════════
  //  PII REDACTION
  // ═══════════════════════════════════════════════════════════

  function redactPii(text) {
    let redacted = text;
    const redactions = [];

    // Teléfonos (MX): 10 dígitos, o con separadores
    const phoneRegex = /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/g;
    redacted = redacted.replace(phoneRegex, (m) => {
      redactions.push({ type: "phone", original_length: m.length });
      return "[TELÉFONO]";
    });

    // Emails
    const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    redacted = redacted.replace(emailRegex, (m) => {
      redactions.push({ type: "email", original_length: m.length });
      return "[EMAIL]";
    });

    // URLs de WhatsApp / wa.me
    const waRegex = /(https?:\/\/)?(wa\.me\/|api\.whatsapp\.com\/)[^\s]+/gi;
    redacted = redacted.replace(waRegex, "[WHATSAPP]");

    // URLs de perfiles de Facebook
    const fbProfileRegex = /https?:\/\/(?:www\.)?facebook\.com\/(?:profile\.php\?id=\d+|[a-zA-Z0-9.]{5,}(?:\/posts\/|\/photos\/))/gi;
    redacted = redacted.replace(fbProfileRegex, (m) => {
      redactions.push({ type: "fb_profile_url" });
      return "[PERFIL-FB]";
    });

    // Coordenadas GPS exactas (mantener municipio/estado pero no GPS puntual)
    // Solo si parece coordenada exacta (no mencion de municipio)
    // Lo dejamos porque para fosas es útil

    return { text: redacted, redactions };
  }

  // ═══════════════════════════════════════════════════════════
  //  GEO EXTRACTION — detectar estado y municipio
  // ═══════════════════════════════════════════════════════════

  function extractGeo(text) {
    const result = { estado: null, municipio: null, locality_approx: null };

    // Buscar estados por nombre completo
    for (const estado of ESTADOS_MEXICO) {
      const regex = new RegExp(`\\b${estado}\\b`, "i");
      if (regex.test(text)) {
        result.estado = normalizeEstado(estado);
        break;
      }
    }

    // Buscar abreviaciones si no se encontró estado
    if (!result.estado) {
      for (const [abbr, full] of Object.entries(ESTADOS_ABBR)) {
        const regex = new RegExp(`\\b${abbr}\\b`);
        if (regex.test(text)) {
          result.estado = normalizeEstado(full);
          break;
        }
      }
    }

    // Buscar municipio (patrón "municipio de X" o "X, Y" donde Y es estado)
    const municipioMatch = text.match(/(?:municipio\s+(?:de\s+|del\s+)?|alcald[ií]a\s+(?:de\s+)?)([A-ZÁÉÍÓÚÑ][\wáéíóúñ\s]{2,50})/i);
    if (municipioMatch?.[1]) {
      result.municipio = municipioMatch[1].trim().split(/\s{2,}/)[0].trim();
    }

    // Buscar localidad aproximada
    const locMatch = text.match(/(?:en|cerca\s+de|zona\s+(?:de|del|de\s+la)|paraje|predio|carretera)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ\s,.]{3,60})/i);
    if (locMatch?.[1]) {
      result.locality_approx = locMatch[1].trim().split(/[,.]/)[0].trim();
    }

    return result;
  }

  function normalizeEstado(name) {
    const map = {
      "Ciudad de M[eé]xico": "Ciudad de México",
      "CDMX": "Ciudad de México",
      "Edomex": "Estado de México",
      "Estado de M[eé]xico": "Estado de México",
      "Nuevo Le[oó]n": "Nuevo León",
      "Michoac[aá]n": "Michoacán",
      "Quer[eé]taro": "Querétaro",
      "Quintana Roo": "Quintana Roo",
      "San Luis Potosí": "San Luis Potosí",
      "Yucat[aá]n": "Yucatán",
    };
    for (const [k, v] of Object.entries(map)) {
      const regex = new RegExp(`^${k}$`, "i");
      if (regex.test(name)) return v;
    }
    return name;
  }

  // ═══════════════════════════════════════════════════════════
  //  CLASIFICACIÓN PRINCIPAL
  // ═══════════════════════════════════════════════════════════

  function classify(text) {
    const fosa_signals = [];
    let fosa_score = 0;
    for (const p of FOSAS_PATTERNS) {
      const match = text.match(p.pattern);
      if (match) {
        fosa_signals.push(p.id);
        fosa_score += p.weight;
      }
    }

    const desap_signals = [];
    let desap_score = 0;
    for (const p of DESAPARICION_PATTERNS) {
      const match = text.match(p.pattern);
      if (match) {
        desap_signals.push(p.id);
        desap_score += p.weight;
      }
    }

    const ubi_signals = [];
    for (const p of UBICACION_PATTERNS) {
      if (p.pattern.test(text)) {
        ubi_signals.push(p.id);
      }
    }

    // Determinar tipo de evento
    let event_type = "otro";
    if (fosa_score >= 5) event_type = "posible_fosa";
    else if (desap_score >= 5) event_type = "punto_desaparicion";
    else if (fosa_score >= 3 && desap_score >= 3) event_type = "posible_fosa";

    // Confidence 0-1
    const max_score = Math.max(fosa_score, desap_score);
    const confidence = Math.min(1, max_score / 12);

    return {
      event_type,
      fosa_signals,
      desap_signals,
      ubi_signals,
      fosa_score,
      desap_score,
      confidence: parseFloat(confidence.toFixed(2)),
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  FULL PIPELINE
  // ═══════════════════════════════════════════════════════════

  function processPost(text) {
    const { text: redacted, redactions } = redactPii(text);
    const classification = classify(redacted);
    const geo = extractGeo(redacted);

    return {
      ...classification,
      ...geo,
      text_redacted: redacted,
      pii_redactions: redactions,
      needs_review: classification.confidence < 0.5 || classification.event_type === "otro",
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════

  global.HiloDetector = {
    processPost,
    classify,
    extractGeo,
    redactPii,
    FOSAS_PATTERNS,
    DESAPARICION_PATTERNS,
    UBICACION_PATTERNS,
    ESTADOS_MEXICO,
  };
})(typeof window !== "undefined" ? window : this);
