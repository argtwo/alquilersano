# TODO — AlquilerSano

## ✅ Completado

### Fase 1: Corregir datos Valencia barrios
- [x] Matching 8 barrios IBI (aliases en etl4.js)
- [x] Normalizar vulnerabilidad ind_econom/ind_global
- [x] Recalcular IER barrios (87/88 barrios, rango 3.0-82.8)
- [x] Frontend año default 2025, quitar 2020

### Fase 5: Escalar a toda la CV
- [x] Descargar GeoJSON 542 municipios (dadesobertes.gva.es)
- [x] Descargar ADRH INE: Valencia (tablas 31250, 31255, 37721)
- [x] Descargar ADRH INE: Alicante (tablas 30833, 30838, 37733)
- [x] Descargar ADRH INE: Castellón (tablas 30962, 30967, 37691)
- [x] ETL municipios CV con conversión UTM→WGS84
- [x] Cargar 534 municipios con IER percentiles (rango 0.2-94.3)
- [x] Frontend selector "Provincia Valencia (municipios)"
- [x] Stats filtradas por ciudad
- [x] Fix Railway: startup.py dejó de borrar alembic_version
- [x] Fix Railway: eliminar geopandas/pandas/sklearn del requirements.txt

## 🔴 Próximo paso

### Fase 3: Pulir frontend
- [ ] **3.1** Renombrar selector "Provincia Valencia" → "Comunidad Valenciana"
- [ ] **3.2** Auto-detectar año con más datos completos por ciudad
- [ ] **3.3** Mostrar cobertura: "534/542 municipios con datos"
- [ ] **3.4** Desglose componentes IER en modal de barrio (renta, pobreza, Gini)
- [ ] **3.5** Vista ranking (tabla ordenable de municipios)
- [ ] **3.6** Desactivar opciones Madrid/Barcelona (sin datos) o mostrar "Próximamente"

### Fase 2: Enriquecer datos barrios Valencia ciudad
- [x] **2.1** precio vivienda libre/m²: dataset `habitatge-lliure-preu-metre-quadrat` es solo nivel ciudad (sin barrio) → sustituido por uso completo de vulnerabilidad
- [x] **2.2** Demografía: ind_dem (vulnerabilidad demográfica) añadido al ETL desde `vulnerabilidad-por-barrios` → guardado en pct_migrantes
- [x] **2.3** IAE: dataset no existe en Valencia Open Data → descartado
- [x] **2.5** Rediseñar fórmula IER barrios: 50% IBI + 30% ind_econom + 20% ind_dem (elimina double-counting ind_global)
- [x] **2.bonus** Cargar también ind_equip normalizado → pct_desempleo (disponible para futuras fórmulas)

### Fase 4: Multi-ciudad
- [ ] Cargar Madrid (barrios + municipios corona)
- [ ] Cargar Barcelona (barrios + municipios AMB)

### Mejoras técnicas
- [ ] Consolidar ETLs (etl_node.js, etl2.js, etl3.js → eliminar)
- [ ] CORS wildcard *.vercel.app
- [ ] Mover ETL a Railway Jobs (cron mensual)
