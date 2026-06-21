import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Eye, X, Info, ArrowLeft } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'

interface FamiliarData {
  descripcion: string
  circunstancias: string
}

function Modal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<FamiliarData>({
    descripcion: 'Hombre de 34 años, complexión delgada, estatura aproximada de 1.72m, cabello negro corto, ojos cafés. Al momento de su desaparición vestía pantalón de mezclilla azul y playera blanca.',
    circunstancias: 'Salió de su domicilio en Zamora, Michoacán el 12 de marzo de 2023 aproximadamente a las 7:00pm con destino a su lugar de trabajo. Nunca llegó a su destino ni regresó a casa. Su teléfono estuvo activo hasta las 8:45pm de ese mismo día.',
  })
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.30)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="glass-strong anim-fade-in"
        style={{ maxWidth: 520, width: '100%', padding: 32, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6B6B6B',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
          }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 500, color: '#1A1A1A', marginBottom: 20 }}>
          Información del familiar
        </h2>

        {/* Top section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: '#F2E3D5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}>
            <User size={32} color="#6B6B6B" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1A1A' }}>Jorge González</div>
          <div style={{ fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>Desaparecido el 12 de marzo de 2023</div>
        </div>

        <div style={{ height: 1, background: '#F2E3D5', marginBottom: 20 }} />

        {/* Descripción física */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="descripcion"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6B6B', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Descripción física
          </label>
          <textarea
            id="descripcion"
            className="glass-input"
            value={data.descripcion}
            onChange={e => setData(d => ({ ...d, descripcion: e.target.value }))}
            style={{ minHeight: 110, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        {/* Circunstancias */}
        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="circunstancias"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6B6B', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Circunstancias de la desaparición
          </label>
          <textarea
            id="circunstancias"
            className="glass-input"
            value={data.circunstancias}
            onChange={e => setData(d => ({ ...d, circunstancias: e.target.value }))}
            style={{ minHeight: 110, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={handleSave}
        >
          {saved ? '¡Cambios guardados!' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

export function Profile() {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: 'var(--app-bg)', backgroundAttachment: 'fixed' }}
    >
      {/* Navbar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 58,
          background: 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(242,195,133,0.35)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/home')}
          aria-label="Volver"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#6B6B6B' }}
        >
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 500, color: '#1A1A1A' }}>Mi perfil</span>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px 40px' }}>

        {/* Section 1: Identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          {/* Avatar */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#F2C185',
            color: '#2D2D2D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 600,
            fontFamily: 'var(--font-family)',
            marginBottom: 12,
          }}>
            MG
          </div>

          <div style={{ fontSize: 18, fontWeight: 500, color: '#1A1A1A', marginBottom: 10 }}>
            María González
          </div>

          {/* Privacy pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 40,
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(242,195,133,0.4)',
          }}>
            <Info size={13} color="#6B6B6B" />
            <span style={{ fontSize: 12, color: '#6B6B6B' }}>
              Tu nombre no es visible para otros usuarios en la plataforma.
            </span>
          </div>
        </div>

        {/* Section 2: Familiares */}
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#6B6B6B', marginBottom: 14, letterSpacing: '-0.005em' }}>
            Familiares buscados
          </p>

          <GlassCard style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Photo placeholder */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#F2E3D5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <User size={22} color="#6B6B6B" />
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>Jorge González</div>
                <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 3 }}>
                  Desaparecido el 12 de marzo de 2023
                </div>
              </div>

              {/* Eye button */}
              <button
                onClick={() => setModalOpen(true)}
                aria-label="Ver información del familiar"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  display: 'flex',
                  alignItems: 'center',
                  color: '#F2921D',
                  borderRadius: 8,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(242,146,29,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <Eye size={20} color="#F2921D" />
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Sign out */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <button
            className="btn-ghost"
            onClick={() => {
              localStorage.removeItem('onboarding_complete')
              navigate('/login')
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </main>

      {modalOpen && <Modal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
