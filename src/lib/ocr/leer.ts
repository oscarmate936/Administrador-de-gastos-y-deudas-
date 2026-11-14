// Reconocimiento de texto en el dispositivo con Tesseract (sin internet: los
// archivos van dentro de la app en ./ocr). Se carga solo cuando se usa.

const LADO_MAXIMO = 2000;

export type Motor = 'lstm' | 'clasico';

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

/**
 * Lee la imagen con cada motor pedido y devuelve un texto por motor, en el
 * mismo orden. El LSTM entiende mejor las palabras; el clásico a veces lee
 * mejor los números. Comparar los dos permite detectar lecturas dudosas.
 */
export async function leerTextoDeImagen(
  archivo: File,
  alAvanzar?: (fraccion: number) => void,
  motores: Motor[] = ['lstm', 'clasico'],
): Promise<string[]> {
  const [{ createWorker, OEM }, canvas] = await Promise.all([import('tesseract.js'), prepararImagen(archivo)]);
  const base = new URL('./ocr/', document.baseURI).href;
  const textos: string[] = [];
  for (let i = 0; i < motores.length; i++) {
    const worker = await createWorker('spa', motores[i] === 'lstm' ? OEM.LSTM_ONLY : OEM.TESSERACT_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}tesseract-core-simd.wasm.js`,
      langPath: base.replace(/\/$/, ''),
      // Los datos van sin comprimir (ver scripts/copiar-ocr.mjs).
      gzip: false,
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') alAvanzar?.((i + m.progress) / motores.length);
      },
    });
    try {
      textos.push((await worker.recognize(canvas)).data.text);
    } finally {
      await worker.terminate();
    }
  }
  return textos;
}
