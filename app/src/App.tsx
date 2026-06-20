import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })

  const signOut = () => supabase.auth.signOut()

  return (
    <div className="hilo-app">
      <div className="demo-banner">⚠ DATOS SINTÉTICOS — DEMO</div>

      <main className="hilo-main">
        <h1 className="hilo-logo">Hilo</h1>
        <p className="hilo-tagline">
          La capa conectiva para la búsqueda de personas desaparecidas.
        </p>

        {loading ? (
          <p className="hilo-muted">Cargando…</p>
        ) : session ? (
          <section className="hilo-card">
            <p className="hilo-muted">Sesión iniciada como</p>
            <p className="hilo-email">{session.user.email}</p>
            <button className="hilo-btn hilo-btn-ghost" onClick={signOut}>
              Cerrar sesión
            </button>
          </section>
        ) : (
          <section className="hilo-card">
            <p className="hilo-muted">Inicia sesión para vincularte a una búsqueda</p>
            <button className="hilo-btn" onClick={signInWithGoogle}>
              Continuar con Google
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
