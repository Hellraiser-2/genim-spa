import type { ArticuloCatalogo, EstadoPedido, Rol } from '@rockstar/contracts';

/** Prenda tal como la muestra la tienda: una variante (talla y color) de un producto. */
export interface Product {
  /** Identificador de la variante en el backend. */
  id: number;
  productId: number;
  sku: string;
  name: string;
  category: string;
  band: string | null;
  /** Lo que se cobra: el precio de oferta si el producto está en oferta este mes. */
  price: number;
  /** Precio normal cuando el producto está en oferta este mes; `null` si no lo está. */
  listPrice: number | null;
  size: string;
  color: string;
  /** Unidades que se pueden comprar en este momento. */
  stock: number;
  description?: string;
  /** Técnica del estampado, por ejemplo "Serigrafía"; `null` si no está registrada. */
  printType: string | null;
  image: string;
}

export interface CurrentUser {
  id: number | 'guest';
  name: string;
  email?: string;
  /** Nombre del rol para mostrar. */
  role: string;
  rol: Rol | 'INVITADO';
  /** Cuenta del personal de la tienda. */
  isAdmin: boolean;
}

const ROLE_LABELS: Record<Rol | 'INVITADO', string> = {
  CLIENTE: 'Cliente',
  VENDEDOR: 'Vendedor',
  BODEGA: 'Bodega',
  GERENTE: 'Gerente',
  RRHH: 'RRHH',
  INVITADO: 'Invitado',
};

export function roleLabel(rol: Rol | 'INVITADO'): string {
  return ROLE_LABELS[rol];
}

const ORDER_STATUS_LABELS: Record<EstadoPedido, string> = {
  PAGADO: 'Pagado',
  EN_PREPARACION: 'En preparación',
  DESPACHO_PENDIENTE: 'Preparando despacho',
  ATENCION_MANUAL: 'En revisión',
  DESPACHADO: 'En camino',
  ENTREGADO: 'Entregado',
};

export function orderStatusLabel(estado: EstadoPedido): string {
  return ORDER_STATUS_LABELS[estado];
}

/** Imagen que se muestra cuando un producto no tiene foto o la foto no carga. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#27272a"/>' +
      '<text x="200" y="260" font-family="sans-serif" font-size="28" fill="#71717a" text-anchor="middle">Sin imagen</text></svg>',
  );

/** Pone la imagen de reemplazo en un `<img>` cuya foto no cargó. */
export function usePlaceholder(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.src !== PLACEHOLDER_IMAGE) {
    img.src = PLACEHOLDER_IMAGE;
  }
}

export function toProduct(articulo: ArticuloCatalogo): Product {
  return {
    id: articulo.idVariante,
    productId: articulo.idProducto,
    sku: articulo.sku,
    name: articulo.producto,
    category: articulo.categoria,
    band: articulo.banda,
    price: articulo.precio,
    listPrice: articulo.precioNormal,
    size: articulo.talla,
    color: articulo.color,
    stock: articulo.disponible,
    ...(articulo.descripcion ? { description: articulo.descripcion } : {}),
    printType: articulo.tipoEstampado,
    image: articulo.imagenUrl ?? PLACEHOLDER_IMAGE,
  };
}

export const formatCLP = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

/** Prefijo de los teléfonos de Chile; la tienda lo pone ella, el cliente escribe solo su número. */
export const PHONE_PREFIX = '+56';
/** Dígitos de un número chileno, fijo o móvil, después del prefijo. */
export const PHONE_DIGITS = 9;

/**
 * Deja lo escrito en el campo de teléfono como los dígitos del número, sin el prefijo:
 * quita espacios y signos, y también el +56 si venía incluido al pegar un número completo.
 */
export function phoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return (digits.length > PHONE_DIGITS && digits.startsWith('56') ? digits.slice(2) : digits).slice(0, PHONE_DIGITS);
}

/** Un teléfono guardado (`+56912345678`) para mostrar: "+56 9 1234 5678". */
export function formatPhone(phone: string): string {
  const match = /^\+56(\d)(\d{4})(\d{4})$/.exec(phone);
  return match ? `${PHONE_PREFIX} ${match[1]} ${match[2]} ${match[3]}` : phone;
}

/** Porcentaje de rebaja de un precio de oferta respecto del precio normal, sin decimales. */
export const discountPercent = (price: number, listPrice: number): number => Math.round((1 - price / listPrice) * 100);

const MONTH_FORMAT = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'America/Santiago' });

/** Nombre del mes en curso en Chile, por ejemplo "octubre": las ofertas rigen por mes calendario. */
export const currentMonthName = (): string => MONTH_FORMAT.format(new Date());

/** El locale `en-CA` escribe las fechas como `AAAA-MM-DD`, que se pueden comparar como texto. */
const TODAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });

/** Indica si un día `AAAA-MM-DD` cae entre hoy y doce meses más, con la fecha de Chile. */
export function isWithinNextYear(day: string): boolean {
  const today = TODAY_FORMAT.format(new Date());
  const limit = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  return day >= today && day <= limit;
}

const DAY_FORMAT = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Un día `AAAA-MM-DD` para mostrar, por ejemplo "31 oct 2026". */
export const formatDay = (day: string): string => DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));

const DATE_FORMAT = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (iso: string): string => DATE_FORMAT.format(new Date(iso));

const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Orden de las tallas: primero las de letras de menor a mayor, luego las numéricas y al final el resto. */
export function compareSizes(a: string, b: string): number {
  const rank = (size: string): number => {
    const letter = LETTER_SIZES.indexOf(size.toUpperCase());
    if (letter >= 0) return letter;
    const number = Number(size);
    return Number.isFinite(number) ? 100 + number : 10_000;
  };
  return rank(a) - rank(b) || a.localeCompare(b, 'es');
}
