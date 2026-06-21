// lib/acquisition/providers/geocoding.ts
// Google Maps Geocoding API client with hardcoded fallback.
// Uses GOOGLE_MAPS_API_KEY env var; falls back to built-in MX city table if unset.

interface GeoResult {
  text: string | null;
  latitude: number | null;
  longitude: number | null;
  region: string | null;
  source: "google" | "table" | null;
}

const GOOGLE_GEO_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";

function apiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY;
}

/** Known Mexican city centroids — fallback when Google API is unavailable. */
const CITY_COORDS: Record<string, { lat: number; lng: number; region: string }> = {
  "ciudad de méxico":       { lat: 19.4326, lng: -99.1332, region: "Ciudad de México" },
  "cdmx":                   { lat: 19.4326, lng: -99.1332, region: "Ciudad de México" },
  "méxico":                 { lat: 19.4326, lng: -99.1332, region: "Ciudad de México" },
  "guadalajara":            { lat: 20.6597, lng: -103.3496, region: "Jalisco" },
  "monterrey":              { lat: 25.6866, lng: -100.3161, region: "Nuevo León" },
  "puebla":                 { lat: 19.0414, lng: -98.2063, region: "Puebla" },
  "toluca":                 { lat: 19.2925, lng: -99.6536, region: "Estado de México" },
  "tijuana":                { lat: 32.5149, lng: -117.0382, region: "Baja California" },
  "juárez":                 { lat: 31.6904, lng: -106.4245, region: "Chihuahua" },
  "cd. juárez":             { lat: 31.6904, lng: -106.4245, region: "Chihuahua" },
  "léon":                   { lat: 21.129,  lng: -101.6803, region: "Guanajuato" },
  "león":                   { lat: 21.129,  lng: -101.6803, region: "Guanajuato" },
  "querétaro":              { lat: 20.5888, lng: -100.3899, region: "Querétaro" },
  "morelia":                { lat: 19.706,  lng: -101.1955, region: "Michoacán" },
  "cancún":                 { lat: 21.1619, lng: -86.8515, region: "Quintana Roo" },
  "mérida":                 { lat: 20.9674, lng: -89.5926, region: "Yucatán" },
  "acapulco":               { lat: 16.8531, lng: -99.8237, region: "Guerrero" },
  "chihuahua":              { lat: 28.6353, lng: -106.0889, region: "Chihuahua" },
  "culiacán":               { lat: 24.8091, lng: -107.394,  region: "Sinaloa" },
  "hermosillo":             { lat: 29.0729, lng: -110.9559, region: "Sonora" },
  "veracruz":               { lat: 19.191,  lng: -96.1534,  region: "Veracruz" },
  "san luis potosí":        { lat: 22.1565, lng: -100.9855, region: "San Luis Potosí" },
  "aguascalientes":         { lat: 21.8853, lng: -102.2916, region: "Aguascalientes" },
  "oaxaca":                 { lat: 17.0732, lng: -96.7266,  region: "Oaxaca" },
  "tuxtla gutiérrez":       { lat: 16.7534, lng: -93.1153,  region: "Chiapas" },
  "xalapa":                 { lat: 19.5438, lng: -96.9102,  region: "Veracruz" },
  "cuernavaca":             { lat: 18.9242, lng: -99.2216,  region: "Morelos" },
  "durango":                { lat: 24.0277, lng: -104.6532, region: "Durango" },
  "tlaxcala":               { lat: 19.3139, lng: -98.2474,  region: "Tlaxcala" },
  "campeche":               { lat: 19.8301, lng: -90.5349,  region: "Campeche" },
  "colima":                 { lat: 19.2433, lng: -103.724,  region: "Colima" },
  "zacatecas":              { lat: 22.7709, lng: -102.5833, region: "Zacatecas" },
  "pachuca":                { lat: 20.099,  lng: -98.7385,  region: "Hidalgo" },
  "saltillo":               { lat: 25.4232, lng: -101.0053, region: "Coahuila" },
  "ciudad victoria":        { lat: 23.7369, lng: -99.1412,  region: "Tamaulipas" },
  "la paz":                 { lat: 24.1426, lng: -110.3125, region: "Baja California Sur" },
  "tepic":                  { lat: 21.506,  lng: -104.8931, region: "Nayarit" },
  "chetumal":               { lat: 18.5141, lng: -88.3038,  region: "Quintana Roo" },
  "ecatepec":               { lat: 19.6013, lng: -99.0538,  region: "Estado de México" },
  "nezahualcóyotl":         { lat: 19.4006, lng: -99.0141,  region: "Estado de México" },
  "naucalpan":              { lat: 19.4817, lng: -99.2394,  region: "Estado de México" },
  "irapuato":               { lat: 20.6767, lng: -101.3563, region: "Guanajuato" },
  "celaya":                 { lat: 20.5219, lng: -100.8159, region: "Guanajuato" },
};

/**
 * Resolve a location string to coordinates.
 *
 * Priority:
 * 1. Google Maps Geocoding API (if GOOGLE_MAPS_API_KEY is set)
 * 2. Built-in MX city table (35+ cities)
 * 3. Returns null coordinates with the raw text
 */
export async function resolveLocation(locationText: string | null): Promise<GeoResult> {
  if (!locationText) {
    return { text: null, latitude: null, longitude: null, region: null, source: null };
  }

  const key = apiKey();

  // Try Google first
  if (key) {
    try {
      const url = `${GOOGLE_GEO_URL}?address=${encodeURIComponent(locationText + ", México")}&key=${encodeURIComponent(key)}&language=es`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data.status === "OK" && data.results?.[0]) {
          const r = data.results[0];
          const lat = r.geometry.location.lat;
          const lng = r.geometry.location.lng;
          const region = r.address_components?.find(
            (c: any) => c.types.includes("administrative_area_level_1"),
          )?.long_name ?? null;
          return {
            text: r.formatted_address ?? locationText,
            latitude: lat,
            longitude: lng,
            region,
            source: "google",
          };
        }
      }
    } catch {
      // fall through to table
    }
  }

  // Fallback: hardcoded city table
  const clean = locationText.toLowerCase().trim().replace(/[.,;]$/, "");
  const entry = CITY_COORDS[clean];
  if (entry) {
    return { text: locationText, latitude: entry.lat, longitude: entry.lng, region: entry.region, source: "table" };
  }

  // Partial match
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (clean.includes(name)) {
      return { text: locationText, latitude: coords.lat, longitude: coords.lng, region: coords.region, source: "table" };
    }
  }

  return { text: locationText, latitude: null, longitude: null, region: null, source: null };
}
