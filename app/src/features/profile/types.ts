export interface PersonaSummary {
  id: number
  id_victimadirecta: string | null
  nombre: string | null
  primer_apellido: string | null
  segundo_apellido: string | null
  sexo: string | null
  edad_actual: string | null
  estado: string | null
  municipio: string | null
  estatus_victima: string | null
}

export interface Filiacion {
  raw: string | null
  parsed: Record<string, string>
}

export interface PersonaDetail extends PersonaSummary {
  fecha_hechos: string | null
  fecha_percato: string | null
  fotografia: string | null
  senas: string[]
  filiacion: Filiacion
}

export interface PersonaList {
  items: PersonaSummary[]
  total: number
  limit: number
  offset: number
}

export interface Vinculo {
  id: string
  persona_victima_id: string
  parentesco: string | null
  created_at: string
}

export interface VinculoOut {
  vinculo: Vinculo
  persona: PersonaDetail | null
}

export function fullName(p: { nombre: string | null; primer_apellido: string | null; segundo_apellido: string | null }): string {
  return [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' ') || 'Sin nombre'
}
