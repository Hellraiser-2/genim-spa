import { describe, expect, it } from 'vitest';

import { codigoDeUbicacion, codigosDeVariante, elegirZona, esUbicacion } from './ubicaciones.js';

describe('elegirZona', () => {
  it('usa las tres primeras letras de la categoría', () => {
    expect(elegirZona('Poleras', new Set())).toBe('POL');
    expect(elegirZona('Cinturones', new Set(['POL']))).toBe('CIN');
  });

  it('avanza la tercera letra cuando la zona ya está tomada', () => {
    expect(elegirZona('Polerones', new Set(['POL']))).toBe('POE');
  });

  it('ignora tildes, espacios y signos', () => {
    expect(elegirZona('Árbol de Navidad', new Set())).toBe('ARB');
  });

  it('completa los nombres cortos y numera cuando no quedan letras', () => {
    expect(elegirZona('Té', new Set())).toBe('TEX');
    expect(elegirZona('Té', new Set(['TEX']))).toBe('TE1');
    expect(elegirZona('Té', new Set(['TEX', 'TE1']))).toBe('TE2');
  });
});

describe('códigos', () => {
  it('arma el código de ubicación con la posición a dos dígitos', () => {
    expect(codigoDeUbicacion('POL', 3)).toBe('B-POL-03');
    expect(codigoDeUbicacion('POL', 120)).toBe('B-POL-120');
  });

  it('deriva el SKU y el código escaneable del identificador', () => {
    expect(codigosDeVariante(9)).toEqual({ sku: 'RS-0009', codigo: '7800000000009' });
  });

  it('reconoce solo las ubicaciones de stock', () => {
    expect(esUbicacion('BODEGA')).toBe(true);
    expect(esUbicacion('SALA_VENTAS')).toBe(true);
    expect(esUbicacion('toString')).toBe(false);
    expect(esUbicacion(1)).toBe(false);
  });
});
