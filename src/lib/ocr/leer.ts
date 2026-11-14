// Reconocimiento de texto en el dispositivo con Tesseract (sin internet: los
// archivos van dentro de la app en ./ocr). Se carga solo cuando se usa.

const LADO_MAXIMO = 1800;

/** Escala y pasa a grises la imagen para leer más rápido y mejor. */
async function prepararImagen(archivo: File): Promise<HTMLCanvasElement> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagen.width * escala);
  canvas.height = Math.round(imagen.height * escala);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = 'grayscale(1) contrast(1.25)';
  ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
  imagen.close();
  return canvas;
}

export async function leerTextoDeImagen(archivo: File, alAvanzar?: (fraccion: number) => void): Promise<string> {
  const [{ createWorker, OEM }, canvas] = await Promise.all([import('tesseract.js'), prepararImagen(archivo)]);
  const base = new URL('./ocr/', document.baseURI).href;
  const worker = await createWorker('spa', OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}tesseract-core-simd-lstm.wasm.js`,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') alAvanzar?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
