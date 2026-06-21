import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { CuerpoQuery } from '../types'

const EMPTY = {
  sexo: 'HOMBRE', edad_min: '', edad_max: '', estatura_cm: '',
  senas: '', estado: '', fecha_hallazgo: '2026-06-30',
}

export function FindingForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (q: CuerpoQuery) => void
  onCancel: () => void
}) {
  const [f, setF] = useState(EMPTY)
  const set = (k: keyof typeof EMPTY) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value })

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      sexo: f.sexo || undefined,
      edad_min: f.edad_min ? Number(f.edad_min) : undefined,
      edad_max: f.edad_max ? Number(f.edad_max) : undefined,
      estatura_cm: f.estatura_cm ? Number(f.estatura_cm) : undefined,
      senas: f.senas ? f.senas.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      estado: f.estado || undefined,
      fecha_hallazgo: f.fecha_hallazgo || undefined,
    })
  }

  return (
    <form className="report-form" onSubmit={submit}>
      <label>Sexo
        <select value={f.sexo} onChange={set('sexo')}>
          <option>HOMBRE</option>
          <option>MUJER</option>
        </select>
      </label>
      <label>Edad mín<input type="number" value={f.edad_min} onChange={set('edad_min')} /></label>
      <label>Edad máx<input type="number" value={f.edad_max} onChange={set('edad_max')} /></label>
      <label>Estatura (cm)<input type="number" value={f.estatura_cm} onChange={set('estatura_cm')} /></label>
      <label>Señas (separadas por coma)
        <input value={f.senas} onChange={set('senas')} placeholder="TATUAJE LADO IZQUIERDO" />
      </label>
      <label>Estado<input value={f.estado} onChange={set('estado')} placeholder="TAMAULIPAS" /></label>
      <label>Fecha hallazgo<input value={f.fecha_hallazgo} onChange={set('fecha_hallazgo')} /></label>
      <div className="report-form-actions">
        <button type="submit" className="hilo-btn">Buscar coincidencias</button>
        <button type="button" className="hilo-btn hilo-btn-ghost" onClick={onCancel}>Volver</button>
      </div>
    </form>
  )
}
