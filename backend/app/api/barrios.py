"""
GET /api/v1/barrios         — Lista todos los barrios (sin geometría)
GET /api/v1/barrios/{id}    — Detalle de un barrio con geometría + histórico IER
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import BarrioBase, BarrioDetalleSchema, IERScoreSchema
from app.core.database import get_db
from app.models.barrio import Barrio
from app.services.repositories import get_barrio_by_id, get_ier_historico

router = APIRouter(prefix="/barrios", tags=["barrios"])


@router.get("", response_model=list[BarrioBase])
async def list_barrios(
    distrito: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Devuelve todos los barrios. Filtra por distrito si se indica."""
    query = select(Barrio).order_by(Barrio.distrito_num, Barrio.nombre)
    if distrito:
        query = query.where(Barrio.distrito == distrito)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{barrio_id}", response_model=BarrioDetalleSchema)
async def get_barrio(
    barrio_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Detalle completo de un barrio: geometría GeoJSON + histórico IER 2020–2025."""
    barrio = await get_barrio_by_id(db, barrio_id)
    if not barrio:
        raise HTTPException(status_code=404, detail=f"Barrio {barrio_id} no encontrado")

    # Geometría guardada como GeoJSON texto (sin PostGIS)
    geom_result = await db.execute(
        text("SELECT geometria AS geojson FROM barrios WHERE id = :id"),
        {"id": barrio_id},
    )
    geom_row = geom_result.one_or_none()
    geometria = json.loads(geom_row.geojson) if geom_row and geom_row.geojson else None

    historico = await get_ier_historico(db, barrio_id)

    return BarrioDetalleSchema(
        id=barrio.id,
        codigo_ine=barrio.codigo_ine,
        nombre=barrio.nombre,
        nombre_val=barrio.nombre_val,
        distrito=barrio.distrito,
        distrito_num=barrio.distrito_num,
        geometria=geometria,
        historico=[IERScoreSchema.model_validate(s) for s in historico],
    )
