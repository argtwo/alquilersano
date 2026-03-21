"""
Queries SQLAlchemy para leer y escribir datos del IER.
Cada función recibe una AsyncSession y devuelve los datos sin lógica de negocio.
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.barrio import (
    Barrio,
    IERScore,
    IndicadorExclusion,
    IndicadorRenta,
    IndicadorSaludMental,
    ReciboIBI,
)
from app.services.ier_calculator import IndicadoresBarrio


# ── Lectura de barrios ─────────────────────────────────────────────────────────

async def get_all_barrios(db: AsyncSession) -> list[Barrio]:
    result = await db.execute(select(Barrio).order_by(Barrio.id))
    return list(result.scalars().all())


async def get_barrio_by_id(db: AsyncSession, barrio_id: int) -> Barrio | None:
    result = await db.execute(select(Barrio).where(Barrio.id == barrio_id))
    return result.scalar_one_or_none()


# ── Lectura de indicadores para el cálculo IER ────────────────────────────────

async def get_indicadores_para_ier(
    db: AsyncSession, anyo: int
) -> list[IndicadoresBarrio]:
    """
    Devuelve los indicadores de todos los barrios para un año,
    haciendo LEFT JOIN entre las 4 tablas de indicadores.
    """
    # Subconsultas por tabla para el año dado
    renta_q = (
        select(
            IndicadorRenta.barrio_id,
            IndicadorRenta.renta_media_hogar,
            IndicadorRenta.coste_alquiler_medio,
        ).where(IndicadorRenta.anyo == anyo)
    ).subquery("renta")

    exclusion_q = (
        select(
            IndicadorExclusion.barrio_id,
            IndicadorExclusion.pct_desempleo,
            IndicadorExclusion.pct_migrantes,
        ).where(IndicadorExclusion.anyo == anyo)
    ).subquery("exclusion")

    ibi_q = (
        select(
            ReciboIBI.barrio_id,
            ReciboIBI.pct_impagados,
            ReciboIBI.pct_persona_juridica,
        ).where(ReciboIBI.anyo == anyo)
    ).subquery("ibi")

    salud_q = (
        select(
            IndicadorSaludMental.barrio_id,
            IndicadorSaludMental.tasa_por_1000,
            IndicadorSaludMental.recursos_disponibles,
        ).where(IndicadorSaludMental.anyo == anyo)
    ).subquery("salud")

    query = (
        select(
            Barrio.id,
            renta_q.c.renta_media_hogar,
            renta_q.c.coste_alquiler_medio,
            exclusion_q.c.pct_desempleo,
            exclusion_q.c.pct_migrantes,
            ibi_q.c.pct_impagados,
            ibi_q.c.pct_persona_juridica,
            salud_q.c.tasa_por_1000,
            salud_q.c.recursos_disponibles,
        )
        .outerjoin(renta_q, Barrio.id == renta_q.c.barrio_id)
        .outerjoin(exclusion_q, Barrio.id == exclusion_q.c.barrio_id)
        .outerjoin(ibi_q, Barrio.id == ibi_q.c.barrio_id)
        .outerjoin(salud_q, Barrio.id == salud_q.c.barrio_id)
    )

    rows = (await db.execute(query)).all()

    return [
        IndicadoresBarrio(
            barrio_id=row.id,
            anyo=anyo,
            renta_media_hogar=row.renta_media_hogar,
            coste_alquiler_medio=row.coste_alquiler_medio,
            pct_desempleo=row.pct_desempleo,
            pct_migrantes=row.pct_migrantes,
            pct_ibi_impagados=row.pct_impagados,
            pct_persona_juridica=row.pct_persona_juridica,
            tasa_salud_mental=row.tasa_por_1000,
            recursos_salud_mental=row.recursos_disponibles,
        )
        for row in rows
    ]


# ── Lectura de scores calculados ──────────────────────────────────────────────

async def get_ier_scores(
    db: AsyncSession,
    anyo: int,
    min_ier: float = 0,
    max_ier: float = 100,
    distrito: str | None = None,
    ciudad: str | None = None,
) -> list[tuple[Barrio, IERScore]]:
    query = (
        select(Barrio, IERScore)
        .join(IERScore, Barrio.id == IERScore.barrio_id)
        .where(IERScore.anyo == anyo)
        .where(IERScore.ier_value >= min_ier)
        .where(IERScore.ier_value <= max_ier)
    )
    if distrito:
        query = query.where(Barrio.distrito == distrito)
    if ciudad:
        query = query.where(Barrio.ciudad == ciudad)

    rows = (await db.execute(query)).all()
    return [(row.Barrio, row.IERScore) for row in rows]


async def get_ier_historico(
    db: AsyncSession, barrio_id: int
) -> list[IERScore]:
    result = await db.execute(
        select(IERScore)
        .where(IERScore.barrio_id == barrio_id)
        .order_by(IERScore.anyo)
    )
    return list(result.scalars().all())


async def get_alertas(
    db: AsyncSession,
    anyo: int,
    riesgos: list[str] | None = None,
    ciudad: str | None = None,
) -> list[tuple[Barrio, IERScore]]:
    if riesgos is None:
        riesgos = ["ALTO", "CRÍTICO"]
    query = (
        select(Barrio, IERScore)
        .join(IERScore, Barrio.id == IERScore.barrio_id)
        .where(IERScore.anyo == anyo)
        .where(IERScore.riesgo_desahucio.in_(riesgos))
        .order_by(IERScore.ier_value.desc())
    )
    if ciudad:
        query = query.where(Barrio.ciudad == ciudad)
    rows = (await db.execute(query)).all()
    return [(row.Barrio, row.IERScore) for row in rows]


async def get_stats(db: AsyncSession, anyo: int, ciudad: str | None = None) -> dict:
    base_q = (
        select(
            func.count(IERScore.id).label("total_barrios"),
            func.avg(IERScore.ier_value).label("ier_medio"),
            func.min(IERScore.ier_value).label("ier_min"),
            func.max(IERScore.ier_value).label("ier_max"),
            func.count().filter(IERScore.riesgo_desahucio == "CRÍTICO").label("critico"),
            func.count().filter(IERScore.riesgo_desahucio == "ALTO").label("alto"),
            func.count().filter(IERScore.riesgo_desahucio == "MEDIO").label("medio"),
            func.count().filter(IERScore.riesgo_desahucio == "BAJO").label("bajo"),
        )
        .join(Barrio, Barrio.id == IERScore.barrio_id)
        .where(IERScore.anyo == anyo)
    )
    if ciudad:
        base_q = base_q.where(Barrio.ciudad == ciudad)
    result = await db.execute(base_q)
    row = result.one()
    return {
        "anyo": anyo,
        "total_barrios": row.total_barrios,
        "ier_medio": round(float(row.ier_medio or 0), 2),
        "ier_min": round(float(row.ier_min or 0), 2),
        "ier_max": round(float(row.ier_max or 0), 2),
        "distribucion_riesgo": {
            "CRÍTICO": row.critico,
            "ALTO": row.alto,
            "MEDIO": row.medio,
            "BAJO": row.bajo,
        },
    }


# ── Escritura de scores ────────────────────────────────────────────────────────

async def upsert_ier_scores(db: AsyncSession, scores: list) -> None:
    """Inserta o actualiza los IERScore calculados."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    if not scores:
        return

    rows = [
        {
            "barrio_id": s.barrio_id,
            "anyo": s.anyo,
            "ier_value": s.ier_value,
            "componente_alquiler": s.componente_alquiler,
            "componente_precariedad": s.componente_precariedad,
            "componente_salud_mental": s.componente_salud_mental,
            "score_calidad_vida": s.score_calidad_vida,
            "riesgo_desahucio": s.riesgo_desahucio,
        }
        for s in scores
    ]

    stmt = pg_insert(IERScore).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["barrio_id", "anyo"],
        set_={
            "ier_value": stmt.excluded.ier_value,
            "componente_alquiler": stmt.excluded.componente_alquiler,
            "componente_precariedad": stmt.excluded.componente_precariedad,
            "componente_salud_mental": stmt.excluded.componente_salud_mental,
            "score_calidad_vida": stmt.excluded.score_calidad_vida,
            "riesgo_desahucio": stmt.excluded.riesgo_desahucio,
        },
    )
    await db.execute(stmt)
    await db.commit()
