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
    const geom = feat.geometry ? JSON.stringify(feat.geometry) : null;

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

  // Normalize values for IER calculation
  const rows = dataRes.rows;
  
  // Find max values for normalization
  const rentaVals = rows.map(r => parseFloat(r.renta_media_hogar) || 0).filter(v => v > 0);
  const pobrezaVals = rows.map(r => parseFloat(r.tasa_pobreza) || 0).filter(v => v > 0);
  const giniVals = rows.map(r => parseFloat(r.precariedad_laboral) || 0).filter(v => v > 0);
  
  const rentaMax = Math.max(...rentaVals, 1);
  const rentaMin = Math.min(...rentaVals.filter(v => v > 0));
  const pobrezaMax = Math.max(...pobrezaVals, 1);
  const giniMax = Math.max(...giniVals, 1);
  
  console.log(`  Renta hogar: min=${rentaMin} max=${rentaMax}`);
  console.log(`  Pobreza (% bajo 60% mediana): max=${pobrezaMax}`);
  console.log(`  Gini: max=${giniMax}`);

  let ierOk = 0;
  for (const row of rows) {
    const renta = parseFloat(row.renta_media_hogar) || 0;
    const pobreza = parseFloat(row.tasa_pobreza) || 0;
    const gini = parseFloat(row.precariedad_laboral) || 0;

    // IER Municipal:
    // compAlquiler (0-50): inverse of renta (lower renta = higher stress)
    // Higher renta = lower stress, so we invert: (1 - renta/max) * 50
    const compAlquiler = renta > 0 ? (1 - (renta - rentaMin) / (rentaMax - rentaMin)) * 50 : 25;
    
    // compPrecariedad (0-25): poverty rate normalized
    const compPrec = pobreza > 0 ? (pobreza / pobrezaMax) * 25 : 0;
    
    // compSocial (0-25): Gini normalized (higher Gini = more inequality = more stress)
    const compSocial = gini > 0 ? (gini / giniMax) * 25 : 0;

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
