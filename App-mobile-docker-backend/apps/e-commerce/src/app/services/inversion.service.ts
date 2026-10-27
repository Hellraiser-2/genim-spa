import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { RecomendacionesInversion } from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/api';

export interface ParametrosInversion {
  /** Semanas a pronosticar. */
  horizonte: number;
  /** Semanas que tarda en llegar una compra. */
  reposicion: number;
  /** Pesos disponibles para comprar; sin él se recomienda todo lo necesario. */
  presupuesto: number | null;
}

/** Modelo predictivo de inversión del Gerente. */
@Injectable({ providedIn: 'root' })
export class InversionService {
  private readonly http = inject(HttpClient);

  recomendaciones({ horizonte, reposicion, presupuesto }: ParametrosInversion): Promise<RecomendacionesInversion> {
    let params = new HttpParams().set('horizonte', horizonte).set('reposicion', reposicion);
    if (presupuesto !== null) params = params.set('presupuesto', presupuesto);
    return firstValueFrom(this.http.get<RecomendacionesInversion>(`${API_URL}/analitica/recomendaciones`, { params }));
  }
}
