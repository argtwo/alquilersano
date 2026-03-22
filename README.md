# AlquilerSano — Índice de Estrés Habitacional por Barrio

Plataforma web que calcula el **Índice de Estrés Residencial (IER)** por barrio, cruzando datos de gran tenedor (IBI), vulnerabilidad económica e indicadores de exclusión social. Visualiza un mapa de calor de vulnerabilidad con granularidad de barrio para Valencia, Madrid y Barcelona.

> Contexto: el 20% de hogares con bajos ingresos en España destina más del 70% de su renta al alquiler (FOESSA 2025).

## 🌐 Links en producción

| Servicio | URL |
|----------|-----|
| **Frontend (Vercel)** | https://frontend-fabrizionbs-projects.vercel.app |
| **Backend (Railway)** | https://alquilersano-backend-production.up.railway.app |
| **API Docs** | https://alquilersano-backend-production.up.railway.app/docs |
| **Repositorio GitHub** | https://github.com/argtwo/alquilersano |

## Fórmula IER

```
IER = compAlquiler(gran_tenedor) + compPrecariedad(vulnerabilidad_económica) + compSocial(exclusión)
```

Rango 0–100 · mayor valor = mayor estrés habitacional.

| Rango IER | Etiqueta | Color |
|-----------|----------|-------|
| 0–24 | Bajo | Verde |
| 25–49 | Moderado | Amarillo |
| 50–74 | Alto | Naranja |
| 75–100 | Crítico | Rojo |

## Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite, Leaflet, Recharts, PWA |
| Backend | FastAPI + Python 3.12, SQLAlchemy async, Alembic |
| Base de datos | PostgreSQL 16 (Railway) — sin PostGIS, geometría como GeoJSON TEXT |
| Despliegue | Vercel (frontend) · Railway (backend + PostgreSQL) |

## Infraestructura de producción

| Componente | Servicio | Detalles |
|------------|---------|----------|
| Frontend | Vercel | Proyecto `frontend`, team `fabrizionbs-projects` |
| Backend | Railway | Proyecto `sublime-patience`, servicio `alquilersano-backend` |
| Base de datos | Railway PostgreSQL | Servicio `alquilersano-db`, interno en `alquilersano-db.railway.internal:5432` |
| CI/CD | GitHub → Railway/Vercel | Push a `master` dispara deploy automático |

## Estructura

```
alquiler/
├── backend/
│   ├── app/
│   │   ├── api/         # Endpoints: /ier, /alertas, /stats, /barrios, /auth
│   │   ├── services/    # IERCalculator, repositories
│   │   ├── models/      # SQLAlchemy: Barrio (geometria=TEXT), IERScore
│   │   ├── etl/         # Pipelines Valencia (download, clean, geocode, load)
│   │   └── core/        # Config, security (JWT)
│   ├── startup.py       # Ejecuta alembic upgrade head al arrancar (solo borra alembic_version)
│   ├── migrate.py       # Script de migración standalone
│   ├── Dockerfile       # CMD: python startup.py && uvicorn ...
│   └── requirements.txt # Sin geoalchemy2 (incompatible con Railway sin PostGIS)
├── frontend/
│   ├── src/
│   │   ├── components/  # MapView, FiltrosPanel, AlertasPanel, charts
│   │   ├── hooks/       # useIERData, useFilters
│   │   └── services/    # api.ts → VITE_API_URL (Railway)
│   └── vercel.json
├── etl4.js              # ETL Valencia en Node.js (apunta a Railway DB pública)
├── docs/
├── docker-compose.yml
└── render.yaml          # Obsoleto — backend migrado a Railway
```

## Datos cargados (producción)

| Dataset | Fuente | Registros | Estado |
|---------|--------|-----------|--------|
| Barrios Valencia GeoJSON | Open Data Valencia (`barris-barrios`) | 88 barrios | ✅ |
| Recibos IBI 2021–2025 | Open Data Valencia (`recibos-ibi-2020-2025`) | 416 registros | ✅ (69/88 barrios con match) |
| Vulnerabilidad por barrios 2021 | Open Data Valencia (`vulnerabilidad-por-barrios`) | 69 barrios | ✅ |
| IER scores calculados | Derivado de IBI + vulnerabilidad | 416 registros | ✅ |
| Madrid / Barcelona | Pendiente | — | ⏳ |

**Nota:** 19 barrios del IBI no coinciden con el GeoJSON por diferencias de nombre (ej. `el cabanyal-el canyamelar` en IBI vs `el cabanyal` en GeoJSON). Ver TODO para el plan de refinación.

## Arranque local

### Con Docker (recomendado)

```bash
cp .env.example .env
# Editar .env: DATABASE_URL, SECRET_KEY, VITE_API_URL

docker compose up -d
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs
```

### Sin Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (otra terminal)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```

## Variables de entorno

| Variable | Dónde | Valor producción |
|----------|-------|-----------------|
| `VITE_API_URL` | Vercel Env Vars | `https://alquilersano-backend-production.up.railway.app` |
| `DATABASE_URL` | Railway Env Vars | `postgresql+asyncpg://...@alquilersano-db.railway.internal:5432/railway` |
| `ALLOWED_ORIGINS` | Railway Env Vars | JSON array con dominios Vercel |
| `SECRET_KEY` | Railway (auto) | Generado automáticamente |

## ETL — Recargar datos de Valencia

El ETL corre en Node.js directamente contra la DB pública de Railway:

```bash
cd G:\Proyectos\alquiler
node etl4.js
```

**IMPORTANTE:** El `startup.py` del backend borra `alembic_version` en cada deploy, pero NO los datos. El ETL solo recarga si se ejecuta manualmente.

## Tests

```bash
# Backend
cd backend && pytest -v

# Frontend
cd frontend && npm test
```

## Ciudades disponibles

| Ciudad | Datos IBI | Vulnerabilidad | IER | Estado |
|--------|-----------|---------------|-----|--------|
| Valencia | ✅ 2021–2025 | ✅ 2021 | ✅ 416 scores | Operativo |
| Madrid | ⏳ | ⏳ | ⏳ | Pendiente |
| Barcelona | ⏳ | ⏳ | ⏳ | Pendiente |

## Licencia

MIT
