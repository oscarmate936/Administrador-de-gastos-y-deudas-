import { Capacitor } from '@capacitor/core';

// Lo que cambia cuando la app corre instalada como APK (Capacitor) en vez de
// en el navegador. Los plugins se cargan solo en ese caso.

export const esNativo = Capacitor.isNativePlatform();

/**
 * Entrega un archivo a la persona: en Android abre el menú de compartir
 * (Drive, WhatsApp, Archivos...); en el navegador comparte o descarga.
 * Lanza AbortError si la persona cancela.
 */
export async function entregarArchivo(nombre: string, contenido: string, tipo: string): Promise<void> {
  if (esNativo) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: nombre,
      data: contenido,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: nombre, files: [uri] });
    } catch (e) {
      // El plugin rechaza con "Share canceled" cuando se cierra el menú sin elegir.
      if (e instanceof Error && /cancel/i.test(e.message)) {
        throw new DOMException('Cancelado', 'AbortError');
      }
      throw e;
    }
    return;
  }

  const archivo = new File([contenido], nombre, { type: tipo });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      // Si compartir falla por otra razón, se descarga el archivo.
    }
  }
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

/**
 * Botón Atrás de Android. `alRetroceder` devuelve true si hizo algo
 * (cerrar un formulario, volver a Inicio); si no, la app se minimiza.
 * Devuelve la función para dejar de escuchar.
 */
export function escucharBotonAtras(alRetroceder: () => boolean): () => void {
  if (!esNativo) return () => {};
  let cancelado = false;
  let quitar: (() => void) | undefined;
  void import('@capacitor/app').then(async ({ App }) => {
    const escucha = await App.addListener('backButton', () => {
      if (!alRetroceder()) void App.minimizeApp();
    });
    if (cancelado) void escucha.remove();
    else quitar = () => void escucha.remove();
  });
  return () => {
    cancelado = true;
    quitar?.();
  };
}
