import type { CityStats } from '../types'
import { RIESGO_COLORS } from '../utils/ier'

interface Props {
  stats: CityStats | null
}

export default function KPIRow({ stats }: Props) {
  if (!stats) return null

  const items = [
    { value: stats.distribucion_riesgo.BAJO, label: 'Bajo', color: RIESGO_COLORS['BAJO'] },
    { value: stats.distribucion_riesgo.MEDIO, label: 'Medio', color: RIESGO_COLORS['MEDIO'] },
    { value: stats.distribucion_riesgo.ALTO, label: 'Alto', color: RIESGO_COLORS['ALTO'] },
    { value: stats.distribucion_riesgo['CRÍTICO'], label: 'Crítico', color: RIESGO_COLORS['CRÍTICO'] },
  ]

  return (
    <div className="kpi-row">
      {items.map(({ value, label, color }) => (
        <div className="kpi-card" key={label}>
          <div className="kpi-value" style={{ color }}>{value}</div>
          <div className="kpi-label">{label}</div>
        </div>
      ))}
    </div>
  )
}
