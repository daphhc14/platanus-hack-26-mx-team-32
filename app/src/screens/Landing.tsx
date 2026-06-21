import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api'
import { AgentDot } from '../components/AgentDot'
import { fetchPersonsOnMap, type PersonOnMap } from '../features/landing/api'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const MAP_CENTER = { lat: 23.6345, lng: -102.5528 }
const MAP_ZOOM = 5
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' }

function fullName(p: PersonOnMap) {
  return [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' ') || 'Sin nombre'
}

function formatDate(date: string | null) {
  if (!date) return 'Fecha no registrada'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'Fecha no registrada'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ageText(p: PersonOnMap) {
  const age = p.edad_actual ?? p.edad_hechos
  return age ? `${age} años` : 'Edad no registrada'
}

function locationText(p: PersonOnMap) {
  return [p.municipio, p.estado].filter(Boolean).join(', ') || 'Ubicación no registrada'
}

function statusText(p: PersonOnMap) {
  return p.estatus_victima ?? 'Estatus no registrado'
}

function getMarkerIcon(): google.maps.Icon {
  return {
    url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#F2921D" stroke="#fff" stroke-width="1.5"/></svg>`
    ),
    scaledSize: new google.maps.Size(16, 16),
    anchor: new google.maps.Point(8, 8),
  }
}

function HoverCard({ person }: { person: PersonOnMap }) {
  return (
    <div style={{ fontFamily: 'var(--font-family)', minWidth: 180, maxWidth: 260 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A1A', marginBottom: 4, lineHeight: 1.3 }}>
        {fullName(person)}
      </div>
      <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 2 }}>
        {ageText(person)} · {locationText(person)}
      </div>
      <div style={{ fontSize: 11, color: '#F2921D', fontWeight: 500, marginBottom: 6 }}>
        {formatDate(person.fecha_hechos)}
      </div>
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 40,
        background: 'rgba(242,146,29,0.12)',
        border: '1px solid rgba(242,146,29,0.35)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: '#9A5B12',
      }}>
        {statusText(person)}
      </span>
    </div>
  )
}

export function Landing() {
  const navigate = useNavigate()
  const [persons, setPersons] = useState<PersonOnMap[]>([])
  const [visible, setVisible] = useState<PersonOnMap[]>([])
  const [hovered, setHovered] = useState<PersonOnMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  })

  useEffect(() => {
    fetchPersonsOnMap()
      .then((data: PersonOnMap[]) => {
        setPersons(data)
        setVisible(data)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos')
        setLoading(false)
      })
  }, [])

  const updateVisible = useCallback(() => {
    const map = mapRef.current
    if (!map || persons.length === 0) return
    const bounds = map.getBounds()
    if (!bounds) return
    setVisible(persons.filter(p => bounds.contains(new google.maps.LatLng(p.lat, p.lng))))
  }, [persons])

  const markerIcon = useMemo(() => isLoaded ? getMarkerIcon() : null, [isLoaded])

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden' }}>
      {/* Navbar */}
      <header className="glass-strong" style={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 20,
        height: 58,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AgentDot size={22} pulse />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1A1A1A', letterSpacing: '-0.01em' }}>
            Rastro de Luz
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" style={{ padding: '8px 20px', fontSize: 13 }} onClick={() => navigate('/login')}>
            Entrar
          </button>
          <button className="btn-primary" style={{ padding: '8px 20px', fontSize: 13 }} onClick={() => navigate('/home')}>
            App
          </button>
        </div>
      </header>

      {/* Stats panel */}
      <div className="glass" style={{
        position: 'absolute',
        top: 90,
        left: 16,
        zIndex: 20,
        borderRadius: 16,
        padding: '16px 18px',
        minWidth: 180,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 8 }}>
          Personas en el mapa
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: '#6B6B6B' }}>Cargando…</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: '#c0392b' }}>{error}</div>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1A1A1A', lineHeight: 1 }}>{persons.length.toLocaleString('es-MX')}</div>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
              {visible.length.toLocaleString('es-MX')} visibles en esta vista
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="glass" style={{
        position: 'absolute',
        bottom: 24,
        left: 16,
        zIndex: 20,
        borderRadius: 16,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F2921D', border: '2px solid #fff' }} />
        <span style={{ fontSize: 12, color: '#1A1A1A', fontWeight: 500 }}>Personas desaparecidas</span>
      </div>

      {/* Map */}
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          onLoad={map => {
            mapRef.current = map
            updateVisible()
          }}
          onIdle={updateVisible}
          options={{
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            zoomControl: true,
          }}
        >
          {visible.map(p => (
            markerIcon && (
              <MarkerF
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                icon={markerIcon}
                onMouseOver={() => setHovered(p)}
                onMouseOut={() => setHovered(null)}
              />
            )
          ))}
          {hovered && (
            <InfoWindowF
              position={{ lat: hovered.lat, lng: hovered.lng }}
              onCloseClick={() => setHovered(null)}
            >
              <HoverCard person={hovered} />
            </InfoWindowF>
          )}
        </GoogleMap>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDFAF7' }}>
          <span style={{ color: '#6B6B6B', fontSize: 14 }}>Cargando mapa…</span>
        </div>
      )}
    </div>
  )
}
