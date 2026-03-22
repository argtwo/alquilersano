/**
 * download_all_nacional.js
 * 
 * Descarga datasets del ADRH (INE) para la PROVINCIA DE VALENCIA (46)
 * + GeoJSON de municipios de la Comunidad Valenciana
 * 
 * USO: cd G:\Proyectos\alquiler && node --max-old-space-size=4096 download_all_nacional.js
 * 
 * IMPORTANTE: El INE tiene tablas SEPARADAS por provincia (540 tablas).
 * Las tablas de Valencia provincia (46) son:
 *   31250 = Renta media y mediana por municipio
 *   31249 = Indicadores demograficos por municipio
 *   31251 = Distribucion fuente de ingresos
 *   31252 = Pobreza umbrales fijos (sexo)
 *   31255 = Pobreza umbrales relativos (sexo)
 * 
 * Es REANUDABLE: si falla una descarga, vuelve a ejecutar y salta las completadas.
 * Cada tabla tarda 1-3 minutos en descargar.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'data', 'raw', 'nacional');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function fetchUrl(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'AlquilerSano/1.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
        return fetchUrl(r.headers.location).then(res).catch(rej);
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode)); return; }
      let d = ''; let sz = 0;
      r.on('data', c => {
        d += c; sz += c.length;
        if (sz % (5*1024*1024) < c.length) process.stdout.write(` ${(sz/1024/1024).toFixed(0)}MB..`);
      });
      r.on('end', () => { console.log(` done (${(sz/1024/1024).toFixed(1)}MB)`); res(d); });
    }).on('error', rej);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function saveFile(name, content) {
  const fp = path.join(OUT, name);
  fs.writeFileSync(fp, content, 'utf8');
  console.log(`  Saved: ${name} (${(fs.statSync(fp).size/1024).toFixed(0)} KB)`);
}

async function downloadINETable(tableId, label) {
  const rawPath = path.join(OUT, `ine_${tableId}_raw.json`);
  let data;

  if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 5000) {
    console.log(`\n[${tableId}] ${label} — ya descargada, reprocesando...`);
    data = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  } else {
    console.log(`\n[${tableId}] ${label}`);
    process.stdout.write(`  Descargando...`);
    const url = `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${tableId}?tip=AM&nult=9`;
    const raw = await fetchUrl(url);
    data = JSON.parse(raw);
    fs.writeFileSync(rawPath, raw, 'utf8');
    console.log(`  Raw JSON guardado (${(fs.statSync(rawPath).size/1024/1024).toFixed(1)} MB)`);
  }
  console.log(`  Series totales: ${data.length}`);

  // Parse JSON to CSV
  const rows = ['codigo_ine;municipio;indicador;anyo;valor'];
  const muniSet = new Set();
  const indSet = new Set();

  for (const entry of data) {
    // Find municipality: T3_Variable=Municipios or 5-digit Codigo
    let muniMeta = entry.MetaData.find(m => m.T3_Variable === 'Municipios');
    if (!muniMeta) {
      muniMeta = entry.MetaData.find(m => m.Codigo && /^\d{5}$/.test(m.Codigo));
    }
    if (!muniMeta || !muniMeta.Codigo) continue;

    // Skip district/section entries (7+ digit codes)
    if (muniMeta.Codigo.length > 5) continue;

    // Find indicator (skip metadata-only fields)
    const skip = new Set(['Municipios','Tipo de dato','Sexo','Total Nacional','Distritos','Secciones']);
    const indMeta = entry.MetaData.find(m => !skip.has(m.T3_Variable) && m.Nombre);
    const indicator = indMeta ? indMeta.Nombre : label;

    muniSet.add(muniMeta.Codigo);
    indSet.add(indicator);

    for (const d of entry.Data) {
      if (d.Valor !== null && d.Valor !== undefined) {
        rows.push(`${muniMeta.Codigo};${muniMeta.Nombre};${indicator};${d.Anyo};${d.Valor}`);
      }
    }
  }

  saveFile(`ine_${tableId}_valencia.csv`, rows.join('\n'));
  console.log(`  Municipios: ${muniSet.size}`);
  console.log(`  Indicadores: ${[...indSet].join(', ').substring(0, 120)}`);
  console.log(`  Filas CSV: ${rows.length - 1}`);

  // Sample for key municipalities
  const targets = ['46131','46190','46244','46169','46250'];
  const names = {46131:'Xirivella',46190:'Picanya',46244:'Torrent',46169:'Mislata',46250:'Valencia'};
  for (const code of targets) {
    const mRows = rows.filter(r => r.startsWith(code+';') && r.includes(';2023;'));
    if (mRows.length > 0) {
      const name = mRows[0].split(';')[1];
      console.log(`  ✓ ${code} ${name}: ${mRows.length} indicadores 2023`);
    } else {
      console.log(`  ✗ ${code} ${names[code]||'?'}: sin datos 2023`);
    }
  }
  return { munis: muniSet.size, rows: rows.length - 1, indicators: [...indSet] };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  AlquilerSano — Descarga ADRH Valencia (prov 46)  ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // ── 1. GeoJSON municipios CV ──
  console.log('── 1. GeoJSON municipios Comunidad Valenciana ──');
  const gjPath = path.join(OUT, 'cv_municipios.geojson');
  if (fs.existsSync(gjPath) && fs.statSync(gjPath).size > 1000) {
    const gj = JSON.parse(fs.readFileSync(gjPath, 'utf8'));
    console.log(`  Ya descargado: ${gj.features.length} municipios`);
  } else {
    process.stdout.write('  Descargando de dadesobertes.gva.es...');
    const gjRaw = await fetchUrl(
      'https://dadesobertes.gva.es/dataset/7928cfb8-88f7-4055-98e2-a40f9c8316a8/resource/2823465c-7c24-4e23-b3ef-ac541c3109ac/download/ca_municipios_20260205.geojson'
    );
    saveFile('cv_municipios.geojson', gjRaw);
    const gj = JSON.parse(gjRaw);
    console.log(`  Municipios: ${gj.features.length}`);
  }

  // ── 2. Tablas ADRH provincia Valencia (46) ──
  // TABLAS CORRECTAS (verificado: 31250 contiene municipios con codigo 46xxx)
  const tables = [
    { id: 31250, label: 'Renta media y mediana' },
    { id: 31249, label: 'Indicadores demograficos' },
    { id: 31251, label: 'Distribucion fuente de ingresos' },
    { id: 31252, label: 'Pobreza umbrales fijos (sexo)' },
    { id: 31255, label: 'Pobreza umbrales relativos (sexo)' },
  ];

  const results = {};
  for (const t of tables) {
    try {
      results[t.id] = await downloadINETable(t.id, t.label);
    } catch (e) {
      console.log(`  ✗ ERROR: ${e.message}`);
      console.log(`    Vuelve a ejecutar el script para reintentar.`);
      results[t.id] = { error: e.message };
    }
    await sleep(2000);
  }

  // ── 3. Buscar tabla Gini para Valencia ──
  // Las tablas Gini tienen IDs diferentes (37xxx). Probamos candidatos.
  console.log('\n── Buscando tabla Gini para Valencia ──');
  const giniCandidates = [37718,37719,37720,37721,37722,37723,37724,37727,37730];
  let giniFound = false;
  for (const gid of giniCandidates) {
    if (giniFound) break;
    const rawP = path.join(OUT, `ine_${gid}_raw.json`);
    if (fs.existsSync(rawP) && fs.statSync(rawP).size > 5000) {
      const d = JSON.parse(fs.readFileSync(rawP, 'utf8'));
      const m = d[0] && d[0].MetaData.find(m => m.Codigo && /^\d{5}$/.test(m.Codigo));
      if (m && m.Codigo.startsWith('46')) {
        console.log(`  ✓ Tabla ${gid} = Valencia Gini (ya descargada)`);
        results[gid] = await downloadINETable(gid, 'Indice Gini y P80/P20');
        giniFound = true;
      }
      continue;
    }
    process.stdout.write(`  Probando tabla ${gid}...`);
    try {
      const url = `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${gid}?tip=AM&nult=1`;
      const raw = await fetchUrl(url);
      const d = JSON.parse(raw);
      const m = d[0] && d[0].MetaData.find(m => m.Codigo && /^\d{5}$/.test(m.Codigo));
      if (m) {
        const prov = m.Codigo.substring(0, 2);
        console.log(`  → provincia ${prov}`);
        if (prov === '46') {
          console.log(`  ✓ ENCONTRADA! Descargando con datos completos...`);
          results[gid] = await downloadINETable(gid, 'Indice Gini y P80/P20');
          giniFound = true;
        }
      }
    } catch (e) { console.log(` err: ${e.message}`); }
    await sleep(1500);
  }
  if (!giniFound) console.log('  ✗ No se encontro tabla Gini para Valencia en los candidatos probados');

  // ── RESUMEN ──
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║              RESULTADO DESCARGA                    ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  const files = fs.readdirSync(OUT).filter(f => !f.endsWith('_raw.json')).sort();
  let totalKB = 0;
  files.forEach(f => {
    const kb = fs.statSync(path.join(OUT, f)).size / 1024;
    totalKB += kb;
    console.log(`║  ${f.padEnd(42)} ${kb.toFixed(0).padStart(7)} KB`);
  });
  console.log('╠═══════════════════════════════════════════════════╣');
  for (const [id, r] of Object.entries(results)) {
    if (r.error) console.log(`║  Tabla ${id}: ✗ ERROR — ${r.error.substring(0,40)}`);
    else console.log(`║  Tabla ${id}: ✓ ${r.munis} municipios, ${r.rows} filas`);
  }
  console.log(`║  Total: ${files.length} archivos, ${(totalKB/1024).toFixed(1)} MB`);
  console.log('╚═══════════════════════════════════════════════════╝');

  const errors = Object.values(results).filter(r => r.error);
  if (errors.length > 0) {
    console.log(`\n⚠ ${errors.length} tabla(s) fallaron. Ejecuta de nuevo para reintentar.`);
  } else {
    console.log('\n✅ Todas las descargas completadas correctamente.');
    console.log('   Proximo paso: node etl_municipios_cv.js (pendiente crear)');
  }
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
