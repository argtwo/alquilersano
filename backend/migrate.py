#!/usr/bin/env python3
"""Reset DB y aplica migraciones. Se ejecuta en el startup de Railway."""
import os
import subprocess
import sys

db_url = os.environ.get("DATABASE_URL", "")
# Convertir asyncpg -> psycopg2 para operaciones síncronas
sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

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
    print("✓ Tablas antiguas eliminadas")
except Exception as e:
    print(f"⚠ Drop tables: {e} (continuando...)")

# Aplicar migraciones
result = subprocess.run(["alembic", "upgrade", "head"], capture_output=False)
sys.exit(result.returncode)
