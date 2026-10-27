import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Categoria,
  IngresoRequest,
  MermaRequest,
  NombreRequest,
  ProductoNuevoRequest,
  ResultadoMovimientos,
  VarianteEdicionRequest,
  VarianteStock,
} from '@rockstar/contracts';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** Cliente del servicio de Inventario. */
@Injectable({ providedIn: 'root' })
export class InventarioApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/inventario`;

  variantePorCodigo(codigo: string): Observable<VarianteStock> {
    return this.http.get<VarianteStock>(`${this.url}/variantes/por-codigo/${encodeURIComponent(codigo)}`);
  }

  buscarVariantes(texto: string): Observable<VarianteStock[]> {
    return this.http.get<VarianteStock[]>(`${this.url}/variantes`, { params: { q: texto } });
  }

  bandas(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/bandas`);
  }

  /** Registra una banda y devuelve la lista completa actualizada. */
  crearBanda(nombre: string): Observable<string[]> {
    return this.http.post<string[]>(`${this.url}/bandas`, { nombre } satisfies NombreRequest);
  }

  categorias(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.url}/categorias`);
  }

  /** Registra una categoría y devuelve la lista completa actualizada. */
  crearCategoria(nombre: string): Observable<Categoria[]> {
    return this.http.post<Categoria[]>(`${this.url}/categorias`, { nombre } satisfies NombreRequest);
  }

  colores(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/colores`);
  }

  /** Registra un color y devuelve la lista completa actualizada. */
  crearColor(nombre: string): Observable<string[]> {
    return this.http.post<string[]>(`${this.url}/colores`, { nombre } satisfies NombreRequest);
  }

  crearProducto(datos: ProductoNuevoRequest): Observable<VarianteStock> {
    return this.http.post<VarianteStock>(`${this.url}/productos`, datos);
  }

  /** Edita una prenda. Solo cambian los campos enviados; responde la variante como quedó. */
  editarVariante(idVariante: number, cambios: VarianteEdicionRequest): Observable<VarianteStock> {
    return this.http.patch<VarianteStock>(`${this.url}/variantes/${idVariante}`, cambios);
  }

  registrarIngreso(datos: IngresoRequest): Observable<ResultadoMovimientos> {
    return this.http.post<ResultadoMovimientos>(`${this.url}/movimientos/ingresos`, datos);
  }

  registrarMerma(datos: MermaRequest): Observable<ResultadoMovimientos> {
    return this.http.post<ResultadoMovimientos>(`${this.url}/movimientos/mermas`, datos);
  }
}
