/// <reference types="cypress" />

describe('POS - Login Vendedor', () => {
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
  });

  it('debe permitir login con credenciales válidas y redirigir a /pos', () => {
    cy.visit('/login');
    cy.wait('@salud');
    
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    
    cy.wait('@login');
    cy.url().should('include', '/pos');
    cy.wait('@catalogo');
    cy.get('.scan-input').should('be.visible');
    cy.get('.venta-vacia').should('be.visible');
  });

  it('debe mostrar error inline con credenciales inválidas', () => {
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      statusCode: 401,
      body: { mensaje: 'Credenciales incorrectas' }
    }).as('loginFail');
    
    cy.visit('/login');
    cy.wait('@salud');
    
    cy.get('#login-email input').clear().type('wrong@rockstar.cl');
    cy.get('#login-password input').clear().type('wrong');
    cy.get('ion-button[type="submit"]').click();
    
    cy.wait('@loginFail');
    cy.url().should('include', '/login');
    cy.contains('Credenciales incorrectas').should('be.visible');
  });

  it('debe persistir sesión tras recarga de página', () => {
    cy.visit('/login');
    cy.wait('@salud');
    
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    
    cy.wait('@login');
    cy.wait('@catalogo');
    cy.url().should('include', '/pos');
    
    cy.reload();
    cy.wait('@salud');
    cy.wait('@catalogo');
    cy.url().should('include', '/pos');
    cy.get('.vendedor-nombre').should('contain', 'Vendedor Test');
  });
});