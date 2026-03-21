from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.auth import router as auth_router
from app.api.barrios import router as barrios_router
from app.api.ier import router as ier_router
from app.api.alertas import router as alertas_router
from app.api.stats import router as stats_router

# Rate limiting (slowapi — opcional, no bloquea el arranque si no está instalado)
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address)
    _RATE_LIMIT_AVAILABLE = True
except ImportError:
    limiter = None
    _RATE_LIMIT_AVAILABLE = False

app = FastAPI(
    title="AlquilerSano API",
    description="Índice de Estrés Residencial por barrio — datos abiertos España",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

if _RATE_LIMIT_AVAILABLE:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(barrios_router, prefix=API_PREFIX)
app.include_router(ier_router, prefix=API_PREFIX)
app.include_router(alertas_router, prefix=API_PREFIX)
app.include_router(stats_router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.2.0",
        "features": {
            "multi_ciudad": True,
            "ml_predictor": True,
            "auth": True,
            "rate_limiting": _RATE_LIMIT_AVAILABLE,
        },
    }
