import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { BarrioConIER, FiltrosMapaState } from '../types'

export function useIERData(filtros: FiltrosMapaState) {
  const [data, setData] = useState<BarrioConIER[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api
      .getBarriosConIER({
        year: filtros.anyo,
        min_ier: filtros.minIER,
        max_ier: filtros.maxIER,
        distrito: filtros.distrito ?? undefined,
        ciudad: filtros.ciudad ?? undefined,
        signal: controller.signal,
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'CanceledError' && e.name !== 'AbortError') {
          setError(e.message ?? 'Error al cargar datos')
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [filtros])

  return { data, loading, error }
}
