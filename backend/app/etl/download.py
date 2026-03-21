"""
ETL Step 1: Descarga de datasets desde portales de datos abiertos.

Uso:
    python -m app.etl.download              # descarga todos
    python -m app.etl.download --dataset renta
    python -m app.etl.download --dataset ibi

Los archivos se guardan en data/raw/ con timestamp para mantener histórico.
"""
import argparse
import logging
import os
from datetime import datetime
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

RAW_DIR = Path(os.getenv("DATA_RAW_DIR", "/data/raw"))

# Datasets a descargar — nombre_clave: (url, nombre_fichero_base)
# Datasets agrupados por ciudad para facilitar la extensión multi-ciudad
DATASETS: dict[str, tuple[str, str]] = {
    # ── Valencia ──────────────────────────────────────────────────────────────
    "renta": (
        "https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
        "renta-per-persona-i-llar-renta-por-persona-y-hogar/exports/csv?lang=es&delimiter=%3B",
        "valencia_renta_por_hogar",
    ),
    "ibi": (
        "https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
        "recibos-ibi-2020-al-2025/exports/csv?lang=es&delimiter=%3B",
        "valencia_recibos_ibi",
    ),
    "salud_mental": (
        "https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
        "malaltia-mental-enfermedad-mental/exports/csv?lang=es&delimiter=%3B",
        "valencia_salud_mental",
    ),
    "migrantes": (
        "https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
        "migrants-migrantes/exports/csv?lang=es&delimiter=%3B",
        "valencia_migrantes",
    ),
    "barrios_geojson": (
        "https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
        "barris-barrios/exports/geojson?lang=es",
        "valencia_barrios",
    ),

    # ── Madrid ────────────────────────────────────────────────────────────────
    # Indicadores de exclusión social por barrio (Observatorio Social Madrid)
    "madrid_exclusion": (
        "https://datos.madrid.es/egob/catalogo/300166-0-indicadores-exclusion-social.csv",
        "madrid_exclusion_social",
    ),
    # Renta neta media por hogar (Estadística Municipal Madrid)
    "madrid_renta": (
        "https://datos.madrid.es/egob/catalogo/214571-0-renta-disponible-hogar.csv",
        "madrid_renta_hogar",
    ),
    # GeoJSON barrios de Madrid (CartoCiudad / Portal de Datos Abiertos)
    "madrid_barrios_geojson": (
        "https://datos.madrid.es/egob/catalogo/200078-0-junta-municipal.geojson",
        "madrid_barrios",
    ),

    # ── Barcelona ─────────────────────────────────────────────────────────────
    # Renta familiar disponible por barrio (Ajuntament Barcelona)
    "barcelona_renta": (
        "https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search"
        "?resource_id=ed3f91bb-ef32-4174-bfcc-cfa0f12c5965&limit=1000&format=csv",
        "barcelona_renta_familiar",
    ),
    # Estadísticas de población por barrio (BCN Open Data)
    "barcelona_poblacion": (
        "https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search"
        "?resource_id=7e68f3f9-6c76-4625-bc44-2f9b6aef78e3&limit=1000&format=csv",
        "barcelona_poblacion_barrios",
    ),
    # GeoJSON barrios de Barcelona
    "barcelona_barrios_geojson": (
        "https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search"
        "?resource_id=3857b215-6591-4f7e-b8aa-0a43d714bf2f&format=geojson",
        "barcelona_barrios",
    ),
}

# Datasets requeridos para cada ciudad (los demás son opcionales/enriquecimiento)
DATASETS_POR_CIUDAD: dict[str, list[str]] = {
    "valencia": ["renta", "ibi", "salud_mental", "migrantes", "barrios_geojson"],
    "madrid": ["madrid_exclusion", "madrid_renta", "madrid_barrios_geojson"],
    "barcelona": ["barcelona_renta", "barcelona_poblacion", "barcelona_barrios_geojson"],
}


def download_dataset(key: str, url: str, filename_base: str) -> Path:
    """Descarga un dataset y lo guarda en RAW_DIR con timestamp."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d")
    ext = "geojson" if "geojson" in url else "csv"
    dest = RAW_DIR / f"{filename_base}_{timestamp}.{ext}"

    if dest.exists():
        logger.info(f"[{key}] Ya existe {dest.name}, saltando descarga.")
        return dest

    logger.info(f"[{key}] Descargando desde {url}")
    try:
        resp = requests.get(url, timeout=120, stream=True)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        size_mb = dest.stat().st_size / 1_000_000
        logger.info(f"[{key}] Guardado en {dest} ({size_mb:.1f} MB)")
    except requests.RequestException as e:
        logger.error(f"[{key}] Error al descargar: {e}")
        raise

    return dest


def download_ciudad(ciudad: str) -> dict[str, Path]:
    """Descarga los datasets de una ciudad concreta (valencia|madrid|barcelona)."""
    keys = DATASETS_POR_CIUDAD.get(ciudad)
    if keys is None:
        raise ValueError(f"Ciudad desconocida: {ciudad}. Opciones: {list(DATASETS_POR_CIUDAD)}")
    return download_all(only=keys)


def download_all(only: list[str] | None = None) -> dict[str, Path]:
    """Descarga todos los datasets (o solo los indicados en `only`)."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
    targets = {k: v for k, v in DATASETS.items() if only is None or k in only}
    results: dict[str, Path] = {}
    for key, (url, base) in targets.items():
        try:
            results[key] = download_dataset(key, url, base)
        except Exception:
            logger.error(f"[{key}] Descarga fallida, continuando con el resto.")
    return results


def get_latest(key: str) -> Path | None:
    """Devuelve el fichero más reciente para un dataset dado."""
    base = DATASETS[key][1]
    ext = "geojson" if key == "barrios_geojson" else "csv"
    files = sorted(RAW_DIR.glob(f"{base}_*.{ext}"), reverse=True)
    return files[0] if files else None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Descarga datasets AlquilerSano")
    parser.add_argument(
        "--dataset",
        nargs="+",
        choices=list(DATASETS.keys()),
        help="Datasets específicos a descargar (por defecto: todos)",
    )
    parser.add_argument(
        "--ciudad",
        choices=list(DATASETS_POR_CIUDAD.keys()),
        help="Descargar solo los datasets de una ciudad",
    )
    args = parser.parse_args()
    if args.ciudad:
        download_ciudad(args.ciudad)
    else:
        download_all(only=args.dataset)
