interface Props {
  onClose: () => void
}

export default function WelcomePopup({ onClose }: Props) {
  return (
    <div className="welcome-overlay" onClick={onClose}>
      <div className="welcome-card" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-hero">
          <div className="welcome-icon">🏠</div>
          <h2>Bienvenido a AlquilerSano</h2>
          <p>Atlas del estrés habitacional en la Comunidad Valenciana</p>
        </div>

        <div className="welcome-body">
          <div className="welcome-section">
            <h3>¿Qué es el estrés residencial?</h3>
            <p>
              El estrés residencial mide la presión económica que sufren las familias para mantener su vivienda.
              Cuando una familia destina gran parte de sus ingresos al alquiler, le queda poco para alimentación,
              salud o educación. En España, el 20% de los hogares con menores ingresos gasta más del 70% de su
              renta en vivienda. Esto genera ansiedad, precariedad y riesgo de desahucio.
            </p>
          </div>

          <div className="welcome-section">
            <h3>¿Qué muestra este mapa?</h3>
            <p>
              Cada zona del mapa es un municipio de la Comunidad Valenciana. El color indica su
              <strong> Índice de Estrés Residencial (IER)</strong>, que combina tres datos oficiales del
              Instituto Nacional de Estadística: la renta de los hogares, la tasa de pobreza y la desigualdad
              económica (índice de Gini).
            </p>
          </div>

          <div className="welcome-section">
            <h3>Cómo leer los colores</h3>
            <div className="welcome-legend">
              <div className="welcome-legend-item">
                <div className="welcome-legend-dot" style={{ background: '#22c55e' }} />
                <span>Bajo (0–24)</span>
              </div>
              <div className="welcome-legend-item">
                <div className="welcome-legend-dot" style={{ background: '#eab308' }} />
                <span>Medio (25–49)</span>
              </div>
              <div className="welcome-legend-item">
                <div className="welcome-legend-dot" style={{ background: '#f97316' }} />
                <span>Alto (50–74)</span>
              </div>
              <div className="welcome-legend-item">
                <div className="welcome-legend-dot" style={{ background: '#ef4444' }} />
                <span>Crítico (75–100)</span>
              </div>
            </div>
            <p style={{ marginTop: 8 }}>
              Cuanto más cálido el color, mayor es la dificultad de las familias para llegar a fin de mes
              después de pagar el alquiler.
            </p>
          </div>

          <button className="welcome-btn" onClick={onClose}>
            Explorar el mapa
          </button>
        </div>
      </div>
    </div>
  )
}
