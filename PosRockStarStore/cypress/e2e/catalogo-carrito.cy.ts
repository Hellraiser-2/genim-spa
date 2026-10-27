/// <reference types="cypress" />

/**
 * La grilla muestra solo los productos de la venta: entran escaneados o elegidos en la
 * barra de busqueda, que muestra el resto del catalogo.
 */
describe('POS - Catálogo y Carrito', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo-integracion.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      accessToken: 'vendor-token-123',
      refreshToken: 'refresh-123',
      usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' }
    }).as('login');

    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');
  });

  it('debe empezar sin productos y mostrar los 7 del catálogo en la búsqueda, con imágenes', () => {
    cy.get('.venta-vacia').should('be.visible');
    cy.get('ion-card.product-card').should('not.exist');

    cy.get('.scan-input').type('rockstar');
    cy.get('.buscador-opcion').should('have.length', 7);
    cy.get('.buscador-opcion').first().find('img').should('be.visible');
  });

  it('debe mostrar en la grilla solo lo elegido en la búsqueda', () => {
    cy.get('.scan-input').type('gorro');
    cy.get('.buscador-opcion').should('have.length', 1).click();

    cy.get('ion-card.product-card').should('have.length', 1).and('contain', 'Gorro Rockstar');
    cy.get('.venta-vacia').should('not.exist');
    cy.get('.scan-input').should('have.value', '');
  });

  it('debe actualizar detalle y total con stepper +/−', () => {
    cy.get('.scan-input').type('POL-NEG-M{enter}');

    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.cantidad').should('contain', '1');
      cy.get('.product-stepper ion-button').last().click();
      cy.get('.cantidad').should('contain', '2');
    });

    cy.get('.carrito-total strong').should('contain', '$30.000');

    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.product-stepper ion-button').first().click();
      cy.get('.cantidad').should('contain', '1');
    });

    cy.get('.carrito-total strong').should('contain', '$15.000');
  });

  it('debe inhabilitar + al llegar al tope de stock (7/7)', () => {
    cy.get('.scan-input').type('POL-NEG-M{enter}');

    cy.get('ion-card.product-card').first().within(() => {
      for (let i = 1; i < 7; i++) {
        cy.get('.product-stepper ion-button').last().click();
      }
      cy.get('.cantidad').should('contain', '7');
      cy.get('.product-stepper ion-button').last().should('have.class', 'button-disabled');
    });
  });

  it('debe mostrar "Sin stock" en la búsqueda para stock 0', () => {
    cy.get('.scan-input').type('poster');
    cy.get('.buscador-opcion.sin-stock')
      .should('have.attr', 'aria-disabled', 'true')
      .and('contain', 'Sin stock');
  });

  it('no debe permitir agregar producto sin stock al carrito', () => {
    cy.get('.scan-input').type('poster');
    cy.get('.buscador-opcion.sin-stock').click();

    cy.get('ion-toast').should(($toast) => expect($toast.prop('message')).to.contain('no tiene stock'));
    cy.get('ion-card.product-card').should('not.exist');
    cy.get('.carrito-vacio').should('be.visible');
  });
});
