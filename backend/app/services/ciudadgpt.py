"""
Fase 7: Adaptador para integración con CiudadGPT (#17 del ecosistema).

CiudadGPT es la app de análisis urbano con IA del mismo ecosistema de datos abiertos.
Esta integración permite:
  - Enriquecer los barrios con contexto narrativo generado por IA
  - Consultar tendencias históricas interpretadas en lenguaje natural
  - Recibir alertas tempranas de deterioro basadas en patrones ML

Estado: STUB — pendiente de que CiudadGPT tenga API pública disponible.
Ver: plan_apps_unificado_2026.docx, App #17.

Uso (futuro):
    from app.services.ciudadgpt import CiudadGPTClient

    client = CiudadGPTClient(api_key=settings.ciudadgpt_api_key)
    contexto = await client.get_barrio_context(barrio_nombre="Rascanya", ciudad="valencia")
    # → "Rascanya es un barrio del norte de Valencia con alta concentración de
    #    población migrante y renta media por debajo de la media de la ciudad..."
"""
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class BarrioContext:
    """Contexto narrativo de un barrio generado por CiudadGPT."""
    barrio: str
    ciudad: str
    resumen: str
    tendencia: str          # "mejorando" | "estable" | "deteriorando"
    factores_clave: list[str] = field(default_factory=list)
    fuente: str = "ciudadgpt"


class CiudadGPTClient:
    """
    Cliente HTTP para la API de CiudadGPT.

    TODO: Implementar cuando CiudadGPT tenga endpoint disponible.
    Por ahora devuelve datos stub para que el resto de la app pueda integrarse.
    """

    BASE_URL = "https://api.ciudadgpt.es/v1"  # URL futura (aún no disponible)

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self._available = False  # cambiar a True cuando la API esté activa

    async def get_barrio_context(
        self,
        barrio_nombre: str,
        ciudad: str = "valencia",
        anyo: int = 2024,
    ) -> BarrioContext:
        """
        Obtiene contexto narrativo de un barrio desde CiudadGPT.
        Actualmente devuelve un stub; se conectará a la API real en fase 7+.
        """
        if not self._available:
            logger.debug(
                f"CiudadGPT no disponible — devolviendo stub para {barrio_nombre}"
            )
            return self._stub_context(barrio_nombre, ciudad)

        # TODO: implementar llamada HTTP real
        # async with aiohttp.ClientSession() as session:
        #     resp = await session.get(
        #         f"{self.BASE_URL}/barrio/{ciudad}/{barrio_nombre}",
        #         headers={"Authorization": f"Bearer {self.api_key}"},
        #         params={"anyo": anyo},
        #     )
        #     data = await resp.json()
        #     return BarrioContext(**data)
        raise NotImplementedError("CiudadGPT API aún no disponible")

    async def get_alertas_tempranas(
        self,
        ciudad: str = "valencia",
        umbral_deterioro: float = 10.0,
    ) -> list[dict]:
        """
        Obtiene predicciones de deterioro habitacional para los próximos 6 meses.
        Basado en series temporales + modelos LLM de CiudadGPT.
        """
        if not self._available:
            logger.debug("CiudadGPT no disponible — devolviendo alertas stub")
            return []

        # TODO: implementar cuando API esté lista
        raise NotImplementedError("CiudadGPT API aún no disponible")

    @staticmethod
    def _stub_context(barrio: str, ciudad: str) -> BarrioContext:
        """Devuelve contexto genérico cuando CiudadGPT no está disponible."""
        return BarrioContext(
            barrio=barrio,
            ciudad=ciudad,
            resumen=(
                f"Contexto de {barrio} ({ciudad}) no disponible. "
                "CiudadGPT está en desarrollo — disponible próximamente."
            ),
            tendencia="estable",
            factores_clave=[],
            fuente="stub",
        )


def get_ciudadgpt_client() -> CiudadGPTClient:
    """Devuelve instancia del cliente con la API key de la config."""
    try:
        from app.core.config import settings
        api_key = getattr(settings, "ciudadgpt_api_key", None)
    except Exception:
        api_key = None
    return CiudadGPTClient(api_key=api_key)
