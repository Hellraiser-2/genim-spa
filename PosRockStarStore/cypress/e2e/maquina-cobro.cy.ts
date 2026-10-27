/// <reference types="cypress" />

export {};

/**
 * Maquina de cobro en la red: el POS le envia el monto y espera el resultado.
 * Aqui la maquina se responde con intercepts en un puerto propio (8099); la prueba
 * contra la maquina simulada real esta en maquina-cobro-real.cy.ts.
 */
const MAQUINA = 'http://localhost:8099/api';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
};

const DEBITO = { codigo: 'DEBITO_PRESENCIAL', nombre: 'Tarjeta de débito' };
const EFECTIVO = { codigo: 'EFECTIVO', nombre: 'Efectivo' };

const comprobante = (medioPago: { codigo: string; nombre: string }) => ({
  idVenta: 300,
  fecha: new Date().toISOString(),
  vendedor: 'Vendedor Test',
  cliente: null,
  medioPago,
  lineas: [
    { idVariante: 1, sku: 'POL-NEG-M', producto: 'Polera Rockstar', talla: 'M', color: 'Negro', cantidad: 1, precioUnitario: 15000, subtotal: 15000, ubicacion: 'SALA_VENTAS' },
  ],
  total: 15000,
});

const cobro = (estado: string, extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  monto: 15000,
  tipo: 'DEBITO',
  referencia: 'k',
  estado,
  codigoAutorizacion: null,
  tarjeta: null,
  motivo: null,
  ...extra,
});

const responder = (body: unknown, statusCode = 200) => ({ statusCode, body, headers: CORS });

function entrar(maquinaActiva = true) {
  cy.visit('/login', {
    onBeforeLoad(win) {
      if (maquinaActiva) {
        win.localStorage.setItem('pos_maquina_cobro', JSON.stringify({ activa: true, direccion: 'localhost:8099' }));
      }
    },
  });
  cy.wait('@salud');
  cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
  cy.get('#login-password input').clear().type('password123');
  cy.get('ion-button[type="submit"]').click();
  cy.wait('@login');
  cy.wait('@catalogo');
}

function cobrarConDebito() {
  cy.get('.scan-input').type('POL-NEG-M{enter}');
  cy.get('ion-button.cobrar-button').click();
  cy.get('[data-medio="TARJETA"]').click();
  cy.get('ion-radio[value="DEBITO_PRESENCIAL"]').click();
  cy.contains('ion-button', 'Cobrar $15.000 en la máquina').click();
}

describe('POS - Máquina de cobro', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo-integracion.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      accessToken: 'vendor-token-123',
      refreshToken: 'refresh-123',
      usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' },
    }).as('login');
    cy.intercept('GET', '/api/v1/ventas/pos', []).as('ventasDelDia');
    cy.intercept('OPTIONS', `${MAQUINA}/**`, { statusCode: 204, headers: CORS });
  });

  it('se activa desde los ajustes y prueba la conexión', () => {
    cy.intercept('GET', `${MAQUINA}/estado`, responder({ nombre: 'Máquina de cobro simulada', modelo: 'SIM-POS 1', serie: 'SIM-0001' })).as('estado');
    entrar(false);

    cy.get('.maquina-chip').should('contain', 'Activar máquina de cobro').click();
    cy.get('ion-modal.ajustes-maquina-modal').within(() => {
      cy.get('ion-toggle.maquina-toggle').click();
      cy.get('.ajuste-input').clear().type('localhost:8099');
      cy.contains('ion-button', 'Probar conexión').click();
      cy.wait('@estado');
      cy.get('.ajuste-prueba.ok').should('contain', 'Conectada: Máquina de cobro simulada');
      cy.contains('ion-button', 'Guardar').click();
    });

    cy.get('.maquina-chip.activa').should('contain', 'Máquina de cobro activa');
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('pos_maquina_cobro') || '{}')).to.deep.equal({ activa: true, direccion: 'localhost:8099' });
    });
  });

  it('cobra con débito en la máquina y la boleta lleva la autorización', () => {
    let consultas = 0;
    cy.intercept('POST', `${MAQUINA}/cobros`, responder(cobro('PENDIENTE'), 201)).as('cobrar');
    cy.intercept('GET', `${MAQUINA}/cobros/c1`, (req) => {
      consultas++;
      req.reply(responder(consultas < 2 ? cobro('PENDIENTE') : cobro('APROBADO', { codigoAutorizacion: '123456', tarjeta: '•••• 4242' })));
    }).as('consultar');
    // El backend guarda la autorizacion y la devuelve en el comprobante.
    cy.intercept('POST', '/api/v1/ventas/pos', (req) =>
      req.reply({
        ...comprobante(DEBITO),
        pagoMaquina: { codigoAutorizacion: req.body.pagoMaquina.codigoAutorizacion, ultimosDigitos: req.body.pagoMaquina.ultimosDigitos },
      }),
    ).as('venta');

    entrar();
    cobrarConDebito();

    cy.contains('Esperando el pago en la máquina').should('be.visible');
    cy.wait('@cobrar').its('request.body').should('include', { monto: 15000, tipo: 'DEBITO' });
    cy.wait('@venta').then(({ request }) => {
      expect(request.body.medioPago).to.equal('DEBITO_PRESENCIAL');
      expect(request.body.pagoMaquina).to.deep.equal({ idCobro: 'c1', codigoAutorizacion: '123456', ultimosDigitos: '4242' });
      cy.get('@cobrar').its('request.body.referencia').should('equal', request.body.claveIdempotencia);
    });
    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('.boleta-info').should('contain', 'Autorización').and('contain', '123456 · •••• 4242');
  });

  it('el registro de jornada muestra la autorización guardada', () => {
    cy.intercept('GET', '/api/v1/ventas/pos', [
      { ...comprobante(DEBITO), pagoMaquina: { codigoAutorizacion: '987654', ultimosDigitos: '0007' } },
    ]).as('jornada');
    entrar();
    cy.get('ion-button.registro-btn').click();
    cy.wait('@jornada');
    cy.get('.venta-autorizacion').should('contain', 'Autorización 987654 · •••• 0007');
  });

  it('si el cobro ya pagó otra venta no ofrece anularlo', () => {
    cy.intercept('POST', `${MAQUINA}/cobros`, responder(cobro('PENDIENTE'), 201));
    cy.intercept('GET', `${MAQUINA}/cobros/c1`, responder(cobro('APROBADO', { codigoAutorizacion: '111111', tarjeta: '•••• 2222' })));
    cy.intercept('POST', `${MAQUINA}/cobros/c1/anular`, responder(cobro('ANULADO'))).as('anular');
    cy.intercept('POST', '/api/v1/ventas/pos', {
      statusCode: 409,
      body: { codigo: 'COBRO_YA_USADO', mensaje: 'Ese cobro de la máquina ya pagó la venta #77.', detalle: { idVenta: 77 } },
    }).as('venta');

    entrar();
    cobrarConDebito();

    cy.wait('@venta');
    cy.contains('Ese cobro de la máquina ya pagó la venta #77.').should('be.visible');
    cy.get('ion-alert:not(.overlay-hidden)').should('not.contain', 'Anular cobro');
    cy.get('@anular.all').should('have.length', 0);
  });

  it('con el pago rechazado no registra la venta y permite cambiar el medio', () => {
    cy.intercept('POST', `${MAQUINA}/cobros`, responder(cobro('PENDIENTE'), 201));
    cy.intercept('GET', `${MAQUINA}/cobros/c1`, responder(cobro('RECHAZADO', { motivo: 'Fondos insuficientes' })));
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(EFECTIVO)).as('venta');

    entrar();
    cobrarConDebito();

    cy.contains('Pago rechazado').should('be.visible');
    cy.contains('Fondos insuficientes').should('be.visible');
    cy.get('@venta.all').should('have.length', 0);

    cy.contains('ion-button', 'Cambiar medio de pago').click();
    cy.get('[data-medio="EFECTIVO"]').click();
    cy.contains('Confirmar y pagar').click();
    cy.wait('@venta').its('request.body.medioPago').should('equal', 'EFECTIVO');
  });

  it('cancelar desde la caja cancela el cobro en la máquina', () => {
    cy.intercept('POST', `${MAQUINA}/cobros`, responder(cobro('PENDIENTE'), 201));
    cy.intercept('GET', `${MAQUINA}/cobros/c1`, responder(cobro('PENDIENTE')));
    cy.intercept('POST', `${MAQUINA}/cobros/c1/cancelar`, responder(cobro('CANCELADO', { motivo: 'Cancelado desde la caja' }))).as('cancelar');
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(DEBITO)).as('venta');

    entrar();
    cobrarConDebito();

    cy.contains('Esperando el pago en la máquina').should('be.visible');
    cy.contains('ion-button', 'Cancelar cobro').click();
    cy.wait('@cancelar');
    cy.contains('Medio de pago').should('be.visible');
    cy.get('@venta.all').should('have.length', 0);
  });

  it('sin conexión con la máquina permite registrar la venta cobrada aparte', () => {
    cy.intercept('POST', `${MAQUINA}/cobros`, { forceNetworkError: true });
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(DEBITO)).as('venta');

    entrar();
    cobrarConDebito();

    cy.contains('Problema con la máquina').should('be.visible');
    cy.contains('No se pudo conectar con la máquina de cobro en http://localhost:8099').should('be.visible');
    cy.contains('ion-button', 'Ya cobré aparte: registrar la venta').click();
    cy.wait('@venta').its('request.body.medioPago').should('equal', 'DEBITO_PRESENCIAL');
    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('.boleta-info').should('not.contain', 'Autorización');
  });

  it('anula el cobro aprobado si la venta no se registra', () => {
    cy.intercept('POST', `${MAQUINA}/cobros`, responder(cobro('PENDIENTE'), 201));
    cy.intercept('GET', `${MAQUINA}/cobros/c1`, responder(cobro('APROBADO', { codigoAutorizacion: '654321', tarjeta: '•••• 1111' })));
    cy.intercept('POST', `${MAQUINA}/cobros/c1/anular`, responder(cobro('ANULADO'))).as('anular');
    cy.intercept('POST', '/api/v1/ventas/pos', {
      statusCode: 409,
      body: {
        codigo: 'EXISTENCIA_EN_BODEGA',
        mensaje: 'No alcanza en sala.',
        detalle: [{ idVariante: 1, producto: 'Polera Rockstar', talla: 'M', enSala: 0, enBodega: 7 }],
      },
    }).as('venta');

    entrar();
    cobrarConDebito();

    cy.wait('@venta');
    cy.contains('Si cancelas, se anula el cobro en la máquina').should('be.visible');
    cy.get('ion-alert:not(.overlay-hidden)').contains('button', 'Cancelar').click();
    cy.wait('@anular');
    cy.get('ion-toast').should(($t) => expect($t.prop('message')).to.contain('anulado en la máquina'));
  });

  it('el efectivo no pasa por la máquina', () => {
    cy.intercept('POST', `${MAQUINA}/cobros`, responder(cobro('PENDIENTE'), 201)).as('cobrar');
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(EFECTIVO)).as('venta');

    entrar();
    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('ion-button.cobrar-button').click();
    cy.get('[data-medio="EFECTIVO"]').click();
    cy.contains('Confirmar y pagar').click();

    cy.wait('@venta');
    cy.get('@cobrar.all').should('have.length', 0);
  });
});
