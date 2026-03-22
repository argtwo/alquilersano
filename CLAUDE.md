# CLAUDE.md — AlquilerSano

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

**AlquilerSano — Índice de Estrés Residencial (IER) por barrio.**
Plataforma web que calcula el IER cruzando datos de gran tenedor (IBI), vulnerabilidad económica y exclusión social, visualizando un mapa de calor por barrio en Valencia, Madrid y Barcelona.

**Categoría:** Vivienda — Crisis habitacional en España (el 20% de hogares con bajos ingresos destina más del 70% de su renta al alquiler, FOESSA 2025).

---

## Estado actual del sistema (22 marzo 2026)

### ✅ Completado

- **Frontend** deployado en Vercel: https://frontend-fabrizionbs-projects.vercel.app
- **Backend** deployado en Railway: https://alquilersano-backend-production.up.railway.app
- **Base de datos** PostgreSQL en Railway (proyecto `sublime-patience`)
- **Repositorio GitHub:** https://github.com/argtwo/alquilersano
- **CI/CD:** Push a `master` → deploy automático en Railway y Vercel
- **Datos Valencia cargados:** 88 barrios, 416 scores IER (años 2021–2025)
- **Geometría** almacenada como GeoJSON texto (sin PostGIS, compatible con Railway)
- **ETL Node.js** (`etl4.js`) funcional para recargar datos de Valencia

### ⚠️ Notas técnicas importantes

- **Sin PostGIS:** Railway no tiene la extensión PostGIS. La columna `geometria` es `TEXT` con GeoJSON. Todas las queries que usaban `ST_AsGeoJSON()` fueron reemplazadas por lectura directa del campo.
- **geoalchemy2 eliminado** de `requirements.txt` y modelos.
- **startup.py** borra solo `alembic_version` en cada deploy (no los datos).
- **VITE_API_URL** apunta a Railway (configurado en Vercel Env Vars).

---

## TODO — Tareas pendientes por prioridad

### 🔴 Crítico (bloquea funcionalidad)

- [ ] **Corregir los 19 barrios IBI sin match** — Diferencias de nombre entre el dataset IBI y el GeoJSON de barrios. Ejemplos conocidos:
  - `el cabanyal-el canyamelar` (IBI) → `el cabanyal` o similar (GeoJSON)
  - `fonteta de sant lluis` (IBI) → verificar nombre exacto en GeoJSON
  - `gran via` (IBI) → verificar
  - `mauella` (IBI) → verificar
  - `el castellar-l'oliveral` (IBI) → verificar
  
  **Plan de acción:** Crear un diccionario de mapeo en `etl4.js` (o en `backend/app/etl/load.py`) con las equivalencias. Ejecutar `node etl4.js` tras el fix para recargar los 19 barrios faltantes. Esto añadirá ~19×5 = ~95 registros IER adicionales y mejorará la cobertura del mapa.

- [ ] **Verificar que el año por defecto (2024) tiene datos** — La app filtra por `year=2024` por defecto pero el IBI solo tiene datos 2021–2025. Confirmar qué años tienen IER scores y ajustar el año por defecto en el frontend si es necesario.

### 🟡 Importante (mejora significativa)

- [ ] **Añadir datos de renta por barrio** — El dataset `renda-per-llar-i-persona` no tiene desglose por barrio (solo datos globales de Valencia). Buscar en el catálogo (`scrap datasets/datasets catalogo valencia.csv`) un dataset alternativo con renta por barrio o sección censal.

- [ ] **Cargar datos Madrid** — El `render.yaml` y el ETL tienen esqueleto para Madrid. Adaptar `etl4.js` para `madrid_exclusion` y `madrid_renta` siguiendo el mismo patrón que Valencia.

- [ ] **Cargar datos Barcelona** — Similar a Madrid.

- [ ] **Añadir salud mental real** — El dataset `malaltia-mental-enfermedad-mental` devuelve puntos de equipamientos (centros), no indicadores por barrio. Buscar alternativa con casos/tasa por barrio.

### 🟢 Mejoras (calidad y mantenimiento)

- [ ] **Eliminar `startup.py` drop de alembic_version** — Es un workaround temporal. Migrar a un sistema más robusto: detectar si las tablas existen y solo correr migraciones nuevas.

- [ ] **Mover ETL a Railway Jobs** — El ETL actualmente se ejecuta manualmente desde local. Convertirlo en un Railway Cron Job que se ejecute mensualmente para actualizar datos.

- [ ] **Refinar el cálculo del IER** — La fórmula actual usa `pct_persona_juridica` como proxy de presión de alquiler. Implementar la fórmula FOESSA completa cuando se tenga el dato de coste de alquiler por barrio.

- [ ] **Añadir datos históricos** — El IBI tiene datos 2021–2025. Mostrar el histórico IER por barrio en el panel de detalle.

- [ ] **Desactivar Vercel Authentication** — Los assets estáticos del deployment están protegidos. Ir a Vercel → Deployment Protection y desactivar o limitar a preview deployments.

- [ ] **Limpiar archivos ETL temporales** — `etl_node.js`, `etl2.js`, `etl3.js`, `etl4.js` en la raíz del proyecto. Consolidar en un único `etl.js` bien documentado o mover a `backend/scripts/`.

- [ ] **Añadir CORS dinámico** — El `ALLOWED_ORIGINS` está hardcodeado con URLs de Vercel. Usar wildcard `*.vercel.app` para no tener que actualizar en cada redeploy.

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
