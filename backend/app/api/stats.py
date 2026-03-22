"""
GET /api/v1/stats — Estadísticas agregadas del IER para toda la ciudad.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import StatsSchema
from app.core.database import get_db
from app.services.repositories import get_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=StatsSchema)
async def city_stats(
    year: int = Query(default=2025, ge=2021, le=2025),
    db: AsyncSession = Depends(get_db),
):
    """
    Estadísticas globales: IER medio, mínimo, máximo y distribución de riesgo.
    """
    return await get_stats(db, year)
