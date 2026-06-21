import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCircle } from 'lucide-react'
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { GlassCard } from '../components/GlassCard'
import { AgentDot } from '../components/AgentDot'

type FilterKey = 'fosas' | 'desaparicion' | 'trabajos'

const FILTER_LABELS: Record<FilterKey, string> = {
  fosas: 'Posibles fosas',
  desaparicion: 'Puntos de desaparición',
  trabajos: 'Puntos de encuentro trabajos falsos',
}

// Colors used in the map
const MAP_COLORS: Record<FilterKey, string> = {
  fosas: '#3B82F6',      // blue
  desaparicion: '#EF4444', // red
  trabajos: '#F2921D',    // orange
}

// Colors for the active chip state (match their map color)
const CHIP_ACTIVE: Record<FilterKey, { bg: string; text: string; border: string }> = {
  fosas:       { bg: '#3B82F6', text: '#fff', border: '#3B82F6' },
  desaparicion: { bg: '#EF4444', text: '#fff', border: '#EF4444' },
  trabajos:    { bg: '#F2921D', text: '#2D2D2D', border: '#F2921D' },
}
const CHIP_INACTIVE: Record<FilterKey, { border: string; text: string }> = {
  fosas:       { border: 'rgba(59,130,246,0.35)',  text: '#3B82F6' },
  desaparicion: { border: 'rgba(239,68,68,0.35)',   text: '#EF4444' },
  trabajos:    { border: 'rgba(242,146,29,0.35)',  text: '#F2921D' },
}

interface PointData {
  id: number
  lat: number
  lng: number
  type: FilterKey
  name: string
  date: string
}

// Fosas as areas (circles with radius in metres)
const FOSAS_AREAS = [
  { id: 'f1', lat: 19.74, lng: -101.19, radius: 3200, name: 'Cerro de la Garza, Zamora', date: '14 feb 2024' },
  { id: 'f2', lat: 19.50, lng: -102.08, radius: 2800, name: 'Rancho El Nance, Apatzingán', date: '3 ene 2024' },
  { id: 'f3', lat: 19.31, lng: -101.96, radius: 4000, name: 'Camino Aguililla-Buenavista', date: '27 nov 2023' },
]

// Desaparición and trabajos as small circle markers
const CIRCLE_POINTS: PointData[] = [
  { id: 4, lat: 19.72, lng: -101.20, type: 'desaparicion', name: 'Centro Histórico, Zamora', date: '20 mar 2024' },
  { id: 5, lat: 19.68, lng: -101.15, type: 'desaparicion', name: 'Blvd. Luis Donaldo Colosio, Jacona', date: '12 mar 2023' },
  { id: 6, lat: 19.56, lng: -101.70, type: 'trabajos', name: 'Oferta Tlalpujahua – Pátzcuaro', date: '18 abr 2024' },
  { id: 7, lat: 19.42, lng: -102.06, type: 'trabajos', name: 'Reclutamiento Apatzingán Centro', date: '2 mar 2024' },
]

function MapInvalidator() {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [map])
  return null
}

const NOTIFICATIONS = [
  {
    id: 1,
    title: 'Nueva coincidencia detectada',
    desc: 'Un reporte en Morelia coincide con la descripción física registrada en el perfil.',
    time: 'hace 23 min',
  },
  {
    id: 2,
    title: 'Alerta zona noreste',
    desc: 'Se identificaron 2 nuevos puntos de interés en Zamora con características similares.',
    time: 'hace 1 h',
  },
  {
    id: 3,
    title: 'Cruce de señas confirmado',
    desc: 'Las señas particulares del reporte #4821 presentan un 82% de coincidencia con el perfil.',
    time: 'hace 3 h',
  },
  {
    id: 4,
    title: 'Nuevo registro disponible',
    desc: 'El RNPDNO publicó 14 nuevos registros para Michoacán. El agente los está analizando.',
    time: 'ayer',
  },
]

export function Home() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    fosas: true,
    desaparicion: true,
    trabajos: true,
  })

  function toggleFilter(key: FilterKey) {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: 'linear-gradient(160deg, #FDFAF7 0%, #F2E3D5 45%, rgba(242,195,133,0.35) 100%)' }}
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
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AgentDot size={22} pulse />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1A1A1A', letterSpacing: '-0.01em' }}>
            Rastro de Luz
          </span>
        </div>

        <button
          onClick={() => navigate('/profile')}
          aria-label="Ir al perfil"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
        >
          <UserCircle size={28} color="#F2921D" />
        </button>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Row 1: Map + sidebar */}
        <div style={{ display: 'flex', gap: 12, height: 'clamp(280px, 50vh, 420px)' }}>

          {/* Left sidebar — filters */}
          <GlassCard
            style={{
              width: 192,
              flexShrink: 0,
              padding: '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#6B6B6B' }}>
              Filtros del agente
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => {
                const active = filters[key]
                const a = CHIP_ACTIVE[key]
                const i = CHIP_INACTIVE[key]
                return (
                  <button
                    key={key}
                    onClick={() => toggleFilter(key)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 40,
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontFamily: 'var(--font-family)',
                      textAlign: 'left',
                      background: active ? a.bg : 'rgba(255,255,255,0.65)',
                      color: active ? a.text : i.text,
                      border: `1.5px solid ${active ? a.border : i.border}`,
                    }}
                  >
                    {FILTER_LABELS[key]}
                  </button>
                )
              })}
            </div>
          </GlassCard>

          {/* Map */}
          <div style={{ flex: 1, position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(242,195,133,0.35)' }}>
            <MapContainer
              center={[19.5665, -101.7068]}
              zoom={8}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
            >
              <MapInvalidator />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />

              {/* Fosas: blue shaded areas */}
              {filters.fosas && FOSAS_AREAS.map(a => (
                <Circle
                  key={a.id}
                  center={[a.lat, a.lng]}
                  radius={a.radius}
                  pathOptions={{
                    color: MAP_COLORS.fosas,
                    fillColor: MAP_COLORS.fosas,
                    fillOpacity: 0.18,
                    weight: 1.5,
                    opacity: 0.6,
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'var(--font-family)', minWidth: 160 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 4 }}>Posible fosa</div>
                      <div style={{ fontSize: 11, color: '#6B6B6B' }}>{a.date}</div>
                    </div>
                  </Popup>
                </Circle>
              ))}

              {/* Desaparición & trabajos: small colored circle markers */}
              {CIRCLE_POINTS.filter(p => filters[p.type]).map(p => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={7}
                  pathOptions={{
                    color: MAP_COLORS[p.type],
                    fillColor: MAP_COLORS[p.type],
                    fillOpacity: 0.85,
                    weight: 1.5,
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'var(--font-family)', minWidth: 160 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: MAP_COLORS[p.type], marginBottom: 4 }}>{FILTER_LABELS[p.type]}</div>
                      <div style={{ fontSize: 11, color: '#6B6B6B' }}>{p.date}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Map legend */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 1000,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(242,195,133,0.4)',
              borderRadius: 12,
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {/* Fosas: square area swatch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 14, height: 10, borderRadius: 3, background: 'rgba(59,130,246,0.25)', border: '1.5px solid #3B82F6', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#6B6B6B', fontFamily: 'var(--font-family)' }}>Posibles fosas</span>
              </div>
              {/* Desaparicion: red circle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#6B6B6B', fontFamily: 'var(--font-family)' }}>Puntos de desaparición</span>
              </div>
              {/* Trabajos: orange circle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F2921D', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#6B6B6B', fontFamily: 'var(--font-family)' }}>Trabajos falsos</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Notifications + AI Summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

          {/* Left: Notifications */}
          <div style={{ flex: '0 0 auto', width: 'min(100%, 55%)', minWidth: 280 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#6B6B6B', marginBottom: 10 }}>
              Notificaciones recientes
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {NOTIFICATIONS.map(n => (
                <div
                  key={n.id}
                  className="glass"
                  style={{
                    padding: '14px 18px',
                    borderLeft: '3px solid #F2921D',
                    borderRadius: '0 16px 16px 0',
                  }}
                >
                  <div style={{ flex: 1, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', marginBottom: 2 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.55 }}>
                      {n.desc}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: '#6B6B6B' }}>{n.time}</span>
                    <button className="btn-ghost" style={{ padding: '5px 14px', fontSize: 12 }}>
                      Ver detalle →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: AI Summary */}
          <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
            <div
              className="absolute pointer-events-none"
              style={{
                width: '120%',
                height: '120%',
                top: '-10%',
                left: '-10%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(242,146,29,0.10) 0%, transparent 68%)',
                zIndex: 0,
              }}
            />

            <GlassCard strong style={{ padding: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
              {/* Header */}
              <div style={{
                padding: '18px 22px 14px',
                borderBottom: '1px solid rgba(242,195,133,0.18)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>
                  Análisis del agente IA
                </span>
              </div>

              {/* Body */}
              <div style={{ padding: '18px 22px', background: 'rgba(242,227,213,0.22)' }}>
                <p style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.70, marginBottom: 18, textWrap: 'pretty' as 'pretty' }}>
                  Con base en los 12 reportes cruzados esta semana, la zona noreste del estado de Michoacán — particularmente los municipios de Zamora y Jacona — muestra la mayor concentración de coincidencias. Se han identificado 3 posibles fosas en un radio de 8 km y 2 puntos de desaparición reportados en los últimos 30 días con características similares al perfil registrado.
                </p>

                {/* Confidence bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#6B6B6B' }}>Nivel de confianza del análisis</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#F2921D' }}>78%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 40, background: 'rgba(242,195,133,0.30)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: '78%',
                        background: 'linear-gradient(90deg, #F2C185, #F2921D)',
                        borderRadius: 40,
                        animation: 'confFill 1.3s ease-out forwards',
                        ['--conf-width' as string]: '78%',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '11px 22px',
                background: 'rgba(242,195,133,0.07)',
                borderTop: '1px solid rgba(242,195,133,0.18)',
              }}>
                <span style={{ fontSize: 11, color: '#6B6B6B' }}>Última actualización: hace 14 minutos</span>
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  )
}
