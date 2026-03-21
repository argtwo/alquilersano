from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://alquiler:alquiler@localhost:5432/alquilersano"
    secret_key: str = "change-me"
    debug: bool = True
    allowed_origins: list[str] = ["http://localhost:5173"]

    # Auth de admin — configurar en .env antes de usar POST /ier/recalculate
    admin_username: str = "admin"
    admin_password_hash: str = ""  # generar con: from app.core.security import hash_password

    # Rate limiting (requests por minuto para la API pública)
    rate_limit_per_minute: int = 60

    # ETL paths
    data_raw_dir: str = "/data/raw"
    data_processed_dir: str = "/data/processed"
    data_geojson_dir: str = "/data/geojson"

    class Config:
        env_file = ".env"


settings = Settings()
