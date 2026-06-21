import { useEffect, useState } from 'react'
import { API_URL } from '../../lib/http'
import { createVinculo, searchPersonas } from './api'
import { fullName } from './types'
import type { PersonaSummary, VinculoOut } from './types'

type Step = 'ask' | 'search'

export function Onboarding({
  onLinked,
  onSkip,
}: {
  onLinked: (v: VinculoOut) => void
  onSkip: () => void
}) {
  const [step, setStep] = useState<Step>('ask')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PersonaSummary[] | null>(null)
  const [selected, setSelected] = useState<PersonaSummary | null>(null)
  const [parentesco, setParentesco] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced typeahead: search as the user types (min 2 chars). `active`
  // guards against out-of-order responses overwriting newer results.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchPersonas(term)
        if (active) {
          setResults(res.items)
          setError(null)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al buscar')
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [q])

  async function confirmLink() {
    if (!selected?.id_victimadirecta) return
    setLoading(true)
    setError(null)
    try {
      const v = await createVinculo(selected.id_victimadirecta, parentesco.trim() || undefined)
      onLinked(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el vínculo')
      setLoading(false)
    }
  }

  if (step === 'ask') {
    return (
      <section className="hilo-card onb-card">
        <h2 className="onb-title">¿Estás buscando a alguien?</h2>
        <p className="hilo-muted">
          Si tienes un familiar desaparecido, vincúlate a su ficha para seguir su caso y recibir
          coincidencias.
        </p>
        <button className="hilo-btn" onClick={() => setStep('search')}>
          Sí, buscar a mi familiar
        </button>
        <button className="hilo-btn hilo-btn-ghost" onClick={onSkip}>
          No, solo explorar
        </button>
      </section>
    )
  }

  return (
    <section className="hilo-card onb-card onb-search">
      <h2 className="onb-title">Busca a tu familiar</h2>
      <div className="onb-search-box">
        <input
          autoFocus
          placeholder="Empieza a escribir un nombre o apellido…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setSelected(null)
          }}
        />
        {loading && <span className="onb-spinner" aria-hidden />}
      </div>

      {error && <p className="report-error">⚠ {error}</p>}

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="hilo-muted">Escribe al menos 2 letras…</p>
      )}

      {results && results.length === 0 && !loading && (
        <p className="hilo-muted">Sin resultados para “{q}”.</p>
      )}

      {results && results.length > 0 && (
        <ul className="onb-results">
          {results.map((p) => (
            <li key={p.id}>
              <button
                className={`onb-result${selected?.id === p.id ? ' onb-result-sel' : ''}`}
                onClick={() => setSelected(p)}
              >
                {p.id_victimadirecta && (
                  <img
                    className="onb-foto"
                    src={`${API_URL}/personas/${p.id_victimadirecta}/foto?size=96`}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  />
                )}
                <span className="onb-result-body">
                  <strong>{fullName(p)}</strong>
                  <span className="hilo-muted">
                    {[p.sexo, p.edad_actual && `${p.edad_actual} años`, p.estado]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="onb-confirm">
          <label className="onb-rel">
            Parentesco (opcional)
            <input
              placeholder="Madre, hermano…"
              value={parentesco}
              onChange={(e) => setParentesco(e.target.value)}
            />
          </label>
          <button className="hilo-btn" onClick={confirmLink} disabled={loading}>
            {loading ? 'Vinculando…' : `Vincularme con ${fullName(selected)}`}
          </button>
        </div>
      )}

      <button className="onb-link" onClick={onSkip}>
        Omitir por ahora
      </button>
    </section>
  )
}
