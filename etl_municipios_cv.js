/**
 * etl_municipios_cv.js
 * 
 * Carga municipios de la provincia de Valencia en PostgreSQL (Railway)
 * con datos del ADRH (INE) y geometría del GeoJSON de la GVA.
 * 
 * Prerequisito: haber ejecutado download_all_nacional.js
 * USO: cd G:\Proyectos\alquiler && node etl_municipios_cv.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'data', 'raw', 'nacional');
const DB_URL = 'postgresql://postgres:atNenxVddmELEHVeJyhMNdtDCTXjkfeJ@autorack.proxy.rlwy.net:49895/railway';

// ═══════════════════════════════════════════════
// UTM Zone 30N (EPSG:25830) → WGS84 (EPSG:4326) converter
// The GVA GeoJSON uses UTM coordinates, Leaflet needs lat/lng
// ═══════════════════════════════════════════════
function utmToLatLng(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const ep2 = e2 / (1 - e2);
  const zone = 30;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;

  const x = easting - 500000;
  const y = northing;

  const M = y / k0;
  const mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 = mu + (3*e1/2 - 27*e1*e1*e1/32) * Math.sin(2*mu)
    + (21*e1*e1/16 - 55*e1*e1*e1*e1/32) * Math.sin(4*mu)
    + (151*e1*e1*e1/96) * Math.sin(6*mu);

  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T1 = tanPhi * tanPhi;
  const C1 = ep2 * cosPhi * cosPhi;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi / R1) * (D*D/2 - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*ep2)*D*D*D*D/24
    + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*ep2 - 3*C1*C1)*D*D*D*D*D*D/720);
  const lon = (D - (1 + 2*T1 + C1)*D*D*D/6
    + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ep2 + 24*T1*T1)*D*D*D*D*D/120) / cosPhi;

  return [lonOrigin + lon * 180 / Math.PI, lat * 180 / Math.PI];
}

function convertGeometry(geom) {
  if (!geom) return null;
  function convertCoords(coords) {
    if (typeof coords[0] === 'number') {
      return utmToLatLng(coords[0], coords[1]);
    }
    return coords.map(convertCoords);
  }
  return { type: geom.type, coordinates: convertCoords(geom.coordinates) };
}

function parseCSV(filename) {
  const raw = fs.readFileSync(path.join(DIR, filename), 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(';');
    if (p.length >= 5) {
      rows.push({ codigo: p[0], municipio: p[1], indicador: p[2], anyo: parseInt(p[3]), valor: parseFloat(p[4]) });
    }
  }
  return rows;
}

function pivotByMuniYear(rows, indicadores) {
  // Group by municipio+year, pivot indicators to columns
  const map = {};
  for (const r of rows) {
    if (isNaN(r.valor)) continue;
    const key = r.codigo + '|' + r.anyo;
    if (!map[key]) map[key] = { codigo: r.codigo, municipio: r.municipio, anyo: r.anyo };
    // Normalize indicator name to a key
    for (const [col, pattern] of Object.entries(indicadores)) {
      if (r.indicador.includes(pattern)) { map[key][col] = r.valor; break; }
    }
  }
  return Object.values(map);
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado a Railway PostgreSQL');

  // ═══════════════════════════════════════════════
  // 1. CARGAR MUNICIPIOS CON GEOMETRIA
  // ═══════════════════════════════════════════════
  console.log('\n── 1. Cargando municipios provincia Valencia ──');
  const gj = JSON.parse(fs.readFileSync(path.join(DIR, 'cv_municipios.geojson'), 'utf8'));
  
  // Filter only Valencia province (CODPROV=46)
  const val46Features = gj.features.filter(f => f.properties.CODPROV === '46');
  console.log(`  GeoJSON features prov 46: ${val46Features.length}`);

  const muniMap = {}; // codigo_ine -> db id

  for (const feat of val46Features) {
    const p = feat.properties;
    const codigoIne = p.MUNIINE; // 5-digit INE code like "46110"
    const nombre = p.NOMBRE;
    // Convert UTM (EPSG:25830) to WGS84 (EPSG:4326) for Leaflet
    const geomWgs84 = feat.geometry ? convertGeometry(feat.geometry) : null;
    const geom = geomWgs84 ? JSON.stringify(geomWgs84) : null;

    const r = await client.query(
      `INSERT INTO barrios (codigo_ine, nombre, nombre_val, distrito, distrito_num, ciudad, geometria)
       VALUES ($1, $2, $3, NULL, NULL, $4, $5)
       ON CONFLICT (codigo_ine) DO UPDATE SET nombre=EXCLUDED.nombre, geometria=EXCLUDED.geometria
       RETURNING id`,
      [codigoIne, nombre, nombre, 'valencia_provincia', geom]
    );
    muniMap[codigoIne] = r.rows[0].id;
  }
  console.log(`  Municipios cargados en DB: ${Object.keys(muniMap).length}`);

  // ═══════════════════════════════════════════════
  // 2. CARGAR RENTA (tabla 31250)
  // ═══════════════════════════════════════════════
  console.log('\n── 2. Cargando renta media (ADRH 31250) ──');
  const rentaRows = parseCSV('ine_31250_valencia.csv');
  const rentaPivot = pivotByMuniYear(rentaRows, {
    renta_neta_persona: 'Renta neta media por persona',
    renta_neta_hogar: 'Renta neta media por hogar',
    renta_uc_media: 'Media de la renta por unidad de consumo',
    renta_uc_mediana: 'Mediana de la renta por unidad de consumo',
  });
  
  let rentaOk = 0;
  for (const r of rentaPivot) {
    const bid = muniMap[r.codigo];
    if (!bid) continue;
    // Store renta in indicadores_renta table
    await client.query(
      `INSERT INTO indicadores_renta (barrio_id, anyo, renta_media_hogar, coste_alquiler_medio)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (barrio_id, anyo) DO UPDATE SET renta_media_hogar=EXCLUDED.renta_media_hogar`,
      [bid, r.anyo, r.renta_neta_hogar || null]
    );
    rentaOk++;
  }
  console.log(`  Registros renta cargados: ${rentaOk}`);

  // ═══════════════════════════════════════════════
  // 3. CARGAR POBREZA (tabla 31255 - umbrales relativos)
  // ═══════════════════════════════════════════════
  console.log('\n── 3. Cargando pobreza relativa (ADRH 31255) ──');
  const pobRows = parseCSV('ine_31255_valencia.csv');
  const pobPivot = pivotByMuniYear(pobRows, {
    pob_bajo_60mediana: '60% de la mediana',
    pob_sobre_200mediana: '200% de la mediana',
  });
  
  let pobOk = 0;
  for (const r of pobPivot) {
    const bid = muniMap[r.codigo];
    if (!bid) continue;
    // Store poverty rate (% below 60% median = at-risk-of-poverty rate)
    const tasaPobreza = r.pob_bajo_60mediana || null;
    await client.query(
      `INSERT INTO indicadores_exclusion (barrio_id, anyo, pct_migrantes, tasa_pobreza, precariedad_laboral, pct_desempleo)
       VALUES ($1, $2, NULL, $3, NULL, NULL)
       ON CONFLICT (barrio_id, anyo) DO UPDATE SET tasa_pobreza=EXCLUDED.tasa_pobreza`,
      [bid, r.anyo, tasaPobreza]
    );
    pobOk++;
  }
  console.log(`  Registros pobreza cargados: ${pobOk}`);

  // ═══════════════════════════════════════════════
  // 4. CARGAR GINI (tabla 37721)
  // ═══════════════════════════════════════════════
  console.log('\n── 4. Cargando Gini (ADRH 37721) ──');
  const giniRows = parseCSV('ine_37721_valencia.csv');
  const giniPivot = pivotByMuniYear(giniRows, {
    gini: 'Gini',
    p80_p20: 'P80/P20',
  });
  
  // Store Gini as precariedad_laboral (reusing existing column)
  let giniOk = 0;
  for (const r of giniPivot) {
    const bid = muniMap[r.codigo];
    if (!bid || !r.gini) continue;
    await client.query(
      `UPDATE indicadores_exclusion SET precariedad_laboral=$1
       WHERE barrio_id=$2 AND anyo=$3`,
      [r.gini, bid, r.anyo]
    );
    giniOk++;
  }
  console.log(`  Registros Gini actualizados: ${giniOk}`);

  // ═══════════════════════════════════════════════
  // 5. CALCULAR IER MUNICIPAL
  // ═══════════════════════════════════════════════
  console.log('\n── 5. Calculando IER municipal ──');
  
  const dataRes = await client.query(`
    SELECT b.id barrio_id, b.nombre, b.codigo_ine,
      r.anyo, r.renta_media_hogar,
      e.tasa_pobreza, e.precariedad_laboral
    FROM barrios b
    LEFT JOIN indicadores_renta r ON r.barrio_id = b.id
    LEFT JOIN indicadores_exclusion e ON e.barrio_id = b.id AND e.anyo = r.anyo
    WHERE b.ciudad = 'valencia_provincia'
    AND r.anyo IS NOT NULL
    ORDER BY b.id, r.anyo
  `);
  console.log(`  Filas para IER: ${dataRes.rows.length}`);

  // Normalize using percentile ranks for better distribution
  const rows = dataRes.rows;
  
  // Helper: compute percentile rank (0-1) within a set of values
  function percentileRank(value, allValues) {
    if (!value || allValues.length === 0) return null;
    const sorted = [...allValues].sort((a, b) => a - b);
    const idx = sorted.findIndex(v => v >= value);
    return idx >= 0 ? idx / (sorted.length - 1) : 1;
  }

  // Group values by year for year-relative percentiles
  const byYear = {};
  for (const r of rows) {
    if (!byYear[r.anyo]) byYear[r.anyo] = { rentas: [], pobrezas: [], ginis: [] };
    const renta = parseFloat(r.renta_media_hogar) || 0;
    const pob = parseFloat(r.tasa_pobreza) || 0;
    const gini = parseFloat(r.precariedad_laboral) || 0;
    if (renta > 0) byYear[r.anyo].rentas.push(renta);
    if (pob > 0) byYear[r.anyo].pobrezas.push(pob);
    if (gini > 0) byYear[r.anyo].ginis.push(gini);
  }
  
  console.log(`  Años con datos:`, Object.keys(byYear).sort().join(', '));

  let ierOk = 0;
  for (const row of rows) {
    const renta = parseFloat(row.renta_media_hogar) || 0;
    const pobreza = parseFloat(row.tasa_pobreza) || 0;
    const gini = parseFloat(row.precariedad_laboral) || 0;
    const yr = byYear[row.anyo];

    // compAlquiler (0-40): inverse percentile of renta (lower renta = higher stress)
    // Percentile 0 (poorest) → 40, Percentile 1 (richest) → 0
    const rentaPct = renta > 0 ? percentileRank(renta, yr.rentas) : 0.5;
    const compAlquiler = (1 - rentaPct) * 40;
    
    // compPrecariedad (0-35): percentile of poverty rate (higher = more stress)
    const pobPct = pobreza > 0 ? percentileRank(pobreza, yr.pobrezas) : null;
    const compPrec = pobPct !== null ? pobPct * 35 : 0;
    
    // compSocial (0-25): percentile of Gini (higher inequality = more stress)
    const giniPct = gini > 0 ? percentileRank(gini, yr.ginis) : null;
    const compSocial = giniPct !== null ? giniPct * 25 : 0;

    const ier = Math.round((compAlquiler + compPrec + compSocial) * 10) / 10;
    const riesgo = ier >= 75 ? 'CRÍTICO' : ier >= 50 ? 'ALTO' : ier >= 25 ? 'MEDIO' : 'BAJO';

    await client.query(
      `INSERT INTO ier_scores (barrio_id, anyo, ier_value, componente_alquiler, componente_precariedad, componente_salud_mental, score_calidad_vida, riesgo_desahucio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (barrio_id, anyo) DO UPDATE SET
         ier_value=EXCLUDED.ier_value, componente_alquiler=EXCLUDED.componente_alquiler,
         componente_precariedad=EXCLUDED.componente_precariedad, componente_salud_mental=EXCLUDED.componente_salud_mental,
         riesgo_desahucio=EXCLUDED.riesgo_desahucio`,
      [row.barrio_id, row.anyo, ier,
       Math.round(compAlquiler*10)/10, Math.round(compPrec*10)/10, Math.round(compSocial*10)/10,
       ier, riesgo]
    );
    ierOk++;
  }
  console.log(`  IER scores calculados: ${ierOk}`);

  // ═══════════════════════════════════════════════
  // 6. RESUMEN
  // ═══════════════════════════════════════════════
  const final = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM barrios WHERE ciudad='valencia_provincia') AS munis,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_total,
      (SELECT COUNT(DISTINCT barrio_id) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_munis,
      (SELECT ROUND(AVG(ier_value)::numeric,1) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_medio,
      (SELECT ROUND(MIN(ier_value)::numeric,1) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_min,
      (SELECT ROUND(MAX(ier_value)::numeric,1) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_max,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND riesgo_desahucio='BAJO') AS bajo,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND riesgo_desahucio='MEDIO') AS medio,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND riesgo_desahucio='ALTO') AS alto,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND riesgo_desahucio='CRÍTICO') AS critico
  `);
  const f = final.rows[0];

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     RESULTADO: MUNICIPIOS PROV. VALENCIA       ║');
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║ Municipios en DB:     ${String(f.munis).padStart(5)}`);
  console.log(`║ IER scores totales:   ${String(f.ier_total).padStart(5)} (${f.ier_munis} municipios)`);
  console.log(`║ IER medio: ${f.ier_medio} | min: ${f.ier_min} | max: ${f.ier_max}`);
  console.log(`║ BAJO: ${f.bajo} | MEDIO: ${f.medio} | ALTO: ${f.alto} | CRÍTICO: ${f.critico}`);
  console.log('╚═══════════════════════════════════════════════╝');

  // Show top/bottom 5
  const topBot = await client.query(`
    SELECT b.nombre, b.codigo_ine, s.ier_value, s.riesgo_desahucio, s.anyo
    FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id
    WHERE b.ciudad='valencia_provincia' AND s.anyo=2023
    ORDER BY s.ier_value DESC LIMIT 5
  `);
  console.log('\nTop 5 IER mas alto (2023):');
  topBot.rows.forEach((r,i) => console.log(`  ${i+1}. ${r.nombre} (${r.codigo_ine}): IER=${r.ier_value} [${r.riesgo_desahucio}]`));

  const bottom = await client.query(`
    SELECT b.nombre, b.codigo_ine, s.ier_value, s.riesgo_desahucio
    FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id
    WHERE b.ciudad='valencia_provincia' AND s.anyo=2023
    ORDER BY s.ier_value ASC LIMIT 5
  `);
  console.log('\nTop 5 IER mas bajo (2023):');
  bottom.rows.forEach((r,i) => console.log(`  ${i+1}. ${r.nombre} (${r.codigo_ine}): IER=${r.ier_value} [${r.riesgo_desahucio}]`));

  await client.end();
  console.log('\nConexion cerrada. ETL completado.');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
