import { useEffect, useRef, useState } from 'react'
import { useChat } from './useChat'

export function ChatPanel({
  personaVictimaId,
  personaNombre,
  onClose,
}: {
  personaVictimaId: string
  personaNombre: string
  onClose: () => void
}) {
  const { messages, loading, error, send } = useChat(personaVictimaId)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal chat" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <header className="chat-head">
          <h2 className="lp-name">Chat del caso</h2>
          <p className="hilo-muted">
            {personaNombre} · anónimo entre familias del mismo caso
          </p>
        </header>

        <div className="chat-log">
          {loading && <p className="hilo-muted">Cargando mensajes…</p>}
          {!loading && messages.length === 0 && (
            <p className="hilo-muted">Aún no hay mensajes. Escribe el primero.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`msg${m.is_me ? ' msg-me' : ''}`}>
              {!m.is_me && <span className="msg-alias">{m.alias}</span>}
              <span className="msg-body">{m.cuerpo}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && <p className="report-error">⚠ {error}</p>}

        <form className="chat-form" onSubmit={submit}>
          <input
            autoFocus
            placeholder="Escribe un mensaje…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="hilo-btn" type="submit" disabled={!draft.trim()}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  )
}
