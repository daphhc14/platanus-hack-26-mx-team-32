import { API_URL } from '../../../lib/http'
import type { PreviewResult } from '../types'

const TIER_CLASS: Record<string, string> = {
  alta: 'tier tier-alta',
  media: 'tier tier-media',
  baja: 'tier tier-baja',
}

export function MatchResults({ result }: { result: PreviewResult }) {
  return (
    <div className="results">
      <p className="hilo-muted">
        Recuperados {result.retrieved} · vía {result.via} · {result.candidatos.length} candidatos
      </p>
      {result.candidatos.map((c, i) => (
        <article className="cand" key={i}>
          <img
            className="cand-foto"
            src={`${API_URL}/personas/${c.persona_victima_id}/foto?size=160`}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
          <div className="cand-body">
            <header className="cand-head">
              <span className={TIER_CLASS[c.tier]}>{c.tier}</span>
              <strong>{c.nombre || '—'}</strong>
              <span className="cand-score">{(c.score * 100).toFixed(0)}%</span>
            </header>
            {c.evidencia.length > 0 && (
              <ul className="ev">
                {c.evidencia.map((e, j) => <li key={j}>✓ {e}</li>)}
              </ul>
            )}
            {c.contradicciones.length > 0 && (
              <ul className="contra">
                {c.contradicciones.map((e, j) => <li key={j}>✕ {e}</li>)}
              </ul>
            )}
            {c.razonamiento && <p className="razon">{c.razonamiento}</p>}
          </div>
        </article>
      ))}
    </div>
  )
}
