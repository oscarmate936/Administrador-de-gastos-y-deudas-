import { Capacitor } from '@capacitor/core';

// Lo que cambia cuando la app corre instalada como APK (Capacitor) en vez de
// en el navegador. Los plugins se cargan solo en ese caso.

export const esNativo = Capacitor.isNativePlatform();

// Abrir el selector de archivos o el menú de compartir manda la app a segundo
// plano. Esa salida la provoca la propia app y no debe pedir el PIN al volver.
let salidaPropia = false;
export const marcarSalidaPropia = () => {
  salidaPropia = true;
};
export const consumirSalidaPropia = () => {
  const v = salidaPropia;
  salidaPropia = false;
  return v;
};

/**
 * Entrega un archivo a la persona: en Android abre el menú de compartir
 * (Drive, WhatsApp, Archivos...); en el navegador comparte o descarga.
 * Lanza AbortError si la persona cancela.
 */
export async function entregarArchivo(nombre: string, contenido: string, tipo: string): Promise<void> {
  marcarSalidaPropia();
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

// ---------- Bloqueo ----------

/** true si el dispositivo tiene huella o rostro configurado. */
export async function huellaDisponible(): Promise<boolean> {
  if (!esNativo) return false;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    return (await NativeBiometric.isAvailable({ useFallback: false })).isAvailable;
  } catch {
    return false;
  }
}

/** Pide la huella o el rostro. true si la persona se identificó. */
export async function verificarHuella(): Promise<boolean> {
  if (!esNativo) return false;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    await NativeBiometric.verifyIdentity({
      title: 'Mis Finanzas',
      subtitle: 'Desbloquea con tu huella',
      negativeButtonText: 'Usar PIN',
      maxAttempts: 3,
    });
    return true;
  } catch {
    return false;
  }
}

/** Oculta el contenido en la lista de apps recientes mientras el bloqueo está activo. */
export async function pantallaPrivada(activa: boolean): Promise<void> {
  if (!esNativo) return;
  try {
    const { PrivacyScreen } = await import('@capacitor-community/privacy-screen');
    await (activa ? PrivacyScreen.enable() : PrivacyScreen.disable());
  } catch {
    // Sin el complemento la app sigue funcionando; solo no oculta la vista previa.
  }
}

/**
 * Avisa cuando la app pasa a segundo plano (false) o vuelve (true).
 * Devuelve la función para dejar de escuchar.
 */
export function escucharPrimerPlano(alCambiar: (activa: boolean) => void): () => void {
  if (!esNativo) {
    const f = () => alCambiar(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }
  let cancelado = false;
  let quitar: (() => void) | undefined;
  void import('@capacitor/app').then(async ({ App }) => {
    const escucha = await App.addListener('appStateChange', ({ isActive }) => alCambiar(isActive));
    if (cancelado) void escucha.remove();
    else quitar = () => void escucha.remove();
  });
  return () => {
    cancelado = true;
    quitar?.();
  };
}
