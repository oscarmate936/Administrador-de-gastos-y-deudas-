import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sv.misfinanzas.app',
  appName: 'Mis Finanzas',
  webDir: 'dist',
  plugins: {
    // Se activa desde la app solo si el bloqueo está encendido.
    PrivacyScreen: { enable: false },
    LocalNotifications: { smallIcon: 'ic_stat_notificacion', iconColor: '#0F6B54' },
    SystemBars: {
      // La app dibuja detrás de las barras del sistema y usa env(safe-area-inset-*).
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
