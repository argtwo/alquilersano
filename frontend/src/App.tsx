import { useMemo, useState } from 'react'
import './App.css'
import MapView from './components/MapView'
import FiltrosPanel from './components/FiltrosPanel'
import AlertasPanel from './components/AlertasPanel'
import StatsBar from './components/StatsBar'
import BarrioDetalleModal from './components/BarrioDetalleModal'
import { useIERData } from './hooks/useIERData'
import { useStats } from './hooks/useStats'
import type { BarrioConIER, FiltrosMapaState } from './types'

const DEFAULT_FILTROS: FiltrosMapaState = {
  anyo: 2025,
  minIER: 0,
  maxIER: 100,
  riesgoDesahucio: 'TODOS',
  distrito: null,
  ciudad: 'valencia',
}

export default function App() {
  const [filtros, setFiltros] = useState<FiltrosMapaState>(DEFAULT_FILTROS)
  const [barrioSeleccionado, setBarrioSeleccionado] = useState<BarrioConIER | null>(null)

  const { data, loading, error } = useIERData(filtros)
  const stats = useStats(filtros.anyo)

  // Lista de distritos únicos para el selector de filtros
  const distritos = useMemo(() => {
    const set = new Set(data.map((b) => b.distrito).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [data])

  // Filtra en cliente por riesgo desahucio (el backend filtra por IER numérico)
  const barrisosFiltrados = useMemo(() => {
    if (filtros.riesgoDesahucio === 'TODOS') return data
    return data.filter((b) => b.ier?.riesgo_desahucio === filtros.riesgoDesahucio)
  }, [data, filtros.riesgoDesahucio])

  const handleBarrioClick = (barrio: BarrioConIER) => {
    setBarrioSeleccionado(barrio)
  }

  const handleFiltroChange = (f: Partial<FiltrosMapaState>) => {
    setFiltros((prev) => ({ ...prev, ...f }))
  }

  return (
    <div className="app">
      <StatsBar stats={stats} anyo={filtros.anyo} />

      <div className="app-body">
        <FiltrosPanel
          filtros={filtros}
          onChange={handleFiltroChange}
          distritos={distritos}
        />

        <div className="map-wrapper">
          {loading && <div className="map-loading">Cargando datos…</div>}
          {error && <div className="map-error">Error: {error}</div>}
          <MapView
            barrios={barrisosFiltrados}
            onBarrioClick={handleBarrioClick}
            anyo={filtros.anyo}
            ciudad={filtros.ciudad ?? 'valencia'}
          />
        </div>

        <AlertasPanel
          barrios={barrisosFiltrados}
          anyo={filtros.anyo}
          selectedId={barrioSeleccionado?.id ?? null}
          onSelect={handleBarrioClick}
        />
      </div>

      {barrioSeleccionado && (
        <BarrioDetalleModal
          barrio={barrioSeleccionado}
          ierMedioCiudad={stats?.ier_medio}
          onClose={() => setBarrioSeleccionado(null)}
        />
      )}
    </div>
  )
}
