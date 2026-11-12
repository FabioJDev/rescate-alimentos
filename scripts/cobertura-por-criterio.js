// Genera docs/qa/cobertura-por-criterio.md: para cada criterio de docs/spec/comportamientos.md, qué archivos de
// tests/ tienen pruebas que nombran su identificador y cuántas. Uso: npm run cobertura:criterios
// Si un criterio queda sin prueba, el script termina con error para que se note.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const especificacion = fs.readFileSync(path.join(raiz, 'docs/spec/comportamientos.md'), 'utf8');
const carpetaPruebas = path.join(raiz, 'tests');

// Cada criterio con su comportamiento: «## CMP-03 · …» seguido de «- **CA-03.1** …».
const criterios = [];
let comportamiento = null;
for (const linea of especificacion.split(/\r?\n/)) {
  const titulo = /^## ((?:CMP-\d+|T-SEG\.\d+) · .+)$/.exec(linea);
  if (titulo) comportamiento = titulo[1];
  else if (/^## /.test(linea)) comportamiento = null;
  const ca = /^- \*\*(CA-(?:\d+|SEG)\.\d+)\*\*/.exec(linea);
  if (ca && comportamiento) criterios.push({ id: ca[1], comportamiento });
}

// Cuántas pruebas nombran cada criterio, por archivo. Se leen los nombres de test('…') y test.each(…)('…'); los
// identificadores van antes del « · » (una prueba puede nombrar dos: «CA-05.3 y CA-02.4 · …»).
const archivos = fs.readdirSync(carpetaPruebas).filter((a) => a.endsWith('.test.js')).sort();
const nombradosPor = {}; // archivo → { 'CA-03.2': 4, … }
for (const archivo of archivos) {
  const texto = fs.readFileSync(path.join(carpetaPruebas, archivo), 'utf8');
  const conteo = {};
  // test.each recibe una lista escrita ([…]) o el nombre de una variable (test.each(camposObligatorios)).
  for (const m of texto.matchAll(/\btest(?:\.each\((?:\[[\s\S]*?\]|[A-Za-z_$][\w$]*)\))?\(\s*['`"]([^'`"]+)['`"]/g)) {
    const cabeza = m[1].split(' · ')[0];
    for (const id of cabeza.match(/CA-(?:\d+|SEG)\.\d+/g) || []) conteo[id] = (conteo[id] || 0) + 1;
  }
  nombradosPor[archivo] = conteo;
}
function pruebasDe(id) {
  return archivos
    .map((a) => ({ archivo: a, cantidad: nombradosPor[a][id] || 0 }))
    .filter((x) => x.cantidad > 0);
}

const lineas = [
  '# Cobertura de pruebas por criterio',
  '',
  'Generado con `npm run cobertura:criterios` a partir de `docs/spec/comportamientos.md` y de los nombres de las pruebas',
  'en `tests/`. Cada prueba empieza con el identificador del criterio que cubre (por ejemplo, `CA-03.2 · …`); esta tabla',
  'cuenta cuántas lo nombran y en qué archivo. No hay que editarla a mano: se vuelve a generar.',
  '',
];
let actual = null;
let sinPrueba = 0;
for (const c of criterios) {
  if (c.comportamiento !== actual) {
    actual = c.comportamiento;
    lineas.push('', `## ${actual}`, '', '| Criterio | Pruebas | Archivos |', '|---|---|---|');
  }
  const encontradas = pruebasDe(c.id);
  const total = encontradas.reduce((s, x) => s + x.cantidad, 0);
  if (total === 0) sinPrueba += 1;
  const donde = encontradas.map((x) => `\`tests/${x.archivo}\``).join(', ') || '**sin prueba**';
  lineas.push(`| ${c.id} | ${total} | ${donde} |`);
}
lineas.splice(6, 0, `**${criterios.length} criterios, ${criterios.length - sinPrueba} con al menos una prueba que los nombra.**`, '');

fs.writeFileSync(path.join(raiz, 'docs/qa/cobertura-por-criterio.md'), `${lineas.join('\n')}\n`);
console.log(`${criterios.length} criterios; ${sinPrueba} sin prueba. Escrito en docs/qa/cobertura-por-criterio.md`);
if (sinPrueba > 0) process.exit(1);
