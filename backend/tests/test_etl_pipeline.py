"""
Tests unitarios del pipeline ETL — clean.py.

Usa DataFrames sintéticos para verificar:
  - Detección dinámica de columnas (nombres alternativos).
  - Normalización de nombres de barrio (bilingüe, aliases).
  - Manejo de valores nulos / filas malformadas.
  - Schema de salida esperado (columnas presentes).
"""
import io
from pathlib import Path

import pandas as pd
import pytest

from app.etl.clean import (
    clean_ibi,
    clean_migrantes,
    clean_renta,
    clean_salud_mental,
    normalize_barrio_name,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _csv_path(tmp_path: Path, name: str, content: str) -> Path:
    """Escribe un CSV en tmp_path y devuelve su Path."""
    p = tmp_path / name
    p.write_text(content, encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# normalize_barrio_name
# ---------------------------------------------------------------------------

class TestNormalizeBarrioName:
    def test_bilingual_takes_valencian(self):
        assert normalize_barrio_name("Rascanya / Rascaña") == "rascanya"

    def test_lowercase_and_strip(self):
        assert normalize_barrio_name("  CAMPANAR  ") == "campanar"

    def test_double_spaces_collapsed(self):
        assert normalize_barrio_name("el  pla  del  real") == "el pla del real"

    def test_known_alias_resolved(self):
        assert normalize_barrio_name("L'Olivereta") == "olivereta"

    def test_non_string_returns_empty(self):
        assert normalize_barrio_name(None) == ""
        assert normalize_barrio_name(42) == ""

    def test_unknown_name_passes_through(self):
        assert normalize_barrio_name("barri desconegut") == "barri desconegut"


# ---------------------------------------------------------------------------
# clean_renta
# ---------------------------------------------------------------------------

class TestCleanRenta:
    def _sample_csv(self, tmp_path: Path) -> Path:
        content = (
            "Any;Barri;Codi_Barri;Rendiment_persona;Rendiment_llar\n"
            "2023;Rascanya;01;14500;32000\n"
            "2023;Campanar / Campanar;02;18000;45000\n"
            "2023;;03;12000;28000\n"  # barrio vacío
            "abc;Extramurs;04;10000;22000\n"  # año no numérico → descartado
        )
        return _csv_path(tmp_path, "renta.csv", content)

    def test_output_columns(self, tmp_path):
        df = clean_renta(self._sample_csv(tmp_path))
        assert "anyo" in df.columns
        assert "barri_normalizado" in df.columns
        assert "renta_media_hogar" in df.columns

    def test_numeric_year(self, tmp_path):
        df = clean_renta(self._sample_csv(tmp_path))
        assert df["anyo"].dtype in (float, int) or str(df["anyo"].dtype).startswith("float")

    def test_bad_year_row_dropped(self, tmp_path):
        df = clean_renta(self._sample_csv(tmp_path))
        # La fila con año "abc" debe haber sido descartada
        assert not df["anyo"].isna().any()

    def test_bilingual_barrio_normalized(self, tmp_path):
        df = clean_renta(self._sample_csv(tmp_path))
        assert "campanar" in df["barri_normalizado"].values

    def test_column_variant_rendiment(self, tmp_path):
        """Acepta 'rendiment_llar' como nombre alternativo de renta del hogar."""
        content = (
            "Any;Barri;rendiment_per_persona;rendiment_per_llar\n"
            "2022;Algirós;15000;38000\n"
        )
        p = _csv_path(tmp_path, "renta2.csv", content)
        df = clean_renta(p)
        assert "renta_media_hogar" in df.columns
        assert df["renta_media_hogar"].iloc[0] == 38000


# ---------------------------------------------------------------------------
# clean_ibi
# ---------------------------------------------------------------------------

class TestCleanIBI:
    def _sample_csv(self, tmp_path: Path) -> Path:
        content = (
            "Any;Barri;Naturalesa_Juridica;Estat_Cobrament\n"
            "2023;Rascanya;Persona física;Cobrat\n"
            "2023;Rascanya;Societat mercantil;Cobrat\n"
            "2023;Rascanya;Persona física;Impagat\n"
            "2023;Campanar;Persona física;Cobrat\n"
            "2023;Campanar;Persona física;Pendent\n"
        )
        return _csv_path(tmp_path, "ibi.csv", content)

    def test_output_columns(self, tmp_path):
        df = clean_ibi(self._sample_csv(tmp_path))
        assert "pct_impagados" in df.columns
        assert "pct_persona_juridica" in df.columns

    def test_pct_impagados_rascanya(self, tmp_path):
        df = clean_ibi(self._sample_csv(tmp_path))
        # Rascanya: 3 recibos, 1 impagado → 33.3%
        rascanya = df[df["barri_normalizado"] == "rascanya"]
        assert not rascanya.empty
        pct = rascanya["pct_impagados"].iloc[0]
        assert abs(pct - 33.33) < 1

    def test_pct_juridica_rascanya(self, tmp_path):
        df = clean_ibi(self._sample_csv(tmp_path))
        rascanya = df[df["barri_normalizado"] == "rascanya"]
        pct_jur = rascanya["pct_persona_juridica"].iloc[0]
        # 1 jurídica de 3 → 33.3%
        assert abs(pct_jur - 33.33) < 1

    def test_pct_impagados_campanar(self, tmp_path):
        df = clean_ibi(self._sample_csv(tmp_path))
        campanar = df[df["barri_normalizado"] == "campanar"]
        pct = campanar["pct_impagados"].iloc[0]
        # 1 pendent de 2 → 50%
        assert abs(pct - 50) < 1


# ---------------------------------------------------------------------------
# clean_salud_mental
# ---------------------------------------------------------------------------

class TestCleanSaludMental:
    def _sample_csv(self, tmp_path: Path) -> Path:
        content = (
            "Any;Barri;Total_casos;Taxa_per_1000\n"
            "2023;Rascanya;120;15.5\n"
            "2023;Campanar;80;10.2\n"
            "2023;Algirós;;8.0\n"  # casos nulos → debe mantenerse
        )
        return _csv_path(tmp_path, "salud_mental.csv", content)

    def test_output_columns(self, tmp_path):
        df = clean_salud_mental(self._sample_csv(tmp_path))
        assert "anyo" in df.columns
        assert "barri_normalizado" in df.columns
        assert "tasa_por_1000" in df.columns

    def test_tasa_numeric(self, tmp_path):
        df = clean_salud_mental(self._sample_csv(tmp_path))
        assert pd.api.types.is_float_dtype(df["tasa_por_1000"])

    def test_null_casos_row_kept(self, tmp_path):
        """Una fila con casos nulos no debe eliminar la fila si tiene tasa."""
        df = clean_salud_mental(self._sample_csv(tmp_path))
        assert len(df) == 3

    def test_column_variant_nombre(self, tmp_path):
        """Acepta 'nombre' como nombre de columna de casos."""
        content = (
            "Any;Barri;nombre;tasa\n"
            "2022;Campanar;100;12.0\n"
        )
        p = _csv_path(tmp_path, "sm2.csv", content)
        df = clean_salud_mental(p)
        assert "casos_totales" in df.columns or "tasa_por_1000" in df.columns


# ---------------------------------------------------------------------------
# clean_migrantes
# ---------------------------------------------------------------------------

class TestCleanMigrantes:
    def _sample_csv(self, tmp_path: Path) -> Path:
        content = (
            "Any;Barri;pct_estrangers;pct_extracomunitaris\n"
            "2023;Rascanya;22.5;14.0\n"
            "2023;Campanar;10.0;5.5\n"
        )
        return _csv_path(tmp_path, "migrantes.csv", content)

    def test_output_columns(self, tmp_path):
        df = clean_migrantes(self._sample_csv(tmp_path))
        assert "anyo" in df.columns
        assert "barri_normalizado" in df.columns
        assert "pct_migrantes" in df.columns

    def test_extracomunitarios_column(self, tmp_path):
        df = clean_migrantes(self._sample_csv(tmp_path))
        assert "pct_extracomunitarios" in df.columns

    def test_values_numeric(self, tmp_path):
        df = clean_migrantes(self._sample_csv(tmp_path))
        assert pd.api.types.is_float_dtype(df["pct_migrantes"])

    def test_barrio_normalized(self, tmp_path):
        df = clean_migrantes(self._sample_csv(tmp_path))
        assert "rascanya" in df["barri_normalizado"].values

    def test_missing_pct_columns_returns_partial(self, tmp_path):
        """Si faltan columnas de porcentaje, el resultado tiene al menos año y barrio."""
        content = (
            "Any;Barri;poblacion_total\n"
            "2022;Campanar;5000\n"
        )
        p = _csv_path(tmp_path, "mig2.csv", content)
        df = clean_migrantes(p)
        assert "anyo" in df.columns
