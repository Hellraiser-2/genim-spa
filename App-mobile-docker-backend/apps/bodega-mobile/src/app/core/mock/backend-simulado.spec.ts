import type { Categoria, ResultadoMovimientos, SesionResponse, VarianteStock } from '@rockstar/contracts';

import { BackendSimulado } from './backend-simulado';

describe('BackendSimulado', () => {
  let backend: BackendSimulado;
  let token: string;

  const post = (ruta: string, cuerpo: unknown) => backend.manejar('POST', ruta, cuerpo, token);
  const variante = (codigo: string) =>
    backend.manejar('GET', `/inventario/variantes/por-codigo/${codigo}`, null, token).body as VarianteStock;
  const existencia = (codigo: string, ubicacion: string) =>
    variante(codigo).existencias.find((e) => e.ubicacion === ubicacion)?.cantidad;

  beforeEach(() => {
    backend = new BackendSimulado();
    const login = backend.manejar('POST', '/usuarios/auth/login', { email: 'bodega@rockstar.cl', password: 'bodega123' }, null);
    token = (login.body as SesionResponse).accessToken;
  });

  it('rechaza credenciales incorrectas sin indicar cuál dato falló', () => {
    const respuesta = backend.manejar('POST', '/usuarios/auth/login', { email: 'bodega@rockstar.cl', password: 'x' }, null);
    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
  });

  it('exige una sesión válida y el rol de bodega', () => {
    expect(backend.manejar('GET', '/inventario/variantes?q=polera', null, null).status).toBe(401);

    const vendedor = backend.manejar('POST', '/usuarios/auth/login', { email: 'vendedor@rockstar.cl', password: 'vendedor123' }, null);
    const tokenVendedor = (vendedor.body as SesionResponse).accessToken;
    const ingreso = backend.manejar(
      'POST',
      '/inventario/movimientos/ingresos',
      { claveIdempotencia: 'v1', ubicacion: 'BODEGA', lineas: [{ idVariante: 1, cantidad: 1 }] },
      tokenVendedor,
    );
    expect(ingreso.status).toBe(403);
  });

  it('busca variantes por código, por SKU y por nombre', () => {
    expect(variante('RS-0001').producto).toBe('Polera Calavera');
    expect(variante('7800000000001').sku).toBe('RS-0001');
    expect(backend.manejar('GET', '/inventario/variantes/por-codigo/NO-EXISTE', null, token).status).toBe(404);
    const porNombre = backend.manejar('GET', '/inventario/variantes?q=calavera', null, token).body as VarianteStock[];
    expect(porNombre.map((v) => v.sku)).toEqual(['RS-0001', 'RS-0002']);
    const todas = backend.manejar('GET', '/inventario/variantes?q=', null, token).body as VarianteStock[];
    expect(todas).toHaveLength(8);
    const porBanda = backend.manejar('GET', '/inventario/variantes?q=metallica', null, token).body as VarianteStock[];
    expect(porBanda.map((v) => [v.sku, v.banda])).toEqual([['RS-0005', 'Metallica']]);
    const porCategoria = backend.manejar('GET', '/inventario/variantes?q=pantalones', null, token).body as VarianteStock[];
    expect(porCategoria.map((v) => [v.sku, v.categoria])).toEqual([['RS-0004', 'Pantalones']]);
    const porEspacio = backend.manejar('GET', '/inventario/variantes?q=b-pol-01', null, token).body as VarianteStock[];
    expect(porEspacio.map((v) => [v.sku, v.codigoUbicacion])).toEqual([
      ['RS-0001', 'B-POL-01'],
      ['RS-0002', 'B-POL-01'],
    ]);
  });

  it('entrega la misma foto para todas las variantes de un producto', () => {
    expect(variante('RS-0001').imagenUrl).toBe('assets/prendas/polera-calavera.jpg');
    expect(variante('RS-0002').imagenUrl).toBe('assets/prendas/polera-calavera.jpg');
    expect(variante('RS-0006').imagenUrl).toBe('assets/prendas/cinturon-tachas.jpg');
  });

  it('asigna a cada producto un código de ubicación por categoría', () => {
    expect(variante('RS-0001').codigoUbicacion).toBe('B-POL-01');
    expect(variante('RS-0002').codigoUbicacion).toBe('B-POL-01');
    expect(variante('RS-0007').codigoUbicacion).toBe('B-POL-02');
    expect(variante('RS-0008').codigoUbicacion).toBe('B-POL-03');
    expect(variante('RS-0003').codigoUbicacion).toBe('B-CHA-01');
    expect(variante('RS-0004').codigoUbicacion).toBe('B-PAN-01');
    expect(variante('RS-0006').codigoUbicacion).toBe('B-CIN-01');
    // "Polerones" no puede compartir la zona POL de "Poleras".
    expect(variante('RS-0005').codigoUbicacion).toBe('B-POE-01');
  });

  describe('catálogos de bandas y categorías', () => {
    const lista = (ruta: string) => backend.manejar('GET', ruta, null, token).body as string[];
    const categorias = () => backend.manejar('GET', '/inventario/categorias', null, token).body as Categoria[];

    it('lista las bandas y categorías en orden alfabético', () => {
      expect(lista('/inventario/bandas')).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits']);
      expect(categorias().map((c) => c.nombre)).toEqual(['Chaquetas', 'Cinturones', 'Pantalones', 'Poleras', 'Polerones']);
    });

    it('define para cada categoría sus tallas y si lleva banda', () => {
      const porNombre = Object.fromEntries(categorias().map((c) => [c.nombre, c]));

      expect(porNombre['Pantalones']).toEqual({
        nombre: 'Pantalones',
        tallas: ['38', '40', '42', '44', '46', '48', '50'],
        usaBanda: false,
      });
      expect(porNombre['Poleras']).toEqual({
        nombre: 'Poleras',
        tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        usaBanda: true,
      });
      expect(porNombre['Cinturones']).toMatchObject({ tallas: ['Única'], usaBanda: false });
    });

    it('crea una categoría nueva con tallas de letras y banda', () => {
      const respuesta = post('/inventario/categorias', { nombre: 'Gorros' }).body as Categoria[];

      expect(respuesta.find((c) => c.nombre === 'Gorros')).toEqual({
        nombre: 'Gorros',
        tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        usaBanda: true,
      });
    });

    it('ignora la banda en un producto de una categoría sin bandas y registra su talla nueva', () => {
      const respuesta = post('/inventario/productos', {
        claveIdempotencia: 'pantalon-1',
        nombre: 'Pantalón Cargo',
        categoria: 'Pantalones',
        banda: 'Metallica',
        talla: '52',
        color: 'Negro',
        imagen: 'data:image/jpeg;base64,AAAA',
        cantidad: 2,
        ubicacion: 'BODEGA',
      });

      expect(respuesta.body).toMatchObject({ categoria: 'Pantalones', banda: null, talla: '52' });
      expect(categorias().find((c) => c.nombre === 'Pantalones')?.tallas).toContain('52');
    });

    it('registra una banda sin necesidad de un producto', () => {
      const respuesta = post('/inventario/bandas', { nombre: ' Motörhead ' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits', 'Motörhead']);
      expect(lista('/inventario/bandas')).toContain('Motörhead');
    });

    it('no duplica un nombre ya registrado ni acepta uno vacío', () => {
      expect(post('/inventario/bandas', { nombre: 'METALLICA' }).body).toHaveLength(4);
      expect(post('/inventario/categorias', { nombre: 'poleras' }).body).toHaveLength(5);
      expect(post('/inventario/bandas', { nombre: '  ' }).status).toBe(400);
      expect(post('/inventario/categorias', {}).status).toBe(400);
    });

    it('lista y registra colores igual que las bandas', () => {
      expect(lista('/inventario/colores')).toEqual(['Azul', 'Gris', 'Negro']);

      expect(post('/inventario/colores', { nombre: 'Burdeo' }).body).toEqual(['Azul', 'Burdeo', 'Gris', 'Negro']);
      expect(post('/inventario/colores', { nombre: 'negro' }).body).toHaveLength(4);
      expect(post('/inventario/colores', { nombre: '' }).status).toBe(400);
    });

    it('usa el color ya registrado al crear un producto que lo escribe distinto', () => {
      const respuesta = post('/inventario/productos', {
        claveIdempotencia: 'colores-1',
        nombre: 'Gorro Bomber',
        categoria: 'Gorros',
        banda: null,
        talla: 'Única',
        color: 'NEGRO',
        imagen: 'data:image/jpeg;base64,AAAA',
        cantidad: 5,
        ubicacion: 'BODEGA',
      });

      expect(respuesta.body).toMatchObject({ color: 'Negro' });
      expect(lista('/inventario/colores')).toEqual(['Azul', 'Gris', 'Negro']);
    });

    it('registra la banda y la categoría nuevas al crear un producto', () => {
      post('/inventario/productos', {
        claveIdempotencia: 'catalogos-1',
        nombre: 'Gorro Bomber',
        categoria: 'Gorros',
        banda: 'Motörhead',
        talla: 'Única',
        color: 'Negro',
        imagen: 'data:image/jpeg;base64,AAAA',
        cantidad: 5,
        ubicacion: 'BODEGA',
      });

      expect(lista('/inventario/bandas')).toContain('Motörhead');
      expect(categorias().map((c) => c.nombre)).toContain('Gorros');
    });
  });

  describe('alta de productos', () => {
    const nuevo = (datos: Record<string, unknown> = {}) =>
      post('/inventario/productos', {
        claveIdempotencia: crypto.randomUUID(),
        nombre: 'Gorro Tour',
        categoria: 'Gorros',
        banda: 'Metallica',
        talla: 'Única',
        color: 'Negro',
        imagen: 'data:image/jpeg;base64,AAAA',
        cantidad: 5,
        ubicacion: 'BODEGA',
        ...datos,
      });

    it('crea el producto, genera SKU, código y ubicación e ingresa las unidades recibidas', () => {
      const respuesta = nuevo();

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        sku: 'RS-0009',
        codigo: '7800000000009',
        codigoUbicacion: 'B-GOR-01',
        categoria: 'Gorros',
        banda: 'Metallica',
        activo: true,
        existencias: [
          { ubicacion: 'BODEGA', cantidad: 5 },
          { ubicacion: 'SALA_VENTAS', cantidad: 0 },
        ],
        disponible: 5,
      });
    });

    it('ingresa las unidades en la ubicación indicada', () => {
      nuevo({ cantidad: 3, ubicacion: 'SALA_VENTAS' });

      expect(existencia('RS-0009', 'SALA_VENTAS')).toBe(3);
      expect(existencia('RS-0009', 'BODEGA')).toBe(0);
    });

    it('rechaza una cantidad que no es un entero mayor que cero o una ubicación no válida', () => {
      for (const cantidad of [0, -1, 2.5, '4', undefined]) {
        expect(nuevo({ cantidad }).status).toBe(400);
      }
      expect(nuevo({ ubicacion: 'VITRINA' }).status).toBe(400);
      expect(backend.manejar('GET', '/inventario/variantes/por-codigo/RS-0009', null, token).status).toBe(404);
    });

    it('rechaza una variante repetida sin distinguir mayúsculas ni tildes', () => {
      const respuesta = nuevo({ nombre: 'polera calavera', talla: 'm', color: 'NEGRO' });

      expect(respuesta).toMatchObject({ status: 409, body: { codigo: 'VARIANTE_DUPLICADA' } });
    });

    it('agrega una talla nueva a un producto existente conservando su ubicación, banda y foto', () => {
      const respuesta = nuevo({ nombre: 'Polera Calavera', categoria: 'Otra', banda: null, talla: 'XL' });

      expect(respuesta.body).toMatchObject({
        producto: 'Polera Calavera',
        categoria: 'Poleras',
        banda: 'Misfits',
        talla: 'XL',
        codigoUbicacion: 'B-POL-01',
        imagenUrl: 'assets/prendas/polera-calavera.jpg',
      });
    });

    it('rechaza el alta si falta un dato obligatorio o la foto', () => {
      for (const faltante of ['nombre', 'categoria', 'talla', 'color', 'imagen']) {
        expect(nuevo({ [faltante]: ' ' }).status).toBe(400);
      }
      expect(variante('RS-0008').sku).toBe('RS-0008');
      expect(backend.manejar('GET', '/inventario/variantes/por-codigo/RS-0009', null, token).status).toBe(404);
    });

    it('no crea dos productos al reenviar la misma clave', () => {
      const primera = nuevo({ claveIdempotencia: 'producto-1' });
      const segunda = nuevo({ claveIdempotencia: 'producto-1' });

      expect(segunda.body).toEqual(primera.body);
      expect(existencia('RS-0009', 'BODEGA')).toBe(5);
      expect(backend.manejar('GET', '/inventario/variantes/por-codigo/RS-0010', null, token).status).toBe(404);
    });
  });

  it('calcula la disponibilidad como existencias menos reservas', () => {
    expect(variante('RS-0002')).toMatchObject({ reservado: 3, disponible: 7 });
  });

  it('registra un ingreso de varias variantes con un movimiento por cada una', () => {
    const respuesta = post('/inventario/movimientos/ingresos', {
      claveIdempotencia: 'i1',
      ubicacion: 'BODEGA',
      lineas: [
        { idVariante: 1, cantidad: 12 },
        { idVariante: 3, cantidad: 2 },
      ],
    });
    const resultado = respuesta.body as ResultadoMovimientos;

    expect(respuesta.status).toBe(200);
    expect(resultado.movimientos.map((m) => [m.tipo, m.idVariante, m.cantidad, m.idUsuario])).toEqual([
      ['INGRESO', 1, 12, 1],
      ['INGRESO', 3, 2, 1],
    ]);
    expect(existencia('RS-0001', 'BODEGA')).toBe(24);
    expect(existencia('RS-0003', 'BODEGA')).toBe(6);
  });

  it('rechaza el ingreso completo si una cantidad no es válida', () => {
    for (const cantidad of [0, -1, 1.5]) {
      const respuesta = post('/inventario/movimientos/ingresos', {
        claveIdempotencia: `i-${cantidad}`,
        ubicacion: 'BODEGA',
        lineas: [
          { idVariante: 1, cantidad: 5 },
          { idVariante: 3, cantidad },
        ],
      });
      expect(respuesta.status).toBe(400);
    }
    expect(existencia('RS-0001', 'BODEGA')).toBe(12);
  });

  it('no duplica una operación reenviada con la misma clave', () => {
    const cuerpo = { claveIdempotencia: 'repetida', ubicacion: 'BODEGA', lineas: [{ idVariante: 1, cantidad: 5 }] };
    const primera = post('/inventario/movimientos/ingresos', cuerpo);
    const segunda = post('/inventario/movimientos/ingresos', cuerpo);

    expect(segunda.body).toEqual(primera.body);
    expect(existencia('RS-0001', 'BODEGA')).toBe(17);
  });

  it('registra una merma con tipo y motivo y descuenta la existencia', () => {
    const respuesta = post('/inventario/movimientos/mermas', {
      claveIdempotencia: 'm1',
      idVariante: 1,
      ubicacion: 'BODEGA',
      cantidad: 2,
      tipoMerma: 'DANADO',
      motivo: 'Costura rota',
    });
    expect((respuesta.body as ResultadoMovimientos).movimientos[0]).toMatchObject({
      tipo: 'MERMA',
      tipoMerma: 'DANADO',
      cantidad: 2,
      motivo: 'Costura rota',
      idUsuario: 1,
    });
    expect(existencia('RS-0001', 'BODEGA')).toBe(10);
  });

  it('rechaza una merma sin motivo, sin tipo válido o mayor a la existencia', () => {
    const base = { idVariante: 1, ubicacion: 'SALA_VENTAS', cantidad: 1, tipoMerma: 'MUESTRA', motivo: 'Vitrina' };
    expect(post('/inventario/movimientos/mermas', { ...base, claveIdempotencia: 'a', motivo: '  ' }).status).toBe(400);
    expect(post('/inventario/movimientos/mermas', { ...base, claveIdempotencia: 'b', tipoMerma: 'ROBO' }).status).toBe(400);
    const excesiva = post('/inventario/movimientos/mermas', { ...base, claveIdempotencia: 'c', cantidad: 4 });
    expect(excesiva).toMatchObject({ status: 409, body: { codigo: 'STOCK_INSUFICIENTE' } });
    expect(existencia('RS-0001', 'SALA_VENTAS')).toBe(3);
  });

  it('rechaza una merma que dejaría la existencia bajo las unidades reservadas', () => {
    // RS-0002: 8 en bodega + 2 en sala, 3 reservadas.
    const respuesta = post('/inventario/movimientos/mermas', {
      claveIdempotencia: 'r1',
      idVariante: 2,
      ubicacion: 'BODEGA',
      cantidad: 8,
      tipoMerma: 'DANADO',
      motivo: 'Humedad',
    });
    expect(respuesta).toMatchObject({ status: 409, body: { codigo: 'UNIDADES_RESERVADAS' } });
    expect(existencia('RS-0002', 'BODEGA')).toBe(8);
  });

  it('traspasa unidades entre ubicaciones sin cambiar el total', () => {
    const respuesta = post('/inventario/movimientos/traspasos', {
      claveIdempotencia: 't1',
      idVariante: 1,
      origen: 'BODEGA',
      destino: 'SALA_VENTAS',
      cantidad: 3,
      motivo: 'Reposición de sala',
    });
    expect(respuesta.status).toBe(200);
    expect(existencia('RS-0001', 'BODEGA')).toBe(9);
    expect(existencia('RS-0001', 'SALA_VENTAS')).toBe(6);
    expect(variante('RS-0001').disponible).toBe(15);
  });

  it('rechaza un traspaso sin existencia suficiente en el origen o sin motivo', () => {
    const base = { idVariante: 4, origen: 'SALA_VENTAS', destino: 'BODEGA', cantidad: 1, motivo: 'Devuelta a bodega' };
    expect(post('/inventario/movimientos/traspasos', { ...base, claveIdempotencia: 'a' })).toMatchObject({
      status: 409,
      body: { codigo: 'STOCK_INSUFICIENTE' },
    });
    expect(post('/inventario/movimientos/traspasos', { ...base, claveIdempotencia: 'b', origen: 'BODEGA', destino: 'SALA_VENTAS', motivo: '' }).status).toBe(400);
  });

  it('ajusta la existencia a la cantidad contada y registra la diferencia', () => {
    const respuesta = post('/inventario/movimientos/ajustes', {
      claveIdempotencia: 'c1',
      idVariante: 1,
      ubicacion: 'BODEGA',
      cantidadContada: 7,
      motivo: 'Conteo mensual',
    });
    expect((respuesta.body as ResultadoMovimientos).movimientos[0]).toMatchObject({ tipo: 'AJUSTE', cantidad: -5 });
    expect(existencia('RS-0001', 'BODEGA')).toBe(7);
  });

  it('rechaza movimientos sobre una variante desactivada', () => {
    const respuesta = post('/inventario/movimientos/ingresos', {
      claveIdempotencia: 'd1',
      ubicacion: 'BODEGA',
      lineas: [{ idVariante: 6, cantidad: 1 }],
    });
    expect(respuesta).toMatchObject({ status: 409, body: { codigo: 'VARIANTE_INACTIVA' } });
  });

  it('lista los pedidos y permite filtrarlos por estado', () => {
    const todos = backend.manejar('GET', '/logistica/pedidos', null, token).body as { estado: string }[];
    const despachados = backend.manejar('GET', '/logistica/pedidos?estado=DESPACHADO', null, token).body as {
      idPedido: number;
    }[];

    expect(todos).toHaveLength(7);
    expect(despachados.map((p) => p.idPedido)).toEqual([1004, 1005]);
    expect(backend.manejar('GET', '/logistica/pedidos', null, null).status).toBe(401);
  });

  it('registra la duración solo de las búsquedas completadas', () => {
    const encontrada = post('/inventario/busquedas', { idVariante: 1 }).body as { idBusqueda: number };
    const cancelada = post('/inventario/busquedas', { idVariante: 3 }).body as { idBusqueda: number };

    const cierre = backend.manejar('PATCH', `/inventario/busquedas/${encontrada.idBusqueda}`, { resultado: 'ENCONTRADA' }, token);
    const abandono = backend.manejar('PATCH', `/inventario/busquedas/${cancelada.idBusqueda}`, { resultado: 'CANCELADA' }, token);

    expect(cierre.body).toMatchObject({ duracionSegundos: expect.any(Number), fin: expect.any(String) });
    expect(abandono.body).not.toHaveProperty('duracionSegundos');
    expect(abandono.body).not.toHaveProperty('fin');
  });
});
