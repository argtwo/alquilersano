/**
 * download_alicante_castellon.js
 * 
 * Descarga tablas ADRH del INE para Alicante (03) y Castellon (12).
 * Primero detecta automaticamente los IDs de tabla para cada provincia.
 * 
 * USO: cd G:\Proyectos\alquiler && node --max-old-space-size=4096 download_alicante_castellon.js
 * 
 * Prerequisito: haber ejecutado download_all_nacional.js (para tener el GeoJSON de CV)
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
      r.on('data', c => { d += c; sz += c.length; if (sz % (5*1024*1024) < c.length) process.stdout.write(` ${(sz/1024/1024).toFixed(0)}MB..`); });
      r.on('end', () => { if (sz > 1024*1024) console.log(` done (${(sz/1024/1024).toFixed(1)}MB)`); res(d); });
    }).on('error', rej);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function saveFile(name, content) {
  const fp = path.join(OUT, name);
  fs.writeFileSync(fp, content, 'utf8');
  console.log(`  Saved: ${name} (${(fs.statSync(fp).size/1024).toFixed(0)} KB)`);
}

// Parse INE JSON response to CSV
function ineJsonToCsv(data) {
  const rows = ['codigo_ine;municipio;indicador;anyo;valor'];
  const muniSet = new Set();
  const indSet = new Set();
  for (const entry of data) {
    let muniMeta = entry.MetaData.find(m => m.T3_Variable === 'Municipios');
    if (!muniMeta) muniMeta = entry.MetaData.find(m => m.Codigo && /^\d{5}$/.test(m.Codigo));
    if (!muniMeta || !muniMeta.Codigo || muniMeta.Codigo.length > 5) continue;
    const skip = new Set(['Municipios','Tipo de dato','Sexo','Total Nacional','Distritos','Secciones']);
    const indMeta = entry.MetaData.find(m => !skip.has(m.T3_Variable) && m.Nombre);
    const indicator = indMeta ? indMeta.Nombre : 'unknown';
    muniSet.add(muniMeta.Codigo);
    indSet.add(indicator);
    for (const d of entry.Data) {
      if (d.Valor !== null && d.Valor !== undefined) {
        rows.push(`${muniMeta.Codigo};${muniMeta.Nombre};${indicator};${d.Anyo};${d.Valor}`);
      }
    }
  }
  return { csv: rows.join('\n'), munis: muniSet.size, rows: rows.length - 1, indicators: [...indSet] };
}

// Detect which table ID corresponds to which province
async function findTableForProvince(tableIds, targetProv) {
  for (const id of tableIds) {
    const rawPath = path.join(OUT, `ine_${id}_raw.json`);
    // If already downloaded, check province from raw
    if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 5000) {
      const d = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
      const m = d[0] && d[0].MetaData.find(m => m.T3_Variable === 'Municipios' || (m.Codigo && /^\d{5}$/.test(m.Codigo)));
      if (m && m.Codigo.startsWith(targetProv)) return id;
      continue;
    }
    // Quick probe: download with nult=1 to check province
    process.stdout.write(`  Probing ${id}...`);
    try {
      const url = `https://servicios.ine.es/wstempus/jsCache/ES/DATOS_TABLA/${id}?tip=AM&nult=1`;
      const raw = await fetchUrl(url);
      const d = JSON.parse(raw);
      const withMuni = d.find(e => e.MetaData.some(m => m.T3_Variable === 'Municipios'));
      if (withMuni) {
        const m = withMuni.MetaData.find(m => m.T3_Variable === 'Municipios');
        const prov = m.Codigo.substring(0, 2);
        console.log(` → provincia ${prov} (${m.Nombre})`);
        if (prov === targetProv) return id;
      }
    } catch(e) { console.log(` err`); }
    await sleep(1500);
  }
  return null;
}

async function downloadTable(tableId, label, provCode) {
  const rawPath = path.join(OUT, `ine_${tableId}_raw.json`);
  let data;
  if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 5000) {
    console.log(`  [${tableId}] ${label} — ya descargada, reprocesando...`);
    data = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  } else {
    console.log(`  [${tableId}] Descargando ${label}...`);
    process.stdout.write(`  `);
    const url = `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${tableId}?tip=AM&nult=9`;
    const raw = await fetchUrl(url);
    data = JSON.parse(raw);
    fs.writeFileSync(rawPath, raw, 'utf8');
  }
  console.log(`  Series: ${data.length}`);
  const result = ineJsonToCsv(data);
  const filename = `ine_${tableId}_${provCode === '03' ? 'alicante' : 'castellon'}.csv`;
  saveFile(filename, result.csv);
  console.log(`  Municipios: ${result.munis} | Filas: ${result.rows}`);
  return result;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  AlquilerSano — Descarga ADRH Alicante + Castellon    ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // Known table IDs for "Indicadores de renta media y mediana" across provinces
  // Pattern: each province has a block of ~9 consecutive table IDs
  // Valencia(46) = 31250. We need to find Alicante(03) and Castellon(12).
  // Province order in INE: 02,03,04,05,...08,...12,...28,...46,...
  // Known: 30656=02(Albacete), 30896=08(Barcelona), 31250=46(Valencia)
  // Alicante=03 is right after 02, Castellon=12 is between 08 and 28

  // All "Indicadores de renta media y mediana" table IDs
  const rentaTableIds = [
    30656,30824,30833,30842,30851,30860,30869,30878,30887,30896,
    30917,30926,30935,30944,30953,30962,30971,30980,30989,30998,
    31007,31016,31025,31034,31043,31052,31061,31070,31079,31088,
    31097,31106,31115,31124,31133,31142,31151,31160,31169,31178,
    31187,31196,31205,31214,31223,31232,31241,31250,31259,31268,
    31277,31286,31295,53689
  ];

  // Province 02=Albacete is index 0 (ID 30656)
  // Province order follows INE province codes: 01,02,03,04,05...
  // So 03=Alicante should be index 1 or 2, and 12=Castellon around index 7-10
  // Let's probe to find them
  
  const targets = [
    { prov: '03', name: 'Alicante', hint: rentaTableIds.slice(0, 5) },
    { prov: '12', name: 'Castellon', hint: rentaTableIds.slice(5, 15) },
  ];

  const foundTables = {};

  for (const t of targets) {
    console.log(`\n── Buscando tablas para ${t.name} (provincia ${t.prov}) ──`);
    
    // Find renta table
    console.log('  Buscando tabla renta...');
    const rentaId = await findTableForProvince(t.hint, t.prov);
    if (!rentaId) {
      // Try all
      console.log('  No encontrada en hint, probando todas...');
      const allId = await findTableForProvince(rentaTableIds, t.prov);
      if (!allId) { console.log(`  ✗ No se encontro tabla renta para ${t.name}`); continue; }
      foundTables[t.prov] = { renta: allId };
    } else {
      foundTables[t.prov] = { renta: rentaId };
    }
    console.log(`  ✓ Renta: tabla ${foundTables[t.prov].renta}`);

    // Once we find renta ID, the other tables are at known offsets
    // Pattern from Valencia: renta=31250, demog=31249, fuentes=31251, pobFija=31252, pobRel=31255
    // Offsets: demog=-1, fuentes=+1, pobFija=+2, pobRel=+5
    const base = foundTables[t.prov].renta;
    foundTables[t.prov].demog = base - 1;
    foundTables[t.prov].fuentes = base + 1;
    foundTables[t.prov].pobFija = base + 2;
    foundTables[t.prov].pobRel = base + 5;
    
    console.log(`  Tablas inferidas: demog=${base-1}, fuentes=${base+1}, pobFija=${base+2}, pobRel=${base+5}`);
    
    // Download all tables for this province
    const tables = [
      { id: foundTables[t.prov].renta, label: 'Renta media y mediana' },
      { id: foundTables[t.prov].demog, label: 'Indicadores demograficos' },
      { id: foundTables[t.prov].fuentes, label: 'Fuentes de ingreso' },
      { id: foundTables[t.prov].pobRel, label: 'Pobreza umbrales relativos' },
    ];
    
    for (const tbl of tables) {
      try {
        await downloadTable(tbl.id, tbl.label, t.prov);
      } catch(e) {
        console.log(`  ✗ Error tabla ${tbl.id}: ${e.message}`);
      }
      await sleep(2000);
    }
  }

  // Also find Gini tables for both provinces
  // Gini tables have different IDs (37xxx range)
  const giniTableIds = [
    37607,37608,37677,37678,37679,37680,37682,37683,37684,37685,
    37686,37687,37688,37689,37690,37691,37692,37693,37694,37695,
    37697,37698,37699,37700,37701,37702,37703,37704,37705,37706,
    37707,37708,37709,37710,37711,37712,37713,37714,37715,37716,
    37717,37718,37719,37720,37721,37722,37723,37724,37727,37730,
    37731,37732,37733,53688
  ];
  
  for (const t of targets) {
    if (!foundTables[t.prov]) continue;
    console.log(`\n── Buscando Gini para ${t.name} ──`);
    const giniId = await findTableForProvince(giniTableIds, t.prov);
    if (giniId) {
      foundTables[t.prov].gini = giniId;
      console.log(`  ✓ Gini: tabla ${giniId}`);
      try {
        await downloadTable(giniId, 'Indice Gini', t.prov);
      } catch(e) {
        console.log(`  ✗ Error Gini: ${e.message}`);
      }
    } else {
      console.log(`  ✗ No se encontro tabla Gini para ${t.name}`);
    }
    await sleep(2000);
  }

  // ── RESUMEN ──
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║              RESULTADO DESCARGA                        ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  for (const [prov, tables] of Object.entries(foundTables)) {
    const name = prov === '03' ? 'Alicante' : 'Castellon';
    console.log(`║  ${name} (${prov}):`);
    for (const [type, id] of Object.entries(tables)) {
      const csvFile = `ine_${id}_${prov === '03' ? 'alicante' : 'castellon'}.csv`;
      const csvPath = path.join(OUT, csvFile);
      if (fs.existsSync(csvPath)) {
        const lines = fs.readFileSync(csvPath, 'utf8').split('\n').length - 1;
        console.log(`║    ${type.padEnd(10)}: tabla ${id} → ${csvFile} (${lines} filas)`);
      } else {
        console.log(`║    ${type.padEnd(10)}: tabla ${id} → NO DESCARGADA`);
      }
    }
  }
  
  const files = fs.readdirSync(OUT).filter(f => f.includes('alicante') || f.includes('castellon')).sort();
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  Archivos nuevos: ${files.length}`);
  files.forEach(f => {
    const kb = (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0);
    console.log(`║    ${f} (${kb} KB)`);
  });
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('\nProximo paso: adaptar etl_municipios_cv.js para cargar Alicante y Castellon');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
