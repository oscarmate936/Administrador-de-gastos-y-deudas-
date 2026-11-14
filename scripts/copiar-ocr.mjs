// Copia a public/ocr los archivos que el lector de imágenes necesita para
// funcionar sin internet: el worker de Tesseract, el motor (WASM con SIMD, con
// los dos motores: LSTM y clásico) y los datos de español completos (incluyen
// el modelo clásico, que lee mejor algunos números). No se guardan en el repositorio.
import { copyFileSync, mkdirSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public', 'ocr');
mkdirSync(destino, { recursive: true });

const archivos = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
];

// Los datos de español van descomprimidos: al armar el APK, Android descomprime
// los archivos .gz y les quita la extensión, y la app no los encontraría.
const datos = join(raiz, 'node_modules/@tesseract.js-data/spa/4.0.0/spa.traineddata.gz');
if (!existsSync(datos)) throw new Error('Faltan los datos de español. Ejecuta npm install.');
const destinoDatos = join(destino, 'spa.traineddata');
const contenido = gunzipSync(readFileSync(datos));
if (!existsSync(destinoDatos) || statSync(destinoDatos).size !== contenido.length) writeFileSync(destinoDatos, contenido);
// Archivos de versiones anteriores del lector.
for (const viejo of ['spa.traineddata.gz', 'tesseract-core-simd-lstm.wasm.js']) rmSync(join(destino, viejo), { force: true });

for (const [origen, nombre] of archivos) {
  const de = join(raiz, origen);
  const a = join(destino, nombre);
  if (!existsSync(de)) throw new Error(`Falta ${origen}. Ejecuta npm install.`);
  if (existsSync(a) && statSync(a).size === statSync(de).size) continue;
  copyFileSync(de, a);
}
console.log('Archivos del lector de tickets listos en public/ocr');
