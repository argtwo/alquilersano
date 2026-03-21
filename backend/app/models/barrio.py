from geoalchemy2 import Geometry
from sqlalchemy import Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Barrio(Base):
    __tablename__ = "barrios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Código INE de sección censal (ej. "4625001001")
    codigo_ine: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    nombre_val: Mapped[str | None] = mapped_column(String(100))  # Nombre en valenciano
    distrito: Mapped[str | None] = mapped_column(String(100))
    distrito_num: Mapped[int | None] = mapped_column(Integer)
    # Ciudad: "valencia" | "madrid" | "barcelona"
    ciudad: Mapped[str] = mapped_column(String(50), nullable=False, server_default="valencia")
    # Polígono del barrio en EPSG:4326
    geometria: Mapped[object | None] = mapped_column(Geometry("MULTIPOLYGON", srid=4326))


class IndicadorRenta(Base):
    __tablename__ = "indicadores_renta"
    __table_args__ = (UniqueConstraint("barrio_id", "anyo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barrio_id: Mapped[int] = mapped_column(Integer, nullable=False)
    anyo: Mapped[int] = mapped_column(Integer, nullable=False)
    renta_media_hogar: Mapped[float | None] = mapped_column(Float)   # €/año
    renta_media_persona: Mapped[float | None] = mapped_column(Float) # €/año
    coste_alquiler_medio: Mapped[float | None] = mapped_column(Float) # €/mes


class IndicadorSaludMental(Base):
    __tablename__ = "indicadores_salud_mental"
    __table_args__ = (UniqueConstraint("barrio_id", "anyo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barrio_id: Mapped[int] = mapped_column(Integer, nullable=False)
    anyo: Mapped[int] = mapped_column(Integer, nullable=False)
    # Número de casos de enfermedad mental registrados
    casos_totales: Mapped[int | None] = mapped_column(Integer)
    # Tasa por 1000 habitantes
    tasa_por_1000: Mapped[float | None] = mapped_column(Float)
    # Número de recursos de salud mental accesibles (centros, consultas)
    recursos_disponibles: Mapped[int | None] = mapped_column(Integer)


class IndicadorExclusion(Base):
    __tablename__ = "indicadores_exclusion"
    __table_args__ = (UniqueConstraint("barrio_id", "anyo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barrio_id: Mapped[int] = mapped_column(Integer, nullable=False)
    anyo: Mapped[int] = mapped_column(Integer, nullable=False)
    tasa_pobreza: Mapped[float | None] = mapped_column(Float)         # %
    pct_migrantes: Mapped[float | None] = mapped_column(Float)        # %
    precariedad_laboral: Mapped[float | None] = mapped_column(Float)  # índice 0-1
    pct_desempleo: Mapped[float | None] = mapped_column(Float)        # %


class ReciboIBI(Base):
    __tablename__ = "recibos_ibi"
    __table_args__ = (UniqueConstraint("barrio_id", "anyo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barrio_id: Mapped[int] = mapped_column(Integer, nullable=False)
    anyo: Mapped[int] = mapped_column(Integer, nullable=False)
    total_recibos: Mapped[int | None] = mapped_column(Integer)
    recibos_impagados: Mapped[int | None] = mapped_column(Integer)
    pct_impagados: Mapped[float | None] = mapped_column(Float)
    # % de recibos cuyo titular es persona jurídica (gran tenedor)
    pct_persona_juridica: Mapped[float | None] = mapped_column(Float)


class IERScore(Base):
    __tablename__ = "ier_scores"
    __table_args__ = (UniqueConstraint("barrio_id", "anyo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barrio_id: Mapped[int] = mapped_column(Integer, nullable=False)
    anyo: Mapped[int] = mapped_column(Integer, nullable=False)
    # Índice de Estrés Residencial (0-100)
    ier_value: Mapped[float | None] = mapped_column(Float)
    # Componentes desglosados
    componente_alquiler: Mapped[float | None] = mapped_column(Float)
    componente_precariedad: Mapped[float | None] = mapped_column(Float)
    componente_salud_mental: Mapped[float | None] = mapped_column(Float)
    # Score compuesto con criminalidad
    score_calidad_vida: Mapped[float | None] = mapped_column(Float)
    # BAJO / MEDIO / ALTO / CRÍTICO
    riesgo_desahucio: Mapped[str | None] = mapped_column(String(10))
