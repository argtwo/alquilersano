"""Add ciudad column to barrios and extend codigo_ine length.

Revision ID: 002
Revises: 001
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ampliar codigo_ine para admitir códigos de Madrid/Barcelona (hasta 20 chars)
    op.alter_column("barrios", "codigo_ine", type_=sa.String(20))

    # Añadir columna ciudad con valor por defecto "valencia" para los existentes
    op.add_column(
        "barrios",
        sa.Column(
            "ciudad",
            sa.String(50),
            nullable=False,
            server_default="valencia",
        ),
    )

    # Índice para filtrar por ciudad eficientemente
    op.create_index("ix_barrios_ciudad", "barrios", ["ciudad"])


def downgrade() -> None:
    op.drop_index("ix_barrios_ciudad", table_name="barrios")
    op.drop_column("barrios", "ciudad")
    op.alter_column("barrios", "codigo_ine", type_=sa.String(10))
