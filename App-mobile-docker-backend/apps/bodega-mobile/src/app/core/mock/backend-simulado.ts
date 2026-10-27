import { Injectable } from '@angular/core';
import type {
  AjusteRequest,
  Busqueda,
  BusquedaRequest,
  Categoria,
  CierreBusquedaRequest,
  ErrorApi,
  IngresoRequest,
  LineaPedido,
  LoginRequest,
  MermaRequest,
  Movimiento,
  NombreRequest,
  Pedido,
  ProductoNuevoRequest,
  RefreshRequest,
  ResultadoMovimientos,
  SesionResponse,
  TipoMerma,
  TraspasoRequest,
  Ubicacion,
  Usuario,
  VarianteEdicionRequest,
  VarianteStock,
} from '@rockstar/contracts';

export interface RespuestaSimulada {
  status: number;
  body: unknown;
}

interface VarianteSimulada {
  idVariante: number;
  sku: string;
  codigo: string;
  producto: string;
  categoria: string;
  banda: string | null;
  imagenUrl: string | null;
  codigoUbicacion: string;
  talla: string;
  color: string;
  activo: boolean;
  existencias: Record<Ubicacion, number>;
  reservado: number;
}

const UBICACIONES: readonly Ubicacion[] = ['BODEGA', 'SALA_VENTAS'];
const TIPOS_MERMA: readonly TipoMerma[] = ['DANADO', 'MUESTRA', 'CAMBIO'];

const CUENTAS: (Usuario & { password: string })[] = [
  { id: 1, nombre: 'Bodega Demo', email: 'bodega@rockstar.cl', password: 'bodega123', rol: 'BODEGA' },
  { id: 2, nombre: 'Vendedor Demo', email: 'vendedor@rockstar.cl', password: 'vendedor123', rol: 'VENDEDOR' },
];

/** Fotos de ejemplo incluidas en la app; su origen y licencia están en `assets/prendas/CREDITOS.md`. */
const IMAGENES: Record<string, string> = {
  'Polera Calavera': 'assets/prendas/polera-calavera.jpg',
  'Polera Eddie': 'assets/prendas/polera-eddie.webp',
  'Polera Rayo': 'assets/prendas/polera-rayo.jpg',
  'Polerón Banda Tour': 'assets/prendas/poleron-banda-tour.jpg',
  'Chaqueta de Cuero Rider': 'assets/prendas/chaqueta-cuero-rider.jpg',
  'Jeans Rasgado': 'assets/prendas/jeans-rasgado.jpg',
  'Cinturón Tachas': 'assets/prendas/cinturon-tachas.jpg',
};

const CATEGORIAS: Record<string, string> = {
  'Polera Calavera': 'Poleras',
  'Polera Eddie': 'Poleras',
  'Polera Rayo': 'Poleras',
  'Polerón Banda Tour': 'Polerones',
  'Chaqueta de Cuero Rider': 'Chaquetas',
  'Jeans Rasgado': 'Pantalones',
  'Cinturón Tachas': 'Cinturones',
};

const TALLAS_DE_LETRAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/** Cada categoría define sus tallas y si sus productos pertenecen a una banda. */
function categoriasIniciales(): Categoria[] {
  return [
    { nombre: 'Poleras', tallas: [...TALLAS_DE_LETRAS], usaBanda: true },
    { nombre: 'Polerones', tallas: [...TALLAS_DE_LETRAS], usaBanda: true },
    { nombre: 'Chaquetas', tallas: [...TALLAS_DE_LETRAS], usaBanda: false },
    { nombre: 'Pantalones', tallas: ['38', '40', '42', '44', '46', '48', '50'], usaBanda: false },
    { nombre: 'Cinturones', tallas: ['Única'], usaBanda: false },
  ];
}

/** Compara nombres sin distinguir mayúsculas ni tildes. */
const mismoTexto = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

const soloLetras = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();

/**
 * Genera el código de ubicación en bodega de cada producto: `B-<zona>-<posición>`.
 * La zona son tres letras de la categoría y la posición es correlativa dentro de ella,
 * de modo que las prendas de una misma categoría quedan juntas.
 */
class AsignadorDeUbicaciones {
  private readonly zonas = new Map<string, string>();
  private readonly posiciones = new Map<string, number>();

  siguiente(categoria: string): string {
    const zona = this.zonaDe(categoria);
    const posicion = (this.posiciones.get(zona) ?? 0) + 1;
    this.posiciones.set(zona, posicion);
    return `B-${zona}-${String(posicion).padStart(2, '0')}`;
  }

  private zonaDe(categoria: string): string {
    const clave = soloLetras(categoria);
    let zona = this.zonas.get(clave);
    if (!zona) {
      // "Poleras" y "Polerones" empiezan igual: la tercera letra avanza hasta dar con una zona libre.
      const usadas = new Set(this.zonas.values());
      const letras = clave.padEnd(3, 'X');
      const candidatas = [...letras.slice(2)].map((letra) => letras.slice(0, 2) + letra);
      zona = candidatas.find((candidata) => !usadas.has(candidata)) ?? `${letras.slice(0, 2)}${usadas.size}`;
      this.zonas.set(clave, zona);
    }
    return zona;
  }
}

function variantesIniciales(ubicaciones: AsignadorDeUbicaciones): VarianteSimulada[] {
  const ubicacionDeProducto = new Map<string, string>();
  const ubicacionDe = (producto: string) => {
    if (!ubicacionDeProducto.has(producto)) {
      ubicacionDeProducto.set(producto, ubicaciones.siguiente(CATEGORIAS[producto]));
    }
    return ubicacionDeProducto.get(producto)!;
  };
  const fila = (
    idVariante: number,
    producto: string,
    banda: string | null,
    talla: string,
    color: string,
    bodega: number,
    sala: number,
    reservado = 0,
    activo = true,
  ): VarianteSimulada => ({
    idVariante,
    sku: `RS-${String(idVariante).padStart(4, '0')}`,
    codigo: `780000000${String(idVariante).padStart(4, '0')}`,
    producto,
    categoria: CATEGORIAS[producto],
    banda,
    imagenUrl: IMAGENES[producto] ?? null,
    codigoUbicacion: ubicacionDe(producto),
    talla,
    color,
    activo,
    existencias: { BODEGA: bodega, SALA_VENTAS: sala },
    reservado,
  });
  return [
    fila(1, 'Polera Calavera', 'Misfits', 'M', 'Negro', 12, 3),
    fila(2, 'Polera Calavera', 'Misfits', 'L', 'Negro', 8, 2, 3),
    fila(3, 'Chaqueta de Cuero Rider', null, 'M', 'Negro', 4, 1),
    fila(4, 'Jeans Rasgado', null, '42', 'Azul', 6, 0),
    fila(5, 'Polerón Banda Tour', 'Metallica', 'XL', 'Gris', 0, 0),
    fila(6, 'Cinturón Tachas', null, 'Única', 'Negro', 5, 5, 0, false),
    fila(7, 'Polera Eddie', 'Iron Maiden', 'M', 'Negro', 9, 2),
    fila(8, 'Polera Rayo', 'AC/DC', 'L', 'Negro', 5, 1),
  ];
}

/** Pedidos de ejemplo con fechas relativas al momento actual, para que siempre haya de cada estado. */
function pedidosIniciales(variantes: VarianteSimulada[]): Pedido[] {
  const haceHoras = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
  const linea = (idVariante: number, cantidad: number): LineaPedido => {
    const { sku, producto, talla, color } = variantes.find((v) => v.idVariante === idVariante)!;
    return { idVariante, sku, producto, talla, color, cantidad };
  };
  const destino = (destinatario: string, direccion: string, comuna: string, region: string) => ({
    destinatario,
    direccion,
    comuna,
    region,
  });
  return [
    {
      idPedido: 1001,
      idVenta: 5001,
      estado: 'PAGADO',
      ...destino('Camila Rojas', 'Av. Providencia 1234, depto 52', 'Providencia', 'Región Metropolitana'),
      lineas: [linea(2, 1)],
      pagadoEn: haceHoras(2),
    },
    {
      idPedido: 1002,
      idVenta: 5002,
      estado: 'EN_PREPARACION',
      ...destino('Matías Fuentes', 'Calle Condell 880', 'Valparaíso', 'Valparaíso'),
      lineas: [linea(2, 1)],
      pagadoEn: haceHoras(20),
    },
    {
      idPedido: 1003,
      idVenta: 5003,
      estado: 'DESPACHO_PENDIENTE',
      ...destino('Javiera Soto', 'Los Carrera 455', 'Concepción', 'Biobío'),
      lineas: [linea(2, 1)],
      pagadoEn: haceHoras(26),
    },
    {
      idPedido: 1004,
      idVenta: 5004,
      estado: 'DESPACHADO',
      ...destino('Diego Muñoz', 'Av. Alemania 310', 'Temuco', 'La Araucanía'),
      lineas: [linea(3, 1), linea(1, 2)],
      pagadoEn: haceHoras(40),
      despachadoEn: haceHoras(22),
      trackingStarken: 'STK-900104',
    },
    {
      idPedido: 1005,
      idVenta: 5005,
      estado: 'DESPACHADO',
      ...destino('Fernanda Castro', 'Arturo Prat 2100', 'Antofagasta', 'Antofagasta'),
      lineas: [linea(4, 1)],
      pagadoEn: haceHoras(70),
      despachadoEn: haceHoras(50),
      trackingStarken: 'STK-900105',
    },
    {
      idPedido: 1006,
      idVenta: 5006,
      estado: 'ENTREGADO',
      ...destino('Sebastián Vera', 'Irarrázaval 3400', 'Ñuñoa', 'Región Metropolitana'),
      lineas: [linea(1, 1)],
      pagadoEn: haceHoras(120),
      despachadoEn: haceHoras(100),
      entregadoEn: haceHoras(75),
      trackingStarken: 'STK-900106',
    },
    {
      idPedido: 1007,
      idVenta: 5007,
      estado: 'ENTREGADO',
      ...destino('Antonia Pérez', 'O’Higgins 150', 'Rancagua', 'O’Higgins'),
      lineas: [linea(4, 2)],
      pagadoEn: haceHoras(200),
      despachadoEn: haceHoras(180),
      entregadoEn: haceHoras(150),
      trackingStarken: 'STK-900107',
    },
  ];
}

class ErrorSimulado extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) {
    throw new ErrorSimulado(400, 'DATOS_INVALIDOS', mensaje);
  }
}

/**
 * Backend en memoria que responde el contrato de Usuarios e Inventario y aplica
 * las mismas reglas de negocio, para desarrollar y probar la app sin los servicios reales.
 */
@Injectable({ providedIn: 'root' })
export class BackendSimulado {
  private readonly ubicaciones = new AsignadorDeUbicaciones();
  private readonly variantes = variantesIniciales(this.ubicaciones);
  // Las bandas y categorías son catálogos propios: pueden existir antes de tener productos.
  private readonly bandas = [...new Set(this.variantes.flatMap((v) => (v.banda ? [v.banda] : [])))];
  private readonly categorias = categoriasIniciales();
  private readonly colores = [...new Set(this.variantes.map((v) => v.color))];
  private readonly pedidos = pedidosIniciales(this.variantes);
  private readonly movimientos: Movimiento[] = [];
  private readonly busquedas: Busqueda[] = [];
  private readonly operaciones = new Map<string, unknown>();
  // Los tokens llevan el id del usuario, de modo que una sesión guardada en el dispositivo
  // sigue siendo válida aunque este backend se reinicie al recargar la app.
  private readonly tokensDeAccesoEmitidos: string[] = [];
  private readonly tokensInvalidados = new Set<string>();

  manejar(metodo: string, ruta: string, cuerpo: unknown, token: string | null): RespuestaSimulada {
    try {
      return { status: 200, body: this.resolver(metodo, new URL(ruta, 'http://simulado'), cuerpo, token) };
    } catch (error) {
      if (error instanceof ErrorSimulado) {
        const body: ErrorApi = { codigo: error.codigo, mensaje: error.message };
        return { status: error.status, body };
      }
      throw error;
    }
  }

  /** Invalida los tokens de acceso vigentes, para simular su expiración. */
  expirarTokensDeAcceso(): void {
    this.tokensDeAccesoEmitidos.splice(0).forEach((token) => this.tokensInvalidados.add(token));
  }

  private resolver(metodo: string, url: URL, cuerpo: unknown, token: string | null): unknown {
    const ruta = `${metodo} ${url.pathname}`;
    switch (ruta) {
      case 'POST /usuarios/auth/login':
        return this.login(cuerpo as LoginRequest);
      case 'POST /usuarios/auth/refresh':
        return this.refrescar(cuerpo as RefreshRequest);
      case 'POST /usuarios/auth/logout':
        this.tokensInvalidados.add((cuerpo as RefreshRequest).refreshToken);
        return {};
    }

    const usuario = this.autenticar(token);
    const porCodigo = /^GET \/inventario\/variantes\/por-codigo\/(.+)$/.exec(ruta);
    if (porCodigo) {
      return this.vista(this.buscarPorCodigo(decodeURIComponent(porCodigo[1])));
    }
    const cierre = /^PATCH \/inventario\/busquedas\/(\d+)$/.exec(ruta);
    if (cierre) {
      return this.cerrarBusqueda(Number(cierre[1]), cuerpo as CierreBusquedaRequest);
    }
    const edicion = /^PATCH \/inventario\/variantes\/(\d+)$/.exec(ruta);
    if (edicion) {
      return this.editarVariante(Number(edicion[1]), (cuerpo ?? {}) as VarianteEdicionRequest);
    }
    const despacho = /^POST \/logistica\/pedidos\/(\d+)\/despacho$/.exec(ruta);
    if (despacho) {
      return this.generarDespacho(Number(despacho[1]), usuario);
    }
    switch (ruta) {
      case 'GET /inventario/bandas':
        return this.listar(this.bandas);
      case 'POST /inventario/bandas':
        this.incorporar(this.bandas, (cuerpo as NombreRequest)?.nombre);
        return this.listar(this.bandas);
      case 'GET /inventario/categorias':
        return this.listarCategorias();
      case 'POST /inventario/categorias':
        this.incorporarCategoria((cuerpo as NombreRequest)?.nombre);
        return this.listarCategorias();
      case 'GET /inventario/colores':
        return this.listar(this.colores);
      case 'POST /inventario/colores':
        this.incorporar(this.colores, (cuerpo as NombreRequest)?.nombre);
        return this.listar(this.colores);
      case 'GET /inventario/variantes':
        return this.buscarPorTexto(url.searchParams.get('q') ?? '');
      case 'POST /inventario/productos':
        return this.unaVez(cuerpo as ProductoNuevoRequest, (datos) => this.crearProducto(datos, usuario));
      case 'POST /inventario/movimientos/ingresos':
        return this.unaVez(cuerpo as IngresoRequest, (datos) => this.ingreso(datos, usuario));
      case 'POST /inventario/movimientos/mermas':
        return this.unaVez(cuerpo as MermaRequest, (datos) => this.merma(datos, usuario));
      case 'POST /inventario/movimientos/traspasos':
        return this.unaVez(cuerpo as TraspasoRequest, (datos) => this.traspaso(datos, usuario));
      case 'POST /inventario/movimientos/ajustes':
        return this.unaVez(cuerpo as AjusteRequest, (datos) => this.ajuste(datos, usuario));
      case 'POST /inventario/busquedas':
        return this.iniciarBusqueda(cuerpo as BusquedaRequest);
      case 'GET /logistica/pedidos':
        return this.listarPedidos(url.searchParams.get('estado'));
    }
    throw new ErrorSimulado(404, 'NO_ENCONTRADO', `Ruta no simulada: ${ruta}`);
  }

  // --- Usuarios ---

  private login({ email, password }: LoginRequest): SesionResponse {
    const cuenta = CUENTAS.find((c) => c.email === email?.trim().toLowerCase() && c.password === password);
    if (!cuenta) {
      throw new ErrorSimulado(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña no válidos.');
    }
    return this.emitirSesion(this.sinPassword(cuenta));
  }

  private refrescar({ refreshToken }: RefreshRequest): SesionResponse {
    const usuario = this.usuarioDeToken('refresco', refreshToken);
    if (!usuario) {
      throw new ErrorSimulado(401, 'SESION_INVALIDA', 'La sesión no es válida.');
    }
    this.tokensInvalidados.add(refreshToken);
    return this.emitirSesion(usuario);
  }

  private emitirSesion(usuario: Usuario): SesionResponse {
    const sesion: SesionResponse = {
      accessToken: `acceso-${usuario.id}-${crypto.randomUUID()}`,
      refreshToken: `refresco-${usuario.id}-${crypto.randomUUID()}`,
      usuario,
    };
    this.tokensDeAccesoEmitidos.push(sesion.accessToken);
    return sesion;
  }

  private usuarioDeToken(tipo: 'acceso' | 'refresco', token: string | null | undefined): Usuario | undefined {
    const partes = new RegExp(`^${tipo}-(\\d+)-`).exec(token ?? '');
    if (!token || !partes || this.tokensInvalidados.has(token)) {
      return undefined;
    }
    const cuenta = CUENTAS.find((c) => c.id === Number(partes[1]));
    return cuenta && this.sinPassword(cuenta);
  }

  private sinPassword({ password: _omitida, ...usuario }: (typeof CUENTAS)[number]): Usuario {
    return usuario;
  }

  private autenticar(token: string | null): Usuario {
    const usuario = this.usuarioDeToken('acceso', token);
    if (!usuario) {
      throw new ErrorSimulado(401, 'SESION_INVALIDA', 'La sesión no es válida.');
    }
    if (usuario.rol !== 'BODEGA') {
      throw new ErrorSimulado(403, 'ACCESO_DENEGADO', 'El rol no tiene permiso para esta operación.');
    }
    return usuario;
  }

  // --- Consulta de variantes ---

  private buscarPorCodigo(codigo: string): VarianteSimulada {
    const variante = this.variantes.find((v) => v.codigo === codigo || v.sku === codigo);
    if (!variante) {
      throw new ErrorSimulado(404, 'NO_ENCONTRADO', 'El código no está registrado.');
    }
    return variante;
  }

  private buscarPorTexto(texto: string): VarianteStock[] {
    // Sin texto se devuelven todas las variantes, para los listados de stock.
    const consulta = texto.trim().toLowerCase();
    return this.variantes
      .filter((v) =>
        [v.sku, v.producto, v.categoria, v.banda ?? '', v.codigoUbicacion].some((campo) =>
          campo.toLowerCase().includes(consulta),
        ),
      )
      .map((v) => this.vista(v));
  }

  private vista(variante: VarianteSimulada): VarianteStock {
    const { existencias, ...datos } = variante;
    return {
      ...datos,
      existencias: UBICACIONES.map((ubicacion) => ({ ubicacion, cantidad: existencias[ubicacion] })),
      disponible: this.total(variante) - variante.reservado,
    };
  }

  private total(variante: VarianteSimulada): number {
    return UBICACIONES.reduce((suma, ubicacion) => suma + variante.existencias[ubicacion], 0);
  }

  // --- Productos ---

  private listar(catalogo: string[]): string[] {
    return [...catalogo].sort((a, b) => a.localeCompare(b, 'es'));
  }

  /**
   * Agrega un nombre al catálogo de bandas o de categorías y devuelve cómo quedó registrado.
   * Si ya existe, sin distinguir mayúsculas ni tildes, devuelve el existente.
   */
  private incorporar(catalogo: string[], nombre: unknown): string {
    const limpio = typeof nombre === 'string' ? nombre.trim() : '';
    exigir(limpio !== '', 'El nombre es obligatorio.');
    const existente = catalogo.find((registrado) => mismoTexto(registrado, limpio));
    if (existente) {
      return existente;
    }
    catalogo.push(limpio);
    return limpio;
  }

  private listarCategorias(): Categoria[] {
    return [...this.categorias]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((categoria) => ({ ...categoria, tallas: [...categoria.tallas] }));
  }

  /** Devuelve la categoría con ese nombre, creándola con los datos por defecto si no existe. */
  private incorporarCategoria(nombre: unknown): Categoria {
    const limpio = typeof nombre === 'string' ? nombre.trim() : '';
    exigir(limpio !== '', 'El nombre es obligatorio.');
    let categoria = this.categorias.find((registrada) => mismoTexto(registrada.nombre, limpio));
    if (!categoria) {
      categoria = { nombre: limpio, tallas: [...TALLAS_DE_LETRAS], usaBanda: true };
      this.categorias.push(categoria);
    }
    return categoria;
  }

  private crearProducto(datos: ProductoNuevoRequest, usuario: Usuario): VarianteStock {
    const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
    const nombre = texto(datos.nombre);
    const categoria = texto(datos.categoria);
    const talla = texto(datos.talla);
    const color = texto(datos.color);
    exigir(nombre !== '', 'El nombre es obligatorio.');
    exigir(categoria !== '', 'La categoría es obligatoria.');
    exigir(talla !== '', 'La talla es obligatoria.');
    exigir(color !== '', 'El color es obligatorio.');
    exigir(texto(datos.imagen).startsWith('data:image/'), 'La imagen es obligatoria.');
    exigir(esEnteroPositivo(datos.cantidad), 'La cantidad debe ser un entero mayor que cero.');
    this.validarUbicacion(datos.ubicacion);

    const delProducto = this.variantes.filter((v) => mismoTexto(v.producto, nombre));
    if (delProducto.some((v) => mismoTexto(v.talla, talla) && mismoTexto(v.color, color))) {
      throw new ErrorSimulado(409, 'VARIANTE_DUPLICADA', 'La variante ya existe.');
    }

    // Una talla o color nuevo de un producto existente hereda sus datos y su ubicación.
    const existente = delProducto[0];
    // Una categoría, banda o talla que aún no existe queda registrada al crear el producto.
    const deCategoria = this.incorporarCategoria(existente?.categoria ?? categoria);
    if (!deCategoria.tallas.some((registrada) => mismoTexto(registrada, talla))) {
      deCategoria.tallas.push(talla);
    }
    // Las categorías sin banda, como los pantalones, ignoran la banda que se envíe.
    const banda = deCategoria.usaBanda && texto(datos.banda) ? this.incorporar(this.bandas, datos.banda) : null;
    const idVariante = Math.max(...this.variantes.map((v) => v.idVariante)) + 1;
    const variante: VarianteSimulada = {
      idVariante,
      sku: `RS-${String(idVariante).padStart(4, '0')}`,
      codigo: `780000000${String(idVariante).padStart(4, '0')}`,
      producto: existente?.producto ?? nombre,
      categoria: deCategoria.nombre,
      banda: existente ? existente.banda : banda,
      imagenUrl: existente?.imagenUrl ?? datos.imagen,
      codigoUbicacion: existente?.codigoUbicacion ?? this.ubicaciones.siguiente(deCategoria.nombre),
      talla,
      color: this.incorporar(this.colores, color),
      activo: true,
      existencias: { BODEGA: 0, SALA_VENTAS: 0 },
      reservado: 0,
    };
    this.variantes.push(variante);

    // Las primeras unidades entran como un ingreso, para que el stock siempre tenga su movimiento.
    variante.existencias[datos.ubicacion] = datos.cantidad;
    this.registrar(usuario, {
      idVariante,
      tipo: 'INGRESO',
      ubicacion: datos.ubicacion,
      cantidad: datos.cantidad,
      motivo: 'Ingreso inicial del producto',
    });
    return this.vista(variante);
  }

  /**
   * Edita una prenda: la talla y el color de la variante, y el nombre, la categoría, la
   * banda y la foto de su producto, que cambian para todas sus tallas. Valida todo antes
   * de aplicar nada.
   */
  private editarVariante(idVariante: number, datos: VarianteEdicionRequest): VarianteStock {
    const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
    const variante = this.variantes.find((v) => v.idVariante === idVariante);
    if (!variante) {
      throw new ErrorSimulado(404, 'NO_ENCONTRADO', 'La variante no existe.');
    }
    const campos = ['nombre', 'categoria', 'banda', 'talla', 'color', 'imagen'] as const;
    exigir(campos.some((campo) => datos[campo] !== undefined), 'No hay cambios que aplicar.');
    const delProducto = this.variantes.filter((v) => v.producto === variante.producto);

    const nombre = datos.nombre === undefined ? variante.producto : texto(datos.nombre);
    exigir(nombre !== '', 'El nombre es obligatorio.');
    if (this.variantes.some((v) => !delProducto.includes(v) && mismoTexto(v.producto, nombre))) {
      throw new ErrorSimulado(409, 'PRODUCTO_DUPLICADO', 'Ya existe otro producto con ese nombre.');
    }
    exigir(datos.categoria === undefined || texto(datos.categoria) !== '', 'La categoría es obligatoria.');
    exigir(datos.imagen === undefined || texto(datos.imagen).startsWith('data:image/'), 'La imagen no es válida.');
    exigir(datos.talla === undefined || texto(datos.talla) !== '', 'La talla es obligatoria.');
    exigir(datos.color === undefined || texto(datos.color) !== '', 'El color es obligatorio.');
    const talla = datos.talla === undefined ? variante.talla : texto(datos.talla);
    const color = datos.color === undefined ? variante.color : texto(datos.color);
    if (delProducto.some((v) => v !== variante && mismoTexto(v.talla, talla) && mismoTexto(v.color, color))) {
      throw new ErrorSimulado(409, 'VARIANTE_DUPLICADA', 'El producto ya tiene esa talla y color.');
    }

    const categoria = this.incorporarCategoria(datos.categoria === undefined ? variante.categoria : datos.categoria);
    // Cada categoría tiene su zona en la bodega: al cambiarla, el producto pasa a un espacio nuevo de esa zona.
    const codigoUbicacion = mismoTexto(categoria.nombre, variante.categoria)
      ? variante.codigoUbicacion
      : this.ubicaciones.siguiente(categoria.nombre);
    // Las categorías sin banda, como los pantalones, no la conservan ni la aceptan.
    let banda = categoria.usaBanda ? variante.banda : null;
    if (categoria.usaBanda && datos.banda !== undefined) {
      banda = texto(datos.banda) === '' ? null : this.incorporar(this.bandas, datos.banda);
    }
    for (const delMismo of delProducto) {
      delMismo.producto = nombre;
      delMismo.categoria = categoria.nombre;
      delMismo.codigoUbicacion = codigoUbicacion;
      delMismo.banda = banda;
      if (datos.imagen !== undefined) {
        delMismo.imagenUrl = datos.imagen;
      }
    }
    variante.talla = talla;
    variante.color = datos.color === undefined ? color : this.incorporar(this.colores, color);
    // Las tallas del producto pasan a ser tallas de su categoría.
    for (const { talla: suTalla } of delProducto) {
      if (!categoria.tallas.some((registrada) => mismoTexto(registrada, suTalla))) {
        categoria.tallas.push(suTalla);
      }
    }
    return this.vista(variante);
  }

  // --- Movimientos ---

  private unaVez<T extends { claveIdempotencia: string }, R>(datos: T, operacion: (datos: T) => R): R {
    exigir(typeof datos?.claveIdempotencia === 'string' && datos.claveIdempotencia !== '', 'Falta la clave de idempotencia.');
    if (this.operaciones.has(datos.claveIdempotencia)) {
      return this.operaciones.get(datos.claveIdempotencia) as R;
    }
    const resultado = operacion(datos);
    this.operaciones.set(datos.claveIdempotencia, resultado);
    return resultado;
  }

  private ingreso(datos: IngresoRequest, usuario: Usuario): ResultadoMovimientos {
    this.validarUbicacion(datos.ubicacion);
    exigir(Array.isArray(datos.lineas) && datos.lineas.length > 0, 'El ingreso no tiene productos.');
    // Se valida todo antes de aplicar nada: el ingreso se registra completo o no se registra.
    const lineas = datos.lineas.map((linea) => {
      exigir(esEnteroPositivo(linea.cantidad), 'La cantidad debe ser un entero mayor que cero.');
      return { variante: this.varianteActiva(linea.idVariante), cantidad: linea.cantidad };
    });
    const movimientos = lineas.map(({ variante, cantidad }) => {
      variante.existencias[datos.ubicacion] += cantidad;
      return this.registrar(usuario, {
        idVariante: variante.idVariante,
        tipo: 'INGRESO',
        ubicacion: datos.ubicacion,
        cantidad,
        motivo: datos.motivo?.trim() || 'Ingreso de mercadería',
      });
    });
    return this.resultado(movimientos, lineas.map((l) => l.variante));
  }

  private merma(datos: MermaRequest, usuario: Usuario): ResultadoMovimientos {
    this.validarUbicacion(datos.ubicacion);
    exigir(TIPOS_MERMA.includes(datos.tipoMerma), 'El tipo de merma no es válido.');
    exigir(esEnteroPositivo(datos.cantidad), 'La cantidad debe ser un entero mayor que cero.');
    const motivo = this.motivoObligatorio(datos.motivo);
    const variante = this.varianteActiva(datos.idVariante);
    this.exigirExistencia(variante, datos.ubicacion, datos.cantidad);
    this.exigirSinTocarReservas(variante, this.total(variante) - datos.cantidad);

    variante.existencias[datos.ubicacion] -= datos.cantidad;
    const movimiento = this.registrar(usuario, {
      idVariante: variante.idVariante,
      tipo: 'MERMA',
      tipoMerma: datos.tipoMerma,
      ubicacion: datos.ubicacion,
      cantidad: datos.cantidad,
      motivo,
    });
    return this.resultado([movimiento], [variante]);
  }

  private traspaso(datos: TraspasoRequest, usuario: Usuario): ResultadoMovimientos {
    this.validarUbicacion(datos.origen);
    this.validarUbicacion(datos.destino);
    exigir(datos.origen !== datos.destino, 'El origen y el destino deben ser distintos.');
    exigir(esEnteroPositivo(datos.cantidad), 'La cantidad debe ser un entero mayor que cero.');
    const motivo = this.motivoObligatorio(datos.motivo);
    const variante = this.varianteActiva(datos.idVariante);
    this.exigirExistencia(variante, datos.origen, datos.cantidad);

    variante.existencias[datos.origen] -= datos.cantidad;
    variante.existencias[datos.destino] += datos.cantidad;
    const movimiento = this.registrar(usuario, {
      idVariante: variante.idVariante,
      tipo: 'TRASPASO',
      ubicacion: datos.origen,
      ubicacionDestino: datos.destino,
      cantidad: datos.cantidad,
      motivo,
    });
    return this.resultado([movimiento], [variante]);
  }

  private ajuste(datos: AjusteRequest, usuario: Usuario): ResultadoMovimientos {
    this.validarUbicacion(datos.ubicacion);
    exigir(
      Number.isInteger(datos.cantidadContada) && datos.cantidadContada >= 0,
      'La cantidad contada debe ser un entero mayor o igual a cero.',
    );
    const motivo = this.motivoObligatorio(datos.motivo);
    const variante = this.varianteActiva(datos.idVariante);
    const diferencia = datos.cantidadContada - variante.existencias[datos.ubicacion];
    this.exigirSinTocarReservas(variante, this.total(variante) + diferencia);

    variante.existencias[datos.ubicacion] = datos.cantidadContada;
    const movimiento = this.registrar(usuario, {
      idVariante: variante.idVariante,
      tipo: 'AJUSTE',
      ubicacion: datos.ubicacion,
      cantidad: diferencia,
      motivo,
    });
    return this.resultado([movimiento], [variante]);
  }

  private registrar(
    usuario: Usuario,
    datos: Omit<Movimiento, 'idMovimiento' | 'fecha' | 'idUsuario'>,
  ): Movimiento {
    const movimiento: Movimiento = {
      ...datos,
      idMovimiento: this.movimientos.length + 1,
      fecha: new Date().toISOString(),
      idUsuario: usuario.id,
    };
    this.movimientos.push(movimiento);
    return movimiento;
  }

  private resultado(movimientos: Movimiento[], variantes: VarianteSimulada[]): ResultadoMovimientos {
    return { movimientos, variantes: [...new Set(variantes)].map((v) => this.vista(v)) };
  }

  private varianteActiva(idVariante: number): VarianteSimulada {
    const variante = this.variantes.find((v) => v.idVariante === idVariante);
    if (!variante) {
      throw new ErrorSimulado(404, 'NO_ENCONTRADO', 'La variante no existe.');
    }
    if (!variante.activo) {
      throw new ErrorSimulado(409, 'VARIANTE_INACTIVA', 'El producto está desactivado.');
    }
    return variante;
  }

  private validarUbicacion(ubicacion: Ubicacion): void {
    exigir(UBICACIONES.includes(ubicacion), 'La ubicación no es válida.');
  }

  private motivoObligatorio(motivo: string): string {
    const texto = typeof motivo === 'string' ? motivo.trim() : '';
    exigir(texto !== '', 'El motivo es obligatorio.');
    return texto;
  }

  private exigirExistencia(variante: VarianteSimulada, ubicacion: Ubicacion, cantidad: number): void {
    if (variante.existencias[ubicacion] < cantidad) {
      throw new ErrorSimulado(409, 'STOCK_INSUFICIENTE', 'No hay existencia suficiente en la ubicación.');
    }
  }

  private exigirSinTocarReservas(variante: VarianteSimulada, totalResultante: number): void {
    if (totalResultante < variante.reservado) {
      throw new ErrorSimulado(409, 'UNIDADES_RESERVADAS', 'Hay unidades comprometidas en pedidos.');
    }
  }

  // --- Logística ---

  private listarPedidos(estado: string | null): Pedido[] {
    return this.pedidos.filter((pedido) => !estado || pedido.estado === estado).map((pedido) => ({ ...pedido }));
  }

  /**
   * Deja el pedido despachado con su código de seguimiento y saca sus prendas del stock,
   * primero de la bodega. Un pedido que ya tiene despacho se responde tal como está.
   */
  private generarDespacho(idPedido: number, usuario: Usuario): Pedido {
    const pedido = this.pedidos.find((p) => p.idPedido === idPedido);
    if (!pedido) {
      throw new ErrorSimulado(404, 'NO_ENCONTRADO', 'El pedido no existe.');
    }
    if (pedido.estado !== 'DESPACHADO' && pedido.estado !== 'ENTREGADO') {
      const lineas = pedido.lineas.map((linea) => ({
        variante: this.variantes.find((v) => v.idVariante === linea.idVariante)!,
        cantidad: linea.cantidad,
      }));
      // Se valida todo antes de aplicar nada. Las unidades del pedido están entre las reservadas.
      for (const { variante } of lineas) {
        if (this.total(variante) < variante.reservado) {
          throw new ErrorSimulado(409, 'STOCK_INSUFICIENTE', `No hay existencia suficiente de ${variante.sku} para despachar el pedido.`);
        }
      }
      for (const { variante, cantidad } of lineas) {
        variante.reservado -= cantidad;
        let pendiente = cantidad;
        for (const ubicacion of UBICACIONES) {
          const unidades = Math.min(pendiente, variante.existencias[ubicacion]);
          if (unidades > 0) {
            variante.existencias[ubicacion] -= unidades;
            this.registrar(usuario, {
              idVariante: variante.idVariante,
              tipo: 'DESPACHO',
              ubicacion,
              cantidad: unidades,
              motivo: `Despacho del pedido #${idPedido}`,
            });
            pendiente -= unidades;
          }
        }
      }
      pedido.estado = 'DESPACHADO';
      pedido.despachadoEn = new Date().toISOString();
      pedido.trackingStarken = `STK-${900_000 + idPedido}`;
    }
    return { ...pedido };
  }

  // --- Tiempo de búsqueda ---

  private iniciarBusqueda({ idVariante }: BusquedaRequest): Busqueda {
    this.varianteActiva(idVariante);
    const busqueda: Busqueda = {
      idBusqueda: this.busquedas.length + 1,
      idVariante,
      inicio: new Date().toISOString(),
    };
    this.busquedas.push(busqueda);
    return { ...busqueda };
  }

  private cerrarBusqueda(idBusqueda: number, { resultado }: CierreBusquedaRequest): Busqueda {
    const busqueda = this.busquedas.find((b) => b.idBusqueda === idBusqueda);
    if (!busqueda) {
      throw new ErrorSimulado(404, 'NO_ENCONTRADO', 'La búsqueda no existe.');
    }
    if (resultado === 'ENCONTRADA' && !busqueda.fin) {
      const fin = new Date();
      busqueda.fin = fin.toISOString();
      busqueda.duracionSegundos = Math.round((fin.getTime() - new Date(busqueda.inicio).getTime()) / 1000);
    }
    return { ...busqueda };
  }
}
