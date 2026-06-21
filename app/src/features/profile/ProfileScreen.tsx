import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { signOut } from '../auth'
import { ChatPanel } from '../chat'
import { API_URL } from '../../lib/http'
import { LinkedPersonModal } from './LinkedPersonModal'
import { fullName } from './types'
import type { VinculoOut } from './types'

export function ProfileScreen({
  session,
  vinculo,
  onStartLink,
}: {
  session: Session
  vinculo: VinculoOut | null
  onStartLink: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const persona = vinculo?.persona ?? null

  return (
    <div className="profile">
      <h2 className="profile-h">Mi perfil</h2>

      <section className="hilo-card profile-user">
        <div className="profile-avatar">{(session.user.email ?? '?')[0].toUpperCase()}</div>
        <div>
          <p className="hilo-email">{session.user.email}</p>
          <p className="hilo-muted">Madre Buscadora</p>
        </div>
      </section>

      <h3 className="profile-sub">Persona vinculada</h3>

      {persona ? (
        <button className="hilo-card linked-card" onClick={() => setModalOpen(true)}>
          {persona.id_victimadirecta && (
            <img
              className="linked-foto"
              src={`${API_URL}/personas/${persona.id_victimadirecta}/foto?size=160`}
              alt=""
              loading="lazy"
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
            />
          )}
          <div className="linked-body">
            <strong>{fullName(persona)}</strong>
            {vinculo?.vinculo.parentesco && (
              <span className="hilo-muted">Tu {vinculo.vinculo.parentesco}</span>
            )}
            <span className="hilo-muted">
              {[persona.sexo, persona.edad_actual && `${persona.edad_actual} años`, persona.estado]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {persona.estatus_victima && <span className="lp-status">{persona.estatus_victima}</span>}
          </div>
          <span className="linked-chevron">›</span>
        </button>
      ) : (
        <section className="hilo-card">
          <p className="hilo-muted">No estás vinculada a ninguna búsqueda todavía.</p>
          <button className="hilo-btn" onClick={onStartLink}>
            Vincularme a una búsqueda
          </button>
        </section>
      )}

      {persona && vinculo && (
        <button className="hilo-btn chat-cta" onClick={() => setChatOpen(true)}>
          💬 Chat con otras familias del caso
        </button>
      )}

      <button className="hilo-btn hilo-btn-ghost profile-signout" onClick={() => signOut()}>
        Cerrar sesión
      </button>

      {modalOpen && persona && (
        <LinkedPersonModal
          persona={persona}
          parentesco={vinculo?.vinculo.parentesco ?? null}
          onClose={() => setModalOpen(false)}
        />
      )}

      {chatOpen && persona && vinculo && (
        <ChatPanel
          personaVictimaId={vinculo.vinculo.persona_victima_id}
          personaNombre={fullName(persona)}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
