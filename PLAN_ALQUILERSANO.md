# Plan de Implementación — AlquilerSano

## Estado actual — 2026-03-21

**Fases completadas: 0, 1, 2, 3, 4, 5, 6 y 7**
**MVP completo ✅**

Para arrancar la app localmente:
```bash
cp .env.example .env
docker compose up -d db              # PostgreSQL + PostGIS en :5432
cd backend
pip install -r requirements.txt
alembic upgrade head                 # Crea tablas (requiere DB activa)
python -m app.etl.run_etl            # Descarga, limpia y carga datasets
python -m app.etl.run_etl --step load  # Solo carga si ya tienes los datos
uvicorn app.main:app --reload        # API en :8000
# Docs interactivas: http://localhost:8000/docs

cd frontend && npm install && npm run dev  # UI en :5173

# Tests backend (31 tests en total)
cd backend && pytest                 # Todos los tests
cd backend && pytest tests/test_ier_calculator.py  # Solo IER (12 tests)
cd backend && pytest tests/test_ier_foessa.py      # Calibración FOESSA (10 tests)
cd backend && pytest tests/test_etl_pipeline.py    # Pipeline ETL (17 tests)
cd backend && pytest tests/test_api_endpoints.py   # API endpoints (13 tests)

# Tests frontend
cd frontend && npm test              # Vitest (utils + componentes)

# Validación de datos (requiere DB con datos cargados)
cd backend && python -m app.etl.validate
```

---

## Visión General

**AlquilerSano** calcula el Índice de Estrés Residencial (IER) por barrio, cruzando coste de alquiler, precariedad laboral y acceso a salud mental. El MVP es un mapa web interactivo con filtros y panel de alertas para servicios sociales.

---

## Fase 0: Setup del Proyecto ✅ COMPLETADA

### 0.1 Inicialización del repositorio
- [x] `git init` y configurar `.gitignore` (Python, Node, .env, datasets grandes)
- [x] Crear estructura de carpetas: `backend/`, `frontend/`, `data/`, `docs/`
- [x] Crear `.env.example` con variables requeridas

### 0.2 Docker + Base de datos
- [x] `docker-compose.yml` con PostgreSQL 16 + PostGIS
- [x] Esquema completo con Alembic (`alembic/versions/001_initial_schema.py`):
  - `barrios` (id, nombre, codigo_ine, geometria MULTIPOLYGON, distrito)
  - `indicadores_renta`, `indicadores_salud_mental`, `indicadores_exclusion`
  - `recibos_ibi`, `ier_scores`
- [x] Alembic configurado para asyncpg

### 0.3 Backend FastAPI
- [x] Estructura `backend/app/{api,core,models,services,etl}/`
- [x] `requirements.txt` (FastAPI, SQLAlchemy, Alembic, GeoPandas, Pandas)
- [x] Modelos SQLAlchemy con GeoAlchemy2
- [x] `app/main.py` con CORS y endpoint `/health`
- [x] `backend/Dockerfile`

### 0.4 Frontend React + TypeScript
- [x] Vite + React 18 + TypeScript en `frontend/`
- [x] Dependencias: react-leaflet, leaflet, recharts, axios
- [x] ESLint + Prettier configurados
- [x] Estructura `src/{components,hooks,services,types,utils}/`
- [x] Componentes base: `MapView`, `FiltrosPanel`, `AlertasPanel`
- [x] Hook `useIERData`, servicio `api.ts`, utils `ier.ts`
- [x] `App.tsx` con layout completo (mapa + filtros + alertas)
- [x] `frontend/Dockerfile`

---

## Fase 1: ETL — Ingesta y Transformación de Datos ✅ COMPLETADA

### 1.1 Documentación y descarga
- [x] URLs exactas documentadas en `docs/datasets.md` (6 datasets)
- [x] `backend/app/etl/download.py` — descarga con timestamp, idempotente
  - Datasets: renta, ibi, salud_mental, migrantes, exclusion_madrid, barrios_geojson

### 1.2 Limpieza y normalización
- [x] `backend/app/etl/clean.py` — limpieza de 4 datasets CSV:
  - Normalización de nombres bilingües (val/es)
  - Detección dinámica de columnas (robusta ante cambios del portal)
  - Salida en Parquet en `data/processed/`

### 1.3 Geocodificación
- [x] `backend/app/etl/geocode.py` — procesa GeoJSON de barrios de Open Data Valencia
  - Normaliza propiedades y genera `data/geojson/barrios_valencia.geojson`

### 1.4 Carga en base de datos
- [x] `backend/app/etl/load.py` — carga barrios con PostGIS + 4 tablas de indicadores
  - Usa `ON CONFLICT DO UPDATE` para idempotencia
- [x] `backend/app/etl/run_etl.py` — orquestador con flag `--step`
- [x] `backend/tests/test_etl_clean.py` — tests unitarios de normalización

---

## Fase 2: Lógica de Negocio — Cálculo del IER ✅ COMPLETADA

### 2.1 Fórmula IER
- [x] `backend/app/services/ier_calculator.py` — clase `IERCalculator`:
  - Fórmula: `IER = ω1·ratio_alquiler + ω2·precariedad − ω3·salud_mental` (escalada 0–100)
  - Pesos: ω1=0.50, ω2=0.30, ω3=0.20
  - Normalización min-max por dataset completo (requiere `fit()` previo)
  - 4 sub-indicadores de precariedad: desempleo, migrantes, IBI impagados, persona jurídica
  - Clase `IndicadoresBarrio` (input) y `IERResult` (output) con dataclasses

### 2.2 Score de Calidad de Vida
- [x] `score_calidad_vida = 100 - IER` (MVP; se enriquece con criminalidad en Fase 7)

### 2.3 Riesgo de desahucio
- [x] Reglas heurísticas en `_clasificar_riesgo()`:
  - CRÍTICO: IER ≥ 70 + IBI impagados ≥ 15%
  - ALTO: IER ≥ 70
  - MEDIO: IER ≥ 45
  - BAJO: IER < 45

### 2.4 Repositorios y servicio
- [x] `backend/app/services/repositories.py` — queries SQLAlchemy async (LEFT JOIN 4 tablas)
- [x] `backend/app/services/ier_service.py` — orquesta `fit → calculate → upsert`
- [x] `backend/tests/test_ier_calculator.py` — 12 tests unitarios (rango, nulos, clasificación)

---

## Fase 3: API REST (Backend) ✅ COMPLETADA

### 3.1 Endpoints implementados
- [x] `GET  /api/v1/barrios` — Lista barrios (filtro por distrito)
- [x] `GET  /api/v1/barrios/{id}` — Detalle: geometría GeoJSON + histórico IER
- [x] `GET  /api/v1/ier` — Mapa de calor: barrios + IER + geometría (filtros: year, min_ier, max_ier, distrito)
- [x] `GET  /api/v1/ier/{barrio_id}/historico` — Serie temporal 2020–2025
- [x] `POST /api/v1/ier/recalculate` — Recálculo bajo demanda
- [x] `GET  /api/v1/alertas` — Barrios ALTO/CRÍTICO ordenados por urgencia
- [x] `GET  /api/v1/stats` — IER medio, min, max, distribución de riesgo

### 3.2 Configuración
- [x] Schemas Pydantic en `backend/app/api/schemas.py`
- [x] Routers por dominio: `barrios.py`, `ier.py`, `alertas.py`, `stats.py`
- [x] Registrados en `app/main.py` bajo prefijo `/api/v1`
- [x] CORS configurado
- [x] `pytest.ini` + `tests/test_api_health.py` (health + rutas en OpenAPI)

---

## Fase 4: Frontend — Mapa Interactivo

### 4.1 Mapa de calor ✅
- [x] `MapView.tsx` con react-leaflet: coropletas coloreadas por IER
- [x] Tooltip en hover con nombre, IER y riesgo (via `onEachFeature` + `bindTooltip`)
- [x] Highlight en hover (borde oscuro) y click para abrir modal
- [x] Leyenda superpuesta (verde/amarillo/naranja/rojo + sin datos)
- [x] key en `CapaBarrios` para refrescar al cambiar año sin desmontar el mapa
- [x] Centrado en Valencia (39.4699, -0.3763), zoom 13

### 4.2 Panel de filtros ✅
- [x] `FiltrosPanel.tsx`: selectores año y riesgo desahucio, sliders IER min/max
- [x] Filtro por distrito (lista dinámica de los barrios cargados)
- [x] Botón "Limpiar filtros" visible solo cuando hay filtros activos
- [x] Filtrado en cliente por riesgo, en servidor por IER numérico y distrito

### 4.3 Panel de alertas ✅
- [x] `AlertasPanel.tsx`: lista de barrios ALTO/CRÍTICO ordenados por IER desc
- [x] Tarjetas con badge de color por nivel de riesgo
- [x] Click en tarjeta abre el modal de detalle
- [x] Botón exportar CSV (`utils/csv.ts`) con BOM UTF-8 para Excel español

### 4.4 Modal de detalle de barrio ✅
- [x] `BarrioDetalleModal.tsx`: abre con click en mapa o en panel de alertas
- [x] Cierre con ESC o click fuera del modal
- [x] Badges IER, riesgo desahucio y score calidad de vida
- [x] `IERHistoricoChart.tsx`: Recharts LineChart 2020–2025 con línea media ciudad
- [x] `ComponentesChart.tsx`: Recharts RadarChart con los 3 componentes del IER
- [x] Tabla comparativa IER barrio vs. media ciudad con diferencia coloreada

### 4.5 Header con estadísticas ✅
- [x] `StatsBar.tsx`: IER medio, total barrios, conteo CRÍTICO/ALTO en el header

---

## Fase 5: Testing y Validación ✅ COMPLETADA

### 5.1 Tests backend ✅
- [x] `tests/test_ier_calculator.py` — 12 tests: rango 0–100, nulos, clasificación riesgo
- [x] `tests/test_ier_foessa.py` — 10 tests: calibración FOESSA 2025 (ranking, exclusión severa ≥60, acomodado <40, sensibilidad omegas, monotonicidad)
- [x] `tests/test_etl_pipeline.py` — 17 tests: `normalize_barrio_name`, `clean_renta/ibi/salud_mental/migrantes` con DataFrames sintéticos
- [x] `tests/test_api_endpoints.py` — 13 tests: endpoints con DB mockeada (health, ier, alertas, stats, barrios)
- [x] `tests/test_etl_clean.py` — 5 tests de normalización de nombres bilingües

### 5.2 Tests frontend ✅
- [x] Vitest + @testing-library/react configurados en `vite.config.ts` y `package.json`
- [x] `src/test/setup.ts` — setup de @testing-library/jest-dom
- [x] `src/test/ier.test.ts` — 10 tests: `ierToColor`, `ierToLabel`, `RIESGO_COLORS`
- [x] `src/test/csv.test.ts` — 6 tests: `exportAlertasCSV` (download, filename, Blob, revoke)
- [x] `src/test/FiltrosPanel.test.tsx` — 8 tests: render, cambio de año, limpiar filtros, distritos
- [x] `src/test/AlertasPanel.test.tsx` — 11 tests: filtrado ALTO/CRÍTICO, sorting, click, export, highlight

### 5.3 Validación de datos ✅
- [x] `backend/app/etl/validate.py` — script de validación que verifica:
  - Cobertura: % barrios con datos de renta e IBI
  - Rangos: IER dentro de [0, 100], sin valores negativos
  - Correlación: top-10 IER tiene componente_alquiler ≥ media global
  - Sanity check: 5 barrios conocidos de Valencia con rangos IER esperados
  - Genera `docs/validacion_datos.md` con informe completo en Markdown

---

## Fase 6: Despliegue MVP ✅ COMPLETADA

### 6.1 Dockerfiles de producción ✅
- [x] `backend/Dockerfile` — imagen Python 3.12-slim, CMD uvicorn 2 workers
- [x] `frontend/Dockerfile` — multi-stage: Node 20 build → nginx 1.27 estático
- [x] `frontend/nginx.conf` — SPA fallback + proxy `/api/` → backend + cache assets
- [x] `backend/.dockerignore` / `frontend/.dockerignore` — excluyen tests, .env, node_modules

### 6.2 Docker Compose de producción ✅
- [x] `docker-compose.prod.yml` — 4 servicios: db, migrate (init), backend, frontend
  - Sin bind mounts (imágenes autocontenidas)
  - `migrate` service ejecuta `alembic upgrade head` y sale antes de arrancar backend
  - `backend` healthcheck en `/health`; frontend espera a que backend esté healthy
  - `VITE_API_URL=""` → rutas relativas → nginx proxy transparente

### 6.3 Despliegue cloud ✅
- [x] `vercel.json` — frontend en Vercel (build desde `frontend/`, rewrite SPA, cache assets)
- [x] `render.yaml` — backend en Render (Docker, región Frankfurt, PostgreSQL 16 incluido)

### 6.4 Documentación ✅
- [x] `docs/despliegue.md` — guía completa:
  - Opción A: Docker Compose en VPS + SSL Certbot
  - Opción B: Vercel (frontend) + Render (backend)
  - Tabla de env vars requeridas en producción
  - Comandos para actualizar datos ETL en producción
- [x] `.env.example` — comentarios para dev / prod Docker / prod cloud

---

## Fase 7: Iteraciones Post-MVP ✅ COMPLETADA

### 7.1 Multi-ciudad (Madrid y Barcelona) ✅
- [x] Campo `ciudad` en modelo `Barrio` + migración `002_add_ciudad_to_barrios.py`
- [x] `download.py` — datasets de Madrid (renta, exclusión, GeoJSON) y Barcelona (renta, población, GeoJSON)
- [x] `download_ciudad(ciudad)` — descarga selectiva por ciudad
- [x] `load_barrios(engine, ciudad)` — propaga campo `ciudad` al insertar barrios
- [x] API: parámetro `?ciudad=` en `/ier`, `/alertas`, `/stats`; filtro en `get_ier_scores`, `get_alertas`, `get_stats`
- [x] Frontend: selector ciudad en `FiltrosPanel`; centrado automático del mapa por ciudad (`RecenterMap`); la API filtra por ciudad en `useIERData`

### 7.2 Modelo ML predicción de desahucio ✅
- [x] `backend/app/services/ml_predictor.py` — `EvictionRiskPredictor` con RandomForestClassifier
  - 24 perfiles FOESSA 2025 como training data (BAJO/MEDIO/ALTO/CRÍTICO)
  - `predict()` con fallback heurístico si scikit-learn no está instalado
  - `predict_proba()` para probabilidades por clase
  - `save()` / `load()` para persistir el modelo en `backend/models/`
  - Singleton `get_predictor()` con carga lazy
- [x] `IERCalculator(use_ml=True)` — activa el predictor ML en lugar de las reglas fijas

### 7.3 Autenticación JWT para panel de admin ✅
- [x] `backend/app/core/security.py` — `hash_password()`, `verify_password()`, `create_access_token()`, `decode_access_token()` con python-jose + passlib
- [x] `backend/app/api/auth.py` — `POST /api/v1/auth/token` con OAuth2PasswordRequestForm; dependencia `require_admin`
- [x] `POST /api/v1/ier/recalculate` protegido con `Depends(require_admin)`
- [x] Configuración en `.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`

### 7.4 Rate limiting para API pública ✅
- [x] slowapi integrado en `main.py` (opcional — no bloquea si no está instalado)
- [x] `/health` expone `rate_limiting: true/false` según disponibilidad

### 7.5 PWA para acceso móvil ✅
- [x] `vite-plugin-pwa` configurado en `vite.config.ts`
- [x] Manifest: nombre, iconos, colores, `display: standalone`
- [x] Workbox: cache de assets + NetworkFirst para `/api/` (datos siempre frescos, offline-capable para la última vista)
- [x] Icono SVG en `public/icons/icon.svg`

### 7.6 Integración CiudadGPT (#17) ✅
- [x] `backend/app/services/ciudadgpt.py` — `CiudadGPTClient` con `get_barrio_context()` y `get_alertas_tempranas()`
- [x] Devuelve stub mientras la API de CiudadGPT no está disponible; listo para conectar cuando lo esté

---

## Consideraciones Legales

- **LOPD/RGPD:** Todos los datos usados son agregados por barrio, nunca individualizados. Si en futuro se cruzan datos a nivel de hogar, se necesita Evaluación de Impacto (EIPD) y posible convenio con la administración.
- **Licencias de datos:** Verificar licencia de cada dataset (la mayoría son CC BY 4.0 o equivalente en datos.gob.es).
- **Disclaimer:** El IER es un indicador orientativo, no sustituye evaluaciones profesionales de servicios sociales.

---

## Dependencias Externas y Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Dataset no disponible o URL rota | Alto | Descargar y versionar en `data/raw/`, no depender de API en vivo |
| Datos de barrios incompletos | Medio | Imputación con media del distrito; marcar barrios con datos parciales |
| Geometrías de barrios desactualizadas | Bajo | Usar secciones censales INE 2021 (últimas disponibles) |
| Rendimiento del mapa con muchos polígonos | Medio | Simplificar geometrías (Turf.js simplify), usar vector tiles |
| Cambio en la estructura de los CSV de Open Data | Medio | Tests de esquema en el ETL que alerten si cambian columnas |

---

## Orden de Ejecución Recomendado

1. **Fase 0** — Setup (1-2 días)
2. **Fase 1** — ETL: primero descargar y explorar los datos reales (3-5 días)
3. **Fase 2** — Lógica IER con datos reales cargados (2-3 días)
4. **Fase 3** — API REST exponiendo los datos calculados (2-3 días)
5. **Fase 4** — Frontend con mapa funcional (5-7 días)
6. **Fase 5** — Testing y validación (2-3 días)
7. **Fase 6** — Despliegue (1-2 días)

**Total estimado MVP: 3-4 semanas de trabajo.**
