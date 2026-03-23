"""
GET  /api/v1/ier                        — IER de todos los barrios (para el mapa de calor)
GET  /api/v1/ier/{barrio_id}/historico  — Histórico IER de un barrio 2020–2025
POST /api/v1/ier/recalculate            — Dispara el recálculo del IER (admin)
"""
import json

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.api.schemas import BarrioGeoSchema, IERScoreSchema, RecalculateResponse
from app.core.database import get_db
from app.services.ier_service import recalculate_ier
from app.services.repositories import get_ier_historico, get_ier_scores

router = APIRouter(prefix="/ier", tags=["ier"])

_PRECISION = 4  # ~11m de precisión — suficiente para municipios en un mapa web


def _round_coords(obj: object) -> object:
    """Reduce precisión de coordenadas GeoJSON a 4 decimales para aligerar la respuesta."""
    if isinstance(obj, float):
        return round(obj, _PRECISION)
    if isinstance(obj, list):
        return [_round_coords(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _round_coords(v) for k, v in obj.items()}
    return obj


@router.get("", response_model=list[BarrioGeoSchema])
async def get_ier_mapa(
    request: Request,
    year: int = Query(default=2025, ge=2015, le=2025),
    min_ier: float = Query(default=0, ge=0, le=100),
    max_ier: float = Query(default=100, ge=0, le=100),
    distrito: str | None = None,
    ciudad: str | None = Query(default=None, description="Filtrar por ciudad: valencia, valencia_provincia, madrid, barcelona"),
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve barrios con su IER y geometría GeoJSON para pintar el mapa de calor.
    Aplicar filtros de rango IER y distrito es opcional.
    """
    pairs = await get_ier_scores(db, year, min_ier, max_ier, distrito, ciudad)

    if not pairs:
        return []

    # Obtener geometrías en una sola consulta
    barrio_ids = [b.id for b, _ in pairs]
    placeholders = ", ".join(str(i) for i in barrio_ids)
    geom_result = await db.execute(
        text(f"SELECT id, geometria AS geojson FROM barrios WHERE id IN ({placeholders})")
    )
    geom_map: dict[int, dict] = {}
    for row in geom_result:
        if row.geojson:
            try:
                geom_map[row.id] = _round_coords(json.loads(row.geojson))
            except Exception:
                pass

    return [
        BarrioGeoSchema(
            id=barrio.id,
            codigo_ine=barrio.codigo_ine,
            nombre=barrio.nombre,
            nombre_val=barrio.nombre_val,
            distrito=barrio.distrito,
            distrito_num=barrio.distrito_num,
            geometria=geom_map.get(barrio.id),
            ier=IERScoreSchema.model_validate(score),
        )
        for barrio, score in pairs
    ]


@router.get("/{barrio_id}/historico", response_model=list[IERScoreSchema])
async def get_historico(
    barrio_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Devuelve la serie temporal IER 2020–2025 para un barrio."""
    scores = await get_ier_historico(db, barrio_id)
    return [IERScoreSchema.model_validate(s) for s in scores]


@router.post("/recalculate", response_model=RecalculateResponse)
async def recalculate(
    year: int = Query(default=2025, ge=2015, le=2025),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Recalcula y persiste el IER para el año indicado.
    Útil tras una nueva ingesta de datos ETL.
    """
    n = await recalculate_ier(db, year)
    return RecalculateResponse(
        anyo=year,
        scores_generados=n,
        mensaje=f"IER recalculado para {n} barrios en {year}.",
    )
