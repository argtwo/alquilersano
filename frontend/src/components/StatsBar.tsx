import type { CityStats } from '../types'
import { RIESGO_COLORS } from '../utils/ier'

interface Props {
  stats: CityStats | null
  anyo: number
}

export default function StatsBar({ stats, anyo }: Props) {
  return (
    <header className="app-header">
      <h1>AlquilerSano</h1>
      <span className="tagline">Índice de Estrés Residencial por barrio · Valencia {anyo}</span>

      {stats && (
        <div className="stats-bar">
          <div className="stat-divider" />

          <div className="stat-item">
            <span className="stat-value">{stats.ier_medio.toFixed(1)}</span>
            <span className="stat-label">IER medio</span>
          </div>

          <div className="stat-divider" />

          <div className="stat-item">
            <span className="stat-value">{stats.total_barrios}</span>
            <span className="stat-label">Barrios</span>
          </div>

          <div className="stat-divider" />

          <div className="stat-item">
            <span
              className="stat-value"
              style={{ color: RIESGO_COLORS['CRÍTICO'] }}
            >
              {stats.distribucion_riesgo.CRÍTICO}
            </span>
            <span className="stat-label">Crítico</span>
          </div>

          <div className="stat-item">
            <span
              className="stat-value"
              style={{ color: RIESGO_COLORS['ALTO'] }}
            >
              {stats.distribucion_riesgo.ALTO}
            </span>
            <span className="stat-label">Alto</span>
          </div>
        </div>
      )}
    </header>
  )
}
