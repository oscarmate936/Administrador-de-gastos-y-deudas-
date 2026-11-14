// Copia a public/ocr los archivos que el lector de tickets necesita para
// funcionar sin internet: el worker de Tesseract, el motor (WASM con SIMD,
// solo LSTM) y los datos de español. No se guardan en el repositorio.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'ocr');
mkdirSync(destino, { recursive: true });

const archivos = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', 'spa.traineddata.gz'],
];

for (const [origen, nombre] of archivos) {
  const de = join(raiz, origen);
  const a = join(destino, nombre);
  if (!existsSync(de)) throw new Error(`Falta ${origen}. Ejecuta npm install.`);
  if (existsSync(a) && statSync(a).size === statSync(de).size) continue;
  copyFileSync(de, a);
}
console.log('Archivos del lector de tickets listos en public/ocr');
