import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { CityStats } from '../types'

export function useStats(anyo: number) {
  const [data, setData] = useState<CityStats | null>(null)

  useEffect(() => {
    api.getStats(anyo).then(setData).catch(() => null)
  }, [anyo])

  return data
}
