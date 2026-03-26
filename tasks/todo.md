# TODO — AlquilerSano

## ✅ Completado

### Fase 1: Corregir datos Valencia barrios
- [x] Matching 8 barrios IBI (aliases en etl4.js)
- [x] Normalizar vulnerabilidad ind_econom/ind_global
- [x] Recalcular IER barrios (87/88 barrios, rango 3.0-82.8)
- [x] Frontend año default 2025, quitar 2020

### Fase 2: Enriquecer datos barrios Valencia ciudad
- [x] **2.1** precio vivienda libre/m²: dataset solo nivel ciudad → sustituido por vulnerabilidad
- [x] **2.2** Demografía: ind_dem añadido al ETL desde `vulnerabilidad-por-barrios` → pct_migrantes
- [x] **2.3** IAE: dataset no existe en Valencia Open Data → descartado
- [x] **2.5** Rediseñar fórmula IER barrios: 50% IBI + 30% ind_econom + 20% ind_dem
- [x] **2.bonus** Cargar ind_equip normalizado → pct_desempleo (disponible para futuras fórmulas)

### Fase 3: Pulir frontend
- [x] **3.1** Renombrar selector "Provincia Valencia" → "Comunidad Valenciana"
- [x] **3.2** Auto-detectar año con más datos completos por ciudad (marca ★)
- [x] **3.3** Mostrar cobertura: "534/542 municipios con datos"
- [x] **3.4** Desglose componentes IER en modal de barrio (barras de progreso)
- [x] **3.5** Vista ranking (tabla ordenable de municipios)
- [x] **3.6** Desactivar Madrid/Barcelona con "(Próximamente)"

### Fase 5: Escalar a toda la CV
- [x] Descargar GeoJSON 542 municipios (dadesobertes.gva.es)
- [x] Descargar ADRH INE: Valencia (tablas 31250, 31255, 37721)
- [x] Descargar ADRH INE: Alicante (tablas 30833, 30838, 37733)
- [x] Descargar ADRH INE: Castellón (tablas 30962, 30967, 37691)
- [x] ETL municipios CV con conversión UTM→WGS84
- [x] Cargar 534 municipios con IER percentiles (rango 0.2-94.3)
- [x] Frontend selector "Comunidad Valenciana (municipios)"
- [x] Stats filtradas por ciudad
- [x] Fix Railway: startup.py sin borrar alembic_version
- [x] Fix Railway: eliminar geopandas/pandas/sklearn del requirements.txt

### Fase 6: Rediseño frontend dark dashboard
- [x] Tema dark command center (variables CSS, DM Sans, fondo #0b0f19)
- [x] Popup de bienvenida explicando estrés residencial + leyenda colores
- [x] KPI row distribución riesgo (Bajo/Medio/Alto/Crítico)
- [x] Mapa CartoDB dark tiles con bordes oscuros y hover verde
- [x] Tooltips dark, Leaflet overrides, attribution dark
- [x] Popup genérico (sin mencionar CV, preparado para multi-ciudad)

---

## 🔴 Pendiente

### Fase 4: Multi-ciudad
- [ ] Cargar Madrid (barrios + municipios corona)
- [ ] Cargar Barcelona (barrios + municipios AMB)

### Mejoras técnicas
- [ ] Consolidar ETLs (etl_node.js, etl2.js, etl3.js → eliminar)
- [ ] CORS wildcard `*.vercel.app`
- [ ] Mover ETL a Railway Jobs (cron mensual)

### Tema Light (Modelo C editorial) + toggle dark/light
- [x] **T.1** Variables CSS tema light en `:root[data-theme="light"]` (crema #f5f0eb, texto #292524)
- [x] **T.2** Tipografía serif (Merriweather) en h1 header y welcome hero h2
- [x] **T.3** Tile layer CartoDB `light_nolabels` + `light_only_labels` en tema light
- [x] **T.4** Tooltip mapa: fondo/borde/texto adaptativos según tema
- [x] **T.5** Polígonos light: fillOpacity 0.75, bordes blancos, hover teal #0f766e
- [x] **T.6** Welcome popup adaptado (variables CSS, sin cambios TSX necesarios)
- [x] **T.7** Botón toggle sol/luna en header, localStorage + `prefers-color-scheme`
- [x] **T.8** Leyenda del mapa: usa variables CSS (adaptativa automáticamente)
- [x] **T.9** Modal detalle barrio: usa variables CSS (adaptativo automáticamente)
- [ ] **T.10** Testing visual: contraste WCAG AA en ambos temas
