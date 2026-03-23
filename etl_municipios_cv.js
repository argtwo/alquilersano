/**
 * etl_municipios_cv.js
 * 
 * Carga TODOS los municipios de la Comunidad Valenciana en PostgreSQL:
 *   - Alicante (03): 141 municipios
 *   - Castellón (12): 135 municipios  
 *   - Valencia (46): 264 municipios
 * 
 * Prerequisito: haber ejecutado download_all_nacional.js y download_alicante_castellon.js
 * USO: cd G:\Proyectos\alquiler && node etl_municipios_cv.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'data', 'raw', 'nacional');
const DB_URL = 'postgresql://postgres:atNenxVddmELEHVeJyhMNdtDCTXjkfeJ@autorack.proxy.rlwy.net:49895/railway';

// ── Config por provincia ──
const PROVINCIAS = {
  '03': {
    nombre: 'Alicante',
    csvRenta: 'ine_30833_alicante.csv',
    csvPobreza: 'ine_30838_alicante.csv',
    csvGini: 'ine_37733_alicante.csv',
  },
  '12': {
    nombre: 'Castellon',
    csvRenta: 'ine_30962_castellon.csv',
    csvPobreza: 'ine_30967_castellon.csv',
    csvGini: 'ine_37691_castellon.csv',
  },
  '46': {
    nombre: 'Valencia',
    csvRenta: 'ine_31250_valencia.csv',
    csvPobreza: 'ine_31255_valencia.csv',
    csvGini: 'ine_37721_valencia.csv',
  },
};

// ── UTM Zone 30N → WGS84 converter ──
function utmToLatLng(easting, northing) {
  const a = 6378137.0, f = 1/298.257223563, k0 = 0.9996;
  const e = Math.sqrt(2*f - f*f), e2 = e*e, ep2 = e2/(1-e2);
  const lonOrigin = 29 * 6 - 180 + 3; // zone 30
  const x = easting - 500000, y = northing, M = y/k0;
  const mu = M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256));
  const e1 = (1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const phi1 = mu + (3*e1/2-27*e1*e1*e1/32)*Math.sin(2*mu) + (21*e1*e1/16-55*e1*e1*e1*e1/32)*Math.sin(4*mu) + (151*e1*e1*e1/96)*Math.sin(6*mu);
  const s=Math.sin(phi1),c=Math.cos(phi1),t=Math.tan(phi1);
  const N1=a/Math.sqrt(1-e2*s*s), T1=t*t, C1=ep2*c*c, R1=a*(1-e2)/Math.pow(1-e2*s*s,1.5), D=x/(N1*k0);
  const lat = phi1-(N1*t/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D*D*D*D/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D*D*D*D*D*D/720);
  const lon = (D-(1+2*T1+C1)*D*D*D/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D*D*D*D*D/120)/c;
  return [lonOrigin + lon*180/Math.PI, lat*180/Math.PI];
}
function convertGeometry(geom) {
  if (!geom) return null;
  function conv(coords) {
    if (typeof coords[0] === 'number') return utmToLatLng(coords[0], coords[1]);
    return coords.map(conv);
  }
  return { type: geom.type, coordinates: conv(geom.coordinates) };
}

// ── CSV parser ──
function parseCSV(filename) {
  const fp = path.join(DIR, filename);
  if (!fs.existsSync(fp)) { console.log(`  WARN: ${filename} no existe, saltando`); return []; }
  const raw = fs.readFileSync(fp, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(';');
    if (p.length >= 5) rows.push({ codigo: p[0], municipio: p[1], indicador: p[2], anyo: parseInt(p[3]), valor: parseFloat(p[4]) });
  }
  return rows;
}
function pivotByMuniYear(rows, indicadores) {
  const map = {};
  for (const r of rows) {
    if (isNaN(r.valor)) continue;
    const key = r.codigo + '|' + r.anyo;
    if (!map[key]) map[key] = { codigo: r.codigo, municipio: r.municipio, anyo: r.anyo };
    for (const [col, pattern] of Object.entries(indicadores)) {
      if (r.indicador.includes(pattern)) { map[key][col] = r.valor; break; }
    }
  }
  return Object.values(map);
}

// ── Percentile rank helper ──
function percentileRank(value, allValues) {
  if (!value || allValues.length === 0) return null;
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= value);
  return idx >= 0 ? idx / Math.max(sorted.length - 1, 1) : 1;
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado a Railway PostgreSQL\n');

  // ═══════════════════════════════════════════════
  // 1. CARGAR MUNICIPIOS CON GEOMETRIA (toda la CV)
  // ═══════════════════════════════════════════════
  console.log('── 1. Cargando municipios de toda la CV ──');
  const gj = JSON.parse(fs.readFileSync(path.join(DIR, 'cv_municipios.geojson'), 'utf8'));
  console.log(`  GeoJSON total features: ${gj.features.length}`);

  const muniMap = {}; // codigo_ine -> db id
  let loaded = 0;
  for (const feat of gj.features) {
    const p = feat.properties;
    const codigoIne = p.MUNIINE;
    const codProv = p.CODPROV;
    const nombre = p.NOMBRE;
    // Only load provinces we have data for
    if (!PROVINCIAS[codProv]) continue;
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
    loaded++;
  }
  console.log(`  Municipios cargados: ${loaded} (de ${gj.features.length} en GeoJSON)`);

  // ═══════════════════════════════════════════════
  // 2. CARGAR DATOS POR PROVINCIA
  // ═══════════════════════════════════════════════
  for (const [codProv, prov] of Object.entries(PROVINCIAS)) {
    console.log(`\n── 2. Cargando datos ${prov.nombre} (${codProv}) ──`);

    // 2a. Renta
    const rentaRows = parseCSV(prov.csvRenta);
    const rentaPivot = pivotByMuniYear(rentaRows, {
      renta_neta_hogar: 'Renta neta media por hogar',
      renta_neta_persona: 'Renta neta media por persona',
    });
    let rentaOk = 0;
    for (const r of rentaPivot) {
      const bid = muniMap[r.codigo];
      if (!bid) continue;
      await client.query(
        `INSERT INTO indicadores_renta (barrio_id, anyo, renta_media_hogar, coste_alquiler_medio)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT (barrio_id, anyo) DO UPDATE SET renta_media_hogar=EXCLUDED.renta_media_hogar`,
        [bid, r.anyo, r.renta_neta_hogar || null]
      );
      rentaOk++;
    }
    console.log(`  Renta: ${rentaOk} registros`);

    // 2b. Pobreza
    const pobRows = parseCSV(prov.csvPobreza);
    const pobPivot = pivotByMuniYear(pobRows, { pob_bajo_60mediana: '60% de la mediana' });
    let pobOk = 0;
    for (const r of pobPivot) {
      const bid = muniMap[r.codigo];
      if (!bid) continue;
      await client.query(
        `INSERT INTO indicadores_exclusion (barrio_id, anyo, pct_migrantes, tasa_pobreza, precariedad_laboral, pct_desempleo)
         VALUES ($1, $2, NULL, $3, NULL, NULL)
         ON CONFLICT (barrio_id, anyo) DO UPDATE SET tasa_pobreza=EXCLUDED.tasa_pobreza`,
        [bid, r.anyo, r.pob_bajo_60mediana || null]
      );
      pobOk++;
    }
    console.log(`  Pobreza: ${pobOk} registros`);

    // 2c. Gini
    const giniRows = parseCSV(prov.csvGini);
    const giniPivot = pivotByMuniYear(giniRows, { gini: 'Gini' });
    let giniOk = 0;
    for (const r of giniPivot) {
      const bid = muniMap[r.codigo];
      if (!bid || !r.gini) continue;
      await client.query(
        `UPDATE indicadores_exclusion SET precariedad_laboral=$1 WHERE barrio_id=$2 AND anyo=$3`,
        [r.gini, bid, r.anyo]
      );
      giniOk++;
    }
    console.log(`  Gini: ${giniOk} registros`);
  }

  // ═══════════════════════════════════════════════
  // 3. CALCULAR IER PARA TODA LA CV
  // ═══════════════════════════════════════════════
  console.log('\n── 3. Calculando IER para toda la CV ──');
  const dataRes = await client.query(`
    SELECT b.id barrio_id, b.nombre, b.codigo_ine,
      r.anyo, r.renta_media_hogar,
      e.tasa_pobreza, e.precariedad_laboral
    FROM barrios b
    LEFT JOIN indicadores_renta r ON r.barrio_id = b.id
    LEFT JOIN indicadores_exclusion e ON e.barrio_id = b.id AND e.anyo = r.anyo
    WHERE b.ciudad = 'valencia_provincia' AND r.anyo IS NOT NULL
    ORDER BY b.id, r.anyo
  `);
  const rows = dataRes.rows;
  console.log(`  Filas para IER: ${rows.length}`);

  // Group values by year for percentile calculation
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
  console.log(`  Anyos: ${Object.keys(byYear).sort().join(', ')}`);

  let ierOk = 0;
  for (const row of rows) {
    const renta = parseFloat(row.renta_media_hogar) || 0;
    const pobreza = parseFloat(row.tasa_pobreza) || 0;
    const gini = parseFloat(row.precariedad_laboral) || 0;
    const yr = byYear[row.anyo];

    // IER = compRenta(0-40) + compPobreza(0-35) + compGini(0-25) = 0-100
    const rentaPct = renta > 0 ? percentileRank(renta, yr.rentas) : 0.5;
    const compAlquiler = (1 - rentaPct) * 40;
    const pobPct = pobreza > 0 ? percentileRank(pobreza, yr.pobrezas) : null;
    const compPrec = pobPct !== null ? pobPct * 35 : 0;
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
      [row.barrio_id, row.anyo, ier, Math.round(compAlquiler*10)/10, Math.round(compPrec*10)/10, Math.round(compSocial*10)/10, ier, riesgo]
    );
    ierOk++;
  }
  console.log(`  IER scores: ${ierOk}`);

  // ═══════════════════════════════════════════════
  // 4. RESUMEN
  // ═══════════════════════════════════════════════
  const final = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM barrios WHERE ciudad='valencia_provincia') AS munis,
      (SELECT COUNT(DISTINCT barrio_id) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_munis,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia') AS ier_total,
      (SELECT ROUND(AVG(ier_value)::numeric,1) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023) AS ier_medio,
      (SELECT ROUND(MIN(ier_value)::numeric,1) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023) AS ier_min,
      (SELECT ROUND(MAX(ier_value)::numeric,1) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023) AS ier_max,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023 AND riesgo_desahucio='BAJO') AS bajo,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023 AND riesgo_desahucio='MEDIO') AS medio,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023 AND riesgo_desahucio='ALTO') AS alto,
      (SELECT COUNT(*) FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id WHERE b.ciudad='valencia_provincia' AND s.anyo=2023 AND riesgo_desahucio='CRÍTICO') AS critico
  `);
  const f = final.rows[0];

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║     COMUNIDAD VALENCIANA COMPLETA (2023)           ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║ Municipios en DB:     ${String(f.munis).padStart(5)}`);
  console.log(`║ Municipios con IER:   ${String(f.ier_munis).padStart(5)}`);
  console.log(`║ IER scores totales:   ${String(f.ier_total).padStart(5)}`);
  console.log(`║ IER 2023: medio=${f.ier_medio} min=${f.ier_min} max=${f.ier_max}`);
  console.log(`║ BAJO:${f.bajo} MEDIO:${f.medio} ALTO:${f.alto} CRITICO:${f.critico}`);
  console.log('╚═══════════════════════════════════════════════════╝');

  // Top/bottom by province
  for (const codProv of ['03', '12', '46']) {
    const top = await client.query(`
      SELECT b.nombre, b.codigo_ine, s.ier_value, s.riesgo_desahucio
      FROM ier_scores s JOIN barrios b ON s.barrio_id=b.id
      WHERE b.ciudad='valencia_provincia' AND b.codigo_ine LIKE '${codProv}%' AND s.anyo=2023
      ORDER BY s.ier_value DESC LIMIT 3
    `);
    console.log(`\n${PROVINCIAS[codProv].nombre} - Top 3 IER 2023:`);
    top.rows.forEach((r,i) => console.log(`  ${i+1}. ${r.nombre}: ${r.ier_value} [${r.riesgo_desahucio}]`));
  }

  await client.end();
  console.log('\nETL completado.');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
