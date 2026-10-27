// Genera un historial de ventas de ejemplo, para mostrar el asesor de inversión con más
// datos que los de una tienda recién abierta. Las ventas son inventadas: este programa es
// para una COPIA DE DEMOSTRACIÓN de la base, nunca para la base real, porque mezclaría
// ventas ficticias con las verdaderas en todos los indicadores.
//
//   DATABASE_URL=postgres://rockstar:rockstar_dev@localhost:5433/rockstar npm run ventas:ejemplo -- --demo
//   DATABASE_URL=... npm run ventas:ejemplo -- --demo --borrar      quita las ventas de ejemplo
//
// Protecciones: exige `--demo`, no tiene base por defecto y se niega a usar el puerto 5432,
// que es el de la base real de `docker compose`. Las ventas que crea llevan la clave
// `ejemplo:<n>`, así que se distinguen de las reales y se pueden borrar. Volver a ejecutarlo
// reemplaza las de ejemplo anteriores. No modifica el stock: son ventas que ya ocurrieron.

import pg from 'pg';

const DIAS = 90;
const VENTAS = 260;
const PUERTO_DE_LA_BASE_REAL = '5432';
const PREFIJO = 'ejemplo:';

/** Cuánto se vende cada banda frente a las demás. Inventado, para que el historial tenga forma. */
const DEMANDA_POR_BANDA = {
  'Iron Maiden': 10, Metallica: 9, 'AC/DC': 7, Slayer: 6, 'Guns N\' Roses': 5, Nirvana: 5, Megadeth: 4, 'Black Sabbath': 4,
  Pantera: 3, Misfits: 3, Ramones: 3, Motörhead: 2, Queen: 2, 'Led Zeppelin': 2, Kiss: 1, 'Judas Priest': 1,
};
const DEMANDA_POR_DEFECTO = 2;
const DEMANDA_POR_CATEGORIA = { Poleras: 1, Polerones: 0.45, Pantalones: 0.25, Chaquetas: 0.12 };
/** Bandas cuya venta crece en las últimas semanas, como pasa antes de un concierto. */
const EN_ALZA = new Set(['Iron Maiden', 'Slayer']);

const argumentos = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL?.trim();
if (!argumentos.has('--demo') || !url) {
  console.error('Uso: DATABASE_URL=postgres://... npm run ventas:ejemplo -- --demo [--borrar]\nEs solo para una copia de demostración de la base.');
  process.exit(1);
}
if ((new URL(url).port || PUERTO_DE_LA_BASE_REAL) === PUERTO_DE_LA_BASE_REAL) {
  console.error(`El puerto ${PUERTO_DE_LA_BASE_REAL} es el de la base real. Este programa solo se usa en una copia de demostración, en otro puerto.`);
  process.exit(1);
}

/** Números al azar que se repiten igual en cada ejecución: el historial generado es siempre el mismo. */
function azarCon(semilla) {
  let estado = semilla;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = azarCon(2026);

/** Elige un elemento con probabilidad proporcional a su peso. */
function elegir(elementos, peso) {
  const total = elementos.reduce((suma, elemento) => suma + peso(elemento), 0);
  let punto = azar() * total;
  for (const elemento of elementos) {
    punto -= peso(elemento);
    if (punto <= 0) return elemento;
  }
  return elementos.at(-1);
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  const anteriores = `SELECT id_venta FROM ventas.ventas WHERE clave_idempotencia LIKE '${PREFIJO}%'`;
  await cliente.query(`DELETE FROM ventas.detalle_venta WHERE id_venta IN (${anteriores})`);
  await cliente.query(`DELETE FROM ventas.costos_venta WHERE id_venta IN (${anteriores})`);
  await cliente.query(`DELETE FROM pagos.transacciones WHERE id_venta IN (${anteriores})`);
  const { rowCount: borradas } = await cliente.query(`DELETE FROM ventas.ventas WHERE clave_idempotencia LIKE '${PREFIJO}%'`);
  if (borradas > 0) console.log(`Ventas de ejemplo anteriores borradas: ${borradas}`);

  if (!argumentos.has('--borrar')) {
    const { rows: variantes } = await cliente.query(
      `SELECT v.id_variante, p.precio, p.costo_compra, b.nombre AS banda, c.nombre AS categoria
       FROM inventario.variantes v
       JOIN inventario.productos p ON p.id_producto = v.id_producto
       JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
       LEFT JOIN inventario.bandas b ON b.id_banda = p.id_banda
       WHERE v.activo AND p.activo AND p.precio IS NOT NULL`,
    );
    const { rows: [vendedor] } = await cliente.query(
      `SELECT u.id_usuario FROM usuarios.usuarios u JOIN usuarios.roles r USING (id_rol) WHERE r.nombre = 'VENDEDOR' AND u.activo ORDER BY 1 LIMIT 1`,
    );
    const { rows: medios } = await cliente.query('SELECT id_medio, tasa_comision FROM pagos.medios_pago WHERE presencial');
    const { rows: [{ id_estado: pagada }] } = await cliente.query(`SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA'`);
    if (variantes.length === 0 || !vendedor || medios.length === 0) {
      throw new Error('La base no tiene productos con precio, un Vendedor activo o medios de pago presenciales.');
    }

    let unidades = 0;
    for (let n = 1; n <= VENTAS; n++) {
      // Más ventas hacia el presente: una tienda que va creciendo.
      const diasAtras = Math.floor(DIAS * (1 - Math.sqrt(azar())));
      const reciente = diasAtras <= 30;
      const lineas = new Map();
      const cantidadDeLineas = elegir([1, 2, 3], (lineasPosibles) => [0, 70, 25, 5][lineasPosibles]);
      for (let i = 0; i < cantidadDeLineas; i++) {
        const variante = elegir(variantes, (v) => {
          const demanda = DEMANDA_POR_BANDA[v.banda] ?? DEMANDA_POR_DEFECTO;
          return demanda * (DEMANDA_POR_CATEGORIA[v.categoria] ?? 0.1) * (reciente && EN_ALZA.has(v.banda) ? 2.5 : 1);
        });
        lineas.set(variante, (lineas.get(variante) ?? 0) + elegir([1, 2, 3], (cantidad) => [0, 80, 17, 3][cantidad]));
      }
      const total = [...lineas].reduce((suma, [variante, cantidad]) => suma + variante.precio * cantidad, 0);
      const medio = elegir(medios, () => 1);
      const comision = Math.round(total * Number(medio.tasa_comision));
      // A una hora de tienda, entre las 11 y las 20.
      const fecha = new Date(Date.now() - diasAtras * 86_400_000);
      fecha.setHours(11 + Math.floor(azar() * 9), Math.floor(azar() * 60), 0, 0);

      const { rows: [{ id_venta: idVenta }] } = await cliente.query(
        `INSERT INTO ventas.ventas (canal, id_vendedor, id_estado, fecha, total, clave_idempotencia)
         VALUES ('POS', $1, $2, $3, $4, $5) RETURNING id_venta`,
        [vendedor.id_usuario, pagada, fecha, total, `${PREFIJO}${n}`],
      );
      for (const [variante, cantidad] of lineas) {
        await cliente.query(
          `INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario, costo_unitario, id_ubicacion)
           VALUES ($1, $2, $3, $4, $5, (SELECT id_ubicacion FROM inventario.ubicaciones WHERE nombre = 'SALA_VENTAS'))`,
          [idVenta, variante.id_variante, cantidad, variante.precio, variante.costo_compra],
        );
        unidades += cantidad;
      }
      await cliente.query(
        `INSERT INTO pagos.transacciones (id_venta, id_medio, monto, estado, comision, creado_en, resuelto_en)
         VALUES ($1, $2, $3, 'AUTORIZADA', $4, $5, $5)`,
        [idVenta, medio.id_medio, total, comision, fecha],
      );
      await cliente.query('INSERT INTO ventas.costos_venta (id_venta, comision_pago) VALUES ($1, $2)', [idVenta, comision]);
    }
    console.log(`Ventas de ejemplo creadas: ${VENTAS}, con ${unidades} unidades, en los últimos ${DIAS} días.`);
  }
  await cliente.query('COMMIT');
} catch (error) {
  await cliente.query('ROLLBACK');
  console.error(`No se generó nada: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
