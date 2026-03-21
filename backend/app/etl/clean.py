"""
ETL Step 2: Limpieza y normalización de datasets descargados.

Genera ficheros limpios en data/processed/ listos para carga en PostgreSQL.

Uso:
    python -m app.etl.clean
"""
import logging
import re
from pathlib import Path

import pandas as pd

from app.etl.download import RAW_DIR, get_latest

logger = logging.getLogger(__name__)

PROCESSED_DIR = RAW_DIR.parent / "processed"

# Mapa de nombres de barrio de Valencia → código INE de barrio (2 dígitos dentro del distrito)
# Fuente: Nomenclátor INE 2021 — Valencia código municipio 46250
# Formato clave: nombre normalizado (sin acentos, minúsculas)
# Se amplía con la tabla completa en la función load_barrio_lookup()
BARRIO_NOMBRE_FIXES = {
    "pobles del sud": "pobles del sud",
    "quatre carreres": "quatre carreres",
    "campanar": "campanar",
    "l'olivereta": "olivereta",
    "la olivereta": "olivereta",
    "rascanya": "rascanya",
    "benimaclet": "benimaclet",
    "algiros": "algirós",
    "algirós": "algirós",
    "el pla del real": "pla del real",
    "extramurs": "extramurs",
    "ciudad vella": "ciutat vella",
    "ciudad vieja": "ciutat vella",
}


def normalize_barrio_name(name: str) -> str:
    """Normaliza nombre de barrio: minúsculas, sin espacios dobles, sin prefijos bilingüe."""
    if not isinstance(name, str):
        return ""
    # Los nombres vienen como "Nom Valencià / Nombre Castellano" o solo uno
    if " / " in name:
        name = name.split(" / ")[0]  # Usar la versión valenciana
    name = name.strip().lower()
    name = re.sub(r"\s+", " ", name)
    return BARRIO_NOMBRE_FIXES.get(name, name)


def clean_renta(raw_path: Path) -> pd.DataFrame:
    """Limpia el dataset de Renta por persona y hogar (Valencia)."""
    logger.info(f"Limpiando renta desde {raw_path.name}")
    df = pd.read_csv(raw_path, sep=";", encoding="utf-8", on_bad_lines="skip")

    # Detectar columnas — los nombres exactos pueden variar entre versiones del CSV
    col_map = {}
    for col in df.columns:
        c = col.lower().replace(" ", "_")
        if "any" in c or "año" in c or "year" in c:
            col_map["anyo"] = col
        elif "barri" in c and "codi" not in c:
            col_map["barri"] = col
        elif "codi" in c and "barri" in c:
            col_map["codi_barri"] = col
        elif "rend" in c and "person" in c:
            col_map["renta_persona"] = col
        elif "rend" in c and ("llar" in c or "hogar" in c):
            col_map["renta_hogar"] = col

    required = {"anyo", "barri"}
    missing = required - set(col_map.keys())
    if missing:
        logger.warning(f"Columnas no encontradas en renta: {missing}. Columnas disponibles: {list(df.columns)}")

    result = pd.DataFrame()
    if "anyo" in col_map:
        result["anyo"] = pd.to_numeric(df[col_map["anyo"]], errors="coerce")
    if "barri" in col_map:
        result["barri_normalizado"] = df[col_map["barri"]].apply(normalize_barrio_name)
    if "codi_barri" in col_map:
        result["codi_barri"] = df[col_map["codi_barri"]]
    if "renta_persona" in col_map:
        result["renta_media_persona"] = pd.to_numeric(df[col_map["renta_persona"]], errors="coerce")
    if "renta_hogar" in col_map:
        result["renta_media_hogar"] = pd.to_numeric(df[col_map["renta_hogar"]], errors="coerce")

    result = result.dropna(subset=["anyo"] if "anyo" in result.columns else [])
    logger.info(f"Renta: {len(result)} filas limpias")
    return result


def clean_ibi(raw_path: Path) -> pd.DataFrame:
    """Limpia el dataset de Recibos IBI 2020–2025."""
    logger.info(f"Limpiando IBI desde {raw_path.name}")
    df = pd.read_csv(raw_path, sep=";", encoding="utf-8", on_bad_lines="skip")

    col_map = {}
    for col in df.columns:
        c = col.lower().replace(" ", "_")
        if "any" in c or "año" in c or "year" in c:
            col_map["anyo"] = col
        elif "barri" in c and "codi" not in c:
            col_map["barri"] = col
        elif "naturalesa" in c or "naturaleza" in c or "juridic" in c:
            col_map["naturaleza_juridica"] = col
        elif "estat" in c or "estado" in c or "cobr" in c:
            col_map["estado_cobramiento"] = col

    result = pd.DataFrame()
    if "anyo" in col_map:
        result["anyo"] = pd.to_numeric(df[col_map["anyo"]], errors="coerce")
    if "barri" in col_map:
        result["barri_normalizado"] = df[col_map["barri"]].apply(normalize_barrio_name)

    if "naturaleza_juridica" in col_map and "estado_cobramiento" in col_map:
        df["_es_juridica"] = df[col_map["naturaleza_juridica"]].str.lower().str.contains(
            "jurídic|juridic|societat|sociedad|empresa", na=False
        )
        df["_es_impagado"] = df[col_map["estado_cobramiento"]].str.lower().str.contains(
            "impagat|impagado|pendent|pendiente", na=False
        )
        # Agregar por barrio y año
        groupby_cols = [col_map["anyo"]] + ([col_map["barri"]] if "barri" in col_map else [])
        agg = df.groupby(groupby_cols).agg(
            total_recibos=("_es_impagado", "count"),
            recibos_impagados=("_es_impagado", "sum"),
            recibos_juridica=("_es_juridica", "sum"),
        ).reset_index()
        agg["pct_impagados"] = agg["recibos_impagados"] / agg["total_recibos"] * 100
        agg["pct_persona_juridica"] = agg["recibos_juridica"] / agg["total_recibos"] * 100
        result = agg.rename(columns={col_map["anyo"]: "anyo"})
        if "barri" in col_map:
            result["barri_normalizado"] = result[col_map["barri"]].apply(normalize_barrio_name)

    logger.info(f"IBI: {len(result)} filas limpias")
    return result


def clean_salud_mental(raw_path: Path) -> pd.DataFrame:
    """Limpia el dataset de Enfermedad Mental (Malaltia Mental)."""
    logger.info(f"Limpiando salud mental desde {raw_path.name}")
    df = pd.read_csv(raw_path, sep=";", encoding="utf-8", on_bad_lines="skip")

    col_map = {}
    for col in df.columns:
        c = col.lower().replace(" ", "_")
        if "any" in c or "año" in c:
            col_map["anyo"] = col
        elif "barri" in c and "codi" not in c:
            col_map["barri"] = col
        elif "nombre" in c or "casos" in c or "total" in c:
            col_map["casos"] = col
        elif "tasa" in c or "taxa" in c or "per_1000" in c or "per1000" in c:
            col_map["tasa"] = col

    result = pd.DataFrame()
    if "anyo" in col_map:
        result["anyo"] = pd.to_numeric(df[col_map["anyo"]], errors="coerce")
    if "barri" in col_map:
        result["barri_normalizado"] = df[col_map["barri"]].apply(normalize_barrio_name)
    if "casos" in col_map:
        result["casos_totales"] = pd.to_numeric(df[col_map["casos"]], errors="coerce")
    if "tasa" in col_map:
        result["tasa_por_1000"] = pd.to_numeric(df[col_map["tasa"]], errors="coerce")

    logger.info(f"Salud mental: {len(result)} filas limpias")
    return result


def clean_migrantes(raw_path: Path) -> pd.DataFrame:
    """Limpia el dataset de Migrantes."""
    logger.info(f"Limpiando migrantes desde {raw_path.name}")
    df = pd.read_csv(raw_path, sep=";", encoding="utf-8", on_bad_lines="skip")

    col_map = {}
    for col in df.columns:
        c = col.lower().replace(" ", "_")
        if "any" in c or "año" in c:
            col_map["anyo"] = col
        elif "barri" in c and "codi" not in c:
            col_map["barri"] = col
        elif "pct" in c or "perc" in c or "%" in c:
            if "extrac" in c or "extracom" in c:
                col_map["pct_extracomunitaris"] = col
            elif "estr" in c or "estrang" in c:
                col_map["pct_estrangers"] = col

    result = pd.DataFrame()
    if "anyo" in col_map:
        result["anyo"] = pd.to_numeric(df[col_map["anyo"]], errors="coerce")
    if "barri" in col_map:
        result["barri_normalizado"] = df[col_map["barri"]].apply(normalize_barrio_name)
    if "pct_estrangers" in col_map:
        result["pct_migrantes"] = pd.to_numeric(df[col_map["pct_estrangers"]], errors="coerce")
    if "pct_extracomunitaris" in col_map:
        result["pct_extracomunitarios"] = pd.to_numeric(df[col_map["pct_extracomunitaris"]], errors="coerce")

    logger.info(f"Migrantes: {len(result)} filas limpias")
    return result


def run_all() -> dict[str, pd.DataFrame]:
    """Ejecuta la limpieza de todos los datasets disponibles."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[str, pd.DataFrame] = {}

    cleaners = {
        "renta": clean_renta,
        "ibi": clean_ibi,
        "salud_mental": clean_salud_mental,
        "migrantes": clean_migrantes,
    }

    for key, cleaner_fn in cleaners.items():
        raw = get_latest(key)
        if raw is None:
            logger.warning(f"[{key}] No hay fichero raw descargado. Ejecuta primero download.py.")
            continue
        try:
            df = cleaner_fn(raw)
            out = PROCESSED_DIR / f"{key}_clean.parquet"
            df.to_parquet(out, index=False)
            logger.info(f"[{key}] Guardado en {out}")
            results[key] = df
        except Exception as e:
            logger.error(f"[{key}] Error en limpieza: {e}")

    return results


if __name__ == "__main__":
    run_all()
