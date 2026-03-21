# Guía de Despliegue — AlquilerSano

## Opción A — Docker Compose (servidor propio / VPS)

Todo en un solo servidor: PostgreSQL + backend + frontend nginx en los puertos 80/443.

```bash
# 1. Clonar el repositorio
git clone <repo-url> alquilersano && cd alquilersano

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env:
#   - POSTGRES_PASSWORD → contraseña segura
#   - DATABASE_URL      → postgresql+asyncpg://alquiler:SECRETO@db:5432/alquilersano
#   - SECRET_KEY        → cadena aleatoria larga
#   - ALLOWED_ORIGINS   → tu dominio
#   - VITE_API_URL      → dejar vacío (nginx proxy)

# 3. Construir y arrancar
docker compose -f docker-compose.prod.yml up -d --build

# 4. Verificar
curl http://localhost/health          # debe devolver {"status":"ok"}
curl http://localhost/api/v1/stats    # debe devolver estadísticas IER

# 5. Cargar datos (primera vez)
docker compose -f docker-compose.prod.yml exec backend \
    python -m app.etl.run_etl

# Logs
docker compose -f docker-compose.prod.yml logs -f backend
```

### SSL con Certbot (opcional)

```bash
# Instalar certbot
apt-get install -y certbot python3-certbot-nginx

# Obtener certificado (sustituir tu-dominio.es)
certbot --nginx -d tu-dominio.es -d www.tu-dominio.es

# Certbot modifica /etc/nginx/... automáticamente
# Renovación automática ya instalada vía cron
```

---

## Opción B — Vercel (frontend) + Render (backend)

Arquitectura split: frontend estático en CDN + backend como web service en Render.

### Backend en Render

1. Crear cuenta en [render.com](https://render.com)
2. **New → Blueprint** → conectar el repositorio de GitHub
3. Render detecta `render.yaml` y crea automáticamente:
   - Web service `alquilersano-backend` (Docker, puerto 8000)
   - PostgreSQL 16 `alquilersano-db`
4. En el dashboard de Render, configurar manualmente:
   - `DATABASE_URL` → copiar la URL interna que genera Render para la BD
   - Verificar que las demás env vars están presentes
5. Una vez desplegado, anotar la URL pública: `https://alquilersano-backend.onrender.com`

### Frontend en Vercel

1. Crear cuenta en [vercel.com](https://vercel.com)
2. **Add New → Project** → importar el repositorio
3. Vercel detecta `vercel.json` con:
   - Build: `cd frontend && npm ci && npm run build`
   - Output: `frontend/dist`
4. En **Settings → Environment Variables**, añadir:
   ```
   VITE_API_URL = https://alquilersano-backend.onrender.com
   ```
5. **Redeploy** para que la variable quede en el build

### Verificación final

```bash
# Backend
curl https://alquilersano-backend.onrender.com/health

# Frontend (sustituir con tu URL de Vercel)
open https://alquilersano.vercel.app
```

---

## Variables de Entorno requeridas en producción

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL asyncpg de PostgreSQL | `postgresql+asyncpg://user:pass@host/db` |
| `POSTGRES_PASSWORD` | Solo para docker-compose | contraseña segura |
| `SECRET_KEY` | Clave secreta del backend | cadena aleatoria ≥32 chars |
| `ALLOWED_ORIGINS` | CORS — dominios del frontend | `https://alquilersano.es` |
| `VITE_API_URL` | URL del backend (build-time) | `https://...onrender.com` o vacío |
| `DEBUG` | Activar logs detallados | `false` en prod |

---

## Actualizar datos ETL en producción

```bash
# En Docker Compose
docker compose -f docker-compose.prod.yml exec backend \
    python -m app.etl.run_etl --step download
docker compose -f docker-compose.prod.yml exec backend \
    python -m app.etl.run_etl --step clean
docker compose -f docker-compose.prod.yml exec backend \
    python -m app.etl.run_etl --step load

# En Render (vía SSH o Render Shell en el dashboard)
python -m app.etl.run_etl
```
