import { describe, it, expect } from 'vitest';
import type { ArticuloCatalogo } from '../lib/api';
import { buscarEnCatalogo, porSku } from './busqueda';

const prenda = (datos: Partial<ArticuloCatalogo>): ArticuloCatalogo => ({
  idVariante: 1,
  idProducto: 1,
  sku: 'RS-0001',
  producto: 'Polera Calavera',
  categoria: 'Poleras',
  banda: 'Misfits',
  talla: 'M',
  color: 'Negro',
  precio: 15000,
  descripcion: null,
  imagenUrl: null,
  disponible: 3,
  ...datos,
});

const catalogo = [
  prenda({}),
  prenda({ idVariante: 2, sku: 'RS-0002', talla: 'L' }),
  prenda({ idVariante: 3, sku: 'RS-0003', producto: 'Chaqueta de Cuero Rider', categoria: 'Chaquetas', banda: null, color: 'Café' }),
];

describe('buscarEnCatalogo', () => {
  it('busca por nombre, banda, color o SKU, desde el comienzo de cada palabra', () => {
    expect(buscarEnCatalogo(catalogo, 'pol').map((p) => p.idVariante)).toEqual([1, 2]);
    expect(buscarEnCatalogo(catalogo, 'misfits').map((p) => p.idVariante)).toEqual([1, 2]);
    expect(buscarEnCatalogo(catalogo, 'cuero').map((p) => p.idVariante)).toEqual([3]);
    expect(buscarEnCatalogo(catalogo, 'rs-0003').map((p) => p.idVariante)).toEqual([3]);
    expect(buscarEnCatalogo(catalogo, '0002').map((p) => p.idVariante)).toEqual([2]);
    expect(buscarEnCatalogo(catalogo, 'lera')).toEqual([]);
  });

  it('una talla filtra por talla, y exige todas las palabras en cualquier orden', () => {
    expect(buscarEnCatalogo(catalogo, 'l polera').map((p) => p.idVariante)).toEqual([2]);
    expect(buscarEnCatalogo(catalogo, 'polera m').map((p) => p.idVariante)).toEqual([1]);
    expect(buscarEnCatalogo(catalogo, 'm misfits negro').map((p) => p.idVariante)).toEqual([1]);
  });

  it('ignora mayusculas y tildes', () => {
    expect(buscarEnCatalogo(catalogo, 'CAFE').map((p) => p.idVariante)).toEqual([3]);
  });

  it('no devuelve nada sin texto', () => {
    expect(buscarEnCatalogo(catalogo, '   ')).toEqual([]);
  });
});

describe('porSku', () => {
  it('encuentra el SKU exacto sin importar mayusculas', () => {
    expect(porSku(catalogo, ' rs-0002 ')?.idVariante).toBe(2);
    expect(porSku(catalogo, 'RS-00')).toBeUndefined();
  });
});
