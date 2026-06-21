import type { CuerpoQuery } from './types'

export interface Mock {
  id: string
  label: string
  descripcion: string
  query: CuerpoQuery
}

export const MOCKS: Mock[] = [
  {
    id: 'a',
    label: 'Hallazgo A · coincidencia probable',
    descripcion: 'Hombre ~18, tatuaje lado izquierdo, Tamaulipas, 165 cm',
    query: {
      sexo: 'HOMBRE', edad_min: 16, edad_max: 20, estatura_cm: 165,
      senas: ['TATUAJE LADO IZQUIERDO'], estado: 'TAMAULIPAS', fecha_hallazgo: '2026-06-30',
    },
  },
  {
    id: 'b',
    label: 'Hallazgo B · near-miss (lateralidad)',
    descripcion: 'Igual pero tatuaje lado DERECHO — debe descartarse',
    query: {
      sexo: 'HOMBRE', edad_min: 16, edad_max: 20, estatura_cm: 165,
      senas: ['TATUAJE LADO DERECHO'], estado: 'TAMAULIPAS', fecha_hallazgo: '2026-06-30',
    },
  },
]
