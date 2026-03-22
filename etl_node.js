#!/usr/bin/env node
/**
 * ETL Valencia completo en Node.js puro
 * Descarga barrios + indicadores y los inserta en Railway PostgreSQL
 */
const https = require('https');
const http = require('http');
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:atNenxVddmELEHVeJyhMNdtDCTXjkfeJ@autorack.proxy.rlwy.net:49895/railway';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'AlquilerSano-ETL/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function normalizeBarrio(name) {
  if (!name) return '';
  if (name.includes(' / ')) name = name.split(' / ')[0];
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✓ Conectado a Railway PostgreSQL');

  // 1. Descargar GeoJSON de barrios Valencia
  console.log('>>> Descargando GeoJSON barrios Valencia...');
  const gjRaw = await fetch('https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/barris-barrios/exports/geojson?lang=es');
  const gj = JSON.parse(gjRaw);
  console.log(`✓ ${gj.features.length} features descargadas`);

  // 2. Insertar barrios
  console.log('>>> Insertando barrios...');
  const barrioMap = {}; // codigo_ine -> id
  let inserted = 0;
  for (const feat of gj.features) {
    const p = feat.properties;
    const codiBarri = p.codi_barri || p.codibarri || '';
    const codiDistr = p.codi_districte || p.num_districte || 0;
    const codigoIne = `46250${String(codiDistr).padStart(2,'0')}${String(codiBarri).padStart(2,'0')}`;
    const nombre = p.nom_barri || p.barri || '';
    const nombreVal = p.nom_barri_val || p.nom_barri_va || nombre;
    const distrito = p.nom_districte || p.districte || '';
    const geomText = feat.geometry ? JSON.stringify(feat.geometry) : null;

    const res = await client.query(`
      INSERT INTO barrios (codigo_ine, nombre, nombre_val, distrito, distrito_num, ciudad, geometria)
      VALUES ($1,$2,$3,$4,$5,'valencia',$6)
      ON CONFLICT (codigo_ine) DO UPDATE SET
        nombre=EXCLUDED.nombre, nombre_val=EXCLUDED.nombre_val,
        distrito=EXCLUDED.distrito, geometria=EXCLUDED.geometria
      RETURNING id
    `, [codigoIne, nombre, nombreVal, distrito, codiDistr || null, geomText]);
    barrioMap[codigoIne] = res.rows[0].id;
    barrioMap[normalizeBarrio(nombre)] = res.rows[0].id;
    inserted++;
  }
  console.log(`✓ ${inserted} barrios insertados`);

  // 3. Descargar y procesar CSV de renta
  console.log('>>> Descargando renta...');
  try {
    const rentaRaw = await fetch('https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/renta-per-persona-i-llar-renta-por-persona-y-hogar/exports/csv?lang=es&delimiter=%3B');
    const lines = rentaRaw.split('\n').filter(l => l.trim());
    const headers = lines[0].split(';').map(h => h.replace(/"/g,'').trim().toLowerCase());
    let rentaOk = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(';').map(v => v.replace(/"/g,'').trim());
      const row = {};
      headers.forEach((h,j) => row[h] = vals[j]);
      const anyo = parseInt(row['any'] || row['año'] || row['year']);
      const barriNom = normalizeBarrio(row['nom_barri'] || row['barri'] || row['nombre_barrio'] || '');
      const rentaPersona = parseFloat((row['renda_per_persona'] || row['renta_per_persona'] || '').replace(',','.')) || null;
      const rentaHogar = parseFloat((row['renda_per_llar'] || row['renta_per_hogar'] || '').replace(',','.')) || null;
      if (!anyo || !barriNom) continue;
      const barrioId = barrioMap[barriNom];
      if (!barrioId) continue;
      await client.query(`
        INSERT INTO indicadores_renta (barrio_id, anyo, renta_media_persona, renta_media_hogar, coste_alquiler_medio)
        VALUES ($1,$2,$3,$4,NULL)
        ON CONFLICT (barrio_id, anyo) DO UPDATE SET
          renta_media_persona=EXCLUDED.renta_media_persona,
          renta_media_hogar=EXCLUDED.renta_media_hogar
      `, [barrioId, anyo, rentaPersona, rentaHogar]);
      rentaOk++;
    }
    console.log(`✓ Renta: ${rentaOk} filas`);
  } catch(e) { console.log('⚠ Renta:', e.message); }

  // 4. Descargar IBI
  console.log('>>> Descargando IBI...');
  try {
    const ibiRaw = await fetch('https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/recibos-ibi-2020-al-2025/exports/csv?lang=es&delimiter=%3B');
    const lines = ibiRaw.split('\n').filter(l => l.trim());
    const headers = lines[0].split(';').map(h => h.replace(/"/g,'').trim().toLowerCase());
    // Agregar por barrio y año
    const agg = {};
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(';').map(v => v.replace(/"/g,'').trim());
      const row = {};
      headers.forEach((h,j) => row[h] = vals[j]);
      const anyo = parseInt(row['any'] || row['año'] || '');
      const barriNom = normalizeBarrio(row['nom_barri'] || row['barri'] || '');
      if (!anyo || !barriNom) continue;
      const key = `${barriNom}|${anyo}`;
      if (!agg[key]) agg[key] = { barriNom, anyo, total: 0, impagados: 0, juridica: 0 };
      agg[key].total++;
      const estado = (row['estat_cobrament'] || row['estado_cobramiento'] || '').toLowerCase();
      if (estado.includes('impag') || estado.includes('pendent')) agg[key].impagados++;
      const naturaleza = (row['naturalesa_juridica'] || row['naturaleza_juridica'] || '').toLowerCase();
      if (naturaleza.includes('juridi') || naturaleza.includes('societ') || naturaleza.includes('empresa')) agg[key].juridica++;
    }
    let ibiOk = 0;
    for (const [, v] of Object.entries(agg)) {
      const barrioId = barrioMap[v.barriNom];
      if (!barrioId) continue;
      const pctImpag = v.total > 0 ? (v.impagados / v.total * 100) : null;
      const pctJurid = v.total > 0 ? (v.juridica / v.total * 100) : null;
      await client.query(`
        INSERT INTO recibos_ibi (barrio_id, anyo, total_recibos, recibos_impagados, pct_impagados, pct_persona_juridica)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (barrio_id, anyo) DO UPDATE SET
          total_recibos=EXCLUDED.total_recibos, recibos_impagados=EXCLUDED.recibos_impagados,
          pct_impagados=EXCLUDED.pct_impagados, pct_persona_juridica=EXCLUDED.pct_persona_juridica
      `, [barrioId, v.anyo, v.total, v.impagados, pctImpag, pctJurid]);
      ibiOk++;
    }
    console.log(`✓ IBI: ${ibiOk} filas`);
  } catch(e) { console.log('⚠ IBI:', e.message); }

  // 5. Descargar salud mental
  console.log('>>> Descargando salud mental...');
  try {
    const smRaw = await fetch('https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/malaltia-mental-enfermedad-mental/exports/csv?lang=es&delimiter=%3B');
    const lines = smRaw.split('\n').filter(l => l.trim());
    const headers = lines[0].split(';').map(h => h.replace(/"/g,'').trim().toLowerCase());
    let smOk = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(';').map(v => v.replace(/"/g,'').trim());
      const row = {};
      headers.forEach((h,j) => row[h] = vals[j]);
      const anyo = parseInt(row['any'] || row['año'] || '');
      const barriNom = normalizeBarrio(row['nom_barri'] || row['barri'] || '');
      const casos = parseInt(row['nombre_casos'] || row['casos'] || row['total'] || '') || null;
      const tasa = parseFloat((row['taxa_per_1000'] || row['tasa_per_1000'] || row['tasa'] || '').replace(',','.')) || null;
      if (!anyo || !barriNom) continue;
      const barrioId = barrioMap[barriNom];
      if (!barrioId) continue;
      await client.query(`
        INSERT INTO indicadores_salud_mental (barrio_id, anyo, casos_totales, tasa_por_1000, recursos_disponibles)
        VALUES ($1,$2,$3,$4,NULL)
        ON CONFLICT (barrio_id, anyo) DO UPDATE SET casos_totales=EXCLUDED.casos_totales, tasa_por_1000=EXCLUDED.tasa_por_1000
      `, [barrioId, anyo, casos, tasa]);
      smOk++;
    }
    console.log(`✓ Salud mental: ${smOk} filas`);
  } catch(e) { console.log('⚠ Salud mental:', e.message); }

  // 6. Calcular IER scores básicos a partir de los datos cargados
  console.log('>>> Calculando IER scores...');
  try {
    // Para cada barrio+año con datos de renta e IBI, calcular un IER básico
    const res = await client.query(`
      SELECT r.barrio_id, r.anyo,
        r.renta_media_hogar, r.renta_media_persona,
        i.pct_impagados, i.pct_persona_juridica,
        sm.tasa_por_1000
      FROM indicadores_renta r
      LEFT JOIN recibos_ibi i ON i.barrio_id=r.barrio_id AND i.anyo=r.anyo
      LEFT JOIN indicadores_salud_mental sm ON sm.barrio_id=r.barrio_id AND sm.anyo=r.anyo
      WHERE r.renta_media_hogar IS NOT NULL
    `);
    // Normalizar renta (invertida: menor renta = mayor estrés)
    const rentas = res.rows.map(r => r.renta_media_hogar).filter(Boolean);
    const rentaMin = Math.min(...rentas), rentaMax = Math.max(...rentas);
    let ierOk = 0;
    for (const row of res.rows) {
      // Componente alquiler (normalizado invertido)
      const compAlquiler = rentaMax > rentaMin
        ? ((rentaMax - row.renta_media_hogar) / (rentaMax - rentaMin)) * 40
        : 20;
      // Componente precariedad (IBI impagados)
      const compPrec = Math.min((row.pct_impagados || 0) * 2, 30);
      // Componente salud mental
      const compSM = Math.min((row.tasa_por_1000 || 0) * 1.5, 30);
      const ier = compAlquiler + compPrec + compSM;
      const riesgo = ier >= 75 ? 'CRÍTICO' : ier >= 50 ? 'ALTO' : ier >= 25 ? 'MEDIO' : 'BAJO';
      await client.query(`
        INSERT INTO ier_scores (barrio_id, anyo, ier_value, componente_alquiler, componente_precariedad, componente_salud_mental, score_calidad_vida, riesgo_desahucio)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (barrio_id, anyo) DO UPDATE SET
          ier_value=EXCLUDED.ier_value, componente_alquiler=EXCLUDED.componente_alquiler,
          componente_precariedad=EXCLUDED.componente_precariedad,
          componente_salud_mental=EXCLUDED.componente_salud_mental,
          riesgo_desahucio=EXCLUDED.riesgo_desahucio
      `, [row.barrio_id, row.anyo, ier, compAlquiler, compPrec, compSM, ier, riesgo]);
      ierOk++;
    }
    console.log(`✓ IER scores: ${ierOk} calculados`);
  } catch(e) { console.log('⚠ IER:', e.message); }

  // 7. Verificar resultado final
  const check = await client.query('SELECT COUNT(*) FROM barrios; SELECT COUNT(*) FROM ier_scores');
  console.log(`\n=== RESULTADO FINAL ===`);
  console.log(`Barrios: ${check[0].rows[0].count}`);
  console.log(`IER scores: ${check[1].rows[0].count}`);

  await client.end();
  console.log('✓ Completado');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
