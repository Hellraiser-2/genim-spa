import { describe, expect, it } from 'vitest';

import { claveDe, ordenar, patronLike } from './texto.js';

describe('claveDe', () => {
  it('iguala nombres que solo difieren en mayúsculas, tildes o espacios', () => {
    expect(claveDe('Metállica')).toBe(claveDe('  METALLICA '));
    expect(claveDe('Polerón  Banda   Tour')).toBe(claveDe('poleron banda tour'));
  });

  it('distingue la ñ de la n, que en español son letras distintas', () => {
    expect(claveDe('Ñandú')).toBe('ñandu');
    expect(claveDe('Caña')).not.toBe(claveDe('Cana'));
  });
});

describe('ordenar', () => {
  it('ordena en español sin modificar la lista original', () => {
    const nombres = ['Ñuñoa', 'Zapallar', 'Ángol', 'Arica'];
    expect(ordenar(nombres)).toEqual(['Ángol', 'Arica', 'Ñuñoa', 'Zapallar']);
    expect(nombres[0]).toBe('Ñuñoa');
  });
});

describe('patronLike', () => {
  it('busca los comodines como texto literal', () => {
    expect(patronLike('100%_real')).toBe('%100\\%\\_real%');
  });
});
