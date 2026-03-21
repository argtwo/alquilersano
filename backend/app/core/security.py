"""
Utilidades JWT y hashing de contraseñas para autenticación del panel de admin.

El panel de servicios sociales requiere autenticación para acceder a:
  - POST /api/v1/ier/recalculate
  - En Fase futura: gestión de alertas, exportación de datos sensibles

Las credenciales de admin se configuran en variables de entorno:
  ADMIN_USERNAME, ADMIN_PASSWORD_HASH (generado con hash_password())
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings

# Intentar importar dependencias opcionales de seguridad
try:
    from jose import JWTError, jwt
    from passlib.context import CryptContext
    _SECURITY_AVAILABLE = True
except ImportError:
    _SECURITY_AVAILABLE = False

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 horas


def _check_deps():
    if not _SECURITY_AVAILABLE:
        raise RuntimeError(
            "Dependencias de seguridad no instaladas. "
            "Ejecutar: pip install python-jose[cryptography] passlib[bcrypt]"
        )


def hash_password(password: str) -> str:
    """Genera el hash bcrypt de una contraseña. Usar para configurar ADMIN_PASSWORD_HASH."""
    _check_deps()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica si una contraseña en texto plano coincide con su hash."""
    if not _SECURITY_AVAILABLE:
        return False
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Genera un JWT firmado con SECRET_KEY."""
    _check_deps()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decodifica y valida un JWT. Lanza JWTError si es inválido o ha expirado.
    Relanza como ValueError para que FastAPI lo convierta en 401.
    """
    _check_deps()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise ValueError(f"Token inválido: {e}") from e
