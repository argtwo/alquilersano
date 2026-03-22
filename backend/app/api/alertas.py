"""
GET /api/v1/alertas — Barrios con riesgo de desahucio ALTO o CRÍTICO.
Pensado para el panel de servicios sociales.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BarrioConIERSchema, IERScoreSchema
from app.core.database import get_db
from app.services.repositories import get_alertas

router = APIRouter(prefix="/alertas", tags=["alertas"])


@router.get("", response_model=list[BarrioConIERSchema])
async def list_alertas(
    year: int = Query(default=2025, ge=2015, le=2025),
    nivel: list[str] = Query(default=["ALTO", "CRÍTICO"]),
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve los barrios en estado de alerta (ALTO o CRÍTICO por defecto).
    Ordenados por IER descendente para priorización de intervención.
    """
    pairs = await get_alertas(db, year, nivel)
    return [
        BarrioConIERSchema(
            id=barrio.id,
            codigo_ine=barrio.codigo_ine,
            nombre=barrio.nombre,
            nombre_val=barrio.nombre_val,
            distrito=barrio.distrito,
            distrito_num=barrio.distrito_num,
            ier=IERScoreSchema.model_validate(score),
        )
        for barrio, score in pairs
    ]
