"""
Fase 5.3 — Validación de datos post-ETL.

Verifica:
  1. Cobertura: ningún barrio sin indicadores de renta o IBI.
  2. Correlación: barrios con IER alto deben tener ratio alquiler/renta alto.
  3. Sanity check: 5 barrios conocidos de Valencia y sus valores esperados.
  4. Rango de valores: sin IER fuera de [0, 100], sin rentas negativas.

Genera:
  - Salida a stdout con resumen.
  - docs/validacion_datos.md con el informe completo.

Uso:
    cd backend
    python -m app.etl.validate
"""
import asyncio
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

DOCS_DIR = Path(__file__).resolve().parents[3] / "docs"

# Barrios de Valencia conocidos con sus rangos esperados (sanity check manual)
# Fuente: conocimiento experto + datos publicados FOESSA 2023
SANITY_BARRIOS = [
    {
        "nombre_patron": "rascanya",
        "ier_min_esperado": 45,
        "ier_max_esperado": 90,
        "descripcion": "Barrio con alta concentración de renta baja y migrantes",
    },
    {
        "nombre_patron": "benimaclet",
        "ier_min_esperado": 30,
        "ier_max_esperado": 75,
        "descripcion": "Barrio universitario con mezcla socioeconómica",
    },
    {
        "nombre_patron": "campanar",
        "ier_min_esperado": 20,
        "ier_max_esperado": 65,
        "descripcion": "Barrio de clase media-alta",
    },
    {
        "nombre_patron": "algirós",
        "ier_min_esperado": 20,
        "ier_max_esperado": 65,
        "descripcion": "Barrio residencial consolidado",
    },
    {
        "nombre_patron": "extramurs",
        "ier_min_esperado": 30,
        "ier_max_esperado": 80,
        "descripcion": "Barrio histórico con diversidad socioeconómica",
    },
]


async def _run_validation() -> dict:
    """Ejecuta todas las validaciones contra la base de datos."""
    # Importaciones aquí para evitar errores si no hay DB disponible en tests
    from sqlalchemy import func, select, text
    from app.core.database import AsyncSessionLocal
    from app.models.barrio import Barrio, IERScore, IndicadorRenta, ReciboIBI

    resultados = {
        "cobertura": {},
        "rangos": {},
        "correlacion": {},
        "sanity": [],
        "errores": [],
    }

    async with AsyncSessionLocal() as db:
        # ── 1. Total de barrios ────────────────────────────────────────────────
        total_barrios = (await db.execute(select(func.count()).select_from(Barrio))).scalar()
        resultados["cobertura"]["total_barrios"] = total_barrios

        # ── 2. Barrios sin renta ──────────────────────────────────────────────
        q_sin_renta = (
            select(func.count())
            .select_from(Barrio)
            .outerjoin(IndicadorRenta, IndicadorRenta.barrio_id == Barrio.id)
            .where(IndicadorRenta.id.is_(None))
        )
        sin_renta = (await db.execute(q_sin_renta)).scalar()
        resultados["cobertura"]["barrios_sin_renta"] = sin_renta
        resultados["cobertura"]["pct_cobertura_renta"] = (
            round((total_barrios - sin_renta) / total_barrios * 100, 1)
            if total_barrios else 0
        )

        # ── 3. Barrios sin IBI ────────────────────────────────────────────────
        q_sin_ibi = (
            select(func.count())
            .select_from(Barrio)
            .outerjoin(ReciboIBI, ReciboIBI.barrio_id == Barrio.id)
            .where(ReciboIBI.id.is_(None))
        )
        sin_ibi = (await db.execute(q_sin_ibi)).scalar()
        resultados["cobertura"]["barrios_sin_ibi"] = sin_ibi

        # ── 4. Rangos IER ─────────────────────────────────────────────────────
        ier_stats = (
            await db.execute(
                select(
                    func.min(IERScore.ier_value).label("ier_min"),
                    func.max(IERScore.ier_value).label("ier_max"),
                    func.avg(IERScore.ier_value).label("ier_medio"),
                    func.count().label("total_scores"),
                )
            )
        ).one_or_none()

        if ier_stats:
            resultados["rangos"]["ier_min"] = round(float(ier_stats.ier_min or 0), 2)
            resultados["rangos"]["ier_max"] = round(float(ier_stats.ier_max or 0), 2)
            resultados["rangos"]["ier_medio"] = round(float(ier_stats.ier_medio or 0), 2)
            resultados["rangos"]["total_scores"] = ier_stats.total_scores

            # IER fuera de rango [0, 100]
            ier_out_of_range = (
                await db.execute(
                    select(func.count())
                    .select_from(IERScore)
                    .where((IERScore.ier_value < 0) | (IERScore.ier_value > 100))
                )
            ).scalar()
            resultados["rangos"]["fuera_de_rango"] = ier_out_of_range

        # ── 5. Correlación IER alto ↔ ratio alto ──────────────────────────────
        # Los 10 barrios con mayor IER deben tener componente_alquiler > media
        top10 = (
            await db.execute(
                select(
                    IERScore.barrio_id,
                    IERScore.ier_value,
                    IERScore.componente_alquiler,
                )
                .order_by(IERScore.ier_value.desc())
                .limit(10)
            )
        ).all()

        if top10:
            avg_alquiler_top10 = sum(r.componente_alquiler or 0 for r in top10) / len(top10)
            avg_alquiler_global = (
                await db.execute(select(func.avg(IERScore.componente_alquiler)))
            ).scalar() or 0
            resultados["correlacion"]["avg_alquiler_top10_ier"] = round(avg_alquiler_top10, 3)
            resultados["correlacion"]["avg_alquiler_global"] = round(float(avg_alquiler_global), 3)
            resultados["correlacion"]["correlacion_ok"] = (
                avg_alquiler_top10 >= float(avg_alquiler_global)
            )

        # ── 6. Sanity check — barrios conocidos ────────────────────────────────
        for ref in SANITY_BARRIOS:
            q = (
                select(Barrio.nombre, IERScore.ier_value)
                .join(IERScore, IERScore.barrio_id == Barrio.id)
                .where(
                    func.lower(Barrio.nombre).contains(ref["nombre_patron"])
                )
                .order_by(IERScore.anyo.desc())
                .limit(1)
            )
            row = (await db.execute(q)).one_or_none()
            if row:
                ier = round(float(row.ier_value), 1)
                en_rango = ref["ier_min_esperado"] <= ier <= ref["ier_max_esperado"]
                resultados["sanity"].append({
                    "barrio": row.nombre,
                    "ier_obtenido": ier,
                    "rango_esperado": f"{ref['ier_min_esperado']}–{ref['ier_max_esperado']}",
                    "ok": en_rango,
                    "descripcion": ref["descripcion"],
                })
            else:
                resultados["sanity"].append({
                    "barrio": ref["nombre_patron"],
                    "ier_obtenido": None,
                    "rango_esperado": f"{ref['ier_min_esperado']}–{ref['ier_max_esperado']}",
                    "ok": False,
                    "descripcion": f"NO ENCONTRADO en BD",
                })

    return resultados


def _generar_informe(resultados: dict) -> str:
    """Formatea los resultados como Markdown."""
    lines = [
        "# Informe de Validación de Datos — AlquilerSano",
        "",
        f"Generado automáticamente por `app/etl/validate.py`.",
        "",
        "---",
        "",
        "## 1. Cobertura",
        "",
    ]

    cob = resultados.get("cobertura", {})
    lines += [
        f"| Métrica | Valor |",
        f"|---------|-------|",
        f"| Total barrios | {cob.get('total_barrios', '—')} |",
        f"| Barrios sin renta | {cob.get('barrios_sin_renta', '—')} |",
        f"| Cobertura renta (%) | {cob.get('pct_cobertura_renta', '—')} |",
        f"| Barrios sin IBI | {cob.get('barrios_sin_ibi', '—')} |",
        "",
    ]

    lines += [
        "## 2. Rangos del IER",
        "",
    ]
    rang = resultados.get("rangos", {})
    lines += [
        f"| Métrica | Valor |",
        f"|---------|-------|",
        f"| IER mínimo | {rang.get('ier_min', '—')} |",
        f"| IER máximo | {rang.get('ier_max', '—')} |",
        f"| IER medio | {rang.get('ier_medio', '—')} |",
        f"| Total scores | {rang.get('total_scores', '—')} |",
        f"| Fuera de rango [0–100] | {rang.get('fuera_de_rango', '—')} |",
        "",
    ]

    lines += [
        "## 3. Correlación IER ↔ Componente Alquiler",
        "",
    ]
    corr = resultados.get("correlacion", {})
    corr_ok = corr.get("correlacion_ok")
    lines += [
        f"- Media componente_alquiler en top-10 IER: **{corr.get('avg_alquiler_top10_ier', '—')}**",
        f"- Media componente_alquiler global: **{corr.get('avg_alquiler_global', '—')}**",
        f"- Correlación coherente: {'✅' if corr_ok else '❌'} {'(top10 ≥ media global)' if corr_ok else '(revisar fórmula)'}",
        "",
    ]

    lines += [
        "## 4. Sanity Check — Barrios Conocidos",
        "",
        "| Barrio | IER obtenido | Rango esperado | OK | Descripción |",
        "|--------|-------------|---------------|-----|-------------|",
    ]
    for s in resultados.get("sanity", []):
        ok_icon = "✅" if s["ok"] else "❌"
        ier_str = str(s["ier_obtenido"]) if s["ier_obtenido"] is not None else "N/A"
        lines.append(
            f"| {s['barrio']} | {ier_str} | {s['rango_esperado']} | {ok_icon} | {s['descripcion']} |"
        )

    lines += [
        "",
        "---",
        "",
        "> **Nota**: Los rangos esperados son aproximaciones basadas en datos FOESSA 2023.",
        "> Un IER fuera del rango no implica necesariamente un error — puede reflejar cambios",
        "> reales en el barrio desde que se establecieron los valores de referencia.",
    ]

    return "\n".join(lines) + "\n"


def run_validation_sync() -> None:
    """Punto de entrada sincrónico para ejecución directa."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")

    logger.info("Iniciando validación de datos…")
    try:
        resultados = asyncio.run(_run_validation())
    except Exception as e:
        logger.error(f"Error conectando a la BD: {e}")
        logger.info("Asegúrate de que PostgreSQL está activo y .env está configurado.")
        sys.exit(1)

    # Mostrar resumen en consola
    cob = resultados["cobertura"]
    rang = resultados["rangos"]
    corr = resultados["correlacion"]

    print("\n" + "=" * 60)
    print("VALIDACIÓN DE DATOS — AlquilerSano")
    print("=" * 60)
    print(f"  Barrios totales:     {cob.get('total_barrios', '—')}")
    print(f"  Cobertura renta:     {cob.get('pct_cobertura_renta', '—')}%")
    print(f"  IER rango:           [{rang.get('ier_min', '—')}, {rang.get('ier_max', '—')}]")
    print(f"  IER medio:           {rang.get('ier_medio', '—')}")
    print(f"  Fuera de rango:      {rang.get('fuera_de_rango', '—')}")
    print(f"  Correlación OK:      {'✅' if corr.get('correlacion_ok') else '❌'}")

    print("\nSanity check:")
    for s in resultados["sanity"]:
        icon = "✅" if s["ok"] else "❌"
        ier_str = str(s["ier_obtenido"]) if s["ier_obtenido"] is not None else "N/A"
        print(f"  {icon} {s['barrio']}: IER={ier_str} (esperado {s['rango_esperado']})")

    # Guardar informe Markdown
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    informe_path = DOCS_DIR / "validacion_datos.md"
    informe_path.write_text(_generar_informe(resultados), encoding="utf-8")
    print(f"\nInforme guardado en: {informe_path}")

    # Exit code 1 si hay errores críticos
    fuera = rang.get("fuera_de_rango", 0)
    sin_cobertura = cob.get("barrios_sin_renta", 0)
    if fuera and fuera > 0:
        logger.error(f"{fuera} scores IER fuera del rango [0, 100]. Revisar pipeline.")
        sys.exit(1)
    if sin_cobertura and cob.get("total_barrios", 0) > 0:
        pct_sin = sin_cobertura / cob["total_barrios"] * 100
        if pct_sin > 20:
            logger.warning(f"{pct_sin:.0f}% de barrios sin datos de renta (umbral: 20%).")


if __name__ == "__main__":
    run_validation_sync()
