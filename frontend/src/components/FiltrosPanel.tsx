import type { Ciudad, FiltrosMapaState } from '../types'

interface Props {
  filtros: FiltrosMapaState
  onChange: (f: Partial<FiltrosMapaState>) => void
  distritos: string[]
}

const ANYO_OPTIONS = [2020, 2021, 2022, 2023, 2024, 2025]

const CIUDADES: { value: Ciudad; label: string }[] = [
  { value: 'valencia',  label: 'Valencia' },
  { value: 'madrid',    label: 'Madrid' },
  { value: 'barcelona', label: 'Barcelona' },
]

const DEFAULT_FILTROS: FiltrosMapaState = {
  anyo: 2024,
  minIER: 0,
  maxIER: 100,
  riesgoDesahucio: 'TODOS',
  distrito: null,
  ciudad: 'valencia',
}

export default function FiltrosPanel({ filtros, onChange, distritos }: Props) {
  const isModified =
    filtros.anyo !== DEFAULT_FILTROS.anyo ||
    filtros.minIER !== DEFAULT_FILTROS.minIER ||
    filtros.maxIER !== DEFAULT_FILTROS.maxIER ||
    filtros.riesgoDesahucio !== DEFAULT_FILTROS.riesgoDesahucio ||
    filtros.distrito !== DEFAULT_FILTROS.distrito ||
    filtros.ciudad !== DEFAULT_FILTROS.ciudad

  return (
    <aside className="panel filtros-panel">
      <div className="panel-header">
        <h2>Filtros</h2>
      </div>
      <div className="panel-body">

        {/* Ciudad */}
        <div className="filtro-group">
          <span className="filtro-label">Ciudad</span>
          <select
            className="filtro-select"
            value={filtros.ciudad ?? 'valencia'}
            onChange={(e) => onChange({ ciudad: e.target.value as Ciudad, distrito: null })}
          >
            {CIUDADES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Año */}
        <div className="filtro-group">
          <span className="filtro-label">Año</span>
          <select
            className="filtro-select"
            value={filtros.anyo}
            onChange={(e) => onChange({ anyo: +e.target.value })}
          >
            {ANYO_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Rango IER mínimo */}
        <div className="filtro-group filtro-range">
          <span className="filtro-label">IER mínimo — {filtros.minIER}</span>
          <input
            type="range"
            min={0}
            max={filtros.maxIER - 1}
            value={filtros.minIER}
            onChange={(e) => onChange({ minIER: +e.target.value })}
          />
          <div className="filtro-range-row">
            <span>0</span>
            <span>{filtros.maxIER - 1}</span>
          </div>
        </div>

        {/* Rango IER máximo */}
        <div className="filtro-group filtro-range">
          <span className="filtro-label">IER máximo — {filtros.maxIER}</span>
          <input
            type="range"
            min={filtros.minIER + 1}
            max={100}
            value={filtros.maxIER}
            onChange={(e) => onChange({ maxIER: +e.target.value })}
          />
          <div className="filtro-range-row">
            <span>{filtros.minIER + 1}</span>
            <span>100</span>
          </div>
        </div>

        {/* Riesgo desahucio */}
        <div className="filtro-group">
          <span className="filtro-label">Riesgo desahucio</span>
          <select
            className="filtro-select"
            value={filtros.riesgoDesahucio}
            onChange={(e) =>
              onChange({ riesgoDesahucio: e.target.value as FiltrosMapaState['riesgoDesahucio'] })
            }
          >
            <option value="TODOS">Todos</option>
            <option value="BAJO">Bajo</option>
            <option value="MEDIO">Medio</option>
            <option value="ALTO">Alto</option>
            <option value="CRÍTICO">Crítico</option>
          </select>
        </div>

        {/* Distrito */}
        <div className="filtro-group">
          <span className="filtro-label">Distrito</span>
          <select
            className="filtro-select"
            value={filtros.distrito ?? ''}
            onChange={(e) => onChange({ distrito: e.target.value || null })}
          >
            <option value="">Todos los distritos</option>
            {distritos.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Reset */}
        {isModified && (
          <button
            className="filtro-reset"
            onClick={() => onChange(DEFAULT_FILTROS)}
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </aside>
  )
}
