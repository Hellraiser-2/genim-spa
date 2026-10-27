import { describe, expect, it } from 'vitest';

import {
  asignarPresupuesto,
  desdePrimeraVenta,
  holtAmortiguado,
  intervaloMedio,
  mediaMovil,
  pronosticar,
  pronosticarCon,
  sba,
  seleccionarMetodos,
  ses,
  stockSeguridad,
  tipoDemanda,
  validar,
  variacion,
  wape,
} from './modelo-demanda.js';

describe('ses y media móvil', () => {
  it('el suavizado simple se acerca a cada semana en la fracción α', () => {
    // Nivel inicial 2 (promedio de las primeras 4); luego 2 + 0,5·(6 − 2) = 4.
    expect(ses([2, 2, 2, 2, 6], 0.5)).toBeCloseTo(4, 6);
  });

  it('la media móvil promedia las últimas semanas', () => {
    expect(mediaMovil([10, 1, 2, 3, 4], 4)).toBe(2.5);
    expect(pronosticarCon('MEDIA_MOVIL', [0, 0, 4, 2], 3)).toEqual([3, 3, 3]);
  });
});

describe('tipoDemanda', () => {
  it('intermitente con ADI de 1,32 o más, o con menos de 4 semanas de historia', () => {
    expect(tipoDemanda([3, 4, 3, 5, 4])).toBe('REGULAR');
    expect(tipoDemanda([1, 0, 0, 2, 0, 0, 1])).toBe('INTERMITENTE');
    expect(tipoDemanda([0, 0, 5, 5])).toBe('INTERMITENTE');
    expect(tipoDemanda([0, 0])).toBeNull();
  });
});

describe('seleccionarMetodos', () => {
  it('con tendencia elige Holt para la demanda regular', () => {
    const crecientes = Array.from({ length: 6 }, (_, k) => Array.from({ length: 26 }, (_, i) => 2 + k + 0.5 * i));
    const { elegidos, errores } = seleccionarMetodos(crecientes);
    expect(elegidos.REGULAR).toBe('HOLT');
    expect(Object.keys(errores.REGULAR).sort()).toEqual(['HOLT', 'MEDIA_MOVIL', 'SBA', 'SES']);
  });

  it('con ventas estables que oscilan, un promedio le gana a la tendencia', () => {
    const oscilantes = Array.from({ length: 6 }, () => Array.from({ length: 26 }, (_, i) => (i % 2 ? 2 : 6)));
    expect(['MEDIA_MOVIL', 'SES']).toContain(seleccionarMetodos(oscilantes).elegidos.REGULAR);
  });

  it('sin historia suficiente deja los métodos por defecto', () => {
    expect(seleccionarMetodos([[1, 2, 3]]).elegidos).toEqual({ REGULAR: 'HOLT', INTERMITENTE: 'SBA' });
  });

  it('pronosticar usa el método elegido para el tipo de la serie', () => {
    expect(pronosticar([3, 4, 3, 5, 4, 4], 2, { REGULAR: 'MEDIA_MOVIL', INTERMITENTE: 'SBA' })).toMatchObject({
      metodo: 'MEDIA_MOVIL',
      tipo: 'REGULAR',
    });
  });
});

describe('sba', () => {
  it('pronostica tamaño suavizado sobre intervalo suavizado, con el factor 1 − α/2', () => {
    // Una venta de 3 unidades cada 3 semanas: 1 unidad por semana, corregida por 1 − 0,15/2.
    expect(sba([0, 0, 3, 0, 0, 3], 0.15)).toBeCloseTo(0.925, 6);
  });

  it('sin ventas pronostica cero', () => {
    expect(sba([0, 0, 0])).toBe(0);
  });
});

describe('holtAmortiguado', () => {
  it('una serie constante se pronostica constante', () => {
    expect(holtAmortiguado([5, 5, 5, 5], 3)).toEqual([5, 5, 5]);
  });

  it('una serie creciente sigue creciendo, pero cada semana un factor φ menos', () => {
    const [a, b, c] = holtAmortiguado([1, 2, 3, 4, 5, 6], 3, { phi: 0.9 });
    expect(a).toBeGreaterThan(6);
    expect(b).toBeGreaterThan(a!);
    expect((c! - b!) / (b! - a!)).toBeCloseTo(0.9, 6);
  });

  it('nunca pronostica ventas negativas', () => {
    expect(Math.min(...holtAmortiguado([9, 6, 3, 1, 0, 0], 8))).toBeGreaterThanOrEqual(0);
  });
});

describe('pronosticar', () => {
  it('elige Holt para la demanda regular y SBA para la intermitente', () => {
    expect(pronosticar([3, 4, 3, 5, 4, 4], 4).metodo).toBe('HOLT');
    expect(pronosticar([1, 0, 0, 2, 0, 0, 0, 1], 4).metodo).toBe('SBA');
    expect(pronosticar([0, 0, 0], 4)).toMatchObject({ metodo: 'SIN_VENTAS', semanal: [0, 0, 0, 0] });
  });

  it('ignora las semanas antes de la primera venta', () => {
    expect(desdePrimeraVenta([0, 0, 2, 0, 3])).toEqual([2, 0, 3]);
    // Recién lanzada y vendiendo todas las semanas: es regular, no intermitente.
    const lanzamiento = pronosticar([0, 0, 0, 0, 0, 0, 2, 2, 3, 2, 3], 2);
    expect(lanzamiento.metodo).toBe('HOLT');
    expect(lanzamiento.semanasObservadas).toBe(5);
  });

  it('la desviación nunca es menor que la de una demanda de Poisson', () => {
    const { desviacion, semanal } = pronosticar([4, 4, 4, 4, 4], 2);
    expect(desviacion).toBeCloseTo(Math.sqrt(semanal[0]!), 6);
  });
});

describe('intervaloMedio', () => {
  it('es el largo de la serie sobre las semanas con ventas', () => {
    expect(intervaloMedio([1, 0, 0, 1])).toBe(2);
    expect(intervaloMedio([0, 0])).toBe(Infinity);
  });
});

describe('validar', () => {
  it('compara contra lo vendido en las semanas que se apartan', () => {
    const constante = Array(16).fill(3);
    const resultado = validar([constante], 4)!;
    expect(resultado.wapeModelo).toBeCloseTo(0, 9);
    expect(resultado.wapeIngenuo).toBeCloseTo(0, 9);

    // Ventas que suben: el modelo con tendencia erra menos que repetir el promedio.
    const creciente = Array.from({ length: 20 }, (_, i) => 2 + i);
    const conTendencia = validar([creciente], 4)!;
    expect(conTendencia.wapeModelo).toBeLessThan(conTendencia.wapeIngenuo);
  });

  it('no valida series demasiado cortas', () => {
    expect(validar([[1, 2, 3, 4, 5]], 4)).toBeNull();
  });
});

describe('utilidades', () => {
  it('wape pondera el error por lo vendido', () => {
    expect(wape([10, 10], [12, 7])).toBeCloseTo(0.25, 6);
    expect(wape([0, 0], [1, 1])).toBeNull();
  });

  it('stock de seguridad = z · σ · √reposición', () => {
    expect(stockSeguridad(2, 4, 1.6449)).toBeCloseTo(6.5796, 4);
  });

  it('variación entre periodos', () => {
    expect(variacion(15, 10)).toBeCloseTo(0.5, 6);
    expect(variacion(4, 0)).toBeNull();
  });

  it('el presupuesto toma cada compra entera si cabe y sigue con las demás', () => {
    expect([...asignarPresupuesto([300, 500, 100], 450)]).toEqual([0, 2]);
  });
});
