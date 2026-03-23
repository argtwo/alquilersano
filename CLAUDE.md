# CLAUDE.md — AlquilerSano

Guía para Claude Code al trabajar en este repositorio.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Review lessons at session start

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Run tests, check logs, demonstrate correctness
- Ask: "Would a staff engineer approve this?"

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip for simple, obvious fixes — don't over-engineer

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests → then resolve them

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Document Results**: Add review to `tasks/todo.md`
5. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible
- **No Laziness**: Find root causes. No temporary fixes
- **Minimal Impact**: Changes should only touch what's necessary

---

## Proyecto

**AlquilerSano — Índice de Estrés Residencial (IER) por municipio/barrio.**
Plataforma web que calcula el IER cruzando datos de renta (ADRH/INE), pobreza, desigualdad (Gini) y vulnerabilidad, visualizando un mapa de calor para la Comunidad Valenciana.

## Estado actual (23 marzo 2026)

### ✅ Operativo
- **Frontend** Vercel: https://frontend-gamma-khaki-78.vercel.app
- **Backend** Railway: https://alquilersano-backend-production.up.railway.app
- **DB** PostgreSQL Railway (proyecto `sublime-patience`)
- **GitHub** https://github.com/argtwo/alquilersano — push a `master` = auto-deploy
- **CV completa**: 534 municipios (3 provincias) + 87 barrios Valencia ciudad
- **Datos ADRH del INE**: renta, pobreza, Gini por municipio (2015-2023)
- **Datos Open Data Valencia**: IBI, vulnerabilidad por barrio (2021-2025)

### ⚠️ Notas técnicas
- **Sin PostGIS**: geometría como GeoJSON TEXT. NO usar `ST_AsGeoJSON()` ni geoalchemy2
- **startup.py**: usa `alembic stamp head` como fallback (NO borra alembic_version)
- **GeoJSON municipios CV**: viene en UTM (EPSG:25830), el ETL convierte a WGS84
- **requirements.txt**: sin geopandas/pandas/sklearn (causaban build failure en Railway)

## Arquitectura

```
alquiler/
├── backend/             # FastAPI + SQLAlchemy async + Alembic
│   ├── app/api/         # Endpoints: /ier, /alertas, /stats, /barrios
│   ├── app/models/      # Barrio (geometria=Text), IERScore, indicadores
│   ├── app/services/    # ier_service.py, repositories.py
│   ├── startup.py       # alembic upgrade head + stamp fallback
│   └── Dockerfile
├── frontend/            # React 18 + TypeScript + Vite + Leaflet
│   ├── src/components/  # MapView, FiltrosPanel, AlertasPanel, StatsBar
│   ├── src/hooks/       # useIERData, useStats
│   └── src/services/    # api.ts → VITE_API_URL
├── etl4.js              # ETL barrios Valencia ciudad → Railway DB
├── etl_municipios_cv.js # ETL 542 municipios CV (ADRH + GeoJSON GVA)
├── download_all_nacional.js        # Descarga ADRH Valencia (46)
├── download_alicante_castellon.js  # Descarga ADRH Alicante (03) + Castellón (12)
├── data/raw/nacional/   # CSVs ADRH + GeoJSON municipios CV
└── tasks/               # todo.md, lessons.md
```

## Modelo IER

**Barrios Valencia ciudad** (etl4.js):
```
compAlquiler = (pct_persona_juridica / max) × 50
compPrecariedad = (ind_econom_normalizado) × 25
compSocial = (ind_global_normalizado) × 25
```

**Municipios CV** (etl_municipios_cv.js) — fórmula percentiles:
```
compRenta = (1 - percentile_rank(renta_hogar)) × 40    # menor renta = más estrés
compPobreza = percentile_rank(tasa_pobreza_60med) × 35  # más pobreza = más estrés
compGini = percentile_rank(indice_gini) × 25            # más desigualdad = más estrés
```

## Convenciones

- Código: **inglés**. UI y docs: **español**
- Geometrías: GeoJSON como TEXT (sin PostGIS)
- Municipios: código INE 5 dígitos. Barrios: código INE + distrito + barrio
- Variables sensibles en `.env` / Railway Env Vars, nunca en código
- `ciudad='valencia'` = barrios. `ciudad='valencia_provincia'` = municipios CV

## Comandos frecuentes

```bash
# ETL barrios Valencia ciudad
node etl4.js

# ETL municipios CV completa (3 provincias)
node etl_municipios_cv.js

# Descargar datasets INE
node --max-old-space-size=4096 download_all_nacional.js
node --max-old-space-size=4096 download_alicante_castellon.js

# Deploy (auto via git push)
git add . && git commit -m "..." && git push origin master
```

## Contexto

AlquilerSano es la App #1 de un plan de 17 apps de datos abiertos españoles (`plan_apps_unificado_2026.docx`).
