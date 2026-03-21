import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FiltrosPanel from '../components/FiltrosPanel'
import type { FiltrosMapaState } from '../types'

const DEFAULT_FILTROS: FiltrosMapaState = {
  anyo: 2024,
  minIER: 0,
  maxIER: 100,
  riesgoDesahucio: 'TODOS',
  distrito: null,
  ciudad: 'valencia',
}

describe('FiltrosPanel', () => {
  it('renders the panel with heading', () => {
    render(
      <FiltrosPanel filtros={DEFAULT_FILTROS} onChange={vi.fn()} distritos={[]} />
    )
    expect(screen.getByText('Filtros')).toBeInTheDocument()
  })

  it('shows year selector with default value', () => {
    render(
      <FiltrosPanel filtros={DEFAULT_FILTROS} onChange={vi.fn()} distritos={[]} />
    )
    const yearSelect = screen.getByDisplayValue('2024')
    expect(yearSelect).toBeInTheDocument()
  })

  it('calls onChange when year changes', () => {
    const onChange = vi.fn()
    render(
      <FiltrosPanel filtros={DEFAULT_FILTROS} onChange={onChange} distritos={[]} />
    )
    const yearSelect = screen.getByDisplayValue('2024')
    fireEvent.change(yearSelect, { target: { value: '2022' } })
    expect(onChange).toHaveBeenCalledWith({ anyo: 2022 })
  })

  it('does NOT show Limpiar filtros button when defaults', () => {
    render(
      <FiltrosPanel filtros={DEFAULT_FILTROS} onChange={vi.fn()} distritos={[]} />
    )
    expect(screen.queryByText('Limpiar filtros')).not.toBeInTheDocument()
  })

  it('shows Limpiar filtros button when filtros are modified', () => {
    const modifiedFiltros = { ...DEFAULT_FILTROS, anyo: 2022 }
    render(
      <FiltrosPanel filtros={modifiedFiltros} onChange={vi.fn()} distritos={[]} />
    )
    expect(screen.getByText('Limpiar filtros')).toBeInTheDocument()
  })

  it('shows Limpiar filtros when riesgo is not TODOS', () => {
    const filtros = { ...DEFAULT_FILTROS, riesgoDesahucio: 'ALTO' as const }
    render(
      <FiltrosPanel filtros={filtros} onChange={vi.fn()} distritos={[]} />
    )
    expect(screen.getByText('Limpiar filtros')).toBeInTheDocument()
  })

  it('calls onChange with DEFAULT_FILTROS when Limpiar is clicked', () => {
    const onChange = vi.fn()
    const modifiedFiltros = { ...DEFAULT_FILTROS, anyo: 2022 }
    render(
      <FiltrosPanel filtros={modifiedFiltros} onChange={onChange} distritos={[]} />
    )
    fireEvent.click(screen.getByText('Limpiar filtros'))
    // El primer argumento debe incluir el año por defecto (2024)
    const call = onChange.mock.calls[0][0]
    expect(call.anyo).toBe(2024)
    expect(call.riesgoDesahucio).toBe('TODOS')
  })

  it('renders distritos in the district selector', () => {
    const distritos = ['Campanar', 'Rascanya', 'Extramurs']
    render(
      <FiltrosPanel filtros={DEFAULT_FILTROS} onChange={vi.fn()} distritos={distritos} />
    )
    expect(screen.getByText('Campanar')).toBeInTheDocument()
    expect(screen.getByText('Rascanya')).toBeInTheDocument()
  })

  it('calls onChange with district null when empty option selected', () => {
    const onChange = vi.fn()
    const filtros = { ...DEFAULT_FILTROS, distrito: 'Campanar' }
    render(
      <FiltrosPanel filtros={filtros} onChange={onChange} distritos={['Campanar']} />
    )
    const districtSelect = screen.getByDisplayValue('Campanar')
    fireEvent.change(districtSelect, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ distrito: null })
  })
})
