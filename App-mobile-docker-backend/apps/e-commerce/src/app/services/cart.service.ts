import { Injectable, computed, inject, signal } from '@angular/core';
import type { CheckoutRequest, CheckoutResponse, CompraPendiente } from '@rockstar/contracts';

import { uuid } from '../core/api';
import { Product } from '../data/models';
import { CartItem, ProductsService } from './products.service';
import { ShopApi } from './shop.api';

/** Datos de despacho que el cliente completa en el carrito. */
export interface ShippingData {
  recipient: string;
  phone: string;
  regionId: number | null;
  comunaId: number | null;
  address: string;
}

const CART_KEY = 'rockstar.tienda.carrito';
const SHIPPING_KEY = 'rockstar.tienda.despacho';
const PENDING_KEY = 'rockstar.tienda.compra';
const RESUMED_KEY = 'rockstar.tienda.compra-retomada';
const EMPTY_SHIPPING: ShippingData = { recipient: '', phone: '', regionId: null, comunaId: null, address: '' };

function read<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Sin almacenamiento disponible el carrito dura lo que dure la página abierta.
  }
}

/**
 * Carrito de compras. Vive en el dispositivo y se conserva entre visitas; los precios y
 * la disponibilidad los manda el backend, tanto al revisarlo como al comprar.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly products = inject(ProductsService);
  private readonly api = inject(ShopApi);

  readonly items = signal<CartItem[]>(read(localStorage, CART_KEY, []));
  readonly shipping = signal<ShippingData>({ ...EMPTY_SHIPPING, ...read(localStorage, SHIPPING_KEY, {}) });
  /** Valor del despacho a la comuna elegida; `null` mientras no se ha cotizado. */
  readonly shippingCost = signal<number | null>(null);
  /** Compra creada en el backend que espera su pago. */
  readonly pending = signal<CheckoutResponse | null>(read(sessionStorage, PENDING_KEY, null));

  readonly subtotal = computed(() => this.items().reduce((sum, i) => sum + i.price * i.qty, 0));
  readonly total = computed(() => this.subtotal() + (this.items().length ? (this.shippingCost() ?? 0) : 0));
  readonly count = computed(() => this.items().reduce((s, i) => s + i.qty, 0));

  /** Lo que incluye la compra pendiente cuando se retomó desde el perfil; `null` si salió del carrito actual. */
  private resumedLines: { id: number; qty: number }[] | null = read(sessionStorage, RESUMED_KEY, null);

  /** El carrito se muestra como un panel lateral sobre cualquier pantalla de la tienda. */
  readonly isOpen = signal(false);

  /** Clave de la compra en curso: se repite solo mientras el carrito y el despacho no cambien. */
  private purchaseKey: { hash: string; value: string } | null = null;

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  add(product: Product): { ok: boolean; reason?: string } {
    if (product.stock <= 0) return { ok: false, reason: 'Sin stock' };
    const current = this.items();
    const found = current.find((i) => i.id === product.id);
    if (found) {
      if (found.qty >= product.stock) return { ok: false, reason: 'Stock máximo alcanzado' };
      this.setItems(current.map((i) => (i.id === product.id ? { ...i, ...product, qty: i.qty + 1 } : i)));
    } else {
      this.setItems([...current, { ...product, qty: 1 }]);
    }
    return { ok: true };
  }

  changeQty(id: number, delta: number): void {
    const product = this.products.products().find((p) => p.id === id);
    this.setItems(
      this.items()
        .map((item) => {
          if (item.id !== id) return item;
          const max = product?.stock ?? item.stock;
          return { ...item, qty: Math.min(max, Math.max(0, item.qty + delta)) };
        })
        .filter((item) => item.qty > 0),
    );
  }

  remove(id: number): void {
    this.setItems(this.items().filter((i) => i.id !== id));
  }

  clear(): void {
    this.setItems([]);
  }

  /** Deja el dispositivo sin rastro de la compra: carrito, datos de despacho y pago pendiente. */
  reset(): void {
    this.clear();
    this.shipping.set({ ...EMPTY_SHIPPING });
    write(localStorage, SHIPPING_KEY, null);
    this.shippingCost.set(null);
    this.setPending(null);
    this.resumedLines = null;
    write(sessionStorage, RESUMED_KEY, null);
  }

  /**
   * Pone el carrito al día con el catálogo recién cargado: precio y disponibilidad
   * actuales. Devuelve qué cambió, para avisarle al cliente.
   */
  sync(): string[] {
    const changes: string[] = [];
    const updated: CartItem[] = [];
    for (const item of this.items()) {
      const product = this.products.products().find((p) => p.id === item.id);
      const label = `${item.name} talla ${item.size}`;
      if (!product || product.stock <= 0) {
        changes.push(`${label} ya no está disponible y se quitó del carrito.`);
        continue;
      }
      if (product.price !== item.price) {
        changes.push(`${label} cambió de precio.`);
      }
      if (item.qty > product.stock) {
        changes.push(`De ${label} quedan ${product.stock}; se ajustó la cantidad.`);
      }
      updated.push({ ...product, qty: Math.min(item.qty, product.stock) });
    }
    this.setItems(updated);
    return changes;
  }

  setShipping(patch: Partial<ShippingData>): void {
    this.shipping.update((current) => ({ ...current, ...patch }));
    write(localStorage, SHIPPING_KEY, this.shipping());
  }

  /** Cotiza el despacho a la comuna elegida. Sin comuna, deja el flete sin valor. */
  async quote(): Promise<void> {
    const { comunaId } = this.shipping();
    if (comunaId === null) {
      this.shippingCost.set(null);
      return;
    }
    const { valor } = await this.api.quote(comunaId);
    // La comuna pudo cambiar mientras llegaba la respuesta.
    if (this.shipping().comunaId === comunaId) {
      this.shippingCost.set(valor);
    }
  }

  /** El primer dato de despacho que falta, o `null` si están todos. */
  missingShippingField(): string | null {
    const { recipient, phone, regionId, comunaId, address } = this.shipping();
    if (!recipient.trim()) return 'Falta el nombre de quien recibe.';
    if (!phone.trim()) return 'Falta el teléfono de contacto.';
    if (regionId === null) return 'Falta la región de despacho.';
    if (comunaId === null) return 'Falta la comuna de despacho.';
    if (!address.trim()) return 'Falta la dirección de despacho.';
    return null;
  }

  /** Crea la compra en el backend: reserva las unidades y deja el pago pendiente. */
  async checkout(): Promise<CheckoutResponse> {
    const shipping = this.shipping();
    const request: Omit<CheckoutRequest, 'claveIdempotencia'> = {
      lineas: this.items().map((i) => ({ idVariante: i.id, cantidad: i.qty })),
      despacho: {
        idComuna: shipping.comunaId!,
        direccion: shipping.address.trim(),
        destinatario: shipping.recipient.trim(),
        telefono: shipping.phone.trim(),
      },
    };
    // Si la respuesta se pierde, reintentar con la misma clave no crea otra compra.
    const hash = JSON.stringify(request);
    if (this.purchaseKey?.hash !== hash) {
      this.purchaseKey = { hash, value: uuid() };
    }
    const purchase = await this.api.checkout({ claveIdempotencia: this.purchaseKey.value, ...request });
    this.purchaseKey = null;
    this.setPending(purchase);
    this.resumedLines = null;
    write(sessionStorage, RESUMED_KEY, null);
    return purchase;
  }

  /**
   * Retoma desde el perfil una compra que quedó sin pagar. Esa compra ya tiene sus
   * unidades reservadas en el backend: aquí solo se la deja lista para la pantalla de pago.
   */
  resume(purchase: CompraPendiente): void {
    const { idVenta, subtotal, flete, total, tokenPago, expiraEn, lineas } = purchase;
    this.setPending({ idVenta, subtotal, flete, total, tokenPago, expiraEn });
    this.resumedLines = lineas.map((l) => ({ id: l.idVariante, qty: l.cantidad }));
    write(sessionStorage, RESUMED_KEY, this.resumedLines);
  }

  /** Cierra la compra pendiente. Pagada, saca del carrito lo comprado; si no, el carrito conserva sus productos. */
  finishPayment(paid: boolean): void {
    const resumed = this.resumedLines;
    this.setPending(null);
    this.resumedLines = null;
    write(sessionStorage, RESUMED_KEY, null);
    if (!paid) {
      return;
    }
    if (resumed === null) {
      // La compra salió del carrito tal como está: se vacía.
      this.clear();
      return;
    }
    // Una compra retomada puede no coincidir con el carrito de ahora: solo se descuenta lo que se pagó.
    this.setItems(
      this.items()
        .map((item) => ({ ...item, qty: item.qty - (resumed.find((line) => line.id === item.id)?.qty ?? 0) }))
        .filter((item) => item.qty > 0),
    );
  }

  private setItems(items: CartItem[]): void {
    this.items.set(items);
    write(localStorage, CART_KEY, items);
  }

  private setPending(purchase: CheckoutResponse | null): void {
    this.pending.set(purchase);
    write(sessionStorage, PENDING_KEY, purchase);
  }
}
