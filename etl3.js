const https = require('https');
const { Client } = require('pg');

const BASE = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const DB_URL = 'postgresql://postgres:atNenxVddmELEHVeJyhMNdtDCTXjkfeJ@autorack.proxy.rlwy.net:49895/railway';

function fetchUrl(url) {
  return new Promise((res, rej) => {
    https.get(url, {headers: {'User-Agent': 'AlquilerSano/1.0'}}, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return fetchUrl(r.headers.location).then(res).catch(rej);
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}

function norm(name) {
  if (!name) return '';
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseCSV(raw) {
  const lines = raw.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toLowerCase());
  return { headers, lines: lines.slice(1) };
}

function rowObj(headers, line) {
  // Manejar comillas en campos GeoJSON
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

  // 1. Barrios GeoJSON
  console.log('Descargando barrios...');
  const gjRaw = await fetchUrl(BASE + '/barris-barrios/exports/geojson?lang=es');
  const gj = JSON.parse(gjRaw);
  const barrioMap = {}; // norm(nombre) -> id

  for (const feat of gj.features) {
    const p = feat.properties;
    const codiBarri = p.codi_barri || p.codibarri || 0;
    const codiDistr = p.codi_districte || p.num_districte || 0;
    const ine = '46250' + String(codiDistr).padStart(2,'0') + String(codiBarri).padStart(2,'0');
    const nombre = p.nom_barri || p.barri || '';
    const nombreVal = p.nom_barri_val || p.nom_barri_va || nombre;
    const distrito = p.nom_districte || p.districte || '';
    const geom = feat.geometry ? JSON.stringify(feat.geometry) : null;
    const r = await client.query(
      'INSERT INTO barrios (codigo_ine, nombre, nombre_val, distrito, distrito_num, ciudad, geometria) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (codigo_ine) DO UPDATE SET nombre=EXCLUDED.nombre, nombre_val=EXCLUDED.nombre_val, distrito=EXCLUDED.distrito, geometria=EXCLUDED.geometria RETURNING id',
      [ine, nombre, nombreVal, distrito, codiDistr || null, 'valencia', geom]
    );
    const id = r.rows[0].id;
    barrioMap[norm(nombre)] = id;
    // También mapear por nombre sin accentos y con variantes
    barrioMap[norm(nombreVal)] = id;
  }
  console.log('Barrios insertados:', gj.features.length, '| Lookup entries:', Object.keys(barrioMap).length);

  // 2. IBI - tiene barrio, distrito, periodo, num_recibos
  console.log('Descargando IBI...');
  const ibiRaw = await fetchUrl(BASE + '/recibos-ibi-2020-2025/exports/csv?lang=es&delimiter=%3B');
  const { headers: ih, lines: il } = parseCSV(ibiRaw);
  console.log('IBI headers:', ih.join(', '));

  const ibiMap = {}; // barriNorm|anyo -> {total_f, total_j, total_sin}
  for (const line of il) {
    const row = rowObj(ih, line);
    const anyo = parseInt(row['periodo'] || '');
    const barriNom = norm(row['barrio'] || '');
    if (!anyo || !barriNom) continue;
    const key = barriNom + '|' + anyo;
    if (!ibiMap[key]) ibiMap[key] = { barriNom, anyo, f: 0, j: 0, sin: 0 };
    ibiMap[key].f += parseInt(row['num_recibos_personalidad_f'] || '0') || 0;
    ibiMap[key].j += parseInt(row['num_recibos_personalidad_j'] || '0') || 0;
    ibiMap[key].sin += parseInt(row['num_recibos_sin_personalidad'] || '0') || 0;
  }

  let ibiOk = 0;
  for (const v of Object.values(ibiMap)) {
    const bid = barrioMap[v.barriNom];
    if (!bid) { continue; }
    const total = v.f + v.j + v.sin;
    const pctJ = total > 0 ? (v.j / total * 100) : null;
    // Usar % persona jurídica como proxy de gran tenedor
    await client.query(
      'INSERT INTO recibos_ibi (barrio_id, anyo, total_recibos, recibos_impagados, pct_impagados, pct_persona_juridica) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (barrio_id, anyo) DO UPDATE SET total_recibos=EXCLUDED.total_recibos, pct_persona_juridica=EXCLUDED.pct_persona_juridica',
      [bid, v.anyo, total, 0, 0, pctJ]
    );
    ibiOk++;
  }
  console.log('IBI ok:', ibiOk, '| Filas IBI procesadas:', Object.keys(ibiMap).length);

  // 3. Vulnerabilidad por barrios (tiene datos de exclusión)
  console.log('Descargando vulnerabilidad...');
  try {
    const vulRaw = await fetchUrl(BASE + '/vulnerabilidad-por-barrios/exports/csv?lang=es&delimiter=%3B');
    const { headers: vh, lines: vl } = parseCSV(vulRaw);
    console.log('Vuln headers:', vh.slice(0,15).join(', '));
    let vulOk = 0;
    for (const line of vl) {
      const row = rowObj(vh, line);
      const barriNom = norm(row['nombre'] || row['barri'] || row['nom_barri'] || '');
      if (!barriNom) continue;
      const bid = barrioMap[barriNom];
      if (!bid) continue;
      const anyo = 2021;
      const tasaPobreza = parseFloat((row['tasa_pobreza'] || row['tasa_riesgo_pobreza'] || row['pobreza'] || '').replace(',','.')) || null;
      const pctDesempleo = parseFloat((row['tasa_desempleo'] || row['desempleo'] || row['paro'] || '').replace(',','.')) || null;
      if (!tasaPobreza && !pctDesempleo) continue;
      await client.query(
        'INSERT INTO indicadores_exclusion (barrio_id, anyo, pct_migrantes, tasa_pobreza, precariedad_laboral, pct_desempleo) VALUES ($1,$2,NULL,$3,NULL,$4) ON CONFLICT (barrio_id, anyo) DO UPDATE SET tasa_pobreza=EXCLUDED.tasa_pobreza, pct_desempleo=EXCLUDED.pct_desempleo',
        [bid, anyo, tasaPobreza, pctDesempleo]
      );
      vulOk++;
    }
    console.log('Vulnerabilidad ok:', vulOk);
  } catch(e) { console.log('Vuln skip:', e.message); }

  // 4. Calcular IER scores con los datos disponibles
  console.log('Calculando IER scores...');
  // Obtener todos los barrios con sus datos
  const dataRes = await client.query(`
    SELECT b.id barrio_id, b.nombre,
      ibi.anyo, ibi.pct_persona_juridica, ibi.total_recibos,
      exc.tasa_pobreza, exc.pct_desempleo
    FROM barrios b
    JOIN recibos_ibi ibi ON ibi.barrio_id = b.id
    LEFT JOIN indicadores_exclusion exc ON exc.barrio_id = b.id AND exc.anyo = ibi.anyo
    WHERE b.ciudad = 'valencia'
    ORDER BY b.id, ibi.anyo
  `);

  const rows = dataRes.rows;
  // Normalizar pct_persona_juridica (0-100) -> componente precariedad (0-40)
  const pctJs = rows.map(r => parseFloat(r.pct_persona_juridica) || 0);
  const pctMax = Math.max(...pctJs, 1);

  let ierOk = 0;
  for (const row of rows) {
    const pctJ = parseFloat(row.pct_persona_juridica) || 0;
    const pobreza = parseFloat(row.tasa_pobreza) || 0;
    const desempleo = parseFloat(row.pct_desempleo) || 0;

    // Componentes del IER
    const compAlquiler = (pctJ / pctMax) * 50;           // Gran tenedor como proxy de presión alquiler
    const compPrec = Math.min(desempleo * 2, 25);         // Precariedad laboral
    const compExcl = Math.min(pobreza * 0.5, 25);         // Exclusión social

    const ier = Math.round((compAlquiler + compPrec + compExcl) * 10) / 10;
    const riesgo = ier >= 75 ? 'CRÍTICO' : ier >= 50 ? 'ALTO' : ier >= 25 ? 'MEDIO' : 'BAJO';

    await client.query(
      'INSERT INTO ier_scores (barrio_id, anyo, ier_value, componente_alquiler, componente_precariedad, componente_salud_mental, score_calidad_vida, riesgo_desahucio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (barrio_id, anyo) DO UPDATE SET ier_value=EXCLUDED.ier_value, componente_alquiler=EXCLUDED.componente_alquiler, componente_precariedad=EXCLUDED.componente_precariedad, componente_salud_mental=EXCLUDED.componente_salud_mental, riesgo_desahucio=EXCLUDED.riesgo_desahucio',
      [row.barrio_id, row.anyo, ier, Math.round(compAlquiler*10)/10, Math.round(compPrec*10)/10, Math.round(compExcl*10)/10, ier, riesgo]
    );
    ierOk++;
  }
  console.log('IER scores calculados:', ierOk);

  // Resultado final
  const final = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM barrios WHERE ciudad='valencia') barrios,
      (SELECT COUNT(*) FROM recibos_ibi) ibi,
      (SELECT COUNT(*) FROM ier_scores) ier,
      (SELECT ROUND(AVG(ier_value)::numeric,1) FROM ier_scores) ier_medio,
      (SELECT COUNT(*) FROM ier_scores WHERE riesgo_desahucio='ALTO' OR riesgo_desahucio='CRÍTICO') alto_critico
  `);
  const f = final.rows[0];
  console.log('\n=== RESULTADO FINAL ===');
  console.log('Barrios Valencia:', f.barrios);
  console.log('Recibos IBI:', f.ibi);
  console.log('IER scores:', f.ier);
  console.log('IER medio:', f.ier_medio);
  console.log('Barrios alto/crítico:', f.alto_critico);

  await client.end();
  console.log('\nETL completado.');
}

main().catch(e => { console.error('FATAL:', e.message, '\n', e.stack); process.exit(1); });
