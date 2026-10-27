/// <reference types="cypress" />

export {};

const comprobante = (idVenta: number, cantidad: number, medioPago = { codigo: 'EFECTIVO', nombre: 'Efectivo' }) => ({
  idVenta,
  fecha: new Date().toISOString(),
  vendedor: 'Vendedor Test',
  cliente: 'Cliente Mostrador',
  medioPago,
  lineas: [
    { idVariante: 1, sku: 'POL-NEG-M', producto: 'Polera Rockstar', talla: 'M', color: 'Negro', cantidad, precioUnitario: 15000, subtotal: 15000 * cantidad, ubicacion: 'SALA_VENTAS' },
  ],
  total: 15000 * cantidad,
});

describe('POS - Cobro en efectivo', () => {
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
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(100, 1)).as('venta');
    cy.intercept('GET', '/api/v1/ventas/pos', [comprobante(100, 1)]).as('ventasDelDia');
  });

  it('debe registrar la venta en efectivo con el token del vendedor → boleta emitida, carrito vacío', () => {
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
    cy.get('[data-medio="EFECTIVO"]').click();
    cy.contains('Confirmar y pagar').click();
    
    cy.wait('@venta').then(({ request }) => {
      expect(request.headers.authorization).to.equal('Bearer vendor-token-123');
      expect(request.body).to.include({ medioPago: 'EFECTIVO', idCliente: 2 });
      expect(request.body.lineas).to.deep.equal([{ idVariante: 1, cantidad: 1, permitirBodega: false }]);
      expect(request.body.claveIdempotencia).to.be.a('string').and.not.be.empty;
    });
    
    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('.boleta-info').should('contain', 'Boleta N°').and('contain', '100');
    cy.get('.boleta-totales').should('contain', '$15.000');
    cy.get('.boleta-info').should('contain', 'Efectivo');

    cy.get('ion-button.boleta-cerrar-btn').click();
    cy.get('.carrito-vacio').should('be.visible');

    // El cliente era de esa venta: el proximo comprador parte sin cliente.
    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('ion-button.cobrar-button').click();
    cy.get('.cobro-cliente').should('contain', 'Venta sin cliente');
  });

  it('debe registrar la venta sin cliente identificado', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('ion-button.cobrar-button').click();
    cy.get('.cobro-cliente').should('contain', 'Venta sin cliente');
    cy.get('[data-medio="EFECTIVO"]').click();
    cy.contains('Confirmar y pagar').click();

    cy.wait('@venta').then(({ request }) => {
      expect(request.body).to.include({ medioPago: 'EFECTIVO' });
      expect(request.body).not.to.have.property('idCliente');
    });
    cy.contains('Boleta de Venta').should('be.visible');
  });
});
