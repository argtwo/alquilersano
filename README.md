# AlquilerSano — Índice de Estrés Habitacional por Barrio

Plataforma web que calcula el **Índice de Estrés Residencial (IER)** por barrio, cruzando el porcentaje de renta destinada al alquiler con indicadores de salud mental y exclusión social. Visualiza un mapa de calor de vulnerabilidad con granularidad de barrio en Valencia, Madrid y Barcelona.

> Contexto: el 20% de hogares con bajos ingresos en España destina más del 70% de su renta al alquiler (FOESSA 2025).

## Demo

- **Frontend (Vercel):** _pendiente de despliegue_
- **API (Render):** _pendiente de despliegue_

## Fórmula IER

```
IER = 0.5·(Coste_Alquiler / Ingreso_Hogar) + 0.3·Precariedad_Laboral − 0.2·Acceso_Salud_Mental
```

Rango 0–100 · mayor valor = mayor estrés habitacional · Pesos calibrados con datos FOESSA 2025.

| Rango IER | Etiqueta | Color |
|-----------|----------|-------|
| 0–39 | Bajo | Verde |
| 40–54 | Moderado | Amarillo |
| 55–69 | Alto | Naranja |
| 70–84 | Crítico | Rojo |
| 85–100 | Extremo | Granate |

## Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite, Leaflet, Recharts, PWA |
| Backend | FastAPI + Python 3.12, SQLAlchemy async, Alembic |
| Base de datos | PostgreSQL 16 + PostGIS |
| Despliegue | Docker Compose (VPS) · Vercel (frontend) · Render (backend) |

## Estructura

```
alquiler/
├── backend/          # API REST (FastAPI)
│   ├── app/
│   │   ├── api/      # Endpoints: /ier, /alertas, /stats, /barrios, /auth
│   │   ├── services/ # IERCalculator, ML predictor, repositories, CiudadGPT stub
│   │   ├── models/   # SQLAlchemy: Barrio, IERScore
│   │   ├── etl/      # Pipelines de ingesta (Valencia + Madrid + Barcelona)
│   │   └── core/     # Config, security (JWT), constantes
│   └── tests/        # 56 tests (pytest)
├── frontend/         # SPA React
│   ├── src/
│   │   ├── components/  # MapView, FiltrosPanel, AlertasPanel, charts
│   │   ├── hooks/       # useIERData, useFilters
│   │   ├── services/    # api.ts (axios)
│   │   └── utils/       # ier.ts (colores/etiquetas), csv.ts (export)
│   └── src/test/     # 38 tests (Vitest + RTL)
├── docs/             # despliegue.md, validacion_datos.md
├── docker-compose.yml
├── docker-compose.prod.yml
├── vercel.json
└── render.yaml
```

## Arranque local

### Requisitos
- Docker + Docker Compose
- Node 20+ (solo para desarrollo frontend)
- Python 3.12+ (solo para desarrollo backend)

### Con Docker (recomendado)

```bash
cp .env.example .env
# Edita .env con tus valores

docker compose up -d
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs
```

### Sin Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

## Tests

```bash
# Backend (56 tests)
cd backend && pytest -v

# Frontend (38 tests)
cd frontend && npm test
```

## Despliegue en producción

Ver [`docs/despliegue.md`](docs/despliegue.md) para instrucciones completas de:
- VPS con Docker Compose + HTTPS (Certbot)
- Vercel (frontend) + Render (backend + PostgreSQL)

## Ciudades disponibles

| Ciudad | Datasets | Estado |
|--------|----------|--------|
| Valencia | Renta, IBI, Salud Mental, Migrantes | Implementado |
| Madrid | Renta, Exclusión social | Implementado |
| Barcelona | Renta, Población | Implementado |

## Contexto del ecosistema

AlquilerSano es la App #1 de un plan de 17 aplicaciones de datos abiertos españoles. Comparte patrones ETL y datasets con SmartZone (#13) y VacíoActivo (#2).

## Licencia

MIT
