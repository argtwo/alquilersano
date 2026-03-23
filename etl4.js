const https = require('https');
const { Client } = require('pg');

const BASE = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const DB_URL = 'postgresql://postgres:atNenxVddmELEHVeJyhMNdtDCTXjkfeJ@autorack.proxy.rlwy.net:49895/railway';

// ── Diccionario de aliases: nombre normalizado en dataset → nombre normalizado en GeoJSON ──
// Resuelve los 8 barrios IBI que no matcheaban + 1 de vulnerabilidad
const ALIASES = {
  'ciutat arts i ci ncies':    'ciutat de les arts i de les ciencies',
  'el cabanyal-el canyamelar': 'cabanyal-canyamelar',
  'el castellar-l\'oliveral':  'castellar-l\'oliveral',
  'fonteta de sant lluis':     'la fonteta s.lluis',
  'gran via':                  'la gran via',
  'mauella':                   'mahuella-tauladella',
  'mont-olivet':               'montolivet',
  'sant lloren':               'sant llorens',
};

function fetchUrl(url) {
  return new Promise((res, rej) => {
    https.get(url, {headers: {'User-Agent': 'AlquilerSano/1.0'}}, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
        return fetchUrl(r.headers.location).then(res).catch(rej);
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}

function norm(name) {
  if (!name) return '';
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/'/g, "'").replace(/\s+/g, ' ');
}

// Normaliza y resuelve alias: devuelve el nombre canónico del GeoJSON
function resolveBarrio(rawName) {
  const n = norm(rawName);
  return ALIASES[n] || n;
}

function parseCSV(raw) {
  const lines = raw.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toLowerCase());
  return { headers, lines: lines.slice(1) };
}

function rowObj(headers, line) {
  const vals = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ';' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else cur += line[i];
  }
  vals.push(cur.trim());
  return Object.fromEntries(headers.map((h, j) => [h, vals[j] || '']));
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado a Railway');

  // ═══════════════════════════════════════════════════════════════════
  // 1. BARRIOS GeoJSON
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 1. Descargando barrios GeoJSON ──');
  const gjRaw = await fetchUrl(BASE + '/barris-barrios/exports/geojson?lang=es');
  const gj = JSON.parse(gjRaw);

  const barrioMap = {}; // norm(nombre) → db id

  for (const feat of gj.features) {
    const p = feat.properties;
    const nombre = p.nombre || p.nom_barri || p.barri || '';
    const codiBarri = p.codbarrio || p.codi_barri || p.codibarri || 0;
    const codiDistr = p.coddistrit || p.codi_districte || 0;
    const ine = '46250' + String(codiDistr).padStart(2,'0') + String(codiBarri).padStart(2,'0');
    const geom = feat.geometry ? JSON.stringify(feat.geometry) : null;

    const r = await client.query(
      `INSERT INTO barrios (codigo_ine, nombre, nombre_val, distrito, distrito_num, ciudad, geometria)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (codigo_ine) DO UPDATE SET nombre=EXCLUDED.nombre, geometria=EXCLUDED.geometria
       RETURNING id`,
      [ine, nombre, nombre, null, parseInt(codiDistr) || null, 'valencia', geom]
    );
    barrioMap[norm(nombre)] = r.rows[0].id;
  }
  console.log('Barrios cargados:', gj.features.length, '| Map keys:', Object.keys(barrioMap).length);

  // ═══════════════════════════════════════════════════════════════════
  // 2. IBI — con resolución de aliases
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 2. Descargando IBI ──');
  const ibiRaw = await fetchUrl(BASE + '/recibos-ibi-2020-2025/exports/csv?lang=es&delimiter=%3B');
  const { headers: ih, lines: il } = parseCSV(ibiRaw);

  const ibiMap = {};
  for (const line of il) {
    const row = rowObj(ih, line);
    const anyo = parseInt(row['periodo'] || '');
    const barriNom = resolveBarrio(row['barrio'] || '');
    if (!anyo || !barriNom) continue;
    const key = barriNom + '|' + anyo;
    if (!ibiMap[key]) ibiMap[key] = { barriNom, anyo, f: 0, j: 0, total: 0 };
    ibiMap[key].f += parseInt(row['num_recibos_personalidad_f'] || '0') || 0;
    ibiMap[key].j += parseInt(row['num_recibos_personalidad_j'] || '0') || 0;
    ibiMap[key].total += parseInt(row['num_recibos_totales'] || '0') || 0;
  }

  let ibiOk = 0, ibiFail = 0;
  const failedIBI = new Set();
  for (const v of Object.values(ibiMap)) {
    const bid = barrioMap[v.barriNom];
    if (!bid) { failedIBI.add(v.barriNom); ibiFail++; continue; }
    const total = v.total || (v.f + v.j);
    const pctJ = total > 0 ? Math.round(v.j / total * 1000) / 10 : null;
    await client.query(
      `INSERT INTO recibos_ibi (barrio_id, anyo, total_recibos, recibos_impagados, pct_impagados, pct_persona_juridica)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (barrio_id, anyo) DO UPDATE SET total_recibos=EXCLUDED.total_recibos, pct_persona_juridica=EXCLUDED.pct_persona_juridica`,
      [bid, v.anyo, total, 0, 0, pctJ]
    );
    ibiOk++;
  }
  console.log('IBI ok:', ibiOk, '| Sin match:', ibiFail);
  if (failedIBI.size > 0) console.log('IBI sin match:', [...failedIBI]);

  // ═══════════════════════════════════════════════════════════════════
  // 3. VULNERABILIDAD — con aliases y normalización correcta
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 3. Descargando vulnerabilidad ──');
  try {
    const vulRaw = await fetchUrl(BASE + '/vulnerabilidad-por-barrios/exports/csv?lang=es&delimiter=%3B');
    const { headers: vh, lines: vl } = parseCSV(vulRaw);
    console.log('Vuln headers:', vh.join(', '));

    // Primer paso: leer todos los valores para encontrar max (normalización)
    // Fase 2: ahora cargamos los 4 índices (equip, dem, econom, global)
    const vulData = [];
    let maxEconom = 0, maxGlobal = 0, maxDem = 0, maxEquip = 0;
    for (const line of vl) {
      const row = rowObj(vh, line);
      const barriNom = resolveBarrio(row['nombre'] || '');
      if (!barriNom) continue;
      const indEconom = parseFloat((row['ind_econom'] || '').replace(',','.')) || 0;
      const indGlobal = parseFloat((row['ind_global'] || '').replace(',','.')) || 0;
      const indDem    = parseFloat((row['ind_dem']    || '').replace(',','.')) || 0;
      const indEquip  = parseFloat((row['ind_equip']  || '').replace(',','.')) || 0;
      if (!indEconom && !indGlobal && !indDem && !indEquip) continue;
      vulData.push({ barriNom, indEconom, indGlobal, indDem, indEquip });
      if (indEconom > maxEconom) maxEconom = indEconom;
      if (indGlobal > maxGlobal) maxGlobal = indGlobal;
      if (indDem    > maxDem)    maxDem    = indDem;
      if (indEquip  > maxEquip)  maxEquip  = indEquip;
    }
    console.log('Vuln max ind_econom:', maxEconom, '| max ind_global:', maxGlobal, '| max ind_dem:', maxDem, '| max ind_equip:', maxEquip);

    // Segundo paso: normalizar y guardar los 4 índices de vulnerabilidad
    // Mapeo de columnas (reutilizando columnas existentes sin nueva migración):
    //   tasa_pobreza       → ind_econom normalizado (vulnerabilidad económica)
    //   precariedad_laboral → ind_global normalizado (índice global compuesto)
    //   pct_migrantes      → ind_dem normalizado    (vulnerabilidad demográfica) [Fase 2]
    //   pct_desempleo      → ind_equip normalizado  (acceso a equipamientos)    [Fase 2]
    let vulOk = 0, vulFail = 0;
    const failedVul = new Set();
    for (const v of vulData) {
      const bid = barrioMap[v.barriNom];
      if (!bid) { failedVul.add(v.barriNom); vulFail++; continue; }
      const anyo = 2021;
      const econNorm  = maxEconom > 0 ? v.indEconom / maxEconom : 0;
      const globNorm  = maxGlobal > 0 ? v.indGlobal / maxGlobal : 0;
      const demNorm   = maxDem    > 0 ? v.indDem    / maxDem    : 0;
      const equipNorm = maxEquip  > 0 ? v.indEquip  / maxEquip  : 0;
      await client.query(
        `INSERT INTO indicadores_exclusion (barrio_id, anyo, pct_migrantes, tasa_pobreza, precariedad_laboral, pct_desempleo)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (barrio_id, anyo) DO UPDATE SET
           tasa_pobreza=EXCLUDED.tasa_pobreza,
           precariedad_laboral=EXCLUDED.precariedad_laboral,
           pct_migrantes=EXCLUDED.pct_migrantes,
           pct_desempleo=EXCLUDED.pct_desempleo`,
        [bid, anyo, demNorm, econNorm, globNorm, equipNorm]
      );
      vulOk++;
    }
    console.log('Vulnerabilidad ok:', vulOk, '| Sin match:', vulFail);
    if (failedVul.size > 0) console.log('Vuln sin match:', [...failedVul]);
  } catch(e) { console.log('Vuln skip:', e.message); }

  // ═══════════════════════════════════════════════════════════════════
  // 4. IER SCORES — fórmula corregida con normalización proporcional
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n── 4. Calculando IER scores ──');
  const dataRes = await client.query(`
    SELECT b.id barrio_id, b.nombre,
      ibi.anyo, ibi.pct_persona_juridica, ibi.total_recibos,
      exc.tasa_pobreza,        -- ind_econom normalizado (vulnerabilidad económica)
      exc.pct_migrantes        -- ind_dem normalizado    (vulnerabilidad demográfica) [Fase 2]
    FROM barrios b
    JOIN recibos_ibi ibi ON ibi.barrio_id = b.id
    LEFT JOIN indicadores_exclusion exc ON exc.barrio_id = b.id
    WHERE b.ciudad = 'valencia'
    ORDER BY b.id, ibi.anyo
  `);

  const rows = dataRes.rows;
  console.log('Filas para IER:', rows.length);

  // Normalizar pct_persona_juridica por su máximo
  const pctJs = rows.map(r => parseFloat(r.pct_persona_juridica) || 0);
  const pctMax = Math.max(...pctJs, 1);
  console.log('Max pct_persona_juridica:', pctMax);

  let ierOk = 0;
  for (const row of rows) {
    const pctJ    = parseFloat(row.pct_persona_juridica) || 0;
    const econNorm = parseFloat(row.tasa_pobreza)   || 0; // ind_econom normalizado 0-1
    const demNorm  = parseFloat(row.pct_migrantes)  || 0; // ind_dem normalizado 0-1 [Fase 2]

    // Fórmula IER Fase 2 (sin double-counting de índices de vulnerabilidad):
    //   compAlquiler (0-50): presión inversora vía IBI — pct propietario persona jurídica
    //   compEconom   (0-30): vulnerabilidad económica — ind_econom (desempleo, bajos ingresos)
    //   compDem      (0-20): vulnerabilidad demográfica — ind_dem (dependencia, envejecimiento)
    const compAlquiler = (pctJ / pctMax) * 50;
    const compEconom   = econNorm * 30;
    const compDem      = demNorm  * 20;

    const ier = Math.round((compAlquiler + compEconom + compDem) * 10) / 10;
    const riesgo = ier >= 75 ? 'CRÍTICO' : ier >= 50 ? 'ALTO' : ier >= 25 ? 'MEDIO' : 'BAJO';

    await client.query(
      `INSERT INTO ier_scores (barrio_id, anyo, ier_value, componente_alquiler, componente_precariedad, componente_salud_mental, score_calidad_vida, riesgo_desahucio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (barrio_id, anyo) DO UPDATE SET
         ier_value=EXCLUDED.ier_value, componente_alquiler=EXCLUDED.componente_alquiler,
         componente_precariedad=EXCLUDED.componente_precariedad, componente_salud_mental=EXCLUDED.componente_salud_mental,
         riesgo_desahucio=EXCLUDED.riesgo_desahucio`,
      [row.barrio_id, row.anyo, ier, Math.round(compAlquiler*10)/10, Math.round(compEconom*10)/10, Math.round(compDem*10)/10, ier, riesgo]
    );
    ierOk++;
  }
  console.log('IER ok:', ierOk);

  // ═══════════════════════════════════════════════════════════════════
  // 5. RESUMEN FINAL
  // ═══════════════════════════════════════════════════════════════════
  const final = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM barrios WHERE ciudad='valencia') barrios,
      (SELECT COUNT(*) FROM recibos_ibi) ibi,
      (SELECT COUNT(DISTINCT barrio_id) FROM recibos_ibi) ibi_barrios,
      (SELECT COUNT(*) FROM indicadores_exclusion) vuln,
      (SELECT COUNT(*) FROM ier_scores) ier,
      (SELECT COUNT(DISTINCT barrio_id) FROM ier_scores) ier_barrios,
      (SELECT ROUND(AVG(ier_value)::numeric,1) FROM ier_scores) ier_medio,
      (SELECT ROUND(MIN(ier_value)::numeric,1) FROM ier_scores) ier_min,
      (SELECT ROUND(MAX(ier_value)::numeric,1) FROM ier_scores) ier_max,
      (SELECT COUNT(*) FROM ier_scores WHERE riesgo_desahucio = 'BAJO') bajo,
      (SELECT COUNT(*) FROM ier_scores WHERE riesgo_desahucio = 'MEDIO') medio,
      (SELECT COUNT(*) FROM ier_scores WHERE riesgo_desahucio = 'ALTO') alto,
      (SELECT COUNT(*) FROM ier_scores WHERE riesgo_desahucio = 'CRÍTICO') critico
  `);
  const f = final.rows[0];
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       RESULTADO FINAL VALENCIA       ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║ Barrios GeoJSON:', String(f.barrios).padStart(4), '                ║');
  console.log('║ IBI registros:  ', String(f.ibi).padStart(4), '(', f.ibi_barrios, 'barrios)  ║');
  console.log('║ Vulnerabilidad: ', String(f.vuln).padStart(4), '                ║');
  console.log('║ IER scores:     ', String(f.ier).padStart(4), '(', f.ier_barrios, 'barrios)  ║');
  console.log('╠══════════════════════════════════════╣');
  console.log('║ IER medio:', f.ier_medio, '| min:', f.ier_min, '| max:', f.ier_max);
  console.log('║ BAJO:', f.bajo, '| MEDIO:', f.medio, '| ALTO:', f.alto, '| CRÍTICO:', f.critico);
  console.log('╚══════════════════════════════════════╝');

  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
