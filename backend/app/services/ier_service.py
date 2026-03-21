"""
Orquestador del cálculo IER: lee indicadores → calcula → persiste scores.

Se llama:
  - Desde el ETL al final de la carga (recalcula todos los años)
  - Desde el endpoint POST /api/v1/ier/recalculate (recalcula un año)
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ier_calculator import IERCalculator
from app.services.repositories import (
    get_indicadores_para_ier,
    upsert_ier_scores,
)

logger = logging.getLogger(__name__)

YEARS_DEFAULT = list(range(2020, 2026))


async def recalculate_ier(db: AsyncSession, anyo: int) -> int:
    """
    Recalcula el IER para todos los barrios de un año.
    Devuelve el número de scores generados.
    """
    indicadores = await get_indicadores_para_ier(db, anyo)

    if not indicadores:
        logger.warning(f"Sin indicadores para el año {anyo}. Nada que calcular.")
        return 0

    calculator = IERCalculator()
    calculator.fit(indicadores)
    scores = calculator.calculate_batch(indicadores)

    await upsert_ier_scores(db, scores)
    logger.info(f"IER {anyo}: {len(scores)} scores calculados y persistidos.")
    return len(scores)


async def recalculate_all_years(db: AsyncSession, years: list[int] | None = None) -> dict[int, int]:
    """Recalcula el IER para todos los años indicados. Devuelve {año: nº_scores}."""
    years = years or YEARS_DEFAULT
    results: dict[int, int] = {}
    for year in years:
        results[year] = await recalculate_ier(db, year)
    return results
