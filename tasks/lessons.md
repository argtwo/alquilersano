# Lessons — AlquilerSano

## Railway Deploy
- **startup.py**: NUNCA borrar `alembic_version`. Causa `DuplicateTableError` al re-ejecutar migraciones. Usar `alembic stamp head` como fallback.
- **requirements.txt**: NO incluir geopandas/pandas/sklearn si no se usan en runtime. Causan build failure en python:3.12-slim por falta de GDAL/gcc.
- **Root directory**: Está en `./backend`. El Dockerfile está ahí.

## INE API (ADRH)
- Las tablas del INE están **separadas por provincia** (540 tablas). NO hay una tabla con todos los municipios de España.
- Tabla 31097 = solo Madrid, 30896 = solo Barcelona, 31250 = solo Valencia. No confundir.
- Para encontrar la tabla de una provincia: probar con `DATOS_TABLA/{id}?tip=AM&nult=1` y ver el código de municipio.
- Los offsets entre tipos de tabla son consistentes: renta=base, demog=base-1, fuentes=base+1, pobFija=base+2, pobRel=base+5.

## GeoJSON
- El GeoJSON de municipios de la GVA viene en **UTM (EPSG:25830)**, no WGS84. Leaflet necesita lat/lng. Siempre convertir antes de guardar en DB.
- Los barrios de Valencia ciudad (Open Data Valencia) SÍ vienen en WGS84.

## Fórmula IER
- Normalización por max/min comprime el rango. Usar **percentiles** para distribución real 0-100.
- Valores brutos del INE (ind_econom=0-4.5, ind_global=0-3.9) no son porcentajes. Siempre normalizar.

## CMD de Windows
- Las comillas dobles en `git commit -m "..."` fallan en cmd. Usar archivos `.commitmsg` con `git commit -F`.
- Desktop Commander `start_process` tiene timeout para procesos largos. Dejar scripts para que el usuario ejecute.
