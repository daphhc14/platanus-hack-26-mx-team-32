export type NotifTipo = 'match' | 'evidencia' | 'mensaje' | 'chat'

export interface Notificacion {
  id: string
  tipo: NotifTipo
  payload: Record<string, unknown>
  leida: boolean
  created_at: string
}
