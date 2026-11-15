import { Capacitor, registerPlugin } from '@capacitor/core';

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

// ---------- Recordatorios ----------

export type EstadoPermiso = 'concedido' | 'negado' | 'sin-preguntar' | 'no-disponible';

/** Permiso de notificaciones. Con `pedir`, lo solicita si aún no se preguntó. */
export async function permisoNotificaciones(pedir: boolean): Promise<EstadoPermiso> {
  if (!esNativo) return 'no-disponible';
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let { display } = await LocalNotifications.checkPermissions();
  if (pedir && display !== 'granted' && display !== 'denied') {
    marcarSalidaPropia();
    ({ display } = await LocalNotifications.requestPermissions());
  }
  return display === 'granted' ? 'concedido' : display === 'denied' ? 'negado' : 'sin-preguntar';
}

let canalListo = false;

/** Los botones de cada clase de aviso. */
const TIPOS_DE_ACCIONES = [
  { id: 'PAGO', actions: [{ id: 'pagar', title: 'Registrar pago' }] },
  {
    id: 'PAGO_DIRECTO',
    actions: [
      { id: 'yaPague', title: 'Ya pagué' },
      { id: 'pagar', title: 'Otro monto' },
    ],
  },
  {
    id: 'PAGO_TARJETA',
    actions: [
      { id: 'yaPague', title: 'Pagué el total' },
      { id: 'pagar', title: 'Otro monto' },
    ],
  },
  {
    id: 'PAGO_TARJETA_MINIMO',
    actions: [
      { id: 'yaPague', title: 'Pagué el total' },
      { id: 'pagueMinimo', title: 'Pagué el mínimo' },
      { id: 'pagar', title: 'Otro monto' },
    ],
  },
];

/** Id fijo del aviso de prueba: no se borra al reprogramar los demás. */
const ID_PRUEBA = 7;

/** Crea el canal y los botones de los avisos (una vez por sesión). */
async function prepararCanal(): Promise<void> {
  if (canalListo) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.createChannel({
    id: 'pagos',
    name: 'Recordatorios de pago',
    description: 'Fechas de pago, cortes de tarjeta y respaldos',
    importance: 4,
    visibility: 0,
  });
  await LocalNotifications.registerActionTypes({ types: TIPOS_DE_ACCIONES });
  canalListo = true;
}

/** Reemplaza todas las notificaciones agendadas por estas. */
export async function agendarNotificaciones(
  lista: Array<{ id: number; fecha: Date; titulo: string; cuerpo: string; pagar?: boolean; pagoDirecto?: unknown; destino?: unknown }>,
): Promise<void> {
  if (!esNativo) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const pendientes = (await LocalNotifications.getPending()).notifications.filter((n) => n.id !== ID_PRUEBA);
  if (pendientes.length > 0) {
    await LocalNotifications.cancel({ notifications: pendientes.map((n) => ({ id: n.id })) });
  }
  if (lista.length === 0) return;
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
  await prepararCanal();
  await LocalNotifications.schedule({
    notifications: lista.map((r) => ({
      id: r.id,
      title: r.titulo,
      body: r.cuerpo,
      largeBody: r.cuerpo,
      channelId: 'pagos',
      schedule: { at: r.fecha, allowWhileIdle: true },
      actionTypeId: tipoDeAcciones(r),
      extra: { destino: r.destino ?? null, pagar: r.pagar === true, pago: r.pagoDirecto ?? null },
    })),
  });
}

/**
 * Aviso de prueba en un minuto, con los botones «Ya pagué» y «Otro monto», para
 * comprobar en el celular que llegan y abren la app. No registra nada.
 */
export async function avisoDePrueba(): Promise<boolean> {
  if (!esNativo) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if ((await permisoNotificaciones(true)) !== 'concedido') return false;
  await prepararCanal();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: ID_PRUEBA,
        title: 'Aviso de prueba de Mis Finanzas',
        body: 'Toca «Ya pagué» para comprobar que el botón abre la app. No se registra nada.',
        channelId: 'pagos',
        schedule: { at: new Date(Date.now() + 60_000), allowWhileIdle: true },
        actionTypeId: 'PAGO_DIRECTO',
        extra: { prueba: true },
      },
    ],
  });
  return true;
}

/** Si Android deja usar alarmas exactas (sin ellas, los avisos pueden llegar tarde). null fuera de Android. */
export async function alarmasExactas(): Promise<boolean | null> {
  if (!esNativo) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
  } catch {
    return null;
  }
}

/** Abre el ajuste de Android para permitir alarmas exactas. */
export async function pedirAlarmasExactas(): Promise<boolean> {
  if (!esNativo) return false;
  marcarSalidaPropia();
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === 'granted';
}

/** Qué botones lleva el aviso: «Ya pagué» en préstamos; total, mínimo u otro monto en tarjetas. */
function tipoDeAcciones(r: { pagar?: boolean; pagoDirecto?: unknown }): string | undefined {
  const directo = r.pagoDirecto as { tipo?: string; conMinimo?: boolean } | undefined;
  if (directo?.tipo === 'tarjeta') return directo.conMinimo ? 'PAGO_TARJETA_MINIMO' : 'PAGO_TARJETA';
  if (directo) return 'PAGO_DIRECTO';
  return r.pagar ? 'PAGO' : undefined;
}

/** Avisa cuando la persona toca una notificación o uno de sus botones. */
export function escucharNotificaciones(
  alTocar: (extra: { destino: unknown; pagar: boolean; yaPague: boolean; minimo: boolean; pago: unknown; prueba: boolean }) => void,
): () => void {
  if (!esNativo) return () => {};
  let cancelado = false;
  let quitar: (() => void) | undefined;
  void import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    const escucha = await LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
      const extra = (notification.extra ?? {}) as { destino?: unknown; pago?: unknown; prueba?: boolean };
      alTocar({
        destino: extra.destino ?? null,
        pagar: actionId === 'pagar',
        yaPague: actionId === 'yaPague' || actionId === 'pagueMinimo',
        minimo: actionId === 'pagueMinimo',
        pago: extra.pago ?? null,
        prueba: extra.prueba === true,
      });
    });
    if (cancelado) void escucha.remove();
    else quitar = () => void escucha.remove();
  });
  return () => {
    cancelado = true;
    quitar?.();
  };
}

// ---------- Vibración ----------

/** Vibración corta para confirmar algo sin mirar (guardar, pagar). En el navegador no hace nada. */
export async function vibrar(tipo: 'ligera' | 'exito' = 'ligera'): Promise<void> {
  if (!esNativo) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (tipo === 'exito') await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Sin vibrador o sin el complemento, no pasa nada.
  }
}

// ---------- Atajos del ícono ----------

export type Atajo = 'gasto' | 'ticket' | 'pago';

/** "misfinanzas://agregar/gasto" o "?atajo=gasto" → 'gasto'. */
export function atajoDeUrl(url: string): Atajo | null {
  const m = /^misfinanzas:\/\/agregar\/(gasto|ticket|pago)\/?$/.exec(url) ?? /[?&]atajo=(gasto|ticket|pago)(?:&|$)/.exec(url);
  return m ? (m[1] as Atajo) : null;
}

/**
 * Atajos al mantener presionado el ícono de la app (Android) o del acceso
 * directo de la versión web. Llama `alAtajo` con el que se eligió, también si
 * la app se abrió con él.
 */
export function escucharAtajos(alAtajo: (a: Atajo) => void): () => void {
  if (!esNativo) {
    const a = atajoDeUrl(location.search);
    if (a) {
      alAtajo(a);
      // Que recargar la página no repita el atajo.
      history.replaceState(null, '', location.pathname + location.hash);
    }
    return () => {};
  }
  let cancelado = false;
  let quitar: (() => void) | undefined;
  void import('@capacitor/app').then(async ({ App }) => {
    const inicio = await App.getLaunchUrl();
    const a = inicio?.url ? atajoDeUrl(inicio.url) : null;
    if (a && !cancelado) alAtajo(a);
    const escucha = await App.addListener('appUrlOpen', ({ url }) => {
      const b = atajoDeUrl(url);
      if (b) alAtajo(b);
    });
    if (cancelado) void escucha.remove();
    else quitar = () => void escucha.remove();
  });
  return () => {
    cancelado = true;
    quitar?.();
  };
}

// ---------- Widget de la pantalla principal ----------

interface PluginWidget {
  actualizar(datos: { etiqueta: string; monto: string; detalle: string; oculto: boolean }): Promise<void>;
}

/** Complemento propio del APK (android/.../WidgetPlugin.java). */
const Widget = registerPlugin<PluginWidget>('Widget');

/** Manda al widget la cifra de Inicio. Con bloqueo, el widget la oculta. */
export async function actualizarWidget(datos: { etiqueta: string; monto: string; detalle: string; oculto: boolean }): Promise<void> {
  if (!esNativo) return;
  try {
    await Widget.actualizar(datos);
  } catch {
    // Un APK sin el widget (o un error al guardar) no debe afectar a la app.
  }
}
