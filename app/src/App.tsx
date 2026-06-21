
import { LoginCard, useSession } from './features/auth'
import { ReportFinding } from './features/matching'
import './App.css'

export default function App() {
  const { session, loading } = useSession()

  return (
    <div className="hilo-app">
      <div className="demo-banner">⚠ DATOS SINTÉTICOS — DEMO</div>

      <main className="hilo-main">
        <h1 className="hilo-logo">Hilo</h1>
        <p className="hilo-tagline">
          La capa conectiva para la búsqueda de personas desaparecidas.
        </p>

        {loading ? <p className="hilo-muted">Cargando…</p> : <LoginCard session={session} />}

        <ReportFinding />
      </main>
    </div>
  )
}
