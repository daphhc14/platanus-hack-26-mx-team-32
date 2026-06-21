import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { MensajeAnon } from './types'

/**
 * Anonymous, case-scoped MB↔MB chat over Supabase Realtime.
 *
 * Reads go through the `mensajes_anon` view (zero-PII: alias + is_me, never
 * autor_id). Writes insert into `mensajes`; RLS enforces that only MBs linked
 * to this case can read or post. Realtime on the base table is used purely as a
 * change signal — on each INSERT we refetch that row from the view so the alias
 * is resolved server-side and no autor_id ever reaches the client.
 */
export function useChat(personaVictimaId: string | null) {
  const [messages, setMessages] = useState<MensajeAnon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set())

  const append = useCallback((rows: MensajeAnon[]) => {
    setMessages((prev) => {
      const next = [...prev]
      for (const r of rows) {
        if (seen.current.has(r.id)) continue
        seen.current.add(r.id)
        next.push(r)
      }
      next.sort((a, b) => a.created_at.localeCompare(b.created_at))
      return next
    })
  }, [])

  // Initial history + realtime subscription, re-created per case.
  useEffect(() => {
    if (!personaVictimaId) return
    let cancelled = false
    seen.current = new Set()
    setMessages([])
    setLoading(true)
    setError(null)

    supabase
      .from('mensajes_anon')
      .select('*')
      .eq('persona_victima_id', personaVictimaId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else append((data ?? []) as MensajeAnon[])
        setLoading(false)
      })

    const channel = supabase
      .channel(`chat:${personaVictimaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `persona_victima_id=eq.${personaVictimaId}`,
        },
        async (payload) => {
          const id = (payload.new as { id: string }).id
          const { data } = await supabase.from('mensajes_anon').select('*').eq('id', id).single()
          if (!cancelled && data) append([data as MensajeAnon])
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [personaVictimaId, append])

  const send = useCallback(
    async (cuerpo: string) => {
      const text = cuerpo.trim()
      if (!text || !personaVictimaId) return
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) {
        setError('Sesión expirada')
        return
      }
      const { error } = await supabase
        .from('mensajes')
        .insert({ persona_victima_id: personaVictimaId, autor_id: uid, cuerpo: text })
      // The realtime INSERT handler appends it (no optimistic dupe).
      if (error) setError(error.message)
    },
    [personaVictimaId],
  )

  return { messages, loading, error, send }
}
