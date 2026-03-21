import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { BarrioDetalle } from '../types'

export function useBarrioDetalle(barrioId: number | null) {
  const [data, setData] = useState<BarrioDetalle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (barrioId === null) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    api
      .getBarrioDetalle(barrioId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [barrioId])

  return { data, loading, error }
}
