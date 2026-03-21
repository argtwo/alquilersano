import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { IERScore } from '../types'
import { ierToColor } from '../utils/ier'

interface Props {
  historico: IERScore[]
  ierMedioCiudad?: number
}

export default function IERHistoricoChart({ historico, ierMedioCiudad }: Props) {
  if (historico.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        Sin datos históricos disponibles.
      </p>
    )
  }

  const data = historico.map((s) => ({
    anyo: s.anyo,
    IER: +s.ier_value.toFixed(1),
    color: ierToColor(s.ier_value),
  }))

  const lastIER = data.at(-1)?.IER ?? 50

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="anyo" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: unknown) => [typeof v === 'number' ? v.toFixed(1) : '—', 'IER']}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        {ierMedioCiudad != null && (
          <ReferenceLine
            y={ierMedioCiudad}
            stroke="#94a3b8"
            strokeDasharray="4 3"
            label={{ value: `Media ${ierMedioCiudad.toFixed(1)}`, fontSize: 10, fill: '#94a3b8' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="IER"
          stroke={ierToColor(lastIER)}
          strokeWidth={2.5}
          dot={{ r: 4, fill: ierToColor(lastIER), strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
