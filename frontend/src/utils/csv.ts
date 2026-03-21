import type { BarrioConIER } from '../types'

export function exportAlertasCSV(barrios: BarrioConIER[], anyo: number): void {
  const headers = ['Barrio', 'Distrito', 'IER', 'Riesgo Desahucio', 'Calidad de Vida', 'Año']
  const rows = barrios
    .filter((b) => b.ier)
    .map((b) => [
      b.nombre,
      b.distrito ?? '',
      b.ier!.ier_value.toFixed(1),
      b.ier!.riesgo_desahucio,
      b.ier!.score_calidad_vida?.toFixed(1) ?? '',
      String(anyo),
    ])

  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `alquilersano_alertas_${anyo}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
