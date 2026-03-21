# Datasets — AlquilerSano

Todos los datasets son de acceso público abierto. Licencia mayoritaria: CC BY 4.0.

## Datasets Primarios (Valencia)

### 1. Renta por persona y hogar
- **Portal:** Open Data Valencia
- **URL descarga:** https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/renta-per-persona-i-llar-renta-por-persona-y-hogar/exports/csv
- **Formato:** CSV (`;` separador)
- **Actualización:** Anual
- **Columnas clave:** `codi_barri`, `nom_barri`, `any`, `renda_persona`, `renda_llar`
- **Uso en IER:** Calcula `Ingreso_Hogar` → componente `componente_alquiler`

### 2. Recibos IBI 2020–2025
- **Portal:** Open Data Valencia — Hacienda
- **URL descarga:** https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/recibos-ibi-2020-al-2025/exports/csv
- **Formato:** CSV
- **Actualización:** Anual (serie 2020–2025)
- **Columnas clave:** `any`, `districte`, `barri`, `naturalesa_juridica`, `estat_cobrament`
- **Uso en IER:** Calcula `pct_impagados` y `pct_persona_juridica` → indicador de riesgo desahucio

### 3. Enfermedad Mental (Malaltia Mental)
- **Portal:** Open Data Valencia — Sociedad y Bienestar
- **URL descarga:** https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/malaltia-mental-enfermedad-mental/exports/csv
- **Formato:** CSV
- **Actualización:** Anual
- **Columnas clave:** `barri`, `any`, `nombre_casos`, `tasa_per_1000`
- **Uso en IER:** Componente `componente_salud_mental` (factor protector)

### 4. Migrantes (Migrants)
- **Portal:** Open Data Valencia — Sociedad y Bienestar
- **URL descarga:** https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/migrants-migrantes/exports/csv
- **Formato:** CSV
- **Actualización:** Anual
- **Columnas clave:** `barri`, `any`, `pct_estrangers`, `pct_extracomunitaris`
- **Uso en IER:** Identifica colectivos en vulnerabilidad extrema → `pct_migrantes` en `indicadores_exclusion`

### 5. Pobreza y exclusión social — Madrid (validación cruzada)
- **Portal:** datos.madrid.es
- **URL descarga:** https://datos.madrid.es/egob/catalogo/300166-0-indicadores-exclusion-social.csv
- **Formato:** CSV
- **Uso en IER:** Validación metodológica de indicadores de exclusión a nivel de barrio

## Datasets de Geometría (Barrios)

### 6. Secciones Censales Valencia — GeoJSON
- **Portal:** INE / CartoCiudad
- **URL descarga:** https://www.ine.es/ss/Satellite?L=es_ES&c=Page&cid=1259952026632&p=1259952026632&pagename=ProductosYServicios/PYSLayout
- **Alternativa directa:** https://cartociudad.es/geocoder/api/geocoder/secciones-censales (API REST)
- **Formato:** GeoJSON / SHP
- **CRS:** EPSG:4258 → transformar a EPSG:4326
- **Uso:** Geometrías para tabla `barrios`, índice espacial GiST

## Datasets Secundarios (para Score Calidad de Vida)

### 7. Balances trimestrales de criminalidad
- **Portal:** datos.gob.es — Ministerio del Interior
- **URL:** https://www.interior.gob.es/opencms/es/estadistica/balances-e-informes-de-criminalidad/
- **Formato:** PDF + CSV (publicación trimestral)
- **Uso:** Cruce con IER para `score_calidad_vida`

## Notas de Ingesta

- Los CSV de Open Data Valencia usan codificación **UTF-8** con separador `;`
- Los nombres de barrios están en **bilingüe** (valenciano/castellano, separados por ` / `)
- El código de barrio (`codi_barri`) es un entero de 2 dígitos referenciado al código de distrito
- Para vincular con las secciones censales del INE se necesita la tabla de equivalencias `barri → código INE`
  - Fuente: fichero de equivalencias del Nomenclátor del INE

## Proceso de actualización

Los datasets se actualizan **anualmente** (enero del año siguiente).
El script `backend/app/etl/download.py` descarga la última versión disponible y la almacena en `data/raw/` con timestamp en el nombre para mantener histórico.
