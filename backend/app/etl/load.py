"""
ETL Step 4: Carga de datos procesados en PostgreSQL + PostGIS.

Orden de ejecución recomendado:
    1. download.py  — descarga CSVs y GeoJSON
    2. clean.py     — limpia y genera Parquet en data/processed/
    3. geocode.py   — procesa GeoJSON de barrios
    4. load.py      — carga todo en PostgreSQL

Uso:
    python -m app.etl.load
"""
import json
import logging
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

from app.core.config import settings
from app.etl.download import RAW_DIR

logger = logging.getLogger(__name__)

PROCESSED_DIR = RAW_DIR.parent / "processed"
GEOJSON_DIR = RAW_DIR.parent / "geojson"

# Usamos engine síncrono para la carga ETL batch (más simple que asyncpg para bulk inserts)
SYNC_DB_URL = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")


def get_engine():
    return create_engine(SYNC_DB_URL, echo=False)


def load_barrios(engine, ciudad: str = "valencia") -> dict[str, int]:
    """
    Carga barrios desde el GeoJSON procesado para la ciudad indicada.
    Devuelve un dict {codigo_ine: barrio_id} para uso en cargas posteriores.
    """
    geojson_path = GEOJSON_DIR / f"barrios_{ciudad}.geojson"
    if not geojson_path.exists():
        logger.error(f"No existe barrios_{ciudad}.geojson. Ejecuta primero geocode.py")
        return {}

    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)

    barrio_ids: dict[str, int] = {}
    with engine.begin() as conn:
        for feat in gj["features"]:
            props = feat["properties"]
            # Guardar geometría como GeoJSON texto (sin PostGIS)
            geom_text = json.dumps(feat["geometry"]) if feat.get("geometry") else None

            result = conn.execute(
                text("""
                    INSERT INTO barrios (codigo_ine, nombre, nombre_val, distrito, distrito_num, ciudad, geometria)
                    VALUES (:codigo_ine, :nombre, :nombre_val, :distrito, :distrito_num, :ciudad, :geometria)
                    ON CONFLICT (codigo_ine) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        nombre_val = EXCLUDED.nombre_val,
                        distrito = EXCLUDED.distrito,
                        ciudad = EXCLUDED.ciudad,
                        geometria = EXCLUDED.geometria
                    RETURNING id
                """),
                {
                    "codigo_ine": props["codigo_ine"],
                    "nombre": props["nombre"],
                    "nombre_val": props.get("nombre_val"),
                    "distrito": props.get("distrito"),
                    "distrito_num": props.get("distrito_num"),
                    "ciudad": ciudad,
                    "geometria": geom_text,
                },
            )
            barrio_id = result.scalar()
            barrio_ids[props["codigo_ine"]] = barrio_id

    logger.info(f"Barrios {ciudad} cargados: {len(barrio_ids)}")
    return barrio_ids


def _build_barrio_lookup(engine) -> dict[str, int]:
    """Construye un lookup {barri_normalizado: barrio_id} desde la BD."""
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, nombre FROM barrios")).fetchall()
    lookup = {}
    for row in rows:
        # Normalizamos igual que en clean.py
        key = row.nombre.strip().lower()
        lookup[key] = row.id
    return lookup


def load_indicadores_renta(engine, barrio_lookup: dict[str, int]):
    path = PROCESSED_DIR / "renta_clean.parquet"
    if not path.exists():
        logger.warning("renta_clean.parquet no encontrado, saltando.")
        return

    df = pd.read_parquet(path)
    rows = []
    for _, row in df.iterrows():
        barrio_id = barrio_lookup.get(str(row.get("barri_normalizado", "")).lower())
        if not barrio_id:
            continue
        rows.append({
            "barrio_id": barrio_id,
            "anyo": int(row["anyo"]) if pd.notna(row.get("anyo")) else None,
            "renta_media_hogar": float(row["renta_media_hogar"]) if pd.notna(row.get("renta_media_hogar")) else None,
            "renta_media_persona": float(row["renta_media_persona"]) if pd.notna(row.get("renta_media_persona")) else None,
            "coste_alquiler_medio": None,  # No disponible en este dataset; se puede enriquecer
        })

    if rows:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO indicadores_renta (barrio_id, anyo, renta_media_hogar, renta_media_persona, coste_alquiler_medio)
                    VALUES (:barrio_id, :anyo, :renta_media_hogar, :renta_media_persona, :coste_alquiler_medio)
                    ON CONFLICT (barrio_id, anyo) DO UPDATE SET
                        renta_media_hogar = EXCLUDED.renta_media_hogar,
                        renta_media_persona = EXCLUDED.renta_media_persona
                """),
                rows,
            )
    logger.info(f"Indicadores renta cargados: {len(rows)} filas")


def load_indicadores_salud_mental(engine, barrio_lookup: dict[str, int]):
    path = PROCESSED_DIR / "salud_mental_clean.parquet"
    if not path.exists():
        logger.warning("salud_mental_clean.parquet no encontrado, saltando.")
        return

    df = pd.read_parquet(path)
    rows = []
    for _, row in df.iterrows():
        barrio_id = barrio_lookup.get(str(row.get("barri_normalizado", "")).lower())
        if not barrio_id:
            continue
        rows.append({
            "barrio_id": barrio_id,
            "anyo": int(row["anyo"]) if pd.notna(row.get("anyo")) else None,
            "casos_totales": int(row["casos_totales"]) if pd.notna(row.get("casos_totales")) else None,
            "tasa_por_1000": float(row["tasa_por_1000"]) if pd.notna(row.get("tasa_por_1000")) else None,
            "recursos_disponibles": None,
        })

    if rows:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO indicadores_salud_mental (barrio_id, anyo, casos_totales, tasa_por_1000, recursos_disponibles)
                    VALUES (:barrio_id, :anyo, :casos_totales, :tasa_por_1000, :recursos_disponibles)
                    ON CONFLICT (barrio_id, anyo) DO UPDATE SET
                        casos_totales = EXCLUDED.casos_totales,
                        tasa_por_1000 = EXCLUDED.tasa_por_1000
                """),
                rows,
            )
    logger.info(f"Salud mental cargada: {len(rows)} filas")


def load_indicadores_exclusion(engine, barrio_lookup: dict[str, int]):
    path = PROCESSED_DIR / "migrantes_clean.parquet"
    if not path.exists():
        logger.warning("migrantes_clean.parquet no encontrado, saltando.")
        return

    df = pd.read_parquet(path)
    rows = []
    for _, row in df.iterrows():
        barrio_id = barrio_lookup.get(str(row.get("barri_normalizado", "")).lower())
        if not barrio_id:
            continue
        rows.append({
            "barrio_id": barrio_id,
            "anyo": int(row["anyo"]) if pd.notna(row.get("anyo")) else None,
            "pct_migrantes": float(row["pct_migrantes"]) if pd.notna(row.get("pct_migrantes")) else None,
            "tasa_pobreza": None,       # Se enriquece con datos Madrid en Fase 2
            "precariedad_laboral": None,
            "pct_desempleo": None,
        })

    if rows:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO indicadores_exclusion (barrio_id, anyo, pct_migrantes, tasa_pobreza, precariedad_laboral, pct_desempleo)
                    VALUES (:barrio_id, :anyo, :pct_migrantes, :tasa_pobreza, :precariedad_laboral, :pct_desempleo)
                    ON CONFLICT (barrio_id, anyo) DO UPDATE SET
                        pct_migrantes = EXCLUDED.pct_migrantes
                """),
                rows,
            )
    logger.info(f"Indicadores exclusión cargados: {len(rows)} filas")


def load_recibos_ibi(engine, barrio_lookup: dict[str, int]):
    path = PROCESSED_DIR / "ibi_clean.parquet"
    if not path.exists():
        logger.warning("ibi_clean.parquet no encontrado, saltando.")
        return

    df = pd.read_parquet(path)
    rows = []
    for _, row in df.iterrows():
        barrio_id = barrio_lookup.get(str(row.get("barri_normalizado", "")).lower())
        if not barrio_id:
            continue
        rows.append({
            "barrio_id": barrio_id,
            "anyo": int(row["anyo"]) if pd.notna(row.get("anyo")) else None,
            "total_recibos": int(row["total_recibos"]) if pd.notna(row.get("total_recibos")) else None,
            "recibos_impagados": int(row["recibos_impagados"]) if pd.notna(row.get("recibos_impagados")) else None,
            "pct_impagados": float(row["pct_impagados"]) if pd.notna(row.get("pct_impagados")) else None,
            "pct_persona_juridica": float(row["pct_persona_juridica"]) if pd.notna(row.get("pct_persona_juridica")) else None,
        })

    if rows:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO recibos_ibi (barrio_id, anyo, total_recibos, recibos_impagados, pct_impagados, pct_persona_juridica)
                    VALUES (:barrio_id, :anyo, :total_recibos, :recibos_impagados, :pct_impagados, :pct_persona_juridica)
                    ON CONFLICT (barrio_id, anyo) DO UPDATE SET
                        total_recibos = EXCLUDED.total_recibos,
                        recibos_impagados = EXCLUDED.recibos_impagados,
                        pct_impagados = EXCLUDED.pct_impagados,
                        pct_persona_juridica = EXCLUDED.pct_persona_juridica
                """),
                rows,
            )
    logger.info(f"Recibos IBI cargados: {len(rows)} filas")


def run_all():
    """Ejecuta la carga completa en este orden: barrios → indicadores."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
    engine = get_engine()

    logger.info("=== Paso 1: Cargando barrios ===")
    barrio_lookup_ine = load_barrios(engine)

    if not barrio_lookup_ine:
        logger.error("No se cargaron barrios. Abortando.")
        return

    logger.info("=== Paso 2: Construyendo lookup de barrios ===")
    barrio_lookup = _build_barrio_lookup(engine)
    logger.info(f"Lookup: {len(barrio_lookup)} barrios en BD")

    logger.info("=== Paso 3: Cargando indicadores ===")
    load_indicadores_renta(engine, barrio_lookup)
    load_indicadores_salud_mental(engine, barrio_lookup)
    load_indicadores_exclusion(engine, barrio_lookup)
    load_recibos_ibi(engine, barrio_lookup)

    logger.info("=== ETL completado ===")


if __name__ == "__main__":
    run_all()
