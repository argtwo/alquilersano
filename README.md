# AlquilerSano — Índice de Estrés Habitacional

Plataforma web que calcula el **Índice de Estrés Residencial (IER)** por municipio y barrio, cruzando datos de renta (ADRH/INE), pobreza, desigualdad (Gini) y vulnerabilidad. Visualiza un mapa de calor interactivo de la Comunidad Valenciana.

> El 20% de hogares con bajos ingresos en España destina más del 70% de su renta al alquiler (FOESSA 2025).

## 🌐 Links

| Servicio | URL |
|----------|-----|
| **Frontend** | https://frontend-gamma-khaki-78.vercel.app |
| **Backend API** | https://alquilersano-backend-production.up.railway.app |
| **API Docs** | https://alquilersano-backend-production.up.railway.app/docs |
| **GitHub** | https://github.com/argtwo/alquilersano |

## Datos cargados (23 marzo 2026)

| Ámbito | Fuente | Registros | IER |
|--------|--------|-----------|-----|
| **Valencia barrios** | Open Data Valencia (IBI + vulnerabilidad) | 87 barrios × 5 años | ✅ 3.0–82.8 |
| **CV municipios** | ADRH/INE (renta + pobreza + Gini) | 534 municipios × 9 años | ✅ 0.2–94.3 |
| Madrid / Barcelona | Pendiente | — | ⏳ |

### Distribución IER municipios CV (2023)
- **BAJO** (0–24): 67 municipios
- **MEDIO** (25–49): 291 municipios
- **ALTO** (50–74): 169 municipios
- **CRÍTICO** (75–100): 7 municipios

## Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite, Leaflet, Recharts |
| Backend | FastAPI + Python 3.12, SQLAlchemy async, Alembic |
| DB | PostgreSQL 16 (Railway) — sin PostGIS, geometría como GeoJSON TEXT |
| ETL | Node.js (descarga INE + carga DB) |
| Despliegue | Vercel (frontend) · Railway (backend + PostgreSQL) |

## Fórmula IER

**Municipios CV** (basado en ADRH del INE, percentiles):
```
IER = compRenta(0–40) + compPobreza(0–35) + compGini(0–25) = 0–100
```
- compRenta: percentil inverso de renta neta por hogar (menor renta = más estrés)
- compPobreza: percentil de % población bajo 60% mediana
- compGini: percentil del índice de Gini

**Barrios Valencia** (basado en IBI + vulnerabilidad Open Data):
```
IER = compAlquiler(0–50) + compPrecariedad(0–25) + compSocial(0–25)
```

## Scripts ETL

```bash
# Barrios Valencia ciudad (IBI + vulnerabilidad)
node etl4.js

# Municipios CV completa (ADRH INE — 3 provincias)
node etl_municipios_cv.js

# Descargar datos INE
node --max-old-space-size=4096 download_all_nacional.js          # Valencia
node --max-old-space-size=4096 download_alicante_castellon.js    # Alicante + Castellón
```

## Tablas ADRH del INE por provincia

El INE organiza el ADRH en tablas separadas por provincia. IDs confirmados:

| Provincia | Renta | Pobreza | Gini | Municipios |
|-----------|-------|---------|------|------------|
| Alicante (03) | 30833 | 30838 | 37733 | 141 |
| Castellón (12) | 30962 | 30967 | 37691 | 135 |
| Valencia (46) | 31250 | 31255 | 37721 | 264 |

## Desarrollo local

```bash
# Backend
cd backend && pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://... uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install
echo "VITE_API_URL=http://localhost:8000" > .env && npm run dev
```

## Variables de entorno

| Variable | Dónde | Valor |
|----------|-------|-------|
| `VITE_API_URL` | Vercel | `https://alquilersano-backend-production.up.railway.app` |
| `DATABASE_URL` | Railway | `postgresql+asyncpg://...@alquilersano-db.railway.internal:5432/railway` |
| `ALLOWED_ORIGINS` | Railway | JSON array dominios Vercel |

## Licencia

MIT
