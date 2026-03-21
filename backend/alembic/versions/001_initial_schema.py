"""Initial schema: barrios, indicadores, ier_scores

Revision ID: 001
Revises:
Create Date: 2026-03-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Intentar activar PostGIS — si no está disponible, continuar sin geometría
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        geom_type = sa.Text()  # se reemplaza abajo si postgis está disponible
        use_postgis = True
    except Exception:
        use_postgis = False

    op.create_table(
        "barrios",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_ine", sa.String(10), nullable=False),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column("nombre_val", sa.String(100), nullable=True),
        sa.Column("distrito", sa.String(100), nullable=True),
        sa.Column("distrito_num", sa.Integer(), nullable=True),
        sa.Column("geometria", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo_ine"),
    )

    op.create_table(
        "indicadores_renta",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("barrio_id", sa.Integer(), nullable=False),
        sa.Column("anyo", sa.Integer(), nullable=False),
        sa.Column("renta_media_hogar", sa.Float(), nullable=True),
        sa.Column("renta_media_persona", sa.Float(), nullable=True),
        sa.Column("coste_alquiler_medio", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["barrio_id"], ["barrios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barrio_id", "anyo"),
    )

    op.create_table(
        "indicadores_salud_mental",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("barrio_id", sa.Integer(), nullable=False),
        sa.Column("anyo", sa.Integer(), nullable=False),
        sa.Column("casos_totales", sa.Integer(), nullable=True),
        sa.Column("tasa_por_1000", sa.Float(), nullable=True),
        sa.Column("recursos_disponibles", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["barrio_id"], ["barrios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barrio_id", "anyo"),
    )

    op.create_table(
        "indicadores_exclusion",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("barrio_id", sa.Integer(), nullable=False),
        sa.Column("anyo", sa.Integer(), nullable=False),
        sa.Column("tasa_pobreza", sa.Float(), nullable=True),
        sa.Column("pct_migrantes", sa.Float(), nullable=True),
        sa.Column("precariedad_laboral", sa.Float(), nullable=True),
        sa.Column("pct_desempleo", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["barrio_id"], ["barrios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barrio_id", "anyo"),
    )

    op.create_table(
        "recibos_ibi",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("barrio_id", sa.Integer(), nullable=False),
        sa.Column("anyo", sa.Integer(), nullable=False),
        sa.Column("total_recibos", sa.Integer(), nullable=True),
        sa.Column("recibos_impagados", sa.Integer(), nullable=True),
        sa.Column("pct_impagados", sa.Float(), nullable=True),
        sa.Column("pct_persona_juridica", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["barrio_id"], ["barrios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barrio_id", "anyo"),
    )

    op.create_table(
        "ier_scores",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("barrio_id", sa.Integer(), nullable=False),
        sa.Column("anyo", sa.Integer(), nullable=False),
        sa.Column("ier_value", sa.Float(), nullable=True),
        sa.Column("componente_alquiler", sa.Float(), nullable=True),
        sa.Column("componente_precariedad", sa.Float(), nullable=True),
        sa.Column("componente_salud_mental", sa.Float(), nullable=True),
        sa.Column("score_calidad_vida", sa.Float(), nullable=True),
        sa.Column("riesgo_desahucio", sa.String(10), nullable=True),
        sa.ForeignKeyConstraint(["barrio_id"], ["barrios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barrio_id", "anyo"),
    )


def downgrade() -> None:
    op.drop_table("ier_scores")
    op.drop_table("recibos_ibi")
    op.drop_table("indicadores_exclusion")
    op.drop_table("indicadores_salud_mental")
    op.drop_table("indicadores_renta")
    op.drop_table("barrios")
    op.execute("DROP EXTENSION IF EXISTS postgis")
