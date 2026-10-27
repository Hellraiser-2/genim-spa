/// <reference types="cypress" />

export {};

/** Efectivo con vuelto, transferencia con número de operación y cierre de caja. */

const comprobante = (medioPago: { codigo: string; nombre: string }, extra: Record<string, unknown> = {}) => ({
  idVenta: 500,
  fecha: new Date().toISOString(),
  vendedor: 'Vendedor Test',
  cliente: null,
  medioPago,
  pagoMaquina: null,
  numeroOperacion: null,
  lineas: [
    { idVariante: 1, sku: 'POL-NEG-M', producto: 'Polera Rockstar', talla: 'M', color: 'Negro', cantidad: 1, precioUnitario: 15000, subtotal: 15000, ubicacion: 'SALA_VENTAS' },
  ],
  total: 15000,
  ...extra,
});

const MEDIOS = [
  { codigo: 'EFECTIVO', nombre: 'Efectivo' },
  { codigo: 'DEBITO_PRESENCIAL', nombre: 'Tarjeta de débito' },
  { codigo: 'CREDITO_PRESENCIAL', nombre: 'Tarjeta de crédito' },
  { codigo: 'TRANSFERENCIA', nombre: 'Transferencia bancaria' },
];

function entrar() {
  cy.visit('/login', { onBeforeLoad: (win) => win.localStorage.removeItem('pos_fondo_caja') });
  cy.wait('@salud');
  cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
  cy.get('#login-password input').clear().type('password123');
  cy.get('ion-button[type="submit"]').click();
  cy.wait('@login');
  cy.wait('@catalogo');
}

function cobrarUnaPolera() {
  cy.get('.scan-input').type('POL-NEG-M{enter}');
  cy.get('ion-button.cobrar-button').click();
}

describe('POS - Medios de pago y cierre de caja', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo-integracion.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      accessToken: 'vendor-token-123',
      refreshToken: 'refresh-123',
      usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' },
    }).as('login');
    cy.intercept('GET', '/api/v1/ventas/pos', []);
  });

  it('ofrece efectivo, tarjeta y transferencia, con efectivo por defecto', () => {
    entrar();
    cobrarUnaPolera();
    cy.get('[data-medio]').should('have.length', 3);
    cy.get('[data-medio="EFECTIVO"]').should('have.attr', 'aria-checked', 'true');
    cy.get('[data-medio="TARJETA"]').click();
    cy.get('ion-radio[value="DEBITO_PRESENCIAL"]').should('exist');
    cy.get('ion-radio[value="CREDITO_PRESENCIAL"]').should('exist');
  });

  it('en efectivo calcula el vuelto y lo imprime en la boleta', () => {
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(MEDIOS[0]!)).as('venta');
    entrar();
    cobrarUnaPolera();

    cy.contains('.montos-rapidos button', '$20.000').click();
    cy.get('.vuelto').should('contain', 'Vuelto').and('contain', '$5.000');
    cy.contains('Confirmar y pagar').click();

    cy.wait('@venta').its('request.body.medioPago').should('equal', 'EFECTIVO');
    cy.get('.boleta-info').should('contain', 'Recibido').and('contain', '$20.000').and('contain', 'Vuelto').and('contain', '$5.000');
  });

  it('no deja confirmar si el efectivo recibido no alcanza', () => {
    entrar();
    cobrarUnaPolera();
    cy.get('.campo-pago input').first().type('10000');
    cy.get('.vuelto.falta').should('contain', 'Faltan $5.000');
    cy.get('ion-button.confirmar-cobro').should('have.attr', 'disabled');
  });

  it('con transferencia muestra los datos y envía el número de operación', () => {
    cy.intercept('POST', '/api/v1/ventas/pos', (req) =>
      req.reply(comprobante(MEDIOS[3]!, { numeroOperacion: req.body.numeroOperacion ?? null })),
    ).as('venta');
    entrar();
    cobrarUnaPolera();

    cy.get('[data-medio="TRANSFERENCIA"]').click();
    cy.get('.datos-transferencia').should('contain', 'Rockstar Store SpA').and('contain', '$15.000');
    cy.get('.detalle-pago input[type="text"]').type('OP 778-899!');
    cy.get('.detalle-pago input[type="text"]').should('have.value', 'OP778-899');
    cy.contains('ion-button', 'Transferencia recibida: confirmar').click();

    cy.wait('@venta').its('request.body').should('include', { medioPago: 'TRANSFERENCIA', numeroOperacion: 'OP778-899' });
    cy.get('.boleta-info').should('contain', 'N° operación').and('contain', 'OP778-899');
  });

  describe('cierre de caja', () => {
    const caja = {
      desde: new Date().toISOString(),
      ventas: 4,
      total: 60000,
      porMedio: [
        { ...MEDIOS[0], ventas: 2, total: 30000 },
        { ...MEDIOS[1], ventas: 1, total: 15000 },
        { ...MEDIOS[2], ventas: 0, total: 0 },
        { ...MEDIOS[3], ventas: 1, total: 15000 },
      ],
      ultimoCierre: { idCierre: 6, fecha: new Date().toISOString(), fondoInicial: 20000 },
    };

    beforeEach(() => {
      cy.intercept('GET', '/api/v1/ventas/pos/caja', caja).as('caja');
      cy.intercept('POST', '/api/v1/ventas/pos/cierres', (req) => {
        const { fondoInicial, efectivoContado, observacion } = req.body;
        req.reply(201, {
          idCierre: 7,
          vendedor: 'Vendedor Test',
          fecha: new Date().toISOString(),
          desde: caja.desde,
          hasta: new Date().toISOString(),
          ventas: 4,
          total: 60000,
          porMedio: caja.porMedio,
          fondoInicial,
          efectivoVentas: 30000,
          efectivoEsperado: fondoInicial + 30000,
          efectivoContado,
          diferencia: efectivoContado - fondoInicial - 30000,
          observacion: observacion ?? null,
        });
      }).as('cerrar');
    });

    it('con un faltante exige explicarlo y registra el cierre', () => {
      entrar();
      cy.get('ion-button.cierre-btn').click();
      cy.wait('@caja');

      cy.get('.cierre-medios').should('contain', 'Efectivo').and('contain', '$30.000').and('contain', 'Transferencia bancaria');
      cy.get('.cierre-form input').first().should('have.value', '20000');
      cy.get('.cierre-esperado').should('contain', '$50.000');

      cy.get('.cierre-form input').eq(1).type('49000');
      cy.get('.cuadre.falta').should('contain', 'Faltan $1.000');
      cy.get('ion-button.cerrar-caja-btn').should('have.attr', 'disabled');

      cy.get('.cierre-form textarea').type('Vuelto entregado de más');
      cy.get('ion-button.cerrar-caja-btn').should('not.have.attr', 'disabled');
      cy.get('ion-button.cerrar-caja-btn').click();

      cy.wait('@cerrar').its('request.body').should('include', { fondoInicial: 20000, efectivoContado: 49000, observacion: 'Vuelto entregado de más' });
      cy.get('.cierre-hecho').should('contain', 'Cierre N° 7').and('contain', 'Faltan $1.000');
      cy.get('ion-toast').should(($t) => expect($t.prop('message')).to.contain('Caja cerrada: 4 ventas'));
    });

    it('cuadrada no pide observación', () => {
      entrar();
      cy.get('ion-button.cierre-btn').click();
      cy.wait('@caja');
      cy.get('.cierre-form input').eq(1).type('50000');
      cy.get('.cuadre.cuadra').should('contain', 'Caja cuadrada');
      cy.get('ion-button.cerrar-caja-btn').click();
      cy.wait('@cerrar').its('request.body').should('not.have.property', 'observacion');
      cy.get('.cierre-hecho').should('contain', 'Caja cuadrada');
    });
  });
});
