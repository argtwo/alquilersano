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

// Componentes IER Fase 2: valores en escala real (0-50 / 0-30 / 0-20)
export const COMPONENTES_CONFIG = [
  { key: 'componente_alquiler',    label: 'Presión inversora',      max: 50, color: '#ef4444' },
  { key: 'componente_precariedad', label: 'Vulnerabilidad económica', max: 30, color: '#f97316' },
  { key: 'componente_salud_mental',label: 'Vulnerabilidad demográfica', max: 20, color: '#eab308' },
] as const

export default function ComponentesChart({ score }: Props) {
  const data = COMPONENTES_CONFIG.map(({ key, label }) => ({
    componente: label,
    valor: +(score[key] ?? 0),
  }))

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
