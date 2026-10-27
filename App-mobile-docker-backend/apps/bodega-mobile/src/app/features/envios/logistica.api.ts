import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Pedido, RutaReparto } from '@rockstar/contracts';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** Cliente del servicio de Logística. */
@Injectable({ providedIn: 'root' })
export class LogisticaApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/logistica`;

  pedidos(): Observable<Pedido[]> {
    return this.http.get<Pedido[]>(`${this.url}/pedidos`);
  }

  /** Ruta de reparto de los pedidos por enviar de la Región Metropolitana, desde la bodega. */
  rutaDeReparto(): Observable<RutaReparto> {
    return this.http.get<RutaReparto>(`${this.url}/rutas/reparto`);
  }

  /**
   * Genera el despacho del pedido y lo devuelve con su código de seguimiento.
   * Repetirlo no crea otro despacho, de modo que se puede reintentar sin riesgo.
   */
  generarDespacho(idPedido: number): Observable<Pedido> {
    return this.http.post<Pedido>(`${this.url}/pedidos/${idPedido}/despacho`, null);
  }
}
