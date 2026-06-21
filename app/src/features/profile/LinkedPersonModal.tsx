import { useEffect } from 'react'
import { API_URL } from '../../lib/http'
import { fullName } from './types'
import type { PersonaDetail } from './types'

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="lp-row">
      <span className="lp-row-k">{label}</span>
      <span className="lp-row-v">{value}</span>
    </div>
  )
}

export function LinkedPersonModal({
  persona,
  parentesco,
  onClose,
}: {
  persona: PersonaDetail
  parentesco: string | null
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filiacion = Object.entries(persona.filiacion?.parsed ?? {})

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>

        <header className="lp-header">
          {persona.id_victimadirecta && (
            <img
              className="lp-foto"
              src={`${API_URL}/personas/${persona.id_victimadirecta}/foto?size=320`}
              alt=""
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
            />
          )}
          <div>
            <h2 className="lp-name">{fullName(persona)}</h2>
            {parentesco && <p className="hilo-muted">Tu {parentesco}</p>}
            {persona.estatus_victima && (
              <span className="lp-status">{persona.estatus_victima}</span>
            )}
          </div>
        </header>

        <section className="lp-section">
          <Row label="Sexo" value={persona.sexo} />
          <Row label="Edad" value={persona.edad_actual ? `${persona.edad_actual} años` : null} />
          <Row label="Estado" value={persona.estado} />
          <Row label="Municipio" value={persona.municipio} />
          <Row label="Fecha de hechos" value={persona.fecha_hechos} />
          <Row label="Fecha de percato" value={persona.fecha_percato} />
        </section>

        {filiacion.length > 0 && (
          <section className="lp-section">
            <h3 className="lp-subtitle">Media filiación</h3>
            {filiacion.map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </section>
        )}

        {persona.senas.length > 0 && (
          <section className="lp-section">
            <h3 className="lp-subtitle">Señas particulares</h3>
            <ul className="lp-senas">
              {persona.senas.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
