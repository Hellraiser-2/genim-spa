/// <reference types="cypress" />

/**
 * Escaneo de etiquetas: la pistola USB escribe el codigo en el campo y presiona Enter,
 * igual que escribirlo a mano. El QR trae el SKU; el codigo de barras lo resuelve la API.
 */
describe('POS Escaner - agregar productos por codigo', () => {
  const toastDice = (texto: string) =>
    cy.get('ion-toast').should(($toast) => expect($toast.prop('message')).to.contain(texto));

  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      accessToken: 'vendor-token-123',
      refreshToken: 'refresh-123',
      usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' },
    }).as('login');
    cy.intercept('GET', '/api/v1/inventario/variantes/por-codigo/7800000000002', {
      idVariante: 2, sku: 'POL-NEG-L', codigo: '7800000000002', producto: 'Polera Rockstar', talla: 'L', color: 'Negro', disponible: 5,
    }).as('porCodigo');
    cy.intercept('GET', '/api/v1/inventario/variantes/por-codigo/0000', {
      statusCode: 404,
      body: { codigo: 'NO_ENCONTRADO', mensaje: 'El código no está registrado.' },
    }).as('noExiste');

    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');
  });

  it('agrega la prenda del QR (SKU) al carrito con Enter', () => {
    cy.get('.scan-input').type('pol-neg-m{enter}');
    toastDice('Agregado: Polera Rockstar (M/Negro)');
    cy.get('.carrito-panel .linea-cantidades span').should('contain', '1 ×');
    cy.get('.scan-input').should('have.value', '');

    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('.carrito-panel .linea-cantidades span').should('contain', '2 ×');
    cy.get('ion-button.cobrar-button').should('not.have.attr', 'disabled');
  });

  it('resuelve el codigo de barras en la API', () => {
    cy.get('.scan-input').type('7800000000002{enter}');
    cy.wait('@porCodigo').its('request.headers.authorization').should('eq', 'Bearer vendor-token-123');
    toastDice('Agregado: Polera Rockstar (L/Negro)');
    cy.get('.carrito-panel .linea-info span').should('contain', 'L');
  });

  it('avisa si el codigo no existe o la prenda no tiene stock', () => {
    cy.get('.scan-input').type('0000{enter}');
    cy.wait('@noExiste');
    toastDice('El código 0000 no está registrado.');
    cy.get('.scan-input').should('have.value', '0000');

    cy.get('.scan-input').clear().type('POS-NEG-U{enter}');
    toastDice('no tiene stock');
    cy.get('.carrito-panel .linea-info').should('not.exist');
  });

  it('no supera el stock disponible', () => {
    // VIN-NEG-U tiene 2 unidades disponibles en el fixture.
    cy.get('.scan-input').type('VIN-NEG-U{enter}');
    cy.get('.scan-input').type('VIN-NEG-U{enter}');
    cy.get('.carrito-panel .linea-cantidades span').should('contain', '2 ×');
    cy.get('.scan-input').type('VIN-NEG-U{enter}');
    toastDice('Ya están en el carrito las 2 unidades disponibles');
    cy.get('.carrito-panel .linea-cantidades span').should('contain', '2 ×');
  });

  it('la busqueda muestra el resto del catalogo y se elige con el teclado', () => {
    cy.get('.scan-input').type('polera');
    cy.get('.buscador-opcion').should('have.length', 3);
    cy.get('.scan-input').type('{downArrow}{downArrow}');
    cy.get('.buscador-opcion').eq(1).should('have.attr', 'aria-selected', 'true');
    cy.get('.scan-input').type('{enter}');
    toastDice('Agregado: Polera Rockstar (L/Negro)');
    cy.get('ion-card.product-card').should('have.length', 1).and('contain', 'SKU: POL-NEG-L');
    cy.get('.buscador-lista').should('not.exist');
  });

  it('con varias coincidencias y Enter pide elegir de la lista', () => {
    cy.get('.scan-input').type('polera negro{enter}');
    toastDice('Hay 2 productos que coinciden');
    cy.get('.buscador-opcion').should('have.length', 2);
    cy.get('ion-card.product-card').should('not.exist');

    cy.get('.scan-input').type('{esc}');
    cy.get('.buscador-lista').should('not.exist');
  });

  it('abre y cierra el escaner con camara', () => {
    cy.contains('ion-button', 'Escanear con cámara').click();
    cy.get('ion-modal.escaner-modal .escaner-video-wrap').should('be.visible');
    cy.contains('ion-modal.escaner-modal ion-button', 'Listo, ir al carrito').click();
    // Ionic React deja el modal en el DOM, oculto.
    cy.get('ion-modal.escaner-modal').should('have.class', 'overlay-hidden');
  });
});
