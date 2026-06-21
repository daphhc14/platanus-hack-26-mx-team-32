import { useEffect } from 'react'
import type { Notificacion } from './types'

const META: Record<Notificacion['tipo'], { icon: string; title: string; body: string }> = {
  match: {
    icon: '🔔',
    title: 'Posible coincidencia',
    body: 'El sistema encontró un posible match para tu familiar. Ábrelo para revisarlo.',
  },
  chat: {
    icon: '🔓',
    title: 'Chat disponible',
    body: 'Otra familia se vinculó a tu caso. Ya pueden escribirse de forma anónima.',
  },
  mensaje: {
    icon: '💬',
    title: 'Nuevo mensaje',
    body: 'Otra familia del mismo caso te escribió.',
  },
  evidencia: {
    icon: '📎',
    title: 'Nueva evidencia',
    body: 'Se agregó nueva información al caso de tu familiar.',
  },
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

export function NotificationsScreen({
  items,
  loading,
  onSeen,
}: {
  items: Notificacion[]
  loading: boolean
  onSeen: () => void
}) {
  // Mark everything read when this screen is opened.
  useEffect(() => {
    onSeen()
  }, [onSeen])

  return (
    <div className="profile">
      <h2 className="profile-h">Alertas</h2>
      {loading && <p className="hilo-muted">Cargando…</p>}
      {!loading && items.length === 0 && (
        <p className="hilo-muted">No tienes alertas todavía.</p>
      )}
      {items.map((n) => {
        const m = META[n.tipo] ?? META.evidencia
        return (
          <article key={n.id} className={`hilo-card notif${n.leida ? '' : ' notif-unread'}`}>
            <span className="notif-icon">{m.icon}</span>
            <div className="notif-body">
              <strong>{m.title}</strong>
              <span className="hilo-muted">{m.body}</span>
              <span className="notif-time">{timeAgo(n.created_at)}</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}
