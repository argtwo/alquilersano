# AlquilerSano — Índice de Estrés Habitacional

Plataforma web que calcula el **Índice de Estrés Residencial (IER)** por municipio y barrio, cruzando datos de renta, pobreza y desigualdad del INE. Dashboard dark con mapa interactivo de la Comunidad Valenciana.

> El 20% de hogares con bajos ingresos en España destina más del 70% de su renta al alquiler (FOESSA 2025).

## 🖥️ Dashboard

![AlquilerSano Dashboard](docs/screenshot.png)

Dark command center con:
- **Popup de bienvenida** explicando el estrés residencial y cómo leer el mapa
- **KPI cards** de distribución por riesgo (Bajo/Medio/Alto/Crítico)
- **Mapa dark** (CartoDB) con municipios coloreados por IER
- **Panel de filtros** (zona, año, rango IER, riesgo)
- **Panel de alertas** con municipios en riesgo alto/crítico
- **Vista ranking** (tabla ordenable)

## 🌐 Links

| Servicio | URL |
|----------|-----|
| **Frontend** | https://frontend-gamma-khaki-78.vercel.app |
| **Backend API** | https://alquilersano-backend-production.up.railway.app |
| **GitHub** | https://github.com/argtwo/alquilersano |

## Datos cargados

| Ámbito | Fuente | Registros | IER |
|--------|--------|-----------|-----|
| **CV municipios** | ADRH/INE (renta + pobreza + Gini) | 534 municipios × 9 años | 0.2–94.3 |
| **Valencia barrios** | Open Data Valencia (IBI + vulnerabilidad) | 87 barrios × 5 años | 3.0–82.8 |
| Madrid / Barcelona | Pendiente | — | ⏳ |

### Distribución IER municipios CV (2023)
BAJO 67 · MEDIO 291 · ALTO 169 · CRÍTICO 7

## Stack

| Capa | Tecnologías |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite, Leaflet (CartoDB dark tiles), DM Sans |
| Backend | FastAPI + Python 3.12, SQLAlchemy async, Alembic |
| DB | PostgreSQL 16 (Railway) — sin PostGIS |
| ETL | Node.js (descarga INE + carga DB) |
| Despliegue | Vercel (frontend) · Railway (backend + PostgreSQL) |

## Fórmula IER

**Municipios** (percentiles ADRH/INE):
```
IER = (1 - pctRenta) × 40 + pctPobreza × 35 + pctGini × 25
```

**Barrios Valencia** (IBI + vulnerabilidad):
```
IER = pctJuridica × 50 + econom × 25 + global × 25
```

## Scripts ETL

```bash
node etl4.js                                          # Barrios Valencia
node etl_municipios_cv.js                             # 542 municipios CV
node --max-old-space-size=4096 download_all_nacional.js          # INE Valencia
node --max-old-space-size=4096 download_alicante_castellon.js    # INE Ali+Cas
```

## Tablas ADRH del INE

| Provincia | Renta | Pobreza | Gini | Municipios |
|-----------|-------|---------|------|------------|
| Alicante (03) | 30833 | 30838 | 37733 | 141 |
| Castellón (12) | 30962 | 30967 | 37691 | 135 |
| Valencia (46) | 31250 | 31255 | 37721 | 264 |

## Desarrollo local

```bash
# Backend
cd backend && pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://... uvicorn app.main:app --reload

# Frontend
cd frontend && npm install
echo "VITE_API_URL=http://localhost:8000" > .env && npm run dev
```

## Licencia
MIT
