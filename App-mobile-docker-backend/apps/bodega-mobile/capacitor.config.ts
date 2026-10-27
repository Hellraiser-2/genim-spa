import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rockstar.bodega',
  appName: 'Rockstar Bodega',
  webDir: 'www',
  // Mismo fondo que la app, para que no se vea un destello blanco al abrirla.
  backgroundColor: '#0b0b0e',
  // El backend de la tienda corre en la red local y se publica por HTTP, sin certificado.
  // La app se carga desde `https://localhost`, así que hay que permitirle ese tráfico.
  // Con un backend publicado por HTTPS, estas dos opciones deben quitarse.
  server: {
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // La app no se dibuja detrás de la barra de estado ni de la de navegación (index.html no
    // pide `viewport-fit=cover`): Android le deja ese espacio y ningún botón queda tapado.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'contain',
    },
  },
};

export default config;
