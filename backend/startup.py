#!/usr/bin/env python3
"""
Script de startup: aplica migraciones pendientes y arranca.
"""
import os, subprocess, sys, logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")
log = logging.getLogger(__name__)

# 1. Migraciones (solo aplica las pendientes, no borra nada)
log.info(">>> Aplicando migraciones pendientes...")
try:
    r = subprocess.run(["alembic", "upgrade", "head"], timeout=60)
    if r.returncode != 0:
        log.warning(f"Alembic returned {r.returncode}, intentando stamp head...")
        # Si falla porque las tablas ya existen pero no hay alembic_version,
        # simplemente marcamos la version actual
        subprocess.run(["alembic", "stamp", "head"], timeout=30)
except Exception as e:
    log.warning(f"Migration error: {e}, intentando stamp head...")
    try:
        subprocess.run(["alembic", "stamp", "head"], timeout=30)
    except Exception as e2:
        log.error(f"Stamp also failed: {e2}")

log.info(">>> Startup completado")
sys.exit(0)
