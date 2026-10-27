import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Pruebas del modelo de datos: aplican las migraciones sobre un PostgreSQL vacío y
 * verifican las tablas, los datos de referencia y las restricciones que protegen la
 * integridad aunque el servicio tenga un error.
 */

const DIRECTORIO = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const MIGRACIONES = readdirSync(DIRECTORIO)
  .filter((nombre) => nombre.endsWith('.sql'))
  .sort();

async function aplicar(db: PGlite, migraciones: string[]): Promise<void> {
  for (const nombre of migraciones) {
    await db.exec(readFileSync(join(DIRECTORIO, nombre), 'utf8'));
  }
}

const TABLAS_DEL_DISENO: Record<string, string[]> = {
  usuarios: ['roles', 'sesiones', 'usuarios'],
  inventario: [
    'bandas',
    'busquedas',
    'categorias',
    'categorias_tallas',
    'colores',
    'conteos',
    'existencias',
    'movimientos',
    'ofertas',
    'operaciones',
    'productos',
    'reservas',
    'tallas',
    'tipos_merma',
    'tipos_movimiento',
    'ubicaciones',
    'variantes',
  ],
  ventas: ['cierres_caja', 'costos_venta', 'detalle_venta', 'estados_venta', 'parametros_financieros', 'ventas', 'visitas'],
  pagos: ['medios_pago', 'transacciones'],
  logistica: [
    'comunas',
    'despachos_pendientes',
    'estados_pedido',
    'historial_pedido',
    'pedidos',
    'regiones',
    'solicitudes_despacho',
    'tarifas_cache',
    'tarifas_respaldo',
  ],
};

const COMUNAS_POR_REGION: Record<string, number> = {
  'Arica y Parinacota': 4,
  Tarapacá: 7,
  Antofagasta: 9,
  Atacama: 9,
  Coquimbo: 15,
  Valparaíso: 38,
  'Región Metropolitana': 52,
  'O’Higgins': 33,
  Maule: 30,
  Ñuble: 21,
  Biobío: 33,
  'La Araucanía': 32,
  'Los Ríos': 12,
  'Los Lagos': 30,
  Aysén: 10,
  Magallanes: 11,
};

describe('modelo de datos', () => {
  let db: PGlite;

  const filas = async <T>(sql: string, parametros: unknown[] = []) => (await db.query<T>(sql, parametros)).rows;
  const valor = async <T>(sql: string, parametros: unknown[] = []) => Object.values((await filas<object>(sql, parametros))[0]!)[0] as T;
  const rechaza = (sql: string, parametros: unknown[] = []) => expect(db.query(sql, parametros)).rejects.toThrow();

  /** Datos mínimos sobre los que probar las restricciones: una cuenta de cada tipo y una prenda. */
  let vendedor: number;
  let cliente: number;
  let variante: number;
  let comuna: number;

  async function nuevaVenta(canal: 'POS' | 'ECOMMERCE', estado = 'PAGADA'): Promise<number> {
    return valor<number>(
      `INSERT INTO ventas.ventas (canal, id_vendedor, id_cliente, id_estado, total, clave_idempotencia)
       VALUES ($1, $2, $3, (SELECT id_estado FROM ventas.estados_venta WHERE codigo = $4), 10000, gen_random_uuid()::text)
       RETURNING id_venta`,
      [canal, canal === 'POS' ? vendedor : null, canal === 'ECOMMERCE' ? cliente : null, estado],
    );
  }

  beforeAll(async () => {
    db = await PGlite.create();
    await aplicar(db, MIGRACIONES);

    const cuenta = (email: string, rol: string) =>
      valor<number>(
        `INSERT INTO usuarios.usuarios (nombre, email, hash_contrasena, id_rol)
         VALUES ($1, $1, 'hash', (SELECT id_rol FROM usuarios.roles WHERE nombre = $2)) RETURNING id_usuario`,
        [email, rol],
      );
    vendedor = await cuenta('vendedor@prueba.cl', 'VENDEDOR');
    cliente = await cuenta('cliente@prueba.cl', 'CLIENTE');
    await db.exec(`
      INSERT INTO inventario.categorias (nombre, clave, zona) VALUES ('Poleras', 'poleras', 'POL');
      INSERT INTO inventario.tallas (nombre, clave) VALUES ('M', 'm'), ('L', 'l');
      INSERT INTO inventario.colores (nombre, clave) VALUES ('Negro', 'negro');
      INSERT INTO inventario.productos (id_categoria, codigo_ubicacion, nombre, clave, precio, costo_compra)
        VALUES (1, 'B-POL-01', 'Polera', 'polera', 15000, 6000);
      INSERT INTO inventario.variantes (id_producto, id_talla, id_color, sku, codigo) VALUES (1, 1, 1, 'RS-0001', '7800000000001');
    `);
    variante = await valor<number>('SELECT id_variante FROM inventario.variantes');
    comuna = await valor<number>(`SELECT id_comuna FROM logistica.comunas WHERE nombre = 'Providencia'`);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  describe('estructura', () => {
    it('crea todas las tablas del diseño, en su esquema', async () => {
      const tablas = await filas<{ esquema: string; tabla: string }>(
        `SELECT table_schema AS esquema, table_name AS tabla FROM information_schema.tables
         WHERE table_schema = ANY($1) ORDER BY table_name`,
        [Object.keys(TABLAS_DEL_DISENO)],
      );
      for (const [esquema, esperadas] of Object.entries(TABLAS_DEL_DISENO)) {
        expect(tablas.filter((t) => t.esquema === esquema).map((t) => t.tabla), esquema).toEqual(esperadas);
      }
    });

    it('toda tabla tiene clave primaria', async () => {
      const sinClave = await filas(
        `SELECT t.table_schema || '.' || t.table_name AS tabla
         FROM information_schema.tables t
         WHERE t.table_schema = ANY($1) AND NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints c
           WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.constraint_type = 'PRIMARY KEY')`,
        [Object.keys(TABLAS_DEL_DISENO)],
      );
      expect(sinClave).toEqual([]);
    });

    it('las relaciones entre esquemas son claves foráneas reales', async () => {
      const relaciones = await filas<{ relacion: string }>(
        `SELECT DISTINCT origen.nspname || '.' || tabla.relname || ' -> ' || destino.nspname || '.' || referida.relname AS relacion
         FROM pg_constraint c
         JOIN pg_class tabla ON tabla.oid = c.conrelid JOIN pg_namespace origen ON origen.oid = tabla.relnamespace
         JOIN pg_class referida ON referida.oid = c.confrelid JOIN pg_namespace destino ON destino.oid = referida.relnamespace
         WHERE c.contype = 'f' AND origen.nspname <> destino.nspname ORDER BY 1`,
      );
      expect(relaciones.map((r) => r.relacion)).toEqual([
        'inventario.busquedas -> usuarios.usuarios',
        'inventario.conteos -> usuarios.usuarios',
        'inventario.movimientos -> usuarios.usuarios',
        'inventario.movimientos -> ventas.ventas',
        'inventario.ofertas -> usuarios.usuarios',
        'inventario.operaciones -> usuarios.usuarios',
        'inventario.reservas -> ventas.ventas',
        'logistica.historial_pedido -> usuarios.usuarios',
        'logistica.pedidos -> ventas.ventas',
        'logistica.solicitudes_despacho -> ventas.ventas',
        'pagos.transacciones -> ventas.ventas',
        'ventas.cierres_caja -> usuarios.usuarios',
        'ventas.detalle_venta -> inventario.ubicaciones',
        'ventas.detalle_venta -> inventario.variantes',
        'ventas.parametros_financieros -> usuarios.usuarios',
        'ventas.ventas -> usuarios.usuarios',
      ]);
    });
  });

  describe('datos de referencia', () => {
    it.each([
      ['usuarios.roles', 'nombre', ['BODEGA', 'CLIENTE', 'GERENTE', 'RRHH', 'VENDEDOR']],
      ['inventario.ubicaciones', 'nombre', ['BODEGA', 'SALA_VENTAS']],
      ['inventario.tipos_movimiento', 'codigo', ['AJUSTE', 'DESPACHO', 'DEVOLUCION', 'INGRESO', 'MERMA', 'TRASPASO', 'VENTA']],
      ['inventario.tipos_merma', 'codigo', ['CAMBIO', 'DANADO', 'MUESTRA']],
      ['ventas.estados_venta', 'codigo', ['EXPIRADA', 'PAGADA', 'PENDIENTE_PAGO', 'RECHAZADA', 'REVERSADA']],
      ['logistica.estados_pedido', 'codigo', ['ATENCION_MANUAL', 'DESPACHADO', 'DESPACHO_PENDIENTE', 'EN_PREPARACION', 'ENTREGADO', 'PAGADO']],
      [
        'pagos.medios_pago',
        'codigo',
        ['CREDITO_PRESENCIAL', 'DEBITO_PRESENCIAL', 'EFECTIVO', 'TRANSFERENCIA', 'WEBPAY_CREDITO', 'WEBPAY_DEBITO', 'WEBPAY_PREPAGO'],
      ],
    ])('%s trae sus valores', async (tabla, columna, esperados) => {
      const valores = await filas<{ v: string }>(`SELECT ${columna} AS v FROM ${tabla}`);
      // Se compara como conjunto: el orden de estas filas no significa nada.
      expect(valores.map((f) => f.v).sort()).toEqual([...esperados].sort());
    });

    it('los medios presenciales son los que se cobran en la tienda', async () => {
      const presenciales = await filas<{ codigo: string }>(
        'SELECT codigo FROM pagos.medios_pago WHERE presencial ORDER BY id_medio',
      );
      expect(presenciales.map((m) => m.codigo)).toEqual(['EFECTIVO', 'DEBITO_PRESENCIAL', 'CREDITO_PRESENCIAL', 'TRANSFERENCIA']);
    });

    it('trae las 346 comunas de Chile repartidas en sus 16 regiones', async () => {
      const porRegion = await filas<{ region: string; comunas: number }>(
        `SELECT r.nombre AS region, count(c.id_comuna)::int AS comunas
         FROM logistica.regiones r LEFT JOIN logistica.comunas c ON c.id_region = r.id_region
         GROUP BY r.id_region ORDER BY r.id_region`,
      );
      expect(Object.fromEntries(porRegion.map((f) => [f.region, f.comunas]))).toEqual(COMUNAS_POR_REGION);
      expect(porRegion.reduce((suma, f) => suma + f.comunas, 0)).toBe(346);
    });

    it('la zona tarifaria es Santiago solo en la Región Metropolitana', async () => {
      const zonas = await filas<{ zona: string; regiones: string[] }>(
        `SELECT c.zona, array_agg(DISTINCT r.nombre) AS regiones
         FROM logistica.comunas c JOIN logistica.regiones r ON r.id_region = c.id_region GROUP BY c.zona`,
      );
      expect(zonas.find((z) => z.zona === 'SANTIAGO')!.regiones).toEqual(['Región Metropolitana']);
      expect(zonas.find((z) => z.zona === 'REGIONES')!.regiones).toHaveLength(15);
    });

    it('distingue las comunas del mismo nombre por su región', async () => {
      // "San Pedro" es comuna de la Región Metropolitana; no debe confundirse con otras parecidas.
      expect(await valor(`SELECT count(*)::int FROM logistica.comunas WHERE nombre = 'San Pedro'`)).toBe(1);
      expect(await valor(`SELECT count(*)::int FROM logistica.comunas WHERE nombre LIKE 'San Pedro%'`)).toBe(3);
      await rechaza(`INSERT INTO logistica.comunas (id_region, nombre, zona) VALUES (7, 'Santiago', 'SANTIAGO')`);
    });
  });

  describe('inventario', () => {
    it('la existencia de una ubicación no puede quedar negativa', async () => {
      await db.query('INSERT INTO inventario.existencias (id_variante, id_ubicacion, cantidad) VALUES ($1, 1, 5)', [variante]);

      await rechaza('UPDATE inventario.existencias SET cantidad = cantidad - 6 WHERE id_variante = $1', [variante]);

      expect(await valor('SELECT cantidad FROM inventario.existencias WHERE id_variante = $1', [variante])).toBe(5);
    });

    it('no admite dos variantes con la misma talla y color, ni un SKU repetido', async () => {
      await rechaza(`INSERT INTO inventario.variantes (id_producto, id_talla, id_color, sku, codigo) VALUES (1, 1, 1, 'RS-0002', '2')`);
      await rechaza(`INSERT INTO inventario.variantes (id_producto, id_talla, id_color, sku, codigo) VALUES (1, 2, 1, 'RS-0001', '3')`);
    });

    it('una reserva exige una venta existente, una cantidad positiva y un estado conocido', async () => {
      const venta = await nuevaVenta('ECOMMERCE', 'PENDIENTE_PAGO');
      const reservar = (idVenta: number, cantidad: number, estado: string) =>
        db.query('INSERT INTO inventario.reservas (id_venta, id_variante, cantidad, estado) VALUES ($1, $2, $3, $4)', [
          idVenta,
          variante,
          cantidad,
          estado,
        ]);

      await expect(reservar(99_999, 1, 'ACTIVA')).rejects.toThrow();
      await expect(reservar(venta, 0, 'ACTIVA')).rejects.toThrow();
      await expect(reservar(venta, 1, 'OTRA')).rejects.toThrow();
      await expect(reservar(venta, 2, 'ACTIVA')).resolves.toBeDefined();
      // La misma prenda no se reserva dos veces en una venta: sus unidades van en la cantidad.
      await expect(reservar(venta, 1, 'ACTIVA')).rejects.toThrow();
    });

    it('un movimiento por venta exige que la venta exista', async () => {
      const mover = (idVenta: number) =>
        db.query(
          `INSERT INTO inventario.movimientos (id_variante, id_ubicacion, id_tipo, cantidad, id_usuario, motivo, id_venta)
           VALUES ($1, 2, (SELECT id_tipo FROM inventario.tipos_movimiento WHERE codigo = 'VENTA'), 1, $2, 'Venta POS', $3)`,
          [variante, vendedor, idVenta],
        );

      await expect(mover(99_999)).rejects.toThrow();
      await expect(mover(await nuevaVenta('POS'))).resolves.toBeDefined();
    });

    it('todo movimiento lleva un motivo', async () => {
      await rechaza(
        `INSERT INTO inventario.movimientos (id_variante, id_ubicacion, id_tipo, cantidad, id_usuario, motivo) VALUES ($1, 1, 1, 1, $2, '  ')`,
        [variante, vendedor],
      );
    });
  });

  describe('ventas', () => {
    it('una venta POS exige vendedor y una del e-commerce exige cliente', async () => {
      const venta = (canal: string, idVendedor: number | null, idCliente: number | null) =>
        db.query(
          `INSERT INTO ventas.ventas (canal, id_vendedor, id_cliente, id_estado, total, clave_idempotencia)
           VALUES ($1, $2, $3, 1, 1000, gen_random_uuid()::text)`,
          [canal, idVendedor, idCliente],
        );

      await expect(venta('POS', null, cliente)).rejects.toThrow();
      await expect(venta('ECOMMERCE', vendedor, null)).rejects.toThrow();
      await expect(venta('TELEFONO', vendedor, cliente)).rejects.toThrow();
      await expect(venta('POS', vendedor, null)).resolves.toBeDefined();
    });

    it('la clave de idempotencia impide registrar dos veces la misma venta', async () => {
      const insertar = () =>
        db.query(
          `INSERT INTO ventas.ventas (canal, id_vendedor, id_estado, total, clave_idempotencia) VALUES ('POS', $1, 2, 1000, 'clave-repetida')`,
          [vendedor],
        );
      await insertar();
      await expect(insertar()).rejects.toThrow();
    });

    it('el subtotal de una línea se calcula solo y no se puede escribir', async () => {
      const venta = await nuevaVenta('POS');
      const subtotal = await valor(
        `INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario, costo_unitario, id_ubicacion)
         VALUES ($1, $2, 3, 15000, 6000, 2) RETURNING subtotal`,
        [venta, variante],
      );
      expect(subtotal).toBe(45000);

      await rechaza('UPDATE ventas.detalle_venta SET subtotal = 1 WHERE id_venta = $1', [venta]);
      await rechaza(
        'INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario) VALUES ($1, $2, 0, 15000)',
        [venta, variante],
      );
    });

    it('cada venta tiene a lo más una fila de costos', async () => {
      const venta = await nuevaVenta('POS');
      await db.query('INSERT INTO ventas.costos_venta (id_venta, comision_pago) VALUES ($1, 300)', [venta]);

      await rechaza('INSERT INTO ventas.costos_venta (id_venta) VALUES ($1)', [venta]);
      await rechaza('UPDATE ventas.costos_venta SET comision_pago = -1 WHERE id_venta = $1', [venta]);
    });

    it('varias páginas de una misma visita cuentan una sola', async () => {
      const visitar = (sesion: string) =>
        db.query('INSERT INTO ventas.visitas (id_sesion) VALUES ($1) ON CONFLICT (id_sesion) DO NOTHING', [sesion]);
      const antes = await valor<number>('SELECT count(*)::int FROM ventas.visitas');

      await visitar('11111111-1111-4111-8111-111111111111');
      await visitar('11111111-1111-4111-8111-111111111111');
      await visitar('22222222-2222-4222-8222-222222222222');

      expect(await valor('SELECT count(*)::int FROM ventas.visitas')).toBe(antes + 2);
    });

    it('los parámetros financieros son una sola fila con valores válidos', async () => {
      const guardar = (id: number, horizonte: number) =>
        db.query(
          `INSERT INTO ventas.parametros_financieros (id, inversion_inicial, tasa_descuento_anual, horizonte_meses, actualizado_por)
           VALUES ($1, 5000000, 0.12, $2, $3)`,
          [id, horizonte, vendedor],
        );

      await expect(guardar(1, 0)).rejects.toThrow();
      await expect(guardar(1, 24)).resolves.toBeDefined();
      await expect(guardar(2, 24)).rejects.toThrow();
      await expect(guardar(1, 12)).rejects.toThrow();
    });
  });

  describe('pagos', () => {
    it('la tasa de comisión es una fracción entre 0 y 1', async () => {
      await rechaza(`UPDATE pagos.medios_pago SET tasa_comision = 1.5 WHERE codigo = 'EFECTIVO'`);
      await rechaza(`UPDATE pagos.medios_pago SET tasa_comision = -0.01 WHERE codigo = 'EFECTIVO'`);
      await db.query(`UPDATE pagos.medios_pago SET tasa_comision = 0.0295 WHERE codigo = 'WEBPAY_CREDITO'`);
      expect(await valor(`SELECT tasa_comision::float FROM pagos.medios_pago WHERE codigo = 'WEBPAY_CREDITO'`)).toBe(0.0295);
    });

    it('el token de la pasarela identifica una sola transacción', async () => {
      const venta = await nuevaVenta('ECOMMERCE', 'PENDIENTE_PAGO');
      const crear = () =>
        db.query(`INSERT INTO pagos.transacciones (id_venta, monto, estado, token_webpay) VALUES ($1, 10000, 'PENDIENTE', 'token-1')`, [
          venta,
        ]);
      await crear();
      await expect(crear()).rejects.toThrow();
    });

    it('una transacción está pendiente exactamente mientras no tiene fecha de resolución', async () => {
      const venta = await nuevaVenta('ECOMMERCE', 'PENDIENTE_PAGO');
      const crear = (estado: string, resuelta: boolean) =>
        db.query(
          `INSERT INTO pagos.transacciones (id_venta, monto, estado, resuelto_en) VALUES ($1, 10000, $2, CASE WHEN $3 THEN now() END)`,
          [venta, estado, resuelta],
        );

      await expect(crear('PENDIENTE', true)).rejects.toThrow();
      await expect(crear('AUTORIZADA', false)).rejects.toThrow();
      await expect(crear('DESCONOCIDO', true)).rejects.toThrow();
      await expect(crear('PENDIENTE', false)).resolves.toBeDefined();
      await expect(crear('RECHAZADA', true)).resolves.toBeDefined();
    });
  });

  describe('logística', () => {
    it('una compra tiene una sola solicitud de despacho, con sus datos completos', async () => {
      const venta = await nuevaVenta('ECOMMERCE', 'PENDIENTE_PAGO');
      const solicitar = (direccion: string) =>
        db.query(
          `INSERT INTO logistica.solicitudes_despacho (id_venta, id_comuna, direccion, destinatario, telefono, flete_cotizado)
           VALUES ($1, $2, $3, 'Camila Rojas', '+56911111111', 3990)`,
          [venta, comuna, direccion],
        );

      await expect(solicitar('  ')).rejects.toThrow();
      await expect(solicitar('Av. Providencia 1234')).resolves.toBeDefined();
      await expect(solicitar('Otra dirección 55')).rejects.toThrow();
    });

    it('una venta genera a lo más un pedido', async () => {
      const venta = await nuevaVenta('ECOMMERCE');
      const crear = () =>
        db.query(
          `INSERT INTO logistica.pedidos (id_venta, id_estado, id_comuna, direccion, destinatario, pagado_en)
           VALUES ($1, 1, $2, 'Av. Providencia 1234', 'Camila Rojas', now())`,
          [venta, comuna],
        );
      await crear();
      await expect(crear()).rejects.toThrow();
    });

    it('guarda una tarifa por comuna y tramo, y una de respaldo por zona y tramo', async () => {
      const cache = () =>
        db.query('INSERT INTO logistica.tarifas_cache (id_comuna, tramo_peso, tramo_volumen, valor) VALUES ($1, 1000, 5000, 4200)', [comuna]);
      await cache();
      await expect(cache()).rejects.toThrow();

      await db.query(`INSERT INTO logistica.tarifas_respaldo (zona, tramo_peso, valor) VALUES ('SANTIAGO', 1000, 3990)`);
      await rechaza(`INSERT INTO logistica.tarifas_respaldo (zona, tramo_peso, valor) VALUES ('SANTIAGO', 1000, 4500)`);
      await rechaza(`INSERT INTO logistica.tarifas_respaldo (zona, tramo_peso, valor) VALUES ('EXTRANJERO', 1000, 9990)`);
    });
  });
});

describe('actualización de una base que ya tenía datos', () => {
  it('conserva lo existente y completa las ventas pagadas con su transacción y sus costos', async () => {
    const db = await PGlite.create();
    try {
      // Así estaba la base antes de las migraciones de pagos: con ventas y pedidos, y unas pocas comunas.
      await aplicar(db, MIGRACIONES.filter((nombre) => nombre < '005'));
      await db.exec(`
        INSERT INTO usuarios.usuarios (nombre, email, hash_contrasena, id_rol) VALUES ('Cliente', 'cliente@prueba.cl', 'hash', 1);
        INSERT INTO logistica.comunas (id_region, nombre, zona) VALUES (7, 'Providencia', 'SANTIAGO');
        INSERT INTO ventas.ventas (id_venta, canal, id_cliente, id_estado, total, clave_idempotencia) VALUES
          (5001, 'ECOMMERCE', 1, 2, 19980, 'pagada'),
          (5002, 'ECOMMERCE', 1, 3, 15000, 'rechazada');
        INSERT INTO logistica.pedidos (id_venta, id_estado, id_comuna, direccion, destinatario, flete_cobrado, pagado_en)
          VALUES (5001, 1, 1, 'Av. Providencia 1234', 'Camila Rojas', 4990, now());
      `);

      await aplicar(db, MIGRACIONES.filter((nombre) => nombre >= '005'));

      const transacciones = (await db.query('SELECT id_venta, monto, estado, id_medio FROM pagos.transacciones')).rows;
      expect(transacciones).toEqual([{ id_venta: 5001, monto: 19980, estado: 'AUTORIZADA', id_medio: null }]);
      const costos = (await db.query('SELECT id_venta, flete_cobrado, comision_pago FROM ventas.costos_venta ORDER BY 1')).rows;
      expect(costos).toEqual([
        { id_venta: 5001, flete_cobrado: 4990, comision_pago: 0 },
        { id_venta: 5002, flete_cobrado: 0, comision_pago: 0 },
      ]);
      // La comuna que ya existía conserva su identificador, del que depende el pedido.
      const providencia = (await db.query(`SELECT id_comuna FROM logistica.comunas WHERE nombre = 'Providencia'`)).rows;
      expect(providencia).toEqual([{ id_comuna: 1 }]);
      expect((await db.query('SELECT count(*)::int AS total FROM logistica.comunas')).rows).toEqual([{ total: 346 }]);
    } finally {
      await db.close();
    }
  }, 60_000);
});
