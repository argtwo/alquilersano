import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import type { Layer, GeoJSON as LeafletGeoJSON } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { BarrioConIER, Ciudad } from '../types'
import { ierToColor, ierToLabel, RIESGO_COLORS } from '../utils/ier'

const CIUDAD_CENTER: Record<Ciudad, [number, number]> = {
  valencia:            [39.4699, -0.3763],
  valencia_provincia:  [39.35, -0.75],
  madrid:              [40.4168, -3.7038],
  barcelona:           [41.3851, 2.1734],
}

const CIUDAD_ZOOM: Record<Ciudad, number> = {
  valencia:            13,
  valencia_provincia:  9,
  madrid:              12,
  barcelona:           13,
}

interface Props {
  barrios: BarrioConIER[]
  onBarrioClick: (barrio: BarrioConIER) => void
  anyo: number
  ciudad?: Ciudad
  theme?: 'dark' | 'light'
}

// ── Leyenda superpuesta ──────────────────────────────────────────────────────
function MapLeyenda() {
  return (
    <div className="map-legend">
      <h4>Índice IER</h4>
      {[
        { color: '#22c55e', label: '0–24 Bajo' },
        { color: '#eab308', label: '25–49 Moderado' },
        { color: '#f97316', label: '50–74 Alto' },
        { color: '#ef4444', label: '75–100 Crítico' },
        { color: '#94a3b8', label: 'Sin datos' },
      ].map(({ color, label }) => (
        <div key={label} className="legend-item">
          <div className="legend-swatch" style={{ background: color }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Capa GeoJSON de barrios ──────────────────────────────────────────────────
interface CapaProps {
  barrios: BarrioConIER[]
  onBarrioClick: (b: BarrioConIER) => void
  theme: 'dark' | 'light'
}

function CapaBarrios({ barrios, onBarrioClick, theme }: CapaProps) {
  const layerRefs = useRef<Map<number, LeafletGeoJSON>>(new Map())

  const borderColor = theme === 'light' ? '#ffffff' : '#1e293b'
  const hoverColor  = theme === 'light' ? '#0f766e' : '#22c55e'
  const fillOpacity = theme === 'light' ? 0.75 : 0.7

  const tooltipBg     = theme === 'light' ? '#faf7f2' : '#1a2235'
  const tooltipText   = theme === 'light' ? '#292524' : '#e2e8f0'
  const tooltipBorder = theme === 'light' ? '#d6cfc7' : '#334155'
  const tooltipTitle  = theme === 'light' ? '#1c1917' : '#f8fafc'
  const tooltipMuted  = theme === 'light' ? '#78716c' : '#94a3b8'
  const tooltipNoData = theme === 'light' ? '#a8a29e' : '#64748b'

  // Actualiza estilos si cambia el IER sin desmontar la capa
  useEffect(() => {
    barrios.forEach((b) => {
      const layer = layerRefs.current.get(b.id)
      if (layer) {
        layer.setStyle({
          fillColor: b.ier ? ierToColor(b.ier.ier_value) : '#94a3b8',
          fillOpacity,
          weight: 1,
          color: borderColor,
          opacity: 0.8,
        })
      }
    })
  }, [barrios, borderColor, fillOpacity])

  return (
    <>
      {barrios.map((barrio) => {
        if (!barrio.geometria) return null
        const ier = barrio.ier?.ier_value
        const riesgo = barrio.ier?.riesgo_desahucio

        const tooltip =
          `<div style="font-family:system-ui;font-size:13px;min-width:140px;background:${tooltipBg};color:${tooltipText};padding:8px 10px;border-radius:6px;border:1px solid ${tooltipBorder}">` +
          `<strong style="display:block;margin-bottom:4px;color:${tooltipTitle}">${barrio.nombre}</strong>` +
          (ier != null
            ? `<span>IER: <strong style="color:${ierToColor(ier)}">${ier.toFixed(1)}</strong> · ${ierToLabel(ier)}</span><br/>` +
              `<span style="font-size:11px;color:${tooltipMuted}">Riesgo: <span style="color:${RIESGO_COLORS[riesgo!]};font-weight:600">${riesgo}</span></span>`
            : `<span style="color:${tooltipNoData}">Sin datos</span>`) +
          `</div>`

        return (
          <GeoJSON
            key={barrio.id}
            data={barrio.geometria as GeoJSON.GeoJsonObject}
            style={{
              fillColor: ier != null ? ierToColor(ier) : '#94a3b8',
              fillOpacity,
              weight: 0.8,
              color: borderColor,
              opacity: 0.9,
            }}
            ref={(ref) => {
              if (ref) layerRefs.current.set(barrio.id, ref)
            }}
            onEachFeature={(_feature, layer: Layer) => {
              layer.bindTooltip(tooltip, { sticky: true, opacity: 1, className: 'dark-tooltip' })
              layer.on('click', () => onBarrioClick(barrio))
              layer.on('mouseover', function (this: Layer & { setStyle?: (s: object) => void }) {
                this.setStyle?.({ weight: 2, color: hoverColor, fillOpacity: 0.88 })
              })
              layer.on('mouseout', function (this: Layer & { setStyle?: (s: object) => void }) {
                this.setStyle?.({ weight: 0.8, color: borderColor, fillOpacity })
              })
            }}
          />
        )
      })}
    </>
  )
}

// ── Recentrar mapa cuando cambia la ciudad ───────────────────────────────────
function RecenterMap({ ciudad }: { ciudad: Ciudad }) {
  const map = useMap()
  useEffect(() => {
    map.setView(CIUDAD_CENTER[ciudad], CIUDAD_ZOOM[ciudad])
  }, [ciudad, map])
  return null
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MapView({ barrios, onBarrioClick, anyo, ciudad = 'valencia', theme = 'dark' }: Props) {
  const center = CIUDAD_CENTER[ciudad]
  const zoom = CIUDAD_ZOOM[ciudad]

  const tileBase   = theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
  const tileLabels = theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer
          key={`base-${theme}`}
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url={tileBase}
        />
        <TileLayer
          key={`labels-${theme}`}
          url={tileLabels}
          pane="shadowPane"
        />
        <RecenterMap ciudad={ciudad} />
        {/* key incluye ciudad, año y tema para refrescar la capa GeoJSON */}
        <CapaBarrios key={`${ciudad}-${anyo}-${theme}`} barrios={barrios} onBarrioClick={onBarrioClick} theme={theme} />
      </MapContainer>
      <MapLeyenda />
    </div>
  )
}
