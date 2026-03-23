import { useState } from 'react'
import type { BarrioConIER } from '../types'
import { ierToColor, RIESGO_COLORS } from '../utils/ier'

interface Props {
  barrios: BarrioConIER[]
  anyo: number
  onBarrioClick: (barrio: BarrioConIER) => void
}

type SortKey = 'ier' | 'nombre' | 'distrito' | 'alquiler' | 'econom' | 'dem'

export default function RankingView({ barrios, anyo, onBarrioClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('ier')
  const [sortAsc, setSortAsc] = useState(false)

  const conIER = barrios.filter((b) => b.ier != null)

  const sorted = [...conIER].sort((a, b) => {
    let va: number | string = 0
    let vb: number | string = 0
    if (sortKey === 'ier')       { va = a.ier!.ier_value;             vb = b.ier!.ier_value }
    if (sortKey === 'nombre')    { va = a.nombre;                      vb = b.nombre }
    if (sortKey === 'distrito')  { va = a.distrito ?? '';               vb = b.distrito ?? '' }
    if (sortKey === 'alquiler')  { va = a.ier!.componente_alquiler ?? 0; vb = b.ier!.componente_alquiler ?? 0 }
    if (sortKey === 'econom')    { va = a.ier!.componente_precariedad ?? 0; vb = b.ier!.componente_precariedad ?? 0 }
    if (sortKey === 'dem')       { va = a.ier!.componente_salud_mental ?? 0; vb = b.ier!.componente_salud_mental ?? 0 }
    if (typeof va === 'string')  return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
    return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number)
  })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p)
    else { setSortKey(key); setSortAsc(key === 'nombre' || key === 'distrito') }
  }

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => handleSort(k)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  )

  return (
    <div className="ranking-view">
      <div className="ranking-header">
        <span className="ranking-title">Ranking — {anyo}</span>
        <span className="ranking-count">{conIER.length} barrios/municipios</span>
      </div>

      <div className="ranking-table-wrapper">
        <table className="ranking-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <Th k="nombre"   label="Barrio / Municipio" />
              <Th k="distrito" label="Distrito / Provincia" />
              <Th k="ier"      label="IER" />
              <th>Riesgo</th>
              <Th k="alquiler" label="Presión (IBI)" />
              <Th k="econom"   label="Econ." />
              <Th k="dem"      label="Dem." />
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => {
              const ier = b.ier!
              return (
                <tr
                  key={b.id}
                  onClick={() => onBarrioClick(b)}
                  className="ranking-row"
                >
                  <td className="ranking-pos">{i + 1}</td>
                  <td className="ranking-nombre">{b.nombre}</td>
                  <td className="ranking-distrito">{b.distrito ?? '—'}</td>
                  <td style={{ fontWeight: 700, color: ierToColor(ier.ier_value) }}>
                    {ier.ier_value.toFixed(1)}
                  </td>
                  <td>
                    <span
                      className="riesgo-badge"
                      style={{ background: RIESGO_COLORS[ier.riesgo_desahucio] }}
                    >
                      {ier.riesgo_desahucio}
                    </span>
                  </td>
                  <td>{(ier.componente_alquiler ?? 0).toFixed(1)}</td>
                  <td>{(ier.componente_precariedad ?? 0).toFixed(1)}</td>
                  <td>{(ier.componente_salud_mental ?? 0).toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
