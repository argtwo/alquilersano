// Color del mapa de calor según el valor IER (0–100)
export function ierToColor(ier: number): string {
  if (ier < 25) return '#22c55e'   // verde — bajo estrés
  if (ier < 50) return '#eab308'   // amarillo — estrés moderado
  if (ier < 75) return '#f97316'   // naranja — estrés alto
  return '#ef4444'                 // rojo — estrés crítico
}

export function ierToLabel(ier: number): string {
  if (ier < 25) return 'Bajo'
  if (ier < 50) return 'Moderado'
  if (ier < 75) return 'Alto'
  return 'Crítico'
}

export const RIESGO_COLORS: Record<string, string> = {
  BAJO: '#22c55e',
  MEDIO: '#eab308',
  ALTO: '#f97316',
  'CRÍTICO': '#ef4444',
}
