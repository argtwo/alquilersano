# AlquilerSano — Índice de Estrés Habitacional por Barrio

Plataforma web que calcula el **Índice de Estrés Residencial (IER)** por barrio, cruzando datos de gran tenedor (IBI), vulnerabilidad económica e indicadores de exclusión social. Visualiza un mapa de calor de vulnerabilidad con granularidad de barrio para Valencia, Madrid y Barcelona.

> Contexto: el 20% de hogares con bajos ingresos en España destina más del 70% de su renta al alquiler (FOESSA 2025).

## 🌐 Links en producción

| Servicio | URL |
|----------|-----|
| **Frontend (Vercel)** | https://frontend-gamma-khaki-78.vercel.app |
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
| Recibos IBI 2021–2025 | Open Data Valencia (`recibos-ibi-2020-2025`) | ~416 registros | ⚠️ 8 barrios sin match (ver TODO) |
| Vulnerabilidad por barrios 2021 | Open Data Valencia (`vulnerabilidad-por-barrios`) | 70 barrios | ⚠️ ind_econom/ind_global mal mapeados |
| IER scores calculados | Derivado de IBI + vulnerabilidad | ~416 registros | ⚠️ Cálculo usa datos incorrectos |
| Vivienda libre precio/m² | Open Data Valencia (`habitatge-lliure-preu-metre-quadrat`) | Pendiente | ⏳ |
| Población por manzanas | Open Data Valencia (`illes-amb-dades-de-poblacio-manzanas-con-datos-de-poblacion`) | Pendiente | ⏳ |
| Madrid / Barcelona | Pendiente | — | ⏳ |

---

## 🗺️ PLAN: Completar Valencia (prioridad actual)

### Fase 1: Corregir datos existentes 🔴

#### 1.1 — Arreglar matching de 8 barrios IBI
**Estado:** Pendiente confirmación del usuario para 1 caso (MAUELLA → MAHUELLA-TAULADELLA)

Diccionario de mapeo a añadir en `etl4.js`:
```
IBI                           → GeoJSON
CIUTAT ARTS I CI NCIES        → CIUTAT DE LES ARTS I DE LES CIENCIES
EL CABANYAL-EL CANYAMELAR     → CABANYAL-CANYAMELAR
EL CASTELLAR-L'OLIVERAL       → CASTELLAR-L'OLIVERAL
FONTETA DE SANT LLUIS         → LA FONTETA S.LLUIS
GRAN VIA                      → LA GRAN VIA
MAUELLA                       → MAHUELLA-TAULADELLA (pendiente confirmar)
MONT-OLIVET                   → MONTOLIVET
SANT LLOREN                   → SANT LLORENS
```
Impacto: +8 barrios × 5 años = ~40 registros IER más. Cobertura pasa de 80/88 a 87/88 (solo RAFALELL-VISTABELLA queda sin datos IBI).

#### 1.2 — Corregir mapeo de vulnerabilidad
El ETL actual (`etl4.js`) mete `ind_econom` → `tasa_pobreza` e `ind_global` → `precariedad_laboral`. Estos son **índices compuestos (0-100)**, no porcentajes. El cálculo `Math.min(valor * 0.5, 25)` satura a 25 para casi todos los barrios, eliminando diferenciación.

**Plan:** Normalizar `ind_econom` e `ind_global` dividiendo por el máximo del dataset antes de aplicar el multiplicador. Así el barrio más vulnerable tiene 25 y los demás se escalan proporcionalmente.

También: añadir mapeo `MONT-OLIVET → MONTOLIVET` para vulnerabilidad.

#### 1.3 — Recalcular IER con datos corregidos
Tras 1.1 y 1.2, ejecutar `node etl4.js` para regenerar todos los scores.

### Fase 2: Enriquecer datos Valencia 🟡

#### 2.1 — Añadir precio vivienda libre por m²
Dataset: `habitatge-lliure-preu-metre-quadrat` — precio medio del m² de vivienda libre.
Puede servir como proxy de presión inmobiliaria por zona. Evaluar si tiene desglose por barrio o solo global.

#### 2.2 — Añadir datos de población por manzana
Dataset: `illes-amb-dades-de-poblacio-manzanas-con-datos-de-poblacion` — manzanas con datos demográficos.
Agregar por barrio para obtener densidad, envejecimiento, etc. Útil para ponderar el IER por población afectada.

#### 2.3 — Explorar Recibos IAE por barrio
Dataset: `recibos_iae_2020-2025` — Impuesto de Actividades Económicas.
Puede indicar actividad económica del barrio (más actividad = más servicios = menos exclusión).

#### 2.4 — Explorar VPP (Viviendas de Protección Pública)
Dataset: `vivendes-proteccio-publica-vpp-viviendas-proteccion-publica-vpp`
Distribución de vivienda social por barrio. Un barrio con más VPP puede tener más vulnerabilidad o más protección, según se mire.

#### 2.5 — Mejorar fórmula IER con datos reales
Con los datasets 2.1-2.4 cargados, rediseñar los componentes del IER:
- **compAlquiler**: precio m² × pct_persona_juridica (presión especulativa real, no solo proxy IBI)
- **compPrecariedad**: ind_econom normalizado + indicadores demográficos
- **compSocial**: ind_global normalizado + VPP + IAE (actividad económica)

### Fase 3: Pulir frontend Valencia 🟢

#### 3.1 — Ajustar año por defecto
Cambiar `DEFAULT_FILTROS.anyo` de 2024 a 2021 (único año con datos de vulnerabilidad), o mejor: detectar automáticamente el año con más datos completos.

#### 3.2 — Quitar año 2020 del selector
Los datos IBI son 2021-2025. El filtro ofrece 2020 pero no hay datos. Ajustar `ANYO_OPTIONS`.

#### 3.3 — Mostrar cobertura de datos
Indicar en el UI cuántos barrios tienen datos completos vs parciales para el año seleccionado.
Ej: "87/88 barrios con IBI · 70/88 con vulnerabilidad"

#### 3.4 — Panel de detalle: mostrar componentes IER
El modal de detalle del barrio debería mostrar un desglose visual de los 3 componentes del IER (alquiler, precariedad, social) con barras o gauge.

#### 3.5 — Ranking de barrios
Añadir una vista de ranking (tabla ordenable) además del mapa, para comparar barrios rápidamente.

### Fase 4: Preparar para multi-ciudad (después de Valencia) ⏳

#### 4.1 — Refactorizar ETL para ser multi-ciudad
Convertir `etl4.js` en un ETL parametrizable: `node etl.js --city=valencia|madrid|barcelona`

#### 4.2 — Cargar Madrid
Datasets de Madrid Open Data: IBI, vulnerabilidad, barrios GeoJSON.

#### 4.3 — Cargar Barcelona
Datasets de Barcelona Open Data.

#### 4.4 — Selector de ciudad funcional
El frontend ya tiene el selector pero Madrid/Barcelona no tienen datos. Desactivar las opciones sin datos o mostrar "Próximamente".

---

## Datasets disponibles en Open Data Valencia (relevantes)

| Dataset ID | Descripción | Uso potencial |
|-----------|-------------|---------------|
| `barris-barrios` | GeoJSON 88 barrios | ✅ Ya cargado |
| `recibos-ibi-2020-2025` | IBI por barrio y año | ✅ Ya cargado (parcial) |
| `vulnerabilidad-por-barrios` | Índices vulnerabilidad 2021 | ✅ Ya cargado (mal mapeado) |
| `habitatge-lliure-preu-metre-quadrat` | Precio vivienda libre/m² | ⏳ Evaluar granularidad |
| `illes-amb-dades-de-poblacio-manzanas-con-datos-de-poblacion` | Demografía por manzana | ⏳ Agregar por barrio |
| `recibos_iae_2020-2025` | Actividad económica por barrio | ⏳ Proxy exclusión |
| `vivendes-proteccio-publica-vpp-viviendas-proteccion-publica-vpp` | Vivienda protegida | ⏳ Complemento social |
| `renda-per-llar-i-persona` | Renta por hogar/persona | ⚠️ Solo dato global, sin barrio |
| `seccions-censals-secciones-censales` | Secciones censales geom. | 🔍 Para cruzar datos INE |
| `1_1` | Población en riesgo de pobreza | 🔍 Evaluar si tiene barrio |


## Matching barrios IBI ↔ GeoJSON

8 barrios del IBI no matchean con el GeoJSON por diferencias de nombre:

| IBI | GeoJSON | Estado |
|-----|---------|--------|
| CIUTAT ARTS I CI NCIES | CIUTAT DE LES ARTS I DE LES CIENCIES | ✅ Obvio |
| EL CABANYAL-EL CANYAMELAR | CABANYAL-CANYAMELAR | ✅ Obvio |
| EL CASTELLAR-L'OLIVERAL | CASTELLAR-L'OLIVERAL | ✅ Obvio |
| FONTETA DE SANT LLUIS | LA FONTETA S.LLUIS | ✅ Obvio |
| GRAN VIA | LA GRAN VIA | ✅ Obvio |
| MAUELLA | MAHUELLA-TAULADELLA | ⚠️ Confirmado por usuario |
| MONT-OLIVET | MONTOLIVET | ✅ Obvio |
| SANT LLOREN | SANT LLORENS | ✅ Obvio |

Barrio GeoJSON sin datos IBI: **RAFALELL-VISTABELLA** (pedanía rural, sin recibos IBI propios).

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

```bash
cd G:\Proyectos\alquiler
node etl4.js
```

## Ciudades disponibles

| Ciudad | Datos IBI | Vulnerabilidad | IER | Estado |
|--------|-----------|---------------|-----|--------|
| Valencia | ✅ 2021–2025 | ✅ 2021 | ⚠️ Requiere recálculo | En corrección |
| Madrid | ⏳ | ⏳ | ⏳ | Pendiente |
| Barcelona | ⏳ | ⏳ | ⏳ | Pendiente |

## Licencia

MIT
