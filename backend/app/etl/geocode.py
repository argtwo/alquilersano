"""
ETL Step 3: Geocodificación — carga geometrías GeoJSON de barrios.

Descarga (o usa el fichero local) el GeoJSON de barrios de Valencia
y genera el fichero data/geojson/barrios_valencia.geojson listo para cargar.

Uso:
    python -m app.etl.geocode
"""
import json
import logging
import os
from pathlib import Path

from app.etl.download import RAW_DIR, get_latest

logger = logging.getLogger(__name__)

GEOJSON_DIR = RAW_DIR.parent / "geojson"


def process_barrios_geojson() -> Path:
    """
    Transforma el GeoJSON de Open Data Valencia al formato esperado por la tabla `barrios`.

    El GeoJSON de Open Data Valencia tiene features con propiedades como:
      - 'codi_barri' / 'barri': código y nombre del barrio
      - 'nom_barri' / 'barri_val': nombre en valenciano
      - 'codi_districte' / 'districte': código y nombre del distrito
    """
    GEOJSON_DIR.mkdir(parents=True, exist_ok=True)

    raw_path = get_latest("barrios_geojson")
    if raw_path is None:
        logger.error("No hay GeoJSON de barrios descargado. Ejecuta primero: download.py --dataset barrios_geojson")
        raise FileNotFoundError("barrios GeoJSON not found in data/raw/")

    logger.info(f"Procesando GeoJSON desde {raw_path.name}")
    with open(raw_path, encoding="utf-8") as f:
        geojson = json.load(f)

    features_out = []
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})

        # Normalizar nombres de campo — Open Data Valencia puede usar nombres distintos
        codi_barri = (
            props.get("codi_barri")
            or props.get("codibarri")
            or props.get("barri_id")
            or ""
        )
        nom_barri = (
            props.get("nom_barri")
            or props.get("barri")
            or props.get("nombre_barrio")
            or ""
        )
        nom_barri_val = (
            props.get("nom_barri_val")
            or props.get("nom_barri_va")
            or props.get("barri_val")
            or nom_barri
        )
        districte = (
            props.get("nom_districte")
            or props.get("districte")
            or props.get("nombre_distrito")
            or ""
        )
        districte_num = props.get("codi_districte") or props.get("num_districte")

        # Construir código INE: municipio Valencia = 46250, distrito 2 dígitos, sección 3 dígitos
        # Para el MVP usamos codi_barri del Ayuntamiento como proxy
        codigo_ine = f"46250{str(districte_num or 0).zfill(2)}{str(codi_barri or 0).zfill(2)}"

        features_out.append({
            "type": "Feature",
            "geometry": feature.get("geometry"),
            "properties": {
                "codigo_ine": codigo_ine,
                "nombre": nom_barri,
                "nombre_val": nom_barri_val,
                "distrito": districte,
                "distrito_num": districte_num,
            },
        })

    output = {"type": "FeatureCollection", "features": features_out}
    out_path = GEOJSON_DIR / "barrios_valencia.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    logger.info(f"GeoJSON procesado: {len(features_out)} barrios → {out_path}")
    return out_path


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
    process_barrios_geojson()
