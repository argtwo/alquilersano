import type { BarrioConIER } from '../types'
import { RIESGO_COLORS } from '../utils/ier'
import { exportAlertasCSV } from '../utils/csv'

interface Props {
  barrios: BarrioConIER[]
  anyo: number
  selectedId: number | null
  onSelect: (barrio: BarrioConIER) => void
}

export default function AlertasPanel({ barrios, anyo, selectedId, onSelect }: Props) {
  const alertas = barrios
    .filter((b) => b.ier && ['ALTO', 'CRÍTICO'].includes(b.ier.riesgo_desahucio))
    .sort((a, b) => (b.ier?.ier_value ?? 0) - (a.ier?.ier_value ?? 0))

  return (
    <aside className="panel panel-right alertas-panel">
      <div className="panel-header">
        <h2>Alertas</h2>
        <div className="alertas-count">
          {alertas.length} barrios en riesgo alto/crítico
        </div>
      </div>
      <div className="panel-body">
        {alertas.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Sin alertas con los filtros actuales.
          </p>
        )}

        {alertas.map((b) => {
          const color = RIESGO_COLORS[b.ier!.riesgo_desahucio]
          return (
            <div
              key={b.id}
              className={`alerta-card${selectedId === b.id ? ' selected' : ''}`}
              style={{ borderLeftColor: color }}
              onClick={() => onSelect(b)}
            >
              <div className="alerta-nombre">{b.nombre}</div>
              <div className="alerta-meta">
                <span
                  className="alerta-riesgo-badge"
                  style={{ background: color }}
                >
                  {b.ier!.riesgo_desahucio}
                </span>
                <span className="alerta-ier">IER {b.ier!.ier_value.toFixed(1)}</span>
              </div>
              {b.distrito && (
                <div className="alerta-distrito">{b.distrito}</div>
              )}
            </div>
          )
        })}

        {alertas.length > 0 && (
          <button
            className="btn-export"
            onClick={() => exportAlertasCSV(alertas, anyo)}
          >
            Exportar CSV ({alertas.length})
          </button>
        )}
      </div>
    </aside>
  )
}
