import { ErrorEstado } from './leer';
import type { Pagina } from './tipos';

/**
 * Extrae el texto de un PDF con su posición, dentro del dispositivo (no se
 * envía a ningún servidor). PDF.js se carga solo cuando hace falta.
 * Lanza AbortError si la persona cancela la contraseña.
 */
export async function extraerPaginas(archivo: File): Promise<Pagina[]> {
  const [pdfjs, { default: urlWorker }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker;

  const tarea = pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
    verbosity: 0,
  });
  let cancelado = false;
  tarea.onPassword = (darClave: (clave: string) => void, motivo: number) => {
    const incorrecta = motivo === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    const clave = window.prompt(
      incorrecta ? 'La contraseña no es correcta. Inténtalo de nuevo:' : 'Este PDF tiene contraseña. Escríbela para abrirlo:',
    );
    if (clave === null) {
      cancelado = true;
      void tarea.destroy();
      return;
    }
    darClave(clave);
  };

  let documento;
  try {
    documento = await tarea.promise;
  } catch (e) {
    if (cancelado) throw new DOMException('Cancelado', 'AbortError');
    const nombre = e instanceof Error ? e.name : '';
    throw new ErrorEstado(nombre === 'InvalidPDFException' ? 'El archivo no es un PDF válido.' : 'No pude abrir el PDF.');
  }

  try {
    const paginas: Pagina[] = [];
    for (let n = 1; n <= documento.numPages; n++) {
      const contenido = await (await documento.getPage(n)).getTextContent();
      const items = [];
      for (const i of contenido.items) {
        if (!('str' in i) || !i.str.trim()) continue;
        items.push({ texto: i.str, x: i.transform[4], y: i.transform[5], ancho: i.width });
      }
      paginas.push({ items });
    }
    return paginas;
  } finally {
    void tarea.destroy();
  }
}
