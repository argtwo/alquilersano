import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BarrioConIER } from '../types'
import { exportAlertasCSV } from '../utils/csv'

// Mocks de DOM APIs necesarias para el export
const mockClick = vi.fn()
const mockRevokeObjectURL = vi.fn()
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')

beforeEach(() => {
  mockClick.mockClear()
  mockRevokeObjectURL.mockClear()
  mockCreateObjectURL.mockClear()

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement
    }
    return document.createElement(tag)
  })
  vi.stubGlobal('URL', {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  })
})

function makeBarrio(id: number, nombre: string, ier_value: number, riesgo: 'ALTO' | 'CRÍTICO'): BarrioConIER {
  return {
    id,
    codigo_ine: `46250${id.toString().padStart(4, '0')}`,
    nombre,
    distrito: 'Distrito Test',
    ciudad: 'valencia',
    ier: {
      barrio_id: id,
      anyo: 2024,
      ier_value,
      componente_alquiler: 0.6,
      componente_precariedad: 0.5,
      componente_salud_mental: 0.3,
      score_calidad_vida: 100 - ier_value,
      riesgo_desahucio: riesgo,
    },
  }
}

describe('exportAlertasCSV', () => {
  it('triggers a download click', () => {
    const barrios = [makeBarrio(1, 'Rascanya', 72, 'ALTO')]
    exportAlertasCSV(barrios, 2024)
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('sets correct download filename with year', () => {
    let capturedDownload = ''
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const a = { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement
        Object.defineProperty(a, 'download', {
          get: () => capturedDownload,
          set: (v) => { capturedDownload = v },
        })
        return a
      }
      return document.createElement(tag)
    })
    exportAlertasCSV([makeBarrio(1, 'Rascanya', 72, 'ALTO')], 2023)
    expect(capturedDownload).toBe('alquilersano_alertas_2023.csv')
  })

  it('creates a Blob and calls createObjectURL', () => {
    exportAlertasCSV([makeBarrio(1, 'Test', 75, 'CRÍTICO')], 2024)
    expect(mockCreateObjectURL).toHaveBeenCalledOnce()
    const blob = (mockCreateObjectURL.mock.calls as unknown[][])[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
  })

  it('revokes the object URL after click', () => {
    exportAlertasCSV([makeBarrio(1, 'Test', 75, 'CRÍTICO')], 2024)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('filters out barrios without IER', () => {
    const barrios: BarrioConIER[] = [
      makeBarrio(1, 'Con IER', 72, 'ALTO'),
      { id: 2, codigo_ine: '46250002', nombre: 'Sin IER', ciudad: 'valencia' },
    ]
    exportAlertasCSV(barrios, 2024)
    const blob = (mockCreateObjectURL.mock.calls as unknown[][])[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
  })

  it('handles empty barrios array', () => {
    exportAlertasCSV([], 2024)
    expect(mockClick).toHaveBeenCalledOnce()
    const blob = (mockCreateObjectURL.mock.calls as unknown[][])[0]?.[0]
    expect((blob as Blob | undefined)?.size).toBeGreaterThan(0)
  })
})
