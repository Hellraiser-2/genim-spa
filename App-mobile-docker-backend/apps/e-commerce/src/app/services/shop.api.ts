import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CheckoutRequest,
  CheckoutResponse,
  CompraPendiente,
  Comuna,
  CotizacionFlete,
  PedidoCliente,
  PerfilUsuario,
  Region,
  ResultadoPago,
  RetornoPagoRequest,
} from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/api';

/** Llamadas al backend que usa la compra: destinos, flete, checkout, pago y pedidos del cliente. */
@Injectable({ providedIn: 'root' })
export class ShopApi {
  private readonly http = inject(HttpClient);

  regions(): Promise<Region[]> {
    return firstValueFrom(this.http.get<Region[]>(`${API_URL}/logistica/regiones`));
  }

  comunas(regionId: number): Promise<Comuna[]> {
    return firstValueFrom(this.http.get<Comuna[]>(`${API_URL}/logistica/comunas`, { params: { region: regionId } }));
  }

  quote(comunaId: number): Promise<CotizacionFlete> {
    return firstValueFrom(this.http.post<CotizacionFlete>(`${API_URL}/logistica/fletes/cotizar`, { idComuna: comunaId }));
  }

  checkout(request: CheckoutRequest): Promise<CheckoutResponse> {
    return firstValueFrom(this.http.post<CheckoutResponse>(`${API_URL}/ventas/checkout`, request));
  }

  /** Informa el resultado del pago. `aprobar` solo lo usa la pasarela simulada. */
  resolvePayment(tokenPago: string, aprobar: boolean): Promise<ResultadoPago> {
    const body: RetornoPagoRequest = { tokenPago, aprobar };
    return firstValueFrom(this.http.post<ResultadoPago>(`${API_URL}/pagos/webpay/retorno`, body));
  }

  /** Los datos de la cuenta con sesión iniciada, tal como están hoy en el backend. */
  profile(): Promise<PerfilUsuario> {
    return firstValueFrom(this.http.get<PerfilUsuario>(`${API_URL}/usuarios/yo`));
  }

  /** Compras iniciadas que aún esperan su pago y conservan su reserva. */
  pendingPurchases(): Promise<CompraPendiente[]> {
    return firstValueFrom(this.http.get<CompraPendiente[]>(`${API_URL}/ventas/pendientes`));
  }

  myOrders(): Promise<PedidoCliente[]> {
    return firstValueFrom(this.http.get<PedidoCliente[]>(`${API_URL}/logistica/pedidos/mios`));
  }
}
