import { supabase } from '../../lib/supabase'

export interface PersonOnMap {
  id: number
  nombre: string | null
  primer_apellido: string | null
  segundo_apellido: string | null
  edad_actual: number | null
  edad_hechos: number | null
  estado: string | null
  municipio: string | null
  fecha_hechos: string | null
  estatus_victima: string | null
  lat: number
  lng: number
}

const COLUMNS = [
  'id',
  'nombre',
  'primer_apellido',
  'segundo_apellido',
  'edad_actual',
  'edad_hechos',
  'estado',
  'municipio',
  'fecha_hechos',
  'estatus_victima',
  'latitud',
  'longitud',
].join(',')

export async function fetchPersonsOnMap(): Promise<PersonOnMap[]> {
  const { data, error } = await supabase
    .from('personas_desaparecidas')
    .select(COLUMNS)
    .not('latitud', 'is', null)
    .not('longitud', 'is', null)

  if (error) throw error
  const rows = ((data || []) as unknown) as Array<Record<string, unknown>>
  return rows.map(row => ({
    id: row.id as number,
    nombre: row.nombre as string | null,
    primer_apellido: row.primer_apellido as string | null,
    segundo_apellido: row.segundo_apellido as string | null,
    edad_actual: row.edad_actual as number | null,
    edad_hechos: row.edad_hechos as number | null,
    estado: row.estado as string | null,
    municipio: row.municipio as string | null,
    fecha_hechos: row.fecha_hechos as string | null,
    estatus_victima: row.estatus_victima as string | null,
    lat: row.latitud as number,
    lng: row.longitud as number,
  }))
}
