import { describe, it, expect } from 'vitest';
import { estadoCuadre, montosSugeridos, vueltoDe } from './pago';

describe('pago en efectivo', () => {
  it('sugiere los billetes siguientes al total, sin repetir', () => {
    expect(montosSugeridos(14990)).toEqual([15000, 20000]);
    expect(montosSugeridos(31990)).toEqual([32000, 35000, 40000]);
  });

  it('calcula el vuelto o lo que falta', () => {
    expect(vueltoDe(14990, 20000)).toBe(5010);
    expect(vueltoDe(14990, 10000)).toBe(-4990);
    expect(vueltoDe(14990, null)).toBeNull();
  });
});

describe('cuadre de caja', () => {
  it('cuadra, sobra o falta, siempre con texto', () => {
    expect(estadoCuadre(0)).toMatchObject({ clase: 'cuadra', texto: 'Caja cuadrada' });
    expect(estadoCuadre(500).clase).toBe('sobra');
    expect(estadoCuadre(500).texto).toMatch(/^Sobran \$\s?500$/);
    expect(estadoCuadre(-1000).clase).toBe('falta');
    expect(estadoCuadre(-1000).texto).toMatch(/^Faltan \$\s?1\.000$/);
  });
});
