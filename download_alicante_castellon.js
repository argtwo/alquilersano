/**
 * download_alicante_castellon.js
 * 
 * Descarga tablas ADRH del INE para Alicante (03) y Castellon (12)
 * Usa el mismo patron que Valencia (46) pero con los IDs de tabla correctos.
 * 
 * Las tablas del INE van por provincia. El patron de IDs:
 *   Provincia 02 (Albacete): 30656 (renta), 30814 (demog), 30813 (fuentes)...
 *   Provincia 08 (Barcelona): 30896 (renta)
 *   Provincia 28 (Madrid):    31097 (renta) 
 *   Provincia 46 (Valencia):  31250 (renta), 31249 (demog), 31251 (fuentes)
 *
 * Para encontrar Alicante(03) y Castellon(12), el script prueba tablas
 * y detecta automaticamente cual corresponde a cada provincia.
 *
 * USO: cd G:\Proyectos\alquiler && node --max-old-space-size=4096 download_alicante_castellon.js
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
