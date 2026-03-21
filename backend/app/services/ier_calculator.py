"""
Fase 2: Lógica de negocio — Cálculo del Índice de Estrés Residencial (IER).

Fórmula:
    IER = ω1·ratio_alquiler_normalizado + ω2·precariedad_normalizada − ω3·acceso_salud_normalizado

Pesos calibrados con datos FOESSA 2025:
    ω1 = 0.50  (componente principal: peso del alquiler sobre la renta)
    ω2 = 0.30  (precariedad laboral y exclusión)
    ω3 = 0.20  (acceso a salud mental — factor protector, resta)

Todas las variables se normalizan a [0, 1] usando estadísticos de la ciudad completa
antes de aplicar los pesos. El IER final se escala a [0, 100].
"""
from dataclasses import dataclass


# ── Umbral de estrés habitacional (FOESSA 2025): hogares que dedican >30% al alquiler
UMBRAL_STRESS_RATIO = 0.30
# ── Pesos de la fórmula IER
OMEGA1 = 0.50
OMEGA2 = 0.30
OMEGA3 = 0.20


@dataclass
class IndicadoresBarrio:
    """Inputs del calculador para un barrio/año."""
    barrio_id: int
    anyo: int

    # Componente 1 — alquiler/renta
    renta_media_hogar: float | None        # €/año
    coste_alquiler_medio: float | None     # €/mes

    # Componente 2 — precariedad
    pct_desempleo: float | None            # % desempleo
    pct_migrantes: float | None            # % migrantes extracomunitarios
    pct_ibi_impagados: float | None        # % recibos IBI impagados
    pct_persona_juridica: float | None     # % propietarios persona jurídica

    # Componente 3 — salud mental (factor protector)
    tasa_salud_mental: float | None        # tasa enfermedades por 1000 hab.
    recursos_salud_mental: int | None      # nº recursos disponibles en barrio


@dataclass
class IERResult:
    barrio_id: int
    anyo: int
    ier_value: float                  # 0–100
    componente_alquiler: float        # contribución normalizada (0–1)
    componente_precariedad: float     # contribución normalizada (0–1)
    componente_salud_mental: float    # contribución normalizada (0–1)
    score_calidad_vida: float | None  # 0–100 (se enriquece con criminalidad en Fase 3)
    riesgo_desahucio: str             # BAJO / MEDIO / ALTO / CRÍTICO


class IERCalculator:
    """
    Calcula el IER para un conjunto de barrios normalizando primero
    las variables sobre el rango ciudad (estadísticos del dataset completo).

    Parámetro use_ml: si True, usa el predictor RandomForest para clasificar
    el riesgo de desahucio en lugar de las reglas heurísticas (Fase 7).
    """

    def __init__(
        self,
        omega1: float = OMEGA1,
        omega2: float = OMEGA2,
        omega3: float = OMEGA3,
        use_ml: bool = False,
    ):
        self.omega1 = omega1
        self.omega2 = omega2
        self.omega3 = omega3
        self.use_ml = use_ml
        # Estadísticos ciudad — se calculan llamando a fit()
        self._stats: dict[str, dict[str, float]] = {}
        self._predictor = None  # cargado lazy si use_ml=True

    # ── Normalización ──────────────────────────────────────────────────────────

    @staticmethod
    def _safe(value: float | None, default: float = 0.5) -> float:
        """Devuelve el valor o un neutro (0.5) si es None."""
        return value if value is not None else default

    def _minmax(self, variable: str, value: float | None) -> float:
        """Normaliza un valor al rango [0,1] usando min/max del dataset."""
        if value is None:
            return 0.5  # valor neutro cuando no hay dato
        stats = self._stats.get(variable, {})
        vmin = stats.get("min", 0.0)
        vmax = stats.get("max", 1.0)
        if vmax == vmin:
            return 0.5
        return max(0.0, min(1.0, (value - vmin) / (vmax - vmin)))

    def fit(self, indicadores: list[IndicadoresBarrio]) -> "IERCalculator":
        """
        Calcula estadísticos min/max sobre el conjunto completo de barrios.
        Debe llamarse antes de calculate_batch().
        """
        def _collect(fn):
            vals = [fn(ind) for ind in indicadores if fn(ind) is not None]
            return vals

        fields: dict[str, list[float]] = {
            "ratio_alquiler": _collect(lambda i: _ratio_alquiler(i)),
            "pct_desempleo": _collect(lambda i: i.pct_desempleo),
            "pct_migrantes": _collect(lambda i: i.pct_migrantes),
            "pct_ibi_impagados": _collect(lambda i: i.pct_ibi_impagados),
            "pct_persona_juridica": _collect(lambda i: i.pct_persona_juridica),
            "tasa_salud_mental": _collect(lambda i: i.tasa_salud_mental),
        }

        for name, vals in fields.items():
            if vals:
                self._stats[name] = {"min": min(vals), "max": max(vals)}

        return self

    # ── Cálculo ────────────────────────────────────────────────────────────────

    def calculate(self, ind: IndicadoresBarrio) -> IERResult:
        """Calcula el IER para un único barrio. Requiere fit() previo."""

        # — Componente 1: ratio alquiler/renta (principal)
        ratio = _ratio_alquiler(ind)
        c_alquiler = self._minmax("ratio_alquiler", ratio)

        # — Componente 2: precariedad (promedio de 4 sub-indicadores)
        c_desempleo = self._minmax("pct_desempleo", ind.pct_desempleo)
        c_migrantes = self._minmax("pct_migrantes", ind.pct_migrantes)
        c_impagados = self._minmax("pct_ibi_impagados", ind.pct_ibi_impagados)
        c_juridica = self._minmax("pct_persona_juridica", ind.pct_persona_juridica)
        c_precariedad = (c_desempleo + c_migrantes + c_impagados + c_juridica) / 4

        # — Componente 3: salud mental (factor protector — invierto la escala)
        c_sm_raw = self._minmax("tasa_salud_mental", ind.tasa_salud_mental)
        c_salud_mental = c_sm_raw  # mayor tasa = peor acceso => suma al estrés (sin invertir)

        # — IER: escalar a 0–100
        ier_raw = (
            self.omega1 * c_alquiler
            + self.omega2 * c_precariedad
            - self.omega3 * c_salud_mental  # resta como factor protector
        )
        # Reclamp a [0,1] por si la resta da negativo
        ier_raw = max(0.0, min(1.0, ier_raw))
        ier_value = round(ier_raw * 100, 2)

        # — Score calidad de vida (sin criminalidad aún — se enriquece en API)
        score_calidad_vida = round(100 - ier_value, 2)

        return IERResult(
            barrio_id=ind.barrio_id,
            anyo=ind.anyo,
            ier_value=ier_value,
            componente_alquiler=round(c_alquiler, 4),
            componente_precariedad=round(c_precariedad, 4),
            componente_salud_mental=round(c_salud_mental, 4),
            score_calidad_vida=score_calidad_vida,
            riesgo_desahucio=self._clasificar(ind, ier_value, c_alquiler, c_precariedad, c_salud_mental),
        )

    def calculate_batch(self, indicadores: list[IndicadoresBarrio]) -> list[IERResult]:
        """Calcula IER para una lista de barrios (ya normalizada con fit())."""
        return [self.calculate(ind) for ind in indicadores]

    def _clasificar(
        self,
        ind: IndicadoresBarrio,
        ier_value: float,
        c_alquiler: float,
        c_precariedad: float,
        c_salud_mental: float,
    ) -> str:
        """Clasifica el riesgo usando ML (si use_ml=True) o la heurística."""
        if self.use_ml:
            if self._predictor is None:
                from app.services.ml_predictor import get_predictor
                self._predictor = get_predictor()
            return self._predictor.predict(
                ier_value=ier_value,
                componente_alquiler=c_alquiler,
                componente_precariedad=c_precariedad,
                componente_salud_mental=c_salud_mental,
                pct_ibi_impagados=ind.pct_ibi_impagados or 0.0,
            )
        return _clasificar_riesgo(ind, ier_value)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ratio_alquiler(ind: IndicadoresBarrio) -> float | None:
    """Calcula el ratio mensual_alquiler / (renta_anual / 12)."""
    if ind.coste_alquiler_medio is None or ind.renta_media_hogar is None:
        return None
    renta_mensual = ind.renta_media_hogar / 12
    if renta_mensual <= 0:
        return None
    return ind.coste_alquiler_medio / renta_mensual


def _clasificar_riesgo(ind: IndicadoresBarrio, ier: float) -> str:
    """
    Clasifica el riesgo de desahucio según:
    - IER alto + IBI impagados altos → CRÍTICO
    - IER alto sin impagados        → ALTO
    - IER moderado                  → MEDIO
    - IER bajo                      → BAJO
    """
    pct_imp = ind.pct_ibi_impagados or 0.0
    if ier >= 70 and pct_imp >= 15:
        return "CRÍTICO"
    if ier >= 70:
        return "ALTO"
    if ier >= 45:
        return "MEDIO"
    return "BAJO"
