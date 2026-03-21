"""
Tests de calibración del IER contra benchmarks FOESSA 2025.

FOESSA 2025 establece que el 20% de hogares con bajos ingresos destina
más del 70% de su renta al alquiler. Estos tests verifican que la fórmula
IER produce resultados coherentes con esos perfiles conocidos.

Perfiles de referencia (aproximados con datos FOESSA):
  - Barrio_Exclusion_Severa: renta 12.000€/año, alquiler 900€/mes (ratio 90%)
    → ratio_alquiler ≈ 0.90 · pesos altos → IER debe ser el más alto
  - Barrio_Precariedad_Alta: renta 20.000€/año, alquiler 750€/mes (ratio 45%)
    + desempleo 35%, migrantes extracom. 40%
  - Barrio_Clase_Media: renta 35.000€/año, alquiler 800€/mes (ratio 27%)
    → por debajo del umbral FOESSA del 30%
  - Barrio_Acomodado: renta 55.000€/año, alquiler 900€/mes (ratio 20%)
    + desempleo bajo, sin impagados → IER debe ser el más bajo
"""
import pytest

from app.services.ier_calculator import IERCalculator, IndicadoresBarrio, UMBRAL_STRESS_RATIO


def _make_perfil(
    barrio_id: int,
    renta: float,
    alquiler_mensual: float,
    desempleo: float = 10.0,
    migrantes: float = 10.0,
    ibi_imp: float = 3.0,
    juridica: float = 8.0,
    salud_mental: float = 25.0,
) -> IndicadoresBarrio:
    return IndicadoresBarrio(
        barrio_id=barrio_id,
        anyo=2024,
        renta_media_hogar=renta,
        coste_alquiler_medio=alquiler_mensual,
        pct_desempleo=desempleo,
        pct_migrantes=migrantes,
        pct_ibi_impagados=ibi_imp,
        pct_persona_juridica=juridica,
        tasa_salud_mental=salud_mental,
        recursos_salud_mental=None,
    )


@pytest.fixture
def perfiles_foessa():
    return [
        _make_perfil(1, renta=12_000, alquiler_mensual=900,  # ratio 90%
                     desempleo=38, migrantes=45, ibi_imp=22, juridica=35),  # exclusión severa
        _make_perfil(2, renta=20_000, alquiler_mensual=750,  # ratio 45%
                     desempleo=30, migrantes=30, ibi_imp=10, juridica=20),  # precariedad alta
        _make_perfil(3, renta=35_000, alquiler_mensual=800,  # ratio 27% — bajo umbral 30%
                     desempleo=10, migrantes=12, ibi_imp=4,  juridica=10),  # clase media
        _make_perfil(4, renta=55_000, alquiler_mensual=900,  # ratio 20%
                     desempleo=5,  migrantes=5,  ibi_imp=1,  juridica=5),   # acomodado
    ]


class TestFOESSACalibration:
    def test_ranking_coherente_con_foessa(self, perfiles_foessa):
        """El IER debe crecer monotónicamente con el nivel de estrés real."""
        calc = IERCalculator()
        calc.fit(perfiles_foessa)
        results = {r.barrio_id: r for r in calc.calculate_batch(perfiles_foessa)}

        # Exclusión severa > precariedad alta > clase media > acomodado
        assert results[1].ier_value > results[2].ier_value
        assert results[2].ier_value > results[3].ier_value
        assert results[3].ier_value > results[4].ier_value

    def test_exclusion_severa_en_zona_critica(self, perfiles_foessa):
        """El perfil de exclusión severa debe superar IER=60 (zona de alerta alta)."""
        calc = IERCalculator()
        calc.fit(perfiles_foessa)
        results = {r.barrio_id: r for r in calc.calculate_batch(perfiles_foessa)}
        assert results[1].ier_value >= 60, (
            f"Exclusión severa debería IER≥60, obtenido {results[1].ier_value:.1f}"
        )

    def test_acomodado_bajo_umbral_40(self, perfiles_foessa):
        """El barrio acomodado debe estar por debajo del umbral MEDIO (40)."""
        calc = IERCalculator()
        calc.fit(perfiles_foessa)
        results = {r.barrio_id: r for r in calc.calculate_batch(perfiles_foessa)}
        assert results[4].ier_value < 40, (
            f"Barrio acomodado debería IER<40, obtenido {results[4].ier_value:.1f}"
        )

    def test_clase_media_por_debajo_umbral_stress_30pct(self, perfiles_foessa):
        """Clase media (ratio 27%) debe tener menor IER que precariedad alta (ratio 45%)."""
        calc = IERCalculator()
        calc.fit(perfiles_foessa)
        results = {r.barrio_id: r for r in calc.calculate_batch(perfiles_foessa)}
        assert results[3].ier_value < results[2].ier_value

    def test_riesgo_desahucio_coherente(self, perfiles_foessa):
        """Exclusión severa → CRÍTICO/ALTO; acomodado → BAJO."""
        calc = IERCalculator()
        calc.fit(perfiles_foessa)
        results = {r.barrio_id: r for r in calc.calculate_batch(perfiles_foessa)}
        assert results[1].riesgo_desahucio in ("CRÍTICO", "ALTO")
        assert results[4].riesgo_desahucio == "BAJO"


class TestOmegaSensitivity:
    """Verifica que cambiar los pesos ω produce el efecto esperado."""

    def _calc_with_omegas(self, w1, w2, w3, perfiles):
        calc = IERCalculator(omega1=w1, omega2=w2, omega3=w3)
        calc.fit(perfiles)
        return {r.barrio_id: r for r in calc.calculate_batch(perfiles)}

    def test_aumentar_omega1_sube_ier_barrio_alto_alquiler(self):
        """Con más peso en alquiler, el barrio con ratio alto sube más."""
        low_rent  = _make_perfil(1, renta=50_000, alquiler_mensual=500, desempleo=5)
        high_rent = _make_perfil(2, renta=12_000, alquiler_mensual=900, desempleo=5)
        perfiles = [low_rent, high_rent]

        r_default = self._calc_with_omegas(0.5, 0.3, 0.2, perfiles)
        r_heavy_rent = self._calc_with_omegas(0.8, 0.1, 0.1, perfiles)

        gap_default = r_default[2].ier_value - r_default[1].ier_value
        gap_heavy   = r_heavy_rent[2].ier_value - r_heavy_rent[1].ier_value
        assert gap_heavy > gap_default, (
            "Mayor ω1 debe ampliar la brecha entre barrios con distinto ratio de alquiler"
        )

    def test_sum_omegas_not_required_to_be_1(self):
        """El calculador funciona aunque ω1+ω2+ω3 ≠ 1 (normalización independiente)."""
        perfil = [_make_perfil(1, renta=30_000, alquiler_mensual=800)]
        calc = IERCalculator(omega1=0.6, omega2=0.6, omega3=0.3)
        calc.fit(perfil)
        result = calc.calculate(perfil[0])
        assert 0 <= result.ier_value <= 100


class TestIERMonotonicity:
    """IER debe aumentar cuando un único factor empeora, el resto constante."""

    def _ier_for(self, **kwargs):
        base = dict(renta=30_000, alquiler_mensual=700, desempleo=10,
                    migrantes=10, ibi_imp=5, juridica=10, salud_mental=25)
        base.update(kwargs)
        # Necesitamos al menos 2 barrios para que fit() tenga rango
        perfil_neutral = _make_perfil(99, renta=30_000, alquiler_mensual=700)
        target = _make_perfil(1, **base)
        calc = IERCalculator()
        calc.fit([perfil_neutral, target])
        return calc.calculate(target).ier_value

    def test_mas_desempleo_sube_ier(self):
        low  = self._ier_for(desempleo=5)
        high = self._ier_for(desempleo=40)
        assert high >= low

    def test_menor_renta_mismo_alquiler_sube_ier(self):
        rico  = self._ier_for(renta=60_000, alquiler_mensual=800)
        pobre = self._ier_for(renta=12_000, alquiler_mensual=800)
        assert pobre >= rico

    def test_mas_ibi_impagados_sube_ier(self):
        pocos = self._ier_for(ibi_imp=1)
        muchos = self._ier_for(ibi_imp=40)
        assert muchos >= pocos
