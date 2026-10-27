import { describe, expect, it } from 'vitest';

import { type Popularidad, claveDeArtista } from './popularidad.service.js';
import { recomendar } from './recomendaciones.js';
import type { ResumenDeNegocio } from './resumen.js';

type Producto = ResumenDeNegocio['productos'][number];
type Banda = ResumenDeNegocio['porBanda'][number];

const producto = (datos: Partial<Producto> & Pick<Producto, 'producto' | 'categoria' | 'banda'>): Producto => ({
  precio: 15990,
  precioOferta: null,
  costo: null,
  unidadesEnStock: 10,
  tallasAgotadas: [],
  unidadesVendidas: 0,
  unidadesVendidasUltimos30Dias: 0,
  ingresos: 0,
  unidadesPerdidas: 0,
  ...datos,
});

/** Arma el resumen del negocio a partir de sus productos, como lo hace el servicio. */
function resumen(productos: Producto[], conciertos: Record<string, Banda['conciertoEnChile']> = {}, pagadas = 50, sinProductos: string[] = []): ResumenDeNegocio {
  const agrupar = (clave: (p: Producto) => string | null) => {
    const grupos = new Map<string, { nombre: string; productos: number; unidadesEnStock: number; unidadesVendidas: number; unidadesVendidasUltimos30Dias: number; ingresos: number }>();
    for (const p of productos) {
      const nombre = clave(p);
      if (nombre === null) continue;
      const grupo = grupos.get(nombre) ?? { nombre, productos: 0, unidadesEnStock: 0, unidadesVendidas: 0, unidadesVendidasUltimos30Dias: 0, ingresos: 0 };
      grupo.productos += 1;
      grupo.unidadesEnStock += p.unidadesEnStock;
      grupo.unidadesVendidas += p.unidadesVendidas;
      grupo.unidadesVendidasUltimos30Dias += p.unidadesVendidasUltimos30Dias;
      grupo.ingresos += p.ingresos;
      grupos.set(nombre, grupo);
    }
    return [...grupos.values()];
  };
  const vacias = sinProductos.map((nombre) => ({ nombre, productos: 0, unidadesEnStock: 0, unidadesVendidas: 0, unidadesVendidasUltimos30Dias: 0, ingresos: 0 }));
  return {
    fecha: '2026-10-06',
    moneda: 'CLP',
    ventas: { pagadas, primera: '2026-07-01', ultima: '2026-10-05' },
    porCategoria: agrupar((p) => p.categoria),
    porBanda: [...agrupar((p) => p.banda), ...vacias].map((banda) => ({ ...banda, conciertoEnChile: conciertos[banda.nombre] ?? null })),
    productos,
  };
}

const popularidad = (fans: Record<string, number> = {}, ranking: Record<string, [canciones: number, mejorPuesto: number]> = {}): Popularidad => ({
  disponible: true,
  fans: new Map(Object.entries(fans).map(([banda, n]) => [claveDeArtista(banda), n])),
  ranking: new Map(Object.entries(ranking).map(([banda, [canciones, mejorPuesto]]) => [claveDeArtista(banda), { nombre: banda, canciones, mejorPuesto }])),
});
const sinInternet: Popularidad = { disponible: false, fans: new Map(), ranking: new Map() };

const banda = (recomendaciones: ReturnType<typeof recomendar>, nombre: string) => recomendaciones.bandas.find((b) => b.banda === nombre)!;

describe('recomendaciones de bandas', () => {
  it('un concierto cercano en Chile basta para recomendar invertir, y mientras más cerca pesa más', () => {
    const productos = ['Cerca', 'Medio', 'Lejos', 'Pasado', 'Sin fecha'].map((nombre) => producto({ producto: `Polera ${nombre}`, categoria: 'Poleras', banda: nombre }));
    const r = recomendar(
      resumen(productos, {
        Cerca: { fecha: '2026-10-31', lugar: 'Estadio Nacional, Santiago' },
        Medio: { fecha: '2027-02-01', lugar: null },
        Lejos: { fecha: '2027-09-01', lugar: null },
        Pasado: { fecha: '2026-05-04', lugar: null },
      }, 0),
      sinInternet,
    );

    expect(r.bandas.map((b) => [b.banda, b.puntaje, b.accion])).toEqual([
      ['Cerca', 40, 'INVERTIR'],
      ['Medio', 30, 'MANTENER'],
      ['Lejos', 20, 'MANTENER'],
      ['Pasado', 0, 'NO_PRIORIZAR'],
      ['Sin fecha', 0, 'NO_PRIORIZAR'],
    ]);
    expect(banda(r, 'Cerca').conciertoEnChile).toEqual({ fecha: '2026-10-31', lugar: 'Estadio Nacional, Santiago', diasRestantes: 25 });
    expect(banda(r, 'Cerca').motivos).toEqual(['Toca en Chile el 31 oct 2026, en 25 días (Estadio Nacional, Santiago).']);
    // Un concierto que ya pasó no cuenta ni se informa.
    expect(banda(r, 'Pasado').conciertoEnChile).toBeNull();
    expect(r.popularidadDisponible).toBe(false);
  });

  it('suma las ventas recientes, los seguidores y los rankings, y explica cada cosa', () => {
    const r = recomendar(
      resumen([
        producto({ producto: 'Polera A', categoria: 'Poleras', banda: 'Alfa', unidadesVendidas: 30, unidadesVendidasUltimos30Dias: 20, unidadesEnStock: 40, ingresos: 300000 }),
        producto({ producto: 'Polera B', categoria: 'Poleras', banda: 'Beta', unidadesVendidas: 12, unidadesVendidasUltimos30Dias: 10, unidadesEnStock: 40 }),
        producto({ producto: 'Polera C', categoria: 'Poleras', banda: 'Gama', unidadesEnStock: 5 }),
      ]),
      popularidad({ Alfa: 935_000, Beta: 3_789_114, Gama: 800 }, { Beta: [3, 7] }),
    );

    // Alfa: 25 por ser la que más vende + 10 por ser la segunda en seguidores.
    expect(banda(r, 'Alfa')).toMatchObject({ puntaje: 35, accion: 'MANTENER', fans: 935_000, cancionesEnRanking: 0 });
    expect(banda(r, 'Alfa').motivos).toEqual([
      'Vendió 20 unidades en los últimos 30 días: es la banda que más vende.',
      'Tiene 935 mil seguidores en Deezer: es la 2.ª de las 3 bandas de la tienda.',
    ]);
    // Beta: 13 por ventas + 20 por ser la más seguida + 5 por estar en los rankings.
    expect(banda(r, 'Beta')).toMatchObject({ puntaje: 38, cancionesEnRanking: 3 });
    expect(banda(r, 'Beta').motivos).toEqual([
      'Tiene 3,8 millones de seguidores en Deezer: es la 1.ª de las 3 bandas de la tienda.',
      'Vendió 10 unidades en los últimos 30 días.',
      'Tiene 3 canciones en los rankings actuales de metal y rock de Deezer.',
    ]);
    expect(banda(r, 'Gama')).toMatchObject({ puntaje: 0, accion: 'NO_PRIORIZAR' });
    expect(r.bandas.map((b) => b.banda)).toEqual(['Beta', 'Alfa', 'Gama']);
  });

  it('premia lo que se vende y se acaba, y castiga el stock detenido solo cuando hay ventas para juzgar', () => {
    const productos = [
      producto({ producto: 'Polera A', categoria: 'Poleras', banda: 'Se acaba', unidadesVendidas: 8, unidadesVendidasUltimos30Dias: 8, unidadesEnStock: 3 }),
      producto({ producto: 'Polera B', categoria: 'Poleras', banda: 'Agotada', unidadesVendidas: 4, unidadesVendidasUltimos30Dias: 4, unidadesEnStock: 0 }),
      producto({ producto: 'Polera C', categoria: 'Poleras', banda: 'Detenida', unidadesEnStock: 14 }),
    ];
    const conVentas = recomendar(resumen(productos), sinInternet);

    expect(banda(conVentas, 'Se acaba')).toMatchObject({ puntaje: 35 });
    expect(banda(conVentas, 'Se acaba').motivos).toContain('Le quedan 3 unidades: menos de un mes al ritmo de venta actual.');
    expect(banda(conVentas, 'Agotada').motivos).toContain('Se vende y ya no le quedan unidades.');
    // El puntaje no baja de cero.
    expect(banda(conVentas, 'Detenida')).toMatchObject({ puntaje: 0, motivos: ['Tiene 14 unidades en stock y no vendió ninguna en 30 días.'] });

    // Con muy pocas ventas en toda la tienda, no vender todavía no dice nada.
    expect(banda(recomendar(resumen(productos, {}, 8), sinInternet), 'Detenida').motivos).toEqual([]);
  });

  it('a una banda en que conviene invertir le propone los tipos de producto que más vende la tienda y aún no tiene', () => {
    const r = recomendar(
      resumen(
        [
          // Pocas unidades: con stock detenido de sobra, el concierto solo no alcanzaría para recomendar más compra.
          producto({ producto: 'Polera A', categoria: 'Poleras', banda: 'Alfa', unidadesEnStock: 5 }),
          producto({ producto: 'Polera B', categoria: 'Poleras', banda: 'Beta', unidadesVendidas: 6, unidadesVendidasUltimos30Dias: 6 }),
          producto({ producto: 'Polerón B', categoria: 'Polerones', banda: 'Beta', unidadesVendidas: 3, unidadesVendidasUltimos30Dias: 3 }),
          // Los pantalones venden bien, pero no son de bandas: no se le proponen a ninguna.
          producto({ producto: 'Jeans', categoria: 'Pantalones', banda: null, unidadesVendidas: 5, unidadesVendidasUltimos30Dias: 5 }),
        ],
        { Alfa: { fecha: '2026-11-15', lugar: null } },
      ),
      sinInternet,
    );

    expect(banda(r, 'Alfa')).toMatchObject({ accion: 'INVERTIR', categorias: ['Poleras'], categoriasPorSumar: ['Polerones'] });
    // Beta no llega a "invertir": no se le propone nada.
    expect(banda(r, 'Beta')).toMatchObject({ accion: 'MANTENER', categoriasPorSumar: [] });

    // Con pocas ventas en la tienda aún no se sabe qué tipo de producto vende más: no se propone ninguno.
    const pocasVentas = recomendar(
      resumen(
        [
          producto({ producto: 'Polera A', categoria: 'Poleras', banda: 'Alfa', unidadesEnStock: 5 }),
          producto({ producto: 'Polerón B', categoria: 'Polerones', banda: 'Beta', unidadesVendidas: 3, unidadesVendidasUltimos30Dias: 3 }),
        ],
        { Alfa: { fecha: '2026-11-15', lugar: null } },
        3,
      ),
      sinInternet,
    );
    expect(banda(pocasVentas, 'Alfa')).toMatchObject({ accion: 'INVERTIR', categoriasPorSumar: [] });
  });

  it('incluye las bandas registradas sin productos, que son candidatas a una primera compra', () => {
    const r = recomendar(resumen([producto({ producto: 'Polera A', categoria: 'Poleras', banda: 'Alfa' })], { Nueva: { fecha: '2026-12-10', lugar: null } }, 0, ['Nueva']), sinInternet);

    expect(banda(r, 'Nueva')).toMatchObject({ accion: 'INVERTIR', productos: 0, categorias: [] });
    expect(banda(r, 'Nueva').motivos).toContain('Está registrada, pero la tienda aún no vende productos suyos.');
  });
});

describe('recomendaciones de tipos de producto', () => {
  const productos = [
    producto({ producto: 'Polera A', categoria: 'Poleras', banda: 'Alfa', unidadesVendidas: 40, unidadesVendidasUltimos30Dias: 30, unidadesEnStock: 80 }),
    producto({ producto: 'Polerón A', categoria: 'Polerones', banda: 'Alfa', unidadesVendidas: 9, unidadesVendidasUltimos30Dias: 9, unidadesEnStock: 4 }),
    producto({ producto: 'Jeans', categoria: 'Pantalones', banda: null, unidadesVendidas: 5, unidadesVendidasUltimos30Dias: 5, unidadesEnStock: 30 }),
    producto({ producto: 'Cinturón', categoria: 'Cinturones', banda: null, unidadesEnStock: 0 }),
    producto({ producto: 'Chaqueta', categoria: 'Chaquetas', banda: null, unidadesEnStock: 6 }),
  ];

  it('recomienda invertir en lo que más vende o se está acabando, y no priorizar lo que no se mueve', () => {
    const r = recomendar(resumen(productos), sinInternet);

    expect(r.categorias.map((c) => [c.categoria, c.accion])).toEqual([
      ['Poleras', 'INVERTIR'],
      ['Polerones', 'INVERTIR'],
      ['Pantalones', 'MANTENER'],
      ['Chaquetas', 'NO_PRIORIZAR'],
      ['Cinturones', 'NO_PRIORIZAR'],
    ]);
    expect(r.categorias[0]!.motivos).toEqual(['Vendió 30 unidades en los últimos 30 días: el 68 % de lo que vende la tienda.', 'Tiene 80 unidades en stock.']);

    // Lo que más vende no necesita más compra si su stock cubre más de tres meses de venta.
    const conStockDeSobra = productos.map((p) => (p.categoria === 'Poleras' ? { ...p, unidadesEnStock: 200 } : p));
    expect(recomendar(resumen(conStockDeSobra), sinInternet).categorias[0]).toMatchObject({ categoria: 'Poleras', accion: 'MANTENER' });
    expect(r.categorias[1]!.motivos[1]).toBe('Le quedan 4 unidades: menos de un mes al ritmo de venta actual.');
    expect(r.categorias[3]!.motivos).toEqual(['No vendió nada en los últimos 30 días y tiene 6 unidades en stock.']);
    expect(r.categorias[4]!.motivos).toEqual(['No vendió nada en los últimos 30 días y no tiene stock.']);
  });

  it('con pocas ventas en la tienda no descarta una categoría por no haber vendido', () => {
    const r = recomendar(resumen(productos, {}, 8), sinInternet);
    expect(r.categorias.find((c) => c.categoria === 'Chaquetas')).toMatchObject({ accion: 'MANTENER' });
    // Tampoco declara principal a la categoría que más vende: con tan pocas ventas es poca evidencia.
    expect(r.categorias.find((c) => c.categoria === 'Poleras')).toMatchObject({ accion: 'MANTENER' });
    expect(r.ventasPagadas).toBe(8);
  });
});

describe('productos por reponer y bandas del momento', () => {
  it('lista lo que se vende y se acaba, o tiene tallas agotadas, de lo que más vende a lo que menos', () => {
    const r = recomendar(
      resumen([
        producto({ producto: 'Con stock', categoria: 'Poleras', banda: 'Alfa', unidadesVendidasUltimos30Dias: 9, unidadesEnStock: 50 }),
        producto({ producto: 'Se acaba', categoria: 'Poleras', banda: 'Alfa', unidadesVendidasUltimos30Dias: 6, unidadesEnStock: 2 }),
        producto({ producto: 'Talla agotada', categoria: 'Poleras', banda: 'Beta', unidadesVendidasUltimos30Dias: 8, unidadesEnStock: 20, tallasAgotadas: ['M'] }),
        producto({ producto: 'Agotado sin ventas', categoria: 'Poleras', banda: 'Beta', unidadesEnStock: 0, tallasAgotadas: ['M'] }),
      ]),
      sinInternet,
    );

    expect(r.porReponer.map((p) => p.producto)).toEqual(['Talla agotada', 'Se acaba']);
    expect(r.porReponer[0]).toEqual({ producto: 'Talla agotada', banda: 'Beta', categoria: 'Poleras', unidadesEnStock: 20, unidadesVendidasUltimos30Dias: 8, tallasAgotadas: ['M'] });
  });

  it('propone las bandas de los rankings que la tienda no vende, aunque su nombre esté escrito distinto', () => {
    const r = recomendar(
      resumen([producto({ producto: 'Polera', categoria: 'Poleras', banda: 'AC/DC' }), producto({ producto: 'Polera M', categoria: 'Poleras', banda: 'Motörhead' })]),
      popularidad({}, { 'Ac Dc': [4, 2], Motorhead: [1, 30], Rammstein: [3, 5], 'System of a Down': [3, 1], Ghost: [1, 12] }),
    );

    expect(r.bandasDelMomento).toEqual([
      { banda: 'System of a Down', cancionesEnRanking: 3, mejorPuesto: 1 },
      { banda: 'Rammstein', cancionesEnRanking: 3, mejorPuesto: 5 },
      { banda: 'Ghost', cancionesEnRanking: 1, mejorPuesto: 12 },
    ]);
    expect(banda(r, 'AC/DC').cancionesEnRanking).toBe(4);
    expect(r.popularidadDisponible).toBe(true);
  });
});
