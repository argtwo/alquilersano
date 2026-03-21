import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { IERScore } from '../types'

interface Props {
  score: IERScore
}

export default function ComponentesChart({ score }: Props) {
  const data = [
    {
      componente: 'Alquiler/Renta',
      valor: +(score.componente_alquiler * 100).toFixed(1),
    },
    {
      componente: 'Precariedad',
      valor: +(score.componente_precariedad * 100).toFixed(1),
    },
    {
      componente: 'Salud Mental',
      valor: +(score.componente_salud_mental * 100).toFixed(1),
    },
  ]

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="componente" tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(v: unknown) => [typeof v === 'number' ? v.toFixed(1) : '—', 'Peso normalizado']}
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Radar
          dataKey="valor"
          stroke="#2563eb"
          fill="#2563eb"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
