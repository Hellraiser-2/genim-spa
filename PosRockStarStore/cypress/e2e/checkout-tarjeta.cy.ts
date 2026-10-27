/// <reference types="cypress" />

export {};

// En la tienda la tarjeta se pasa por el terminal físico: el POS solo registra el medio.
const comprobante = (idVenta: number, medioPago: { codigo: string; nombre: string }, ubicacion = 'SALA_VENTAS') => ({
  idVenta,
  fecha: new Date().toISOString(),
  vendedor: 'Vendedor Test',
  cliente: 'Cliente Mostrador',
  medioPago,
  lineas: [
    { idVariante: 1, sku: 'POL-NEG-M', producto: 'Polera Rockstar', talla: 'M', color: 'Negro', cantidad: 1, precioUnitario: 15000, subtotal: 15000, ubicacion },
  ],
  total: 15000,
});

const DEBITO = { codigo: 'DEBITO_PRESENCIAL', nombre: 'Tarjeta de débito' };

function venderUnaPolera(medio: string) {
  cy.visit('/login');
  cy.wait('@salud');
  cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
  cy.get('#login-password input').clear().type('password123');
  cy.get('ion-button[type="submit"]').click();
  cy.wait('@login');
  cy.wait('@catalogo');

  cy.get('.scan-input').type('POL-NEG-M{enter}');

  cy.get('ion-button.cobrar-button').click();
  cy.contains('ion-button', 'Identificar cliente').click();
  cy.get('.cliente-form').within(() => {
    cy.get('#cliente-email input').clear().type('cliente@rockstar.cl');
    cy.get('#cliente-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
  });
  cy.wait('@login');

  cy.contains('Medio de pago').should('be.visible');
  cy.get('[data-medio="TARJETA"]').click();
  cy.get(`ion-radio[value="${medio}"]`).click();
  cy.contains('Confirmar y pagar').click();
}

describe('POS - Cobro con tarjeta', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo-integracion.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', (req) => {
      const email = String((req.body && req.body.email) || '').toLowerCase();
      if (email === 'cliente@rockstar.cl') {
        req.reply({
          accessToken: 'client-token-123',
          refreshToken: 'client-refresh-123',
          usuario: { id: 2, nombre: 'Cliente Mostrador', email: 'cliente@rockstar.cl', rol: 'CLIENTE' }
        });
      } else {
        req.reply({
          accessToken: 'vendor-token-123',
          refreshToken: 'refresh-123',
          usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' }
        });
      }
    }).as('login');
    cy.intercept('GET', '/api/v1/ventas/pos', [comprobante(101, DEBITO)]).as('ventasDelDia');
  });

  it('debe registrar la venta con débito → boleta emitida, carrito vacío', () => {
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(101, DEBITO)).as('venta');

    venderUnaPolera('DEBITO_PRESENCIAL');

    cy.wait('@venta').its('request.body.medioPago').should('equal', 'DEBITO_PRESENCIAL');
    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('.boleta-info').should('contain', 'Tarjeta de débito');
    cy.get('ion-button.boleta-cerrar-btn').click();
    cy.get('.carrito-vacio').should('be.visible');
  });

  it('debe ofrecer retirar de bodega lo que no alcanza en sala y reenviar con la misma clave', () => {
    const cuerpos: Array<{ claveIdempotencia: string; lineas: Array<{ permitirBodega?: boolean }> }> = [];
    cy.intercept('POST', '/api/v1/ventas/pos', (req) => {
      cuerpos.push(req.body);
      if (cuerpos.length === 1) {
        req.reply(409, {
          codigo: 'EXISTENCIA_EN_BODEGA',
          mensaje: 'Polera Rockstar talla M no alcanza en la sala de ventas: hay que retirarla de bodega.',
          detalle: [{ idVariante: 1, producto: 'Polera Rockstar', talla: 'M', enSala: 0, enBodega: 7 }],
        });
      } else {
        req.reply(comprobante(102, DEBITO, 'BODEGA'));
      }
    }).as('venta');

    venderUnaPolera('DEBITO_PRESENCIAL');

    cy.wait('@venta');
    cy.contains('Retirar desde bodega').should('be.visible');
    cy.contains('sala 0, bodega 7').should('be.visible');
    cy.contains('button', 'Retirar de bodega').click();

    cy.wait('@venta');
    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('.boleta-lineas').should('contain', 'bodega');
    cy.then(() => {
      expect(cuerpos).to.have.length(2);
      expect(cuerpos[0].lineas[0].permitirBodega).to.equal(false);
      expect(cuerpos[1].lineas[0].permitirBodega).to.equal(true);
      expect(cuerpos[1].claveIdempotencia).to.equal(cuerpos[0].claveIdempotencia);
    });
  });

  it('debe reintentar tras una falla del servidor con la misma clave → sin duplicados', () => {
    // Un 503 y no un corte de red: el navegador reintenta solo un POST cortado, y la
    // prueba necesita que el vendedor vea el error y reintente.
    const claves: string[] = [];
    cy.intercept('POST', '/api/v1/ventas/pos', (req) => {
      claves.push(req.body.claveIdempotencia);
      if (claves.length === 1) {
        req.reply(503, { mensaje: 'El servicio no está disponible.' });
      } else {
        req.reply(comprobante(103, DEBITO));
      }
    }).as('venta');

    venderUnaPolera('DEBITO_PRESENCIAL');

    cy.wait('@venta');
    cy.contains('Error en la venta').should('be.visible');
    cy.get('.cantidad').should('contain', '1'); // carrito conservado
    cy.get('ion-alert:not(.overlay-hidden)').contains('button', 'Reintentar').click();

    cy.wait('@venta');
    cy.contains('Boleta de Venta').should('be.visible');
    cy.then(() => {
      expect(claves).to.have.length(2);
      expect(claves[1]).to.equal(claves[0]);
    });
  });
});
