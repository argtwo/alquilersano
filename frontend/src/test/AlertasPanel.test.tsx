import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AlertasPanel from '../components/AlertasPanel'
import type { BarrioConIER } from '../types'
import * as csvUtils from '../utils/csv'

function makeBarrio(
  id: number,
  nombre: string,
  ier_value: number,
  riesgo: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO',
): BarrioConIER {
  return {
    id,
    codigo_ine: `46250${id.toString().padStart(4, '0')}`,
    nombre,
    distrito: 'Distrito Test',
    ciudad: 'valencia' as const,
    ier: {
      barrio_id: id,
      anyo: 2024,
      ier_value,
      componente_alquiler: 0.5,
      componente_precariedad: 0.4,
      componente_salud_mental: 0.3,
      score_calidad_vida: 100 - ier_value,
      riesgo_desahucio: riesgo,
    },
  }
}

describe('AlertasPanel', () => {
  it('shows heading "Alertas"', () => {
    render(
      <AlertasPanel barrios={[]} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText('Alertas')).toBeInTheDocument()
  })

  it('shows "Sin alertas" message when no high-risk barrios', () => {
    const barrios = [makeBarrio(1, 'Ejemplo', 30, 'BAJO')]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText(/sin alertas/i)).toBeInTheDocument()
  })

  it('shows ALTO barrios in the list', () => {
    const barrios = [makeBarrio(1, 'Rascanya', 73, 'ALTO')]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText('Rascanya')).toBeInTheDocument()
  })

  it('shows CRÍTICO barrios in the list', () => {
    const barrios = [makeBarrio(1, 'Patraix', 82, 'CRÍTICO')]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText('Patraix')).toBeInTheDocument()
  })

  it('does NOT show BAJO or MEDIO barrios', () => {
    const barrios = [
      makeBarrio(1, 'Barrio Bajo', 20, 'BAJO'),
      makeBarrio(2, 'Barrio Medio', 46, 'MEDIO'),
    ]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.queryByText('Barrio Bajo')).not.toBeInTheDocument()
    expect(screen.queryByText('Barrio Medio')).not.toBeInTheDocument()
  })

  it('sorts barrios by IER descending', () => {
    const barrios = [
      makeBarrio(1, 'Primero IER 71', 71, 'ALTO'),
      makeBarrio(2, 'Segundo IER 85', 85, 'CRÍTICO'),
      makeBarrio(3, 'Tercero IER 77', 77, 'ALTO'),
    ]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    const cards = screen.getAllByText(/IER \d+\.\d+/)
    // El primero en el DOM debe ser el de IER más alto (85)
    expect(cards[0].textContent).toContain('85')
  })

  it('calls onSelect when a card is clicked', () => {
    const onSelect = vi.fn()
    const barrios = [makeBarrio(1, 'Rascanya', 73, 'ALTO')]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={onSelect} />
    )
    fireEvent.click(screen.getByText('Rascanya'))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect.mock.calls[0][0].id).toBe(1)
  })

  it('shows export button when there are alertas', () => {
    const barrios = [makeBarrio(1, 'Rascanya', 73, 'ALTO')]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText(/exportar csv/i)).toBeInTheDocument()
  })

  it('does not show export button when no alertas', () => {
    render(
      <AlertasPanel barrios={[]} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.queryByText(/exportar csv/i)).not.toBeInTheDocument()
  })

  it('calls exportAlertasCSV when export button is clicked', () => {
    const exportSpy = vi.spyOn(csvUtils, 'exportAlertasCSV').mockImplementation(() => {})
    const barrios = [makeBarrio(1, 'Rascanya', 73, 'ALTO')]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    fireEvent.click(screen.getByText(/exportar csv/i))
    expect(exportSpy).toHaveBeenCalledOnce()
    exportSpy.mockRestore()
  })

  it('highlights selected barrio card', () => {
    const barrios = [makeBarrio(1, 'Rascanya', 73, 'ALTO')]
    const { container } = render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={1} onSelect={vi.fn()} />
    )
    const card = container.querySelector('.alerta-card.selected')
    expect(card).not.toBeNull()
  })

  it('shows correct count in header', () => {
    const barrios = [
      makeBarrio(1, 'Barrio A', 73, 'ALTO'),
      makeBarrio(2, 'Barrio B', 82, 'CRÍTICO'),
    ]
    render(
      <AlertasPanel barrios={barrios} anyo={2024} selectedId={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText(/2 barrios en riesgo/i)).toBeInTheDocument()
  })
})
