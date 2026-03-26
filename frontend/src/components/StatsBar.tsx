import type { CityStats } from '../types'
import { RIESGO_COLORS } from '../utils/ier'

// Total de barrios/municipios en DB por ciudad (incluyendo los sin datos ADRH)
const TOTAL_GEOMETRIAS: Record<string, number> = {
  valencia:           88,
  valencia_provincia: 542,
}

interface Props {
  stats: CityStats | null
  anyo: number
  ciudad?: string
  theme?: 'dark' | 'light'
  onThemeToggle?: () => void
}

export default function StatsBar({ stats, anyo, ciudad, theme, onThemeToggle }: Props) {
  const totalGeo = ciudad ? (TOTAL_GEOMETRIAS[ciudad] ?? null) : null
  const cobertura = stats && totalGeo
    ? `${stats.total_barrios}/${totalGeo}`
    : stats?.total_barrios?.toString() ?? null
  const etiquetaUnidad = ciudad === 'valencia_provincia' ? 'Municipios' : 'Barrios'

  return (
    <header className="app-header">
      <h1>AlquilerSano</h1>
      <span className="tagline">Índice de Estrés Residencial · {anyo}</span>
      {onThemeToggle && (
        <button className="theme-toggle" onClick={onThemeToggle} title="Cambiar tema">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      )}

      {stats && (
        <div className="stats-bar">
          <div className="stat-divider" />

          <div className="stat-item">
            <span className="stat-value">{stats.ier_medio.toFixed(1)}</span>
            <span className="stat-label">IER medio</span>
          </div>

          <div className="stat-divider" />

          <div className="stat-item">
            <span className="stat-value">{cobertura}</span>
            <span className="stat-label">{etiquetaUnidad} con datos</span>
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
