import { describe, it, expect } from 'vitest'
import { ierToColor, ierToLabel, RIESGO_COLORS } from '../utils/ier'

describe('ierToColor', () => {
  it('returns green for IER < 25', () => {
    expect(ierToColor(0)).toBe('#22c55e')
    expect(ierToColor(24.9)).toBe('#22c55e')
  })

  it('returns yellow for IER 25–49', () => {
    expect(ierToColor(25)).toBe('#eab308')
    expect(ierToColor(49.9)).toBe('#eab308')
  })

  it('returns orange for IER 50–74', () => {
    expect(ierToColor(50)).toBe('#f97316')
    expect(ierToColor(74.9)).toBe('#f97316')
  })

  it('returns red for IER >= 75', () => {
    expect(ierToColor(75)).toBe('#ef4444')
    expect(ierToColor(100)).toBe('#ef4444')
  })
})

describe('ierToLabel', () => {
  it('returns Bajo for IER < 25', () => {
    expect(ierToLabel(0)).toBe('Bajo')
    expect(ierToLabel(24)).toBe('Bajo')
  })

  it('returns Moderado for IER 25–49', () => {
    expect(ierToLabel(25)).toBe('Moderado')
    expect(ierToLabel(49)).toBe('Moderado')
  })

  it('returns Alto for IER 50–74', () => {
    expect(ierToLabel(50)).toBe('Alto')
    expect(ierToLabel(74)).toBe('Alto')
  })

  it('returns Crítico for IER >= 75', () => {
    expect(ierToLabel(75)).toBe('Crítico')
    expect(ierToLabel(100)).toBe('Crítico')
  })
})

describe('RIESGO_COLORS', () => {
  it('has all four risk levels defined', () => {
    expect(RIESGO_COLORS['BAJO']).toBeDefined()
    expect(RIESGO_COLORS['MEDIO']).toBeDefined()
    expect(RIESGO_COLORS['ALTO']).toBeDefined()
    expect(RIESGO_COLORS['CRÍTICO']).toBeDefined()
  })

  it('maps CRÍTICO to red', () => {
    expect(RIESGO_COLORS['CRÍTICO']).toBe('#ef4444')
  })

  it('maps BAJO to green', () => {
    expect(RIESGO_COLORS['BAJO']).toBe('#22c55e')
  })
})
