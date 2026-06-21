import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LoginCard, useSession } from './features/auth'
import { ReportFinding } from './features/matching'
import { Onboarding, ProfileScreen, getMyVinculo } from './features/profile'
import type { VinculoOut } from './features/profile'
import { NotificationsScreen, useNotifications } from './features/notifications'
import './App.css'

type Tab = 'inicio' | 'alertas' | 'perfil'

export default function App() {
  const { session, loading } = useSession()

  return (
    <div className="hilo-app">
      <div className="demo-banner">⚠ DATOS SINTÉTICOS — DEMO</div>
      {loading ? (
        <main className="hilo-main">
          <p className="hilo-muted">Cargando…</p>
        </main>
      ) : session ? (
        <Authed session={session} />
      ) : (
        <Landing />
      )}
    </div>
  )
}

function Landing() {
  return (
    <main className="hilo-main">
      <h1 className="hilo-logo">Hilo</h1>
      <p className="hilo-tagline">
        La capa conectiva para la búsqueda de personas desaparecidas.
      </p>
      <LoginCard session={null} />
    </main>
  )
}

function Authed({ session }: { session: Session }) {
  const skipKey = `hilo_onb_skip_${session.user.id}`
  const [vinculo, setVinculo] = useState<VinculoOut | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [skipped, setSkipped] = useState(() => localStorage.getItem(skipKey) === '1')
  const [tab, setTab] = useState<Tab>('inicio')
  // Notifications only make sense once the user is linked to a case.
  const { items, unread, loading: notifLoading, markAllRead } = useNotifications(!!vinculo)

  const refresh = useCallback(async () => {
    try {
      setVinculo(await getMyVinculo())
    } catch {
      setVinculo(null)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!loaded) {
    return (
      <main className="hilo-main">
        <p className="hilo-muted">Cargando…</p>
      </main>
    )
  }

  // Onboarding gate: first time, no link yet and hasn't opted out.
  if (!vinculo && !skipped) {
    return (
      <main className="hilo-main">
        <h1 className="hilo-logo">Hilo</h1>
        <Onboarding
          onLinked={(v) => {
            setVinculo(v)
            setTab('perfil')
          }}
          onSkip={() => {
            localStorage.setItem(skipKey, '1')
            setSkipped(true)
          }}
        />
      </main>
    )
  }

  return (
    <>
      <main className="hilo-main hilo-main-app">
        {tab === 'inicio' && (
          <>
            <h1 className="hilo-logo">Hilo</h1>
            <p className="hilo-tagline">
              La capa conectiva para la búsqueda de personas desaparecidas.
            </p>
            <ReportFinding />
          </>
        )}
        {tab === 'alertas' && (
          <NotificationsScreen items={items} loading={notifLoading} onSeen={markAllRead} />
        )}
        {tab === 'perfil' && (
          <ProfileScreen
            session={session}
            vinculo={vinculo}
            onStartLink={() => {
              localStorage.removeItem(skipKey)
              setSkipped(false)
            }}
          />
        )}
      </main>

      <nav className="tabbar">
        <button
          className={tab === 'inicio' ? 'tab tab-on' : 'tab'}
          onClick={() => setTab('inicio')}
        >
          <span className="tab-ico">🏠</span>
          Inicio
        </button>
        <button
          className={tab === 'alertas' ? 'tab tab-on' : 'tab'}
          onClick={() => setTab('alertas')}
        >
          <span className="tab-ico">
            🔔
            {unread > 0 && <span className="tab-badge">{unread > 9 ? '9+' : unread}</span>}
          </span>
          Alertas
        </button>
        <button
          className={tab === 'perfil' ? 'tab tab-on' : 'tab'}
          onClick={() => setTab('perfil')}
        >
          <span className="tab-ico">👤</span>
          Perfil
        </button>
      </nav>
    </>
  )
}
