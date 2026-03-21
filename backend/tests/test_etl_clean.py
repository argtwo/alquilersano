"""Tests unitarios del pipeline ETL — limpieza y normalización."""
import pandas as pd
import pytest

from app.etl.clean import normalize_barrio_name


def test_normalize_barrio_name_bilingual():
    assert normalize_barrio_name("Quatre Carreres / Quatre Carreres") == "quatre carreres"


def test_normalize_barrio_name_single():
    assert normalize_barrio_name("Extramurs") == "extramurs"


def test_normalize_barrio_name_fix():
    # La Olivereta debe normalizarse a olivereta
    assert normalize_barrio_name("La Olivereta") == "olivereta"


def test_normalize_barrio_name_extra_spaces():
    assert normalize_barrio_name("  Campanar  ") == "campanar"


def test_normalize_barrio_name_none():
    assert normalize_barrio_name(None) == ""
