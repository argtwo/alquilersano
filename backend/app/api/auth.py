"""
POST /api/v1/auth/token — Obtener token JWT para acceso al panel de admin.

Uso:
    curl -X POST /api/v1/auth/token \
         -d "username=admin&password=secreto" \
         -H "Content-Type: application/x-www-form-urlencoded"

    → {"access_token": "eyJ...", "token_type": "bearer"}

Las credenciales se configuran en .env:
    ADMIN_USERNAME=admin
    ADMIN_PASSWORD_HASH=$(python -c "from app.core.security import hash_password; print(hash_password('tu_password'))")
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    """
    Autentica al usuario admin y devuelve un JWT.
    Protege endpoints de administración (recalculate, etc.).
    """
    admin_user = getattr(settings, "admin_username", "admin")
    admin_hash = getattr(settings, "admin_password_hash", None)

    # Si no hay hash configurado, rechazar siempre (no permitir acceso sin configurar)
    if not admin_hash:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Autenticación no configurada. Definir ADMIN_PASSWORD_HASH en .env",
        )

    credentials_ok = (
        form.username == admin_user
        and verify_password(form.password, admin_hash)
    )

    if not credentials_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": form.username, "role": "admin"})
    return TokenResponse(access_token=token)


async def require_admin(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependencia FastAPI para proteger endpoints de admin.

    Uso:
        @router.post("/recalculate")
        async def recalculate(admin=Depends(require_admin), ...):
            ...
    """
    from app.core.security import decode_access_token

    try:
        payload = decode_access_token(token)
    except (ValueError, Exception):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permisos insuficientes",
        )
    return payload
