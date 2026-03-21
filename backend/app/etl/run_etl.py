"""
Punto de entrada para ejecutar el pipeline ETL completo.

Uso:
    python -m app.etl.run_etl                   # pipeline completo
    python -m app.etl.run_etl --step download   # solo descarga
    python -m app.etl.run_etl --step clean      # solo limpieza
    python -m app.etl.run_etl --step geocode    # solo geocodificación
    python -m app.etl.run_etl --step load       # solo carga en BD
"""
import argparse
import logging

logger = logging.getLogger(__name__)


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
    parser = argparse.ArgumentParser(description="Pipeline ETL AlquilerSano")
    parser.add_argument(
        "--step",
        choices=["download", "clean", "geocode", "load", "all"],
        default="all",
    )
    args = parser.parse_args()

    if args.step in ("download", "all"):
        logger.info(">>> STEP 1: Download")
        from app.etl.download import download_all
        download_all()

    if args.step in ("clean", "all"):
        logger.info(">>> STEP 2: Clean")
        from app.etl.clean import run_all as clean_all
        clean_all()

    if args.step in ("geocode", "all"):
        logger.info(">>> STEP 3: Geocode")
        from app.etl.geocode import process_barrios_geojson
        process_barrios_geojson()

    if args.step in ("load", "all"):
        logger.info(">>> STEP 4: Load")
        from app.etl.load import run_all as load_all
        load_all()

    logger.info("Pipeline finalizado.")


if __name__ == "__main__":
    main()
