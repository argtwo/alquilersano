# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto: AlquilerSano

**Índice de Estrés Habitacional por Barrio** — Plataforma web que calcula el Índice de Estrés Residencial (IER) por barrio, cruzando el porcentaje de renta destinada al alquiler con indicadores de salud mental y exclusión social. Visualiza un mapa de calor de vulnerabilidad con granularidad de barrio.

**Categoría:** Vivienda — Crisis habitacional en España (el 20% de hogares con bajos ingresos destina más del 70% de su renta al alquiler, FOESSA 2025).

## Arquitectura Objetivo

```
alquiler/
├── backend/                  # API REST (FastAPI / Python)
│   ├── app/
│   │   ├── api/              # Endpoints REST
│   │   ├── core/             # Config, settings, constantes
│   │   ├── models/           # Modelos SQLAlchemy / Pydantic
│   │   ├── services/         # Lógica de negocio (cálculo IER)
│   │   └── etl/              # Pipelines de ingesta y transformación de datos
│   ├── tests/
│   └── requirements.txt
├── frontend/                 # SPA (React + Leaflet/Mapbox)
│   ├── src/
│   │   ├── components/       # Componentes React (Mapa, Filtros, Panel alertas)
│   │   ├── hooks/            # Custom hooks (useMapData, useFilters)
│   │   ├── services/         # Llamadas API
│   │   └── utils/            # Helpers, constantes
│   └── package.json
├── data/                     # Datasets procesados (no raw — los raw van en scrap datasets/)
├── scrap datasets/           # Catálogos y datasets crudos de datos abiertos
├── docs/                     # Documentación del proyecto
└── docker-compose.yml
```

## Modelo de Datos — Fórmula IER

```
IER = ω1·(Coste_Alquiler / Ingreso_Hogar) + ω2·Precariedad_Laboral − ω3·Acceso_Salud_Mental
```

- Los pesos `ω` se calibran con datos FOESSA
- El IER se cruza con datos de criminalidad para generar un **Score de Calidad de Vida del Barrio**
- Rango: 0–100, donde mayor valor = mayor estrés habitacional

## Datasets Principales

| Dataset | Fuente | Uso |
|---------|--------|-----|
| Renta por persona y hogar | Open Data Valencia | % renta disponible vs. coste alquiler por barrio |
| Recibos IBI 2020–2025 | Valencia — Hacienda Local | Impagos y concentración de grandes tenedores |
| Enfermedad Mental (Malaltia Mental) | Valencia — Sociedad y Bienestar | Correlación estrés habitacional ↔ salud mental |
| Pobreza y exclusión | Madrid | Validación cruzada de exclusión social |
| Migrantes (Migrants) | Valencia — Sociedad y Bienestar | Colectivos en vulnerabilidad extrema |

Los catálogos disponibles están en `scrap datasets/catalogo_tematico_llm.json` (Valencia: 269 datasets, Barcelona: 553, Madrid: 675, España: 87.250).

## Portales de Datos Abiertos

- **Valencia:** https://valencia.opendatasoft.com / datos.valencia.es
- **GVA:** https://dadesobertes.gva.es
- **Madrid:** https://datos.madrid.es
- **Barcelona:** https://opendata-ajuntament.barcelona.cat
- **España:** https://datos.gob.es (87.250 datasets)

## Stack Tecnológico Previsto

- **Backend:** Python 3.12+, FastAPI, SQLAlchemy, Pandas/GeoPandas, Alembic
- **Frontend:** React 18+, TypeScript, Leaflet (o Mapbox GL JS), Recharts
- **Base de datos:** PostgreSQL + PostGIS (datos geoespaciales por barrio)
- **ETL:** Scripts Python para ingesta de CSV/JSON desde portales de datos abiertos
- **Despliegue:** Docker Compose (dev), Vercel (frontend) + Railway/Render (backend)

## Comandos (una vez inicializado)

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev          # Dev server (Vite)
npm run build        # Build producción
npm run lint         # ESLint

# Tests backend (31 tests)
cd backend && pytest                                    # Todos los tests
cd backend && pytest tests/test_ier_calculator.py       # Cálculo IER (12 tests)
cd backend && pytest tests/test_ier_foessa.py           # Calibración FOESSA (10 tests)
cd backend && pytest tests/test_etl_pipeline.py         # ETL pipeline (17 tests)
cd backend && pytest tests/test_api_endpoints.py        # API con DB mockeada (13 tests)
cd backend && pytest -k "test_ranking"                  # Test por nombre

# Tests frontend (Vitest)
cd frontend && npm test                  # Todos los tests (utils + RTL components)

# ETL
cd backend && python -m app.etl.run_etl               # Pipeline completo
cd backend && python -m app.etl.run_etl --step load   # Solo carga
cd backend && python -m app.etl.validate              # Validación de datos (requiere DB)
```

## Convenciones

- Idioma del código (variables, funciones, comentarios): **inglés**
- Idioma de la UI y documentación de usuario: **español**
- Los datasets crudos nunca se modifican — se procesan en `data/`
- Coordenadas geográficas en EPSG:4326 (WGS84), transformar a EPSG:25830 (ETRS89 UTM 30N) solo para cálculos de distancia
- Barrios de Valencia identificados por código INE de sección censal
- Variables de entorno sensibles (API keys, DB credentials) en `.env`, nunca en el código

## Contexto del Ecosistema

AlquilerSano es la App #1 de un plan de 17 apps basadas en datos abiertos españoles (`plan_apps_unificado_2026.docx`). Comparte datasets y patrones ETL con otras apps del ecosistema (especialmente SmartZone #13, VacíoActivo #2). Diseñar los pipelines de datos pensando en reutilización.
