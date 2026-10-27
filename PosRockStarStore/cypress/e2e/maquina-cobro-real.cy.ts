/// <reference types="cypress" />

export {};

/**
 * Contra la maquina simulada de verdad (contenedor `terminal`, http://localhost:8090):
 * prueba el protocolo completo. La venta en el backend se responde con un intercept
 * para no dejar ventas de prueba en la base.
 */
const MAQUINA = 'http://localhost:8090';

describe('POS - Máquina de cobro simulada (contenedor)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo-integracion.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      accessToken: 'vendor-token-123',
      refreshToken: 'refresh-123',
      usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' },
    }).as('login');
    cy.intercept('GET', '/api/v1/ventas/pos', []);
    cy.intercept('POST', '/api/v1/ventas/pos', (req) =>
      req.reply({
        idVenta: 400,
        fecha: new Date().toISOString(),
        vendedor: 'Vendedor Test',
        cliente: null,
        medioPago: { codigo: 'CREDITO_PRESENCIAL', nombre: 'Tarjeta de crédito' },
        pagoMaquina: { codigoAutorizacion: req.body.pagoMaquina.codigoAutorizacion, ultimosDigitos: req.body.pagoMaquina.ultimosDigitos },
        lineas: [
          { idVariante: 1, sku: 'POL-NEG-M', producto: 'Polera Rockstar', talla: 'M', color: 'Negro', cantidad: 1, precioUnitario: 15000, subtotal: 15000, ubicacion: 'SALA_VENTAS' },
        ],
        total: 15000,
      }),
    ).as('venta');

    // Si quedo un cobro pendiente de otra corrida, la maquina estaria ocupada.
    cy.request(`${MAQUINA}/api/cobros/actual`).then(({ body }) => {
      if (body?.id) cy.request('POST', `${MAQUINA}/api/cobros/${body.id}/cancelar`);
    });
  });

  it('cobra con crédito y se aprueba desde la pantalla de la máquina', () => {
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem('pos_maquina_cobro', JSON.stringify({ activa: true, direccion: 'localhost:8090' }));
      },
    });
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('ion-button.cobrar-button').click();
    cy.get('[data-medio="TARJETA"]').click();
    cy.get('ion-radio[value="CREDITO_PRESENCIAL"]').click();
    cy.contains('ion-button', 'Cobrar $15.000 en la máquina').click();
    cy.contains('Esperando el pago en la máquina').should('be.visible');

    // Lo que haria el cliente en la maquina: pasar la tarjeta.
    cy.request(`${MAQUINA}/api/cobros/actual`).then(({ body: pendiente }) => {
      expect(pendiente).to.include({ monto: 15000, tipo: 'CREDITO', estado: 'PENDIENTE' });
      cy.request('POST', `${MAQUINA}/api/cobros/${pendiente.id}/aprobar`).then(({ body: aprobado }) => {
        cy.wait('@venta').its('request.body').should((venta) => {
          expect(venta.claveIdempotencia).to.equal(pendiente.referencia);
          expect(venta.pagoMaquina).to.deep.equal({
            idCobro: pendiente.id,
            codigoAutorizacion: aprobado.codigoAutorizacion,
            ultimosDigitos: aprobado.tarjeta.slice(-4),
          });
        });
        cy.contains('Boleta de Venta').should('be.visible');
        cy.get('.boleta-info').should('contain', `${aprobado.codigoAutorizacion} · ${aprobado.tarjeta}`);
      });
    });
  });
});
