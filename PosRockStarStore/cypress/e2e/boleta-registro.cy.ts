/// <reference types="cypress" />

export {};

const comprobante = (idVenta: number, total: number, medioPago: { codigo: string; nombre: string }, minutosAtras = 0) => ({
  idVenta,
  fecha: new Date(Date.now() - minutosAtras * 60000).toISOString(),
  vendedor: 'Vendedor Test',
  cliente: 'Cliente Mostrador',
  medioPago,
  lineas: [
    { idVariante: 1, sku: 'POL-NEG-M', producto: 'Polera Rockstar', talla: 'M', color: 'Negro', cantidad: total / 15000, precioUnitario: 15000, subtotal: total, ubicacion: 'SALA_VENTAS' },
  ],
  total,
});

const EFECTIVO = { codigo: 'EFECTIVO', nombre: 'Efectivo' };
const DEBITO = { codigo: 'DEBITO_PRESENCIAL', nombre: 'Tarjeta de débito' };

describe('POS - Boleta y Registro de Jornada', () => {
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
    cy.intercept('POST', '/api/v1/ventas/pos', comprobante(103, 30000, EFECTIVO)).as('venta');
    cy.intercept('GET', '/api/v1/ventas/pos', [
      comprobante(103, 30000, EFECTIVO),
      comprobante(102, 15000, DEBITO, 60),
      comprobante(101, 15000, EFECTIVO, 120),
    ]).as('ventasDelDia');
  });

  it('debe mostrar boleta completa con id, fecha, líneas, total, medio, giro', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');
    
    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('ion-card.product-card').first().find('.product-stepper ion-button').last().click();
    
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
    
    cy.wait('@venta');
    
    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('.boleta-info').should('contain', 'Boleta N°').and('contain', '103');
    cy.contains('Rockstar Store SpA').should('be.visible');
    cy.contains('76.123.456-7').should('be.visible');
    cy.get('.boleta-info').should('contain', 'Efectivo');
    cy.get('.boleta-totales').should('contain', '$30.000');
    cy.get('.boleta-lineas').should('contain', 'Polera Rockstar');
    cy.contains('Gracias por su compra').should('be.visible');
  });

  it('debe permitir impresión solo boleta (CSS print)', () => {
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
    
    cy.wait('@venta');
    
    cy.get('ion-button.boleta-imprimir-btn').should('exist');
  });

  it('debe mostrar registro de jornada con stats (conteo, total) y orden reciente a antigua', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    // El registro usa el token del vendedor: no hace falta identificar a un cliente.
    cy.get('ion-button.registro-btn').click();
    cy.wait('@ventasDelDia').its('request.headers.authorization').should('equal', 'Bearer vendor-token-123');
    
    cy.contains('Registro de Jornada').should('be.visible');
    cy.get('.registro-stats').should('contain', '3'); // 3 ventas
    cy.get('.registro-stats').should('contain', '$60.000'); // 30000 + 15000 + 15000
    
    cy.get('.venta-item').should('have.length', 3);
    cy.get('.venta-item').first().should('contain', 'Venta #103');
    cy.get('.venta-item').last().should('contain', 'Venta #101');
    cy.get('.venta-item').eq(1).should('contain', 'Tarjeta de débito');
    cy.get('.estado-pagado').should('have.length', 3);
  });

  it('debe refrescar catálogo tras venta (stock actualizado)', () => {
    // El catálogo tras la venta devuelve stock descontado en 1.
    cy.fixture('catalogo-integracion.json').then((base: Array<Record<string, unknown>>) => {
      let llamadas = 0;
      cy.intercept('GET', '/api/v1/inventario/catalogo', (req) => {
        llamadas++;
        const copia = structuredClone(base) as Array<Record<string, unknown>>;
        if (llamadas > 1) {
          copia[0] = { ...copia[0], disponible: 6 };
        }
        req.reply(copia);
      }).as('catalogoDinamico');
    });

    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogoDinamico');

    const stockInicial = 7;
    cy.get('.scan-input').type('POL-NEG-M{enter}');
    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.stock').should('contain', `Disp: ${stockInicial}`);
    });

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

    cy.wait('@venta');

    cy.contains('Boleta de Venta').should('be.visible');
    cy.get('ion-button.boleta-cerrar-btn').click();

    // Tras la venta la grilla queda vacia; el stock al dia se ve en la busqueda.
    cy.get('ion-card.product-card').should('not.exist');
    cy.get('.scan-input').type('POL-NEG-M');
    cy.get('.buscador-opcion').first().should('contain', `Disp: ${stockInicial - 1}`);
  });
});