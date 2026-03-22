import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { CityStats } from '../types'

export function useStats(anyo: number, ciudad?: string | null) {
  const [data, setData] = useState<CityStats | null>(null)

  useEffect(() => {
    api.getStats(anyo, ciudad ?? undefined).then(setData).catch(() => null)
  }, [anyo, ciudad])

  return data
}
