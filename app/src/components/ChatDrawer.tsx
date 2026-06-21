import { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { useChat } from '../features/chat/useChat'
import { AgentDot } from './AgentDot'

/**
 * Side drawer for the anonymous MB↔MB case chat. Styled to the app design
 * system; powered by the real `useChat` hook (mensajes + Realtime + RLS).
 * Subscribes only while open.
 */
export function ChatDrawer({
  personaVictimaId,
  personaNombre,
  open,
  onClose,
}: {
  personaVictimaId: string
  personaNombre: string
  open: boolean
  onClose: () => void
}) {
  const { messages, loading, error, send } = useChat(open ? personaVictimaId : null)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft
    setDraft('')
    await send(text)
  }

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          background: 'rgba(0,0,0,0.25)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* panel */}
      <aside
        aria-hidden={!open}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 301,
          width: 'min(380px, 100vw)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderLeft: '1px solid rgba(242,195,133,0.45)',
          boxShadow: '-10px 0 34px rgba(0,0,0,0.14)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s ease',
          fontFamily: 'var(--font-family)',
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid rgba(242,195,133,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AgentDot size={22} pulse />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Chat del caso</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {personaNombre} · anónimo entre familias
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar chat"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Cargando mensajes…</p>}
          {!loading && messages.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Aún no hay mensajes. Escribe el primero.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.is_me ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              {!m.is_me && (
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 2 }}>{m.alias}</div>
              )}
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 14,
                  fontSize: 14,
                  lineHeight: 1.5,
                  background: m.is_me ? '#F2921D' : 'rgba(255,255,255,0.92)',
                  color: m.is_me ? '#fff' : '#1A1A1A',
                  border: m.is_me ? 'none' : '1px solid rgba(242,195,133,0.45)',
                  wordBreak: 'break-word',
                }}
              >
                {m.cuerpo}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--color-error)', padding: '0 18px' }}>⚠ {error}</p>}

        {/* composer */}
        <form
          onSubmit={submit}
          style={{ padding: '12px 16px', borderTop: '1px solid rgba(242,195,133,0.3)', display: 'flex', gap: 8 }}
        >
          <input
            className="glass-input"
            placeholder="Escribe un mensaje…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!draft.trim()}
            aria-label="Enviar"
            style={{ padding: '0 14px', display: 'flex', alignItems: 'center', opacity: draft.trim() ? 1 : 0.5 }}
          >
            <Send size={18} />
          </button>
        </form>
      </aside>
    </>
  )
}
