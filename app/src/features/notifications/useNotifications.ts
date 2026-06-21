import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Notificacion } from './types'

/**
 * Live in-app notifications. RLS scopes rows to the current user; Realtime
 * pushes new ones instantly (drives the unread badge). Created server-side by
 * DB triggers on match / message / evidence — never inserted by the client.
 */
export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return
        setItems((data ?? []) as Notificacion[])
        setLoading(false)
      })

    const channel = supabase
      .channel('notificaciones')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          if (!cancelled) setItems((prev) => [payload.new as Notificacion, ...prev])
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [enabled])

  const unread = items.filter((n) => !n.leida).length

  const markAllRead = useCallback(async () => {
    const ids = items.filter((n) => !n.leida).map((n) => n.id)
    if (ids.length === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })))
    await supabase.from('notificaciones').update({ leida: true }).in('id', ids)
  }, [items])

  return { items, unread, loading, markAllRead }
}
