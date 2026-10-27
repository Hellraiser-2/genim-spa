import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rockstar.pos',
  appName: 'Rockstar POS',
  webDir: 'dist',
  // Mismo fondo que la app: es el que se ve detrás de las barras del sistema.
  backgroundColor: '#121212',
  // El backend corre en la red local y se publica por HTTP, sin certificado. La app se
  // carga desde `https://localhost`, así que hay que permitirle ese tráfico, igual que en
  // la app de bodega. Con un backend publicado por HTTPS, estas dos opciones deben quitarse.
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
