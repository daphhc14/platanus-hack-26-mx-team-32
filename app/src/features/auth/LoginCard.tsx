import type { Session } from '@supabase/supabase-js'
import { signInWithGoogle, signOut } from './useSession'

export function LoginCard({ session }: { session: Session | null }) {
  if (session) {
    return (
      <section className="hilo-card">
        <p className="hilo-muted">Sesión iniciada como</p>
        <p className="hilo-email">{session.user.email}</p>
        <button className="hilo-btn hilo-btn-ghost" onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </section>
    )
  }
  return (
    <section className="hilo-card">
      <p className="hilo-muted">Inicia sesión para vincularte a una búsqueda</p>
      <button className="hilo-btn" onClick={() => signInWithGoogle()}>
        Continuar con Google
      </button>
    </section>
  )
}
