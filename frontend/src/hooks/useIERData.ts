import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { BarrioConIER, FiltrosMapaState } from '../types'

export function useIERData(filtros: FiltrosMapaState) {
  const [data, setData] = useState<BarrioConIER[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .getBarriosConIER({
        year: filtros.anyo,
        min_ier: filtros.minIER,
        max_ier: filtros.maxIER,
        distrito: filtros.distrito ?? undefined,
        ciudad: filtros.ciudad ?? undefined,
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros])

  return { data, loading, error }
}
