"""Schemas Pydantic para los responses de la API."""
from pydantic import BaseModel, ConfigDict


# ── IER ───────────────────────────────────────────────────────────────────────

class IERScoreSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    barrio_id: int
    anyo: int
    ier_value: float
    componente_alquiler: float | None
    componente_precariedad: float | None
    componente_salud_mental: float | None
    score_calidad_vida: float | None
    riesgo_desahucio: str | None


# ── Barrio (sin geometría) ─────────────────────────────────────────────────────

class BarrioBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo_ine: str
    nombre: str
    nombre_val: str | None
    distrito: str | None
    distrito_num: int | None


class BarrioConIERSchema(BarrioBase):
    ier: IERScoreSchema | None = None


# ── Barrio con geometría GeoJSON (para el mapa) ────────────────────────────────

class BarrioGeoSchema(BarrioConIERSchema):
    """
    Incluye la geometría como dict GeoJSON.
    La geometría se serializa manualmente en el router usando ST_AsGeoJSON.
    """
    geometria: dict | None = None


# ── Detalle de barrio (con histórico) ─────────────────────────────────────────

class BarrioDetalleSchema(BarrioGeoSchema):
    historico: list[IERScoreSchema] = []


# ── Stats globales ─────────────────────────────────────────────────────────────

class DistribucionRiesgoSchema(BaseModel):
    CRÍTICO: int
    ALTO: int
    MEDIO: int
    BAJO: int


class StatsSchema(BaseModel):
    anyo: int
    total_barrios: int
    ier_medio: float
    ier_min: float
    ier_max: float
    distribucion_riesgo: DistribucionRiesgoSchema


# ── Recalculate response ───────────────────────────────────────────────────────

class RecalculateResponse(BaseModel):
    anyo: int
    scores_generados: int
    mensaje: str
