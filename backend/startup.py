#!/usr/bin/env python3
"""
Script de startup: limpia DB, aplica migraciones y ejecuta ETL de Valencia.
"""
import os, subprocess, sys, logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
log = logging.getLogger(__name__)

db_url = os.environ.get("DATABASE_URL", "")
sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

# 1. Limpiar tablas antiguas
log.info(">>> Limpiando tablas...")
try:
    import psycopg2
    conn = psycopg2.connect(sync_url)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        DROP TABLE IF EXISTS alembic_version, ier_scores, recibos_ibi,
        indicadores_exclusion, indicadores_salud_mental,
        indicadores_renta, barrios CASCADE;
    """)
    conn.close()
    log.info("✓ Tablas eliminadas")
except Exception as e:
    log.warning(f"Drop: {e}")

# 2. Migraciones
log.info(">>> Aplicando migraciones...")
r = subprocess.run(["alembic", "upgrade", "head"])
if r.returncode != 0:
    sys.exit(r.returncode)

# 3. ETL solo si la tabla está vacía
log.info(">>> Verificando si hay datos...")
try:
    import psycopg2
    conn = psycopg2.connect(sync_url)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM barrios")
    count = cur.fetchone()[0]
    conn.close()
    if count > 0:
        log.info(f"✓ Ya hay {count} barrios. Saltando ETL.")
        sys.exit(0)
except Exception as e:
    log.warning(f"Check count: {e}")

# 4. ETL
log.info(">>> Ejecutando ETL Valencia...")
# Configurar directorio de datos en /tmp (Railway no tiene /data)
os.environ.setdefault("DATA_RAW_DIR", "/tmp/data/raw")
os.environ.setdefault("DATA_PROCESSED_DIR", "/tmp/data/processed")
os.environ.setdefault("DATA_GEOJSON_DIR", "/tmp/data/geojson")

try:
    from app.etl.download import download_all, DATASETS_POR_CIUDAD
    from app.etl.clean import run_all as clean_all
    from app.etl.geocode import process_barrios_geojson
    from app.etl.load import run_all as load_all

    log.info("Descargando datasets Valencia...")
    download_all(only=DATASETS_POR_CIUDAD["valencia"])
    log.info("Limpiando datos...")
    clean_all()
    log.info("Procesando GeoJSON...")
    process_barrios_geojson()
    log.info("Cargando en BD...")
    load_all()
    log.info("✓ ETL completado")
except Exception as e:
    log.error(f"ETL falló: {e}. Continuando sin datos...")

sys.exit(0)
