// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Determinismo visual en e2e: desactiva animaciones/transiciones CSS.
// (En Electron headless el reloj de animaciones puede congelarse en t=0,
// dejando estados de entrada como `fade-in` en opacidad 0 y rompiendo
// chequeos de visibilidad. En navegadores reales las animaciones corren.)
Cypress.on('window:before:load', (win) => {
  const style = win.document.createElement('style');
  style.setAttribute('data-cypress', 'no-anim');
  style.innerHTML =
    '*, *::before, *::after { animation: none !important; transition: none !important; }';
  win.document.head.appendChild(style);
});

// Alternatively you can use CommonJS syntax:
// require('./commands')