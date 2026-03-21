"""Tests unitarios del IER Calculator."""
import pytest

from app.services.ier_calculator import IERCalculator, IndicadoresBarrio, _clasificar_riesgo


def _make_ind(
    barrio_id: int = 1,
    renta: float | None = 30000,
    alquiler: float | None = 900,
    desempleo: float | None = 15.0,
    migrantes: float | None = 20.0,
    ibi_imp: float | None = 5.0,
    juridica: float | None = 10.0,
    salud_mental: float | None = 30.0,
) -> IndicadoresBarrio:
    return IndicadoresBarrio(
        barrio_id=barrio_id,
        anyo=2024,
        renta_media_hogar=renta,
        coste_alquiler_medio=alquiler,
        pct_desempleo=desempleo,
        pct_migrantes=migrantes,
        pct_ibi_impagados=ibi_imp,
        pct_persona_juridica=juridica,
        tasa_salud_mental=salud_mental,
        recursos_salud_mental=None,
    )


def _calc_batch(indicadores: list[IndicadoresBarrio]):
    calc = IERCalculator()
    calc.fit(indicadores)
    return calc.calculate_batch(indicadores)


class TestIERRange:
    def test_ier_within_0_100(self):
        inds = [_make_ind(1), _make_ind(2, renta=15000, alquiler=1200, desempleo=40)]
        results = _calc_batch(inds)
        for r in results:
            assert 0 <= r.ier_value <= 100

    def test_high_stress_barrio_scores_higher(self):
        low_stress = _make_ind(1, renta=60000, alquiler=500, desempleo=5, ibi_imp=1)
        high_stress = _make_ind(2, renta=12000, alquiler=1100, desempleo=40, ibi_imp=30)
        results = _calc_batch([low_stress, high_stress])
        low_r = next(r for r in results if r.barrio_id == 1)
        high_r = next(r for r in results if r.barrio_id == 2)
        assert high_r.ier_value > low_r.ier_value

    def test_single_barrio_returns_neutral(self):
        """Con un solo barrio todos los min==max → IER neutro."""
        ind = _make_ind(1)
        calc = IERCalculator()
        calc.fit([ind])
        result = calc.calculate(ind)
        # Con min==max la normalización devuelve 0.5 → IER neutro
        assert result.ier_value == pytest.approx(
            (0.5 * 0.5 + 0.3 * 0.5 - 0.2 * 0.5) * 100, abs=1
        )


class TestNullHandling:
    def test_all_nulls_gives_neutral_ier(self):
        ind = _make_ind(1, renta=None, alquiler=None, desempleo=None,
                        migrantes=None, ibi_imp=None, juridica=None, salud_mental=None)
        calc = IERCalculator()
        calc.fit([ind])
        result = calc.calculate(ind)
        assert 0 <= result.ier_value <= 100

    def test_partial_nulls_does_not_crash(self):
        inds = [
            _make_ind(1, alquiler=None),   # sin coste alquiler
            _make_ind(2, renta=None),       # sin renta
            _make_ind(3),
        ]
        results = _calc_batch(inds)
        assert len(results) == 3


class TestRiesgoClasificacion:
    def test_critico_requires_high_ier_and_impagados(self):
        ind = _make_ind(1, ibi_imp=20)
        assert _clasificar_riesgo(ind, ier=75) == "CRÍTICO"

    def test_alto_high_ier_low_impagados(self):
        ind = _make_ind(1, ibi_imp=5)
        assert _clasificar_riesgo(ind, ier=75) == "ALTO"

    def test_medio(self):
        ind = _make_ind(1)
        assert _clasificar_riesgo(ind, ier=50) == "MEDIO"

    def test_bajo(self):
        ind = _make_ind(1)
        assert _clasificar_riesgo(ind, ier=20) == "BAJO"


class TestIERResultFields:
    def test_result_has_all_components(self):
        inds = [_make_ind(1), _make_ind(2, renta=20000)]
        results = _calc_batch(inds)
        for r in results:
            assert r.componente_alquiler is not None
            assert r.componente_precariedad is not None
            assert r.componente_salud_mental is not None
            assert r.score_calidad_vida == pytest.approx(100 - r.ier_value, abs=0.01)

    def test_components_between_0_and_1(self):
        inds = [_make_ind(i) for i in range(1, 6)]
        results = _calc_batch(inds)
        for r in results:
            assert 0 <= r.componente_alquiler <= 1
            assert 0 <= r.componente_precariedad <= 1
            assert 0 <= r.componente_salud_mental <= 1
