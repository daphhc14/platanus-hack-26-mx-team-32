export interface CuerpoQuery {
  sexo?: string
  edad_min?: number
  edad_max?: number
  estatura_cm?: number
  senas?: string[]
  media_filiacion?: string
  estado?: string
  fecha_hallazgo?: string
}

export interface PreviewCandidate {
  persona_victima_id: string
  nombre: string | null
  score: number
  tier: 'alta' | 'media' | 'baja'
  evidencia: string[]
  contradicciones: string[]
  razonamiento: string | null
}

export interface PreviewResult {
  retrieved: number
  via: string
  candidatos: PreviewCandidate[]
}
