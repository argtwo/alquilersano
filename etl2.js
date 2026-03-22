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
  if (name.includes(' / ')) name = name.split(' / ')[0];
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCSV(raw) {
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim().toLowerCase());
  return { headers, lines: lines.slice(1) };
}

function rowObj(headers, line) {
  const vals = line.split(';').map(v => v.replace(/"/g, '').trim());
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
  console.log('Features:', gj.features.length);

  const barrioMap = {};
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
    barrioMap[norm(nombre)] = r.rows[0].id;
    barrioMap[ine] = r.rows[0].id;
  }
  console.log('Barrios insertados:', gj.features.length);

  // 2. Renta
  console.log('Descargando renta...');
  const rentaRaw = await fetchUrl(BASE + '/renda-per-llar-i-persona/exports/csv?lang=es&delimiter=%3B');
  const { headers: rh, lines: rl } = parseCSV(rentaRaw);
  console.log('Renta headers:', rh.slice(0,10).join(', '));
  let rentaOk = 0;
  for (const line of rl) {
    const row = rowObj(rh, line);
    const anyo = parseInt(row['any'] || row['anyo'] || row['year'] || '');
    const barriNom = norm(row['nom_barri'] || row['barri'] || '');
    const rentaP = parseFloat((row['renda_per_persona'] || row['renta_per_persona'] || '').replace(',','.')) || null;
    const rentaH = parseFloat((row['renda_per_llar'] || row['renta_per_hogar'] || '').replace(',','.')) || null;
    if (!anyo || !barriNom) continue;
    const bid = barrioMap[barriNom];
    if (!bid) continue;
    await client.query('INSERT INTO indicadores_renta (barrio_id, anyo, renta_media_persona, renta_media_hogar, coste_alquiler_medio) VALUES ($1,$2,$3,$4,NULL) ON CONFLICT (barrio_id, anyo) DO UPDATE SET renta_media_persona=EXCLUDED.renta_media_persona, renta_media_hogar=EXCLUDED.renta_media_hogar', [bid, anyo, rentaP, rentaH]);
    rentaOk++;
  }
  console.log('Renta ok:', rentaOk);

  // 3. IBI
  console.log('Descargando IBI...');
  const ibiRaw = await fetchUrl(BASE + '/recibos-ibi-2020-2025/exports/csv?lang=es&delimiter=%3B');
  const { headers: ih, lines: il } = parseCSV(ibiRaw);
  console.log('IBI headers:', ih.slice(0,10).join(', '));
  const ibiAgg = {};
  for (const line of il) {
    const row = rowObj(ih, line);
    const anyo = parseInt(row['any'] || row['anyo'] || '');
    const barriNom = norm(row['nom_barri'] || row['barri'] || '');
    if (!anyo || !barriNom) continue;
    const key = barriNom + '|' + anyo;
    if (!ibiAgg[key]) ibiAgg[key] = { barriNom, anyo, total: 0, impag: 0, jurid: 0 };
    ibiAgg[key].total++;
    const estat = (row['estat_cobrament'] || row['estado'] || '').toLowerCase();
    if (estat.includes('impag') || estat.includes('pendent')) ibiAgg[key].impag++;
    const nat = (row['naturalesa_juridica'] || row['naturaleza'] || '').toLowerCase();
    if (nat.includes('juridi') || nat.includes('societ') || nat.includes('empresa')) ibiAgg[key].jurid++;
  }
  let ibiOk = 0;
  for (const v of Object.values(ibiAgg)) {
    const bid = barrioMap[v.barriNom];
    if (!bid) continue;
    const pctI = v.total > 0 ? v.impag/v.total*100 : null;
    const pctJ = v.total > 0 ? v.jurid/v.total*100 : null;
    await client.query('INSERT INTO recibos_ibi (barrio_id, anyo, total_recibos, recibos_impagados, pct_impagados, pct_persona_juridica) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (barrio_id, anyo) DO UPDATE SET total_recibos=EXCLUDED.total_recibos, pct_impagados=EXCLUDED.pct_impagados, pct_persona_juridica=EXCLUDED.pct_persona_juridica', [bid, v.anyo, v.total, v.impag, pctI, pctJ]);
    ibiOk++;
  }
  console.log('IBI ok:', ibiOk);

  // 4. Salud Mental
  console.log('Descargando salud mental...');
  const smRaw = await fetchUrl(BASE + '/malaltia-mental-enfermedad-mental/exports/csv?lang=es&delimiter=%3B');
  const { headers: sh, lines: sl } = parseCSV(smRaw);
  console.log('SM headers:', sh.slice(0,12).join(', '));
  let smOk = 0;
  for (const line of sl) {
    const row = rowObj(sh, line);
    const anyo = parseInt(row['any'] || row['anyo'] || '');
    const barriNom = norm(row['nom_barri'] || row['barri'] || '');
    const casos = parseInt(row['nombre_casos'] || row['casos'] || row['total_casos'] || '') || null;
    const tasa = parseFloat((row['taxa_per_1000'] || row['tasa'] || row['taxa'] || '').replace(',','.')) || null;
    if (!anyo || !barriNom) continue;
    const bid = barrioMap[barriNom];
    if (!bid) continue;
    await client.query('INSERT INTO indicadores_salud_mental (barrio_id, anyo, casos_totales, tasa_por_1000, recursos_disponibles) VALUES ($1,$2,$3,$4,NULL) ON CONFLICT (barrio_id, anyo) DO UPDATE SET casos_totales=EXCLUDED.casos_totales, tasa_por_1000=EXCLUDED.tasa_por_1000', [bid, anyo, casos, tasa]);
    smOk++;
  }
  console.log('Salud mental ok:', smOk);

  // 5. Migrantes
  console.log('Descargando migrantes...');
  const migRaw = await fetchUrl(BASE + '/migrants-migrantes/exports/csv?lang=es&delimiter=%3B');
  const { headers: mh, lines: ml } = parseCSV(migRaw);
  console.log('Mig headers:', mh.slice(0,12).join(', '));
  let migOk = 0;
  for (const line of ml) {
    const row = rowObj(mh, line);
    const anyo = parseInt(row['any'] || row['anyo'] || '');
    const barriNom = norm(row['nom_barri'] || row['barri'] || '');
    const pctMig = parseFloat((row['pct_estrangers'] || row['pct_estrangeros'] || row['percentatge'] || '').replace(',','.')) || null;
    if (!anyo || !barriNom || !pctMig) continue;
    const bid = barrioMap[barriNom];
    if (!bid) continue;
    await client.query('INSERT INTO indicadores_exclusion (barrio_id, anyo, pct_migrantes, tasa_pobreza, precariedad_laboral, pct_desempleo) VALUES ($1,$2,$3,NULL,NULL,NULL) ON CONFLICT (barrio_id, anyo) DO UPDATE SET pct_migrantes=EXCLUDED.pct_migrantes', [bid, anyo, pctMig]);
    migOk++;
  }
  console.log('Migrantes ok:', migOk);

  // 6. IER scores
  console.log('Calculando IER...');
  const dataRes = await client.query('SELECT r.barrio_id, r.anyo, r.renta_media_hogar, i.pct_impagados, i.pct_persona_juridica, sm.tasa_por_1000 FROM indicadores_renta r LEFT JOIN recibos_ibi i ON i.barrio_id=r.barrio_id AND i.anyo=r.anyo LEFT JOIN indicadores_salud_mental sm ON sm.barrio_id=r.barrio_id AND sm.anyo=r.anyo WHERE r.renta_media_hogar IS NOT NULL');
  const rows = dataRes.rows;
  const rentas = rows.map(r => parseFloat(r.renta_media_hogar)).filter(Boolean);
  const rMin = Math.min(...rentas), rMax = Math.max(...rentas);
  let ierOk = 0;
  for (const row of rows) {
    const compA = rMax > rMin ? ((rMax - parseFloat(row.renta_media_hogar)) / (rMax - rMin)) * 40 : 20;
    const compP = Math.min((parseFloat(row.pct_impagados) || 0) * 2, 30);
    const compS = Math.min((parseFloat(row.tasa_por_1000) || 0) * 1.5, 30);
    const ier = Math.round((compA + compP + compS) * 10) / 10;
    const riesgo = ier >= 75 ? 'CRÍTICO' : ier >= 50 ? 'ALTO' : ier >= 25 ? 'MEDIO' : 'BAJO';
    await client.query('INSERT INTO ier_scores (barrio_id, anyo, ier_value, componente_alquiler, componente_precariedad, componente_salud_mental, score_calidad_vida, riesgo_desahucio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (barrio_id, anyo) DO UPDATE SET ier_value=EXCLUDED.ier_value, componente_alquiler=EXCLUDED.componente_alquiler, componente_precariedad=EXCLUDED.componente_precariedad, componente_salud_mental=EXCLUDED.componente_salud_mental, riesgo_desahucio=EXCLUDED.riesgo_desahucio', [row.barrio_id, row.anyo, ier, Math.round(compA*10)/10, Math.round(compP*10)/10, Math.round(compS*10)/10, ier, riesgo]);
    ierOk++;
  }
  console.log('IER ok:', ierOk);

  const final = await client.query('SELECT (SELECT COUNT(*) FROM barrios) b, (SELECT COUNT(*) FROM ier_scores) s, (SELECT COUNT(*) FROM indicadores_renta) r, (SELECT COUNT(*) FROM recibos_ibi) ibi');
  const f = final.rows[0];
  console.log('FINAL => Barrios:', f.b, '| IER:', f.s, '| Renta:', f.r, '| IBI:', f.ibi);
  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
