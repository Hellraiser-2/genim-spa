/// <reference types="cypress" />

describe('POS - Login Cliente para Checkout', () => {
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
    cy.intercept('POST', '/api/v1/ventas/checkout', {
      idVenta: 100,
      subtotal: 15000,
      flete: 0,
      total: 15000,
      tokenPago: 'payment-token-123',
      expiraEn: '2024-12-31T23:59:59Z'
    }).as('checkout');
    cy.intercept('POST', '/api/v1/pagos/webpay/retorno', {
      estado: 'aprobado',
      idVenta: 100,
      total: 15000,
      idPedido: 50
    }).as('retorno');
  });

  it('cobrar no exige cliente: se identifica, si se quiere, desde el cobro', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('.scan-input').type('POL-NEG-M{enter}');

    cy.get('ion-button.cobrar-button').click();
    cy.contains('Medio de pago').should('be.visible');
    cy.get('.cobro-cliente').should('contain', 'Venta sin cliente');
    cy.contains('ion-button', 'Identificar cliente').click();
    cy.get('.cliente-form #cliente-email').should('be.visible');
  });

  it('debe permitir login de cliente con credenciales válidas (rol CLIENTE)', () => {
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
    cy.get('.cobro-cliente').should('contain', 'Cliente Mostrador');
  });

  it('debe mostrar error si rol no es CLIENTE', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('.scan-input').type('POL-NEG-M{enter}');

    cy.get('ion-button.cobrar-button').click();

    // El 403 se registra tras el login vendedor para no interceptarlo.
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      statusCode: 403,
      body: { mensaje: 'La cuenta debe ser de rol CLIENTE' }
    }).as('loginClienteFail');

    cy.contains('ion-button', 'Identificar cliente').click();
    cy.get('.cliente-form').within(() => {
      cy.get('#cliente-email input').clear().type('vendedor@rockstar.cl');
      cy.get('#cliente-password input').clear().type('password123');
      cy.get('ion-button[type="submit"]').click();
    });
    
    cy.wait('@loginClienteFail');
    cy.contains('La cuenta debe ser de rol CLIENTE').should('be.visible');
  });

  it('debe persistir remember-me 30 días', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('#login-remember').click(); // Remember me
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');
    cy.url().should('include', '/pos');

    // La expiración guardada debe ser ~30 días en el futuro.
    cy.window().then((win) => {
      const exp = Number(win.localStorage.getItem('pos_vendedor_exp') || '0');
      const dias = (exp - Date.now()) / (24 * 60 * 60 * 1000);
      expect(dias).to.be.greaterThan(29);
      expect(dias).to.be.lessThan(31);
    });

    // Tras recarga (sin limpiar storage) la sesión sobrevive.
    cy.reload();
    cy.wait('@salud');
    cy.wait('@catalogo');
    cy.url().should('include', '/pos');
    cy.get('.vendedor-nombre').should('contain', 'Vendedor Test');
  });
});