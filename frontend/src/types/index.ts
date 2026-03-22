export type Ciudad = 'valencia' | 'valencia_provincia' | 'madrid' | 'barcelona'

export interface Barrio {
  id: number
  codigo_ine: string
  nombre: string
  nombre_val?: string
  distrito?: string
  distrito_num?: number
  ciudad: Ciudad
  geometria?: object // GeoJSON MultiPolygon serializado
}

export interface IERScore {
  barrio_id: number
  anyo: number
  ier_value: number
  componente_alquiler: number
  componente_precariedad: number
  componente_salud_mental: number
  score_calidad_vida: number
  riesgo_desahucio: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO'
}

export interface BarrioConIER extends Barrio {
  ier?: IERScore
}

export interface BarrioDetalle extends BarrioConIER {
  historico: IERScore[]
}

export type RiesgoDesahucio = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO'

export interface FiltrosMapaState {
  anyo: number
  minIER: number
  maxIER: number
  riesgoDesahucio: RiesgoDesahucio | 'TODOS'
  distrito: string | null
  ciudad: Ciudad | null
}

export interface CityStats {
  anyo: number
  total_barrios: number
  ier_medio: number
  ier_min: number
  ier_max: number
  distribucion_riesgo: {
    CRÍTICO: number
    ALTO: number
    MEDIO: number
    BAJO: number
  }
}
