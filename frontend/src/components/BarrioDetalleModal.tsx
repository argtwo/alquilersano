import { useEffect } from 'react'
import type { BarrioConIER } from '../types'
import { useBarrioDetalle } from '../hooks/useBarrioDetalle'
import { ierToColor, ierToLabel, RIESGO_COLORS } from '../utils/ier'
import IERHistoricoChart from './IERHistoricoChart'
import ComponentesChart, { COMPONENTES_CONFIG } from './ComponentesChart'

interface Props {
  barrio: BarrioConIER
  ierMedioCiudad?: number
  onClose: () => void
}

export default function BarrioDetalleModal({ barrio, ierMedioCiudad, onClose }: Props) {
  const { data, loading } = useBarrioDetalle(barrio.id)

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const ier = barrio.ier
  const detalle = data

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Cabecera */}
        <div className="modal-header">
          <div>
            <h2>{barrio.nombre}</h2>
            {barrio.nombre_val && barrio.nombre_val !== barrio.nombre && (
              <div className="subtitle">{barrio.nombre_val}</div>
            )}
            {barrio.distrito && (
              <div className="subtitle">{barrio.distrito}</div>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Cuerpo */}
        <div className="modal-body">

          {/* Badges IER */}
          {ier && (
            <div className="ier-badge-row">
              <div className="ier-badge">
                <div
                  className="ier-badge-value"
                  style={{ color: ierToColor(ier.ier_value) }}
                >
                  {ier.ier_value.toFixed(1)}
                </div>
                <div className="ier-badge-label">Índice IER — {ierToLabel(ier.ier_value)}</div>
              </div>

              <div className="ier-badge">
                <div
                  className="ier-badge-value"
                  style={{ color: RIESGO_COLORS[ier.riesgo_desahucio] }}
                >
                  {ier.riesgo_desahucio}
                </div>
                <div className="ier-badge-label">Riesgo desahucio</div>
              </div>

              <div className="ier-badge">
                <div className="ier-badge-value" style={{ color: '#2563eb' }}>
                  {ier.score_calidad_vida?.toFixed(1) ?? '—'}
                </div>
                <div className="ier-badge-label">Calidad de vida</div>
              </div>
            </div>
          )}

          {/* Gráficos */}
          {loading && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Cargando histórico…</p>
          )}

          {!loading && detalle && (
            <div className="charts-row">
              <div className="chart-section">
                <h3>Evolución IER 2020–2025</h3>
                <IERHistoricoChart
                  historico={detalle.historico}
                  ierMedioCiudad={ierMedioCiudad}
                />
              </div>

              {ier && (
                <div className="chart-section">
                  <h3>Componentes IER ({ier.anyo})</h3>
                  <ComponentesChart score={ier} />
                </div>
              )}
            </div>
          )}

          {/* Desglose componentes IER */}
          {ier && (
            <div style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              fontSize: 13,
            }}>
              <strong>Desglose del IER ({ier.anyo})</strong>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COMPONENTES_CONFIG.map(({ key, label, max, color }) => {
                  const val = ier[key] ?? 0
                  const pct = Math.min(100, (val / max) * 100)
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span style={{ fontWeight: 600 }}>{val.toFixed(1)} / {max}</span>
                      </div>
                      <div style={{ background: 'var(--border)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Comparativa con la media */}
          {ier && ierMedioCiudad != null && (
            <div style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              fontSize: 13,
            }}>
              <strong>Comparativa con la ciudad</strong>
              <div style={{ marginTop: 8, display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    IER de este barrio
                  </div>
                  <div style={{ fontWeight: 700, color: ierToColor(ier.ier_value), fontSize: 16 }}>
                    {ier.ier_value.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    Media ciudad
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {ierMedioCiudad.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    Diferencia
                  </div>
                  <div style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: ier.ier_value > ierMedioCiudad ? '#ef4444' : '#22c55e'
                  }}>
                    {ier.ier_value > ierMedioCiudad ? '+' : ''}
                    {(ier.ier_value - ierMedioCiudad).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
