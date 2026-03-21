import axios from 'axios'
import type { BarrioConIER, BarrioDetalle, CityStats, IERScore } from '../types'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

export const api = {
  getBarriosConIER: (params: {
    year?: number
    min_ier?: number
    max_ier?: number
    distrito?: string
    ciudad?: string
  }) => client.get<BarrioConIER[]>('/api/v1/ier', { params }).then((r) => r.data),

  getBarrioDetalle: (id: number) =>
    client.get<BarrioDetalle>(`/api/v1/barrios/${id}`).then((r) => r.data),

  getBarrioHistorico: (id: number) =>
    client.get<IERScore[]>(`/api/v1/ier/${id}/historico`).then((r) => r.data),

  getAlertas: (year: number) =>
    client.get<BarrioConIER[]>('/api/v1/alertas', { params: { year } }).then((r) => r.data),

  getStats: (year: number) =>
    client.get<CityStats>('/api/v1/stats', { params: { year } }).then((r) => r.data),
}
