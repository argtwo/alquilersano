# CLAUDE.md — AlquilerSano

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

**AlquilerSano — Índice de Estrés Residencial (IER) por barrio.**
Plataforma web que calcula el IER cruzando datos de gran tenedor (IBI), vulnerabilidad económica y exclusión social, visualizando un mapa de calor por barrio en Valencia, Madrid y Barcelona.

**Categoría:** Vivienda — Crisis habitacional en España (el 20% de hogares con bajos ingresos destina más del 70% de su renta al alquiler, FOESSA 2025).

---

## Estado actual del sistema (22 marzo 2026)

### ✅ Completado

- **Frontend** deployado en Vercel: https://frontend-gamma-khaki-78.vercel.app
- **Backend** deployado en Railway: https://alquilersano-backend-production.up.railway.app
- **Base de datos** PostgreSQL en Railway (proyecto `sublime-patience`)
- **Repositorio GitHub:** https://github.com/argtwo/alquilersano
- **CI/CD:** Push a `master` → deploy automático en Railway y Vercel
- **Datos Valencia cargados:** 88 barrios, ~416 scores IER (años 2021–2025)
- **Geometría** almacenada como GeoJSON texto (sin PostGIS, compatible con Railway)
- **ETL Node.js** (`etl4.js`) funcional para recargar datos de Valencia

### ⚠️ Problemas detectados en datos actuales

- **8 barrios IBI sin match** por diferencias de nombre (EL CABANYAL-EL CANYAMELAR vs CABANYAL-CANYAMELAR, etc). Diccionario de mapeo identificado, pendiente implementar.
- **Vulnerabilidad mal mapeada:** `ind_econom` (índice 0-100) se mete en `tasa_pobreza` e `ind_global` en `precariedad_laboral`. El cálculo `Math.min(valor * 0.5, 25)` satura a 25 para casi todos los barrios, eliminando diferenciación.
- **Año por defecto incorrecto:** Frontend arranca en 2024 pero vulnerabilidad solo existe para 2021 → componente social vacío para 2022-2025.
- **Año 2020 en selector:** No hay datos IBI para 2020 pero aparece como opción.

### ⚠️ Notas técnicas importantes

- **Sin PostGIS:** Railway no tiene la extensión PostGIS. La columna `geometria` es `TEXT` con GeoJSON. Todas las queries que usaban `ST_AsGeoJSON()` fueron reemplazadas por lectura directa del campo.
- **geoalchemy2 eliminado** de `requirements.txt` y modelos.
- **startup.py** borra solo `alembic_version` en cada deploy (no los datos).
- **VITE_API_URL** apunta a Railway (configurado en Vercel Env Vars).

---

## TODO — Plan de trabajo (ver README.md para detalle completo)

### Fase 1: Corregir datos existentes 🔴 ✅ COMPLETADO

- [x] **1.1 — Arreglar matching 8 barrios IBI** — Diccionario de aliases en `etl4.js`. IBI sin match: 0 (antes 8). 87/88 barrios con datos.
- [x] **1.2 — Corregir mapeo vulnerabilidad** — `ind_econom`/`ind_global` ahora normalizados por max del dataset (0-1). 70/88 barrios con vulnerabilidad.
- [x] **1.3 — Recalcular IER** — Ejecutado. IER medio=40.4, rango 3.0-82.8. Distribución: BAJO 75, MEDIO 237, ALTO 118, CRÍTICO 5.
- [x] **1.4 — Frontend año default** — Cambiado a 2025, quitado 2020 del selector.
- [x] **1.5 — Fix .env.production** — Apuntaba a Render, corregido a Railway.

### Fase 2: Enriquecer datos Valencia 🟡 ← PRÓXIMO PASO

- [ ] **2.1** — Cargar precio vivienda libre/m² (`habitatge-lliure-preu-metre-quadrat`)
- [ ] **2.2** — Cargar demografía por manzana → agregar por barrio (`illes-amb-dades-de-poblacio`)
- [ ] **2.3** — Evaluar Recibos IAE por barrio (`recibos_iae_2020-2025`)
- [ ] **2.4** — Evaluar VPP distribución (`vivendes-proteccio-publica-vpp`)
- [ ] **2.5** — Rediseñar fórmula IER con datos reales

### Fase 3: Pulir frontend Valencia 🟢

- [ ] **3.1** — Cambiar año por defecto a 2021 (o auto-detectar año con más datos)
- [ ] **3.2** — Quitar 2020 del selector (no hay datos)
- [ ] **3.3** — Mostrar cobertura de datos ("87/88 barrios con IBI")
- [ ] **3.4** — Desglose componentes IER en modal de barrio
- [ ] **3.5** — Vista ranking (tabla ordenable)

### Fase 4: Multi-ciudad ⏳ (después de Valencia completo)

- [ ] Refactorizar ETL parametrizable
- [ ] Cargar Madrid
- [ ] Cargar Barcelona
- [ ] Desactivar opciones sin datos en selector ciudad

### Fase 5: Escalar a toda la Comunidad Valenciana (ver README.md para estado detallado)

**Valencia (46): ✅ COMPLETO** — 263 municipios con IER percentiles (1.1–77.2)
**Alicante (03): ✅ DATOS DESCARGADOS** — 141 municipios. Falta: ETL + cargar en DB
**Castellón (12): ✅ DATOS DESCARGADOS** — 135 municipios. Falta: ETL + cargar en DB

Scripts: `download_all_nacional.js` (Valencia), `download_alicante_castellon.js` (Ali+Cas), `etl_municipios_cv.js` (carga Valencia)
CSVs en: `data/raw/nacional/`

**Próximo paso:** Crear ETL para Alicante y Castellón, añadir al selector del frontend.

### Mejoras técnicas (cuando haya hueco)

- [ ] Eliminar `startup.py` drop de alembic_version
- [ ] Mover ETL a Railway Jobs
- [ ] Limpiar ETL temporales (etl_node.js, etl2.js, etl3.js → consolidar)
- [ ] CORS dinámico con wildcard *.vercel.app

---

## Arquitectura

```
alquiler/
├── backend/
│   ├── app/
│   │   ├── api/          # Endpoints REST (/ier, /barrios, /stats, /alertas, /auth)
│   │   ├── core/         # Config (settings.py), database.py, security.py
│   │   ├── models/       # barrio.py — Barrio (geometria=Text), IERScore, etc.
│   │   ├── services/     # ier_service.py, repositories.py
│   │   └── etl/          # download.py, clean.py, geocode.py, load.py, run_etl.py
│   ├── alembic/versions/ # 001_initial_schema.py, 002_add_ciudad_to_barrios.py
│   ├── startup.py        # Limpia alembic_version + alembic upgrade head
│   ├── migrate.py        # Script standalone de migración
│   └── Dockerfile        # python startup.py && uvicorn --port ${PORT:-8000}
├── frontend/
│   ├── src/
│   │   ├── components/   # MapView (Leaflet), FiltrosPanel, AlertasPanel
│   │   ├── hooks/        # useIERData, useFilters
│   │   └── services/     # api.ts → axios con VITE_API_URL
│   └── vercel.json
├── etl4.js               # ETL Valencia en Node.js → Railway DB (uso manual)
├── data/                 # Vacío — datos viven en Railway PostgreSQL
├── scrap datasets/       # Catálogos de Open Data (CSV/JSON de portales)
└── docs/                 # despliegue.md, datasets.md
```

## Modelo de datos

```
IER = compAlquiler(pct_persona_juridica normalizado → 0–50)
    + compPrecariedad(ind_econom → 0–25)
    + compSocial(ind_global → 0–25)
```

> Nota: La fórmula actual es un proxy. La fórmula FOESSA completa requiere datos de coste de alquiler por barrio, aún no disponibles en Open Data Valencia.

## Stack tecnológico

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite 8, Leaflet, react-leaflet, Recharts, PWA |
| Backend | FastAPI + Python 3.12, SQLAlchemy async, asyncpg, Alembic |
| Base de datos | PostgreSQL 16 (Railway) — **sin PostGIS** |
| ETL producción | Node.js 24 (`etl4.js`) — descarga y carga directo a Railway |
| ETL local/Railway | Python (`backend/app/etl/`) — pendiente adaptar al nuevo schema sin PostGIS |
| CI/CD | GitHub (`argtwo/alquilersano`) → Railway + Vercel automático |

## Variables de entorno

### Vercel (frontend build-time)
```
VITE_API_URL=https://alquilersano-backend-production.up.railway.app
```

### Railway (backend runtime)
```
DATABASE_URL=postgresql+asyncpg://postgres:...@alquilersano-db.railway.internal:5432/railway
ALLOWED_ORIGINS=["https://frontend-fabrizionbs-projects.vercel.app","https://frontend-6uiwrc40q-fabrizionbs-projects.vercel.app","https://frontend-gamma-khaki-78.vercel.app","https://alquilersano.vercel.app"]
SECRET_KEY=<auto-generado por Railway>
DEBUG=false
```

## Comandos frecuentes

```bash
# Recargar datos de Valencia en producción (Railway)
cd G:\Proyectos\alquiler
node etl4.js

# Deploy manual (normalmente automático via git push)
git add . && git commit -m "..." && git push origin master

# Verificar backend en producción
curl https://alquilersano-backend-production.up.railway.app/health
curl https://alquilersano-backend-production.up.railway.app/api/v1/stats?year=2021

# Desarrollo local backend
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://... alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Desarrollo local frontend
cd frontend
echo "VITE_API_URL=http://localhost:8000" > .env
npm install && npm run dev

# Tests
cd backend && pytest -v
cd frontend && npm test
```

## Convenciones

- Código (variables, funciones, comentarios): **inglés**
- UI y documentación de usuario: **español**
- Geometrías: GeoJSON como TEXT (sin PostGIS). NO usar `ST_AsGeoJSON()`, `Geometry()` ni geoalchemy2.
- Barrios identificados por código INE: `46250` + 2 dígitos distrito + 2 dígitos barrio
- Variables sensibles en `.env` / Railway Env Vars, nunca en código
- Migraciones Alembic: siempre crear nueva revisión, nunca editar `001_initial_schema.py`

## Contexto del ecosistema

AlquilerSano es la App #1 de un plan de 17 apps de datos abiertos españoles (`plan_apps_unificado_2026.docx`). Comparte datasets y patrones ETL con SmartZone (#13) y VacíoActivo (#2).
