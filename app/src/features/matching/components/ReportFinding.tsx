import { useState } from 'react'
import { matchPreview } from '../api'
import { MOCKS } from '../mocks'
import type { CuerpoQuery, PreviewResult } from '../types'
import { FindingForm } from './FindingForm'
import { MatchResults } from './MatchResults'

type View = 'closed' | 'menu' | 'form'

export function ReportFinding() {
  const [view, setView] = useState<View>('closed')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PreviewResult | null>(null)

  async function run(query: CuerpoQuery) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await matchPreview(query))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
      setView('closed')
    }
  }

  return (
    <section className="report">
      {view === 'closed' && (
        <button className="hilo-btn" onClick={() => setView('menu')}>
          + Reportar hallazgo
        </button>
      )}

      {view === 'menu' && (
        <div className="report-menu">
          {MOCKS.map((m) => (
            <button key={m.id} className="report-option" onClick={() => run(m.query)}>
              <strong>{m.label}</strong>
              <span>{m.descripcion}</span>
            </button>
          ))}
          <button className="report-option" onClick={() => setView('form')}>
            <strong>Agregar nuevo evento</strong>
            <span>Capturar los datos manualmente</span>
          </button>
          <button className="hilo-btn hilo-btn-ghost" onClick={() => setView('closed')}>
            Cancelar
          </button>
        </div>
      )}

      {view === 'form' && <FindingForm onSubmit={run} onCancel={() => setView('menu')} />}

      {loading && <p className="hilo-muted">Buscando coincidencias…</p>}
      {error && <p className="report-error">⚠ {error}</p>}
      {result && <MatchResults result={result} />}
    </section>
  )
}
