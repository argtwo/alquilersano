"""
Fase 7: Modelo ML para predicción de riesgo de desahucio.

Reemplaza las reglas heurísticas de _clasificar_riesgo() con un RandomForestClassifier
entrenado en perfiles FOESSA 2025. El modelo usa las mismas features del IERCalculator
más los componentes raw, lo que le permite capturar interacciones no lineales.

Uso:
    predictor = EvictionRiskPredictor()
    predictor.train()           # entrena sobre perfiles sintéticos FOESSA
    riesgo = predictor.predict(ier_value=72.5, componente_alquiler=0.8,
                                componente_precariedad=0.6, pct_ibi_impagados=18.0)
    # → "CRÍTICO"

    predictor.save("models/eviction_risk.pkl")
    predictor2 = EvictionRiskPredictor.load("models/eviction_risk.pkl")
"""
import logging
import pickle
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

RiesgoLabel = Literal["BAJO", "MEDIO", "ALTO", "CRÍTICO"]

# Directorio donde se persiste el modelo entrenado
MODELS_DIR = Path(__file__).resolve().parents[2] / "models"

# ── Perfiles de entrenamiento (calibrados con FOESSA 2025) ─────────────────────
# Cada perfil: [ier_value, comp_alquiler, comp_precariedad, comp_salud, pct_ibi] → label
_TRAINING_PROFILES = [
    # CRÍTICO — exclusión severa
    [85.0, 0.92, 0.88, 0.70, 22.0, "CRÍTICO"],
    [78.0, 0.85, 0.80, 0.65, 18.0, "CRÍTICO"],
    [82.0, 0.90, 0.75, 0.60, 20.0, "CRÍTICO"],
    [75.0, 0.80, 0.85, 0.72, 16.0, "CRÍTICO"],
    [88.0, 0.95, 0.90, 0.80, 25.0, "CRÍTICO"],
    [72.0, 0.78, 0.82, 0.68, 15.5, "CRÍTICO"],

    # ALTO — precariedad alta sin impagados críticos
    [74.0, 0.82, 0.75, 0.55, 8.0,  "ALTO"],
    [71.0, 0.75, 0.80, 0.60, 9.0,  "ALTO"],
    [76.0, 0.80, 0.70, 0.50, 10.0, "ALTO"],
    [73.0, 0.78, 0.72, 0.58, 7.0,  "ALTO"],
    [70.0, 0.72, 0.75, 0.62, 11.0, "ALTO"],
    [79.0, 0.83, 0.68, 0.45, 6.0,  "ALTO"],

    # MEDIO — clase trabajadora con estrés moderado
    [55.0, 0.60, 0.55, 0.40, 4.0,  "MEDIO"],
    [48.0, 0.55, 0.50, 0.38, 3.5,  "MEDIO"],
    [62.0, 0.65, 0.58, 0.45, 5.0,  "MEDIO"],
    [50.0, 0.52, 0.60, 0.42, 4.5,  "MEDIO"],
    [58.0, 0.62, 0.52, 0.35, 3.0,  "MEDIO"],
    [65.0, 0.68, 0.56, 0.48, 6.0,  "MEDIO"],

    # BAJO — barrios acomodados o bajo estrés
    [20.0, 0.20, 0.18, 0.20, 1.0,  "BAJO"],
    [30.0, 0.30, 0.25, 0.25, 1.5,  "BAJO"],
    [15.0, 0.15, 0.12, 0.15, 0.5,  "BAJO"],
    [38.0, 0.38, 0.32, 0.30, 2.0,  "BAJO"],
    [25.0, 0.25, 0.22, 0.22, 1.2,  "BAJO"],
    [10.0, 0.10, 0.08, 0.10, 0.3,  "BAJO"],
]

FEATURE_NAMES = [
    "ier_value",
    "componente_alquiler",
    "componente_precariedad",
    "componente_salud_mental",
    "pct_ibi_impagados",
]


class EvictionRiskPredictor:
    """
    Clasificador RandomForest para predecir el nivel de riesgo de desahucio.

    Sirve como reemplazo del sistema heurístico basado en umbrales fijos.
    Se puede re-entrenar cuando haya datos reales etiquetados.
    """

    def __init__(self):
        self._model = None
        self._trained = False

    def train(self, extra_profiles: list | None = None) -> "EvictionRiskPredictor":
        """
        Entrena el modelo sobre los perfiles FOESSA + perfiles adicionales opcionales.

        extra_profiles: lista de [ier, comp_alquiler, comp_precariedad, comp_salud,
                                   pct_ibi, label] para enriquecer el entrenamiento.
        """
        try:
            from sklearn.ensemble import RandomForestClassifier
            from sklearn.preprocessing import LabelEncoder
        except ImportError:
            logger.warning(
                "scikit-learn no instalado. Usando clasificador heurístico de fallback. "
                "Instalar con: pip install scikit-learn"
            )
            return self

        profiles = list(_TRAINING_PROFILES)
        if extra_profiles:
            profiles.extend(extra_profiles)

        X = [[p[0], p[1], p[2], p[3], p[4]] for p in profiles]
        y = [p[5] for p in profiles]

        self._model = RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            random_state=42,
            class_weight="balanced",
        )
        self._model.fit(X, y)
        self._trained = True

        logger.info(f"EvictionRiskPredictor entrenado con {len(X)} perfiles.")
        return self

    def predict(
        self,
        ier_value: float,
        componente_alquiler: float,
        componente_precariedad: float,
        componente_salud_mental: float,
        pct_ibi_impagados: float = 0.0,
    ) -> RiesgoLabel:
        """Predice el riesgo de desahucio para un barrio. Fallback heurístico si no hay modelo."""
        if not self._trained or self._model is None:
            return _heuristic_riesgo(ier_value, pct_ibi_impagados)

        X = [[ier_value, componente_alquiler, componente_precariedad,
              componente_salud_mental, pct_ibi_impagados]]
        return self._model.predict(X)[0]

    def predict_proba(
        self,
        ier_value: float,
        componente_alquiler: float,
        componente_precariedad: float,
        componente_salud_mental: float,
        pct_ibi_impagados: float = 0.0,
    ) -> dict[str, float]:
        """Devuelve probabilidades por clase. Solo disponible con modelo entrenado."""
        if not self._trained or self._model is None:
            label = _heuristic_riesgo(ier_value, pct_ibi_impagados)
            return {c: (1.0 if c == label else 0.0) for c in ["BAJO", "MEDIO", "ALTO", "CRÍTICO"]}

        X = [[ier_value, componente_alquiler, componente_precariedad,
              componente_salud_mental, pct_ibi_impagados]]
        proba = self._model.predict_proba(X)[0]
        return dict(zip(self._model.classes_, [round(float(p), 3) for p in proba]))

    def save(self, path: str | Path | None = None) -> Path:
        """Persiste el modelo entrenado en disco."""
        if not self._trained:
            raise RuntimeError("El modelo no está entrenado. Llama a train() primero.")
        dest = Path(path) if path else MODELS_DIR / "eviction_risk.pkl"
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            pickle.dump(self._model, f)
        logger.info(f"Modelo guardado en {dest}")
        return dest

    @classmethod
    def load(cls, path: str | Path | None = None) -> "EvictionRiskPredictor":
        """Carga un modelo previamente entrenado desde disco."""
        src = Path(path) if path else MODELS_DIR / "eviction_risk.pkl"
        if not src.exists():
            logger.warning(f"Modelo no encontrado en {src}. Usando heurístico.")
            return cls()
        predictor = cls()
        with open(src, "rb") as f:
            predictor._model = pickle.load(f)
        predictor._trained = True
        logger.info(f"Modelo cargado desde {src}")
        return predictor


def _heuristic_riesgo(ier: float, pct_ibi: float) -> RiesgoLabel:
    """Fallback heurístico — misma lógica que la Fase 2."""
    if ier >= 70 and pct_ibi >= 15:
        return "CRÍTICO"
    if ier >= 70:
        return "ALTO"
    if ier >= 45:
        return "MEDIO"
    return "BAJO"


# Instancia singleton cargada al importar el módulo (lazy)
_predictor: EvictionRiskPredictor | None = None


def get_predictor() -> EvictionRiskPredictor:
    """
    Devuelve la instancia singleton del predictor.
    Intenta cargar modelo persistido; si no existe, entrena en memoria.
    """
    global _predictor
    if _predictor is None:
        _predictor = EvictionRiskPredictor.load()
        if not _predictor._trained:
            _predictor.train()
    return _predictor
