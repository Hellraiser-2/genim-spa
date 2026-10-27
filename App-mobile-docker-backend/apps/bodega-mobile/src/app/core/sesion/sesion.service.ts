import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { LoginRequest, RefreshRequest, Rol, SesionResponse } from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AlmacenSesion } from './almacen-sesion';

/** Roles que pueden usar la app de bodega. */
const ROLES_PERMITIDOS: readonly Rol[] = ['BODEGA'];

export class RolNoPermitidoError extends Error {
  constructor() {
    super('Esta app es solo para el personal de bodega.');
  }
}

@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly http = inject(HttpClient);
  private readonly almacen = inject(AlmacenSesion);
  private readonly urlAuth = `${environment.apiUrl}/usuarios/auth`;

  private readonly sesion = signal<SesionResponse | null>(null);
  private renovacionEnCurso: Promise<boolean> | null = null;

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  /** Aviso que la pantalla de inicio de sesión muestra una vez, p. ej. "tu sesión expiró". */
  readonly aviso = signal<string | null>(null);

  accessToken(): string | null {
    return this.sesion()?.accessToken ?? null;
  }

  /** Recupera la sesión guardada en el dispositivo al abrir la app. */
  async restaurar(): Promise<void> {
    this.sesion.set(await this.almacen.leer());
  }

  async iniciar(email: string, password: string): Promise<void> {
    const cuerpo: LoginRequest = { email, password };
    const sesion = await firstValueFrom(this.http.post<SesionResponse>(`${this.urlAuth}/login`, cuerpo));
    if (!ROLES_PERMITIDOS.includes(sesion.usuario.rol)) {
      await this.revocar(sesion.refreshToken);
      throw new RolNoPermitidoError();
    }
    await this.establecer(sesion);
    this.aviso.set(null);
  }

  /**
   * Obtiene un nuevo token de acceso con el token de refresco.
   * Varias solicitudes simultáneas comparten una única renovación.
   */
  renovar(): Promise<boolean> {
    this.renovacionEnCurso ??= this.ejecutarRenovacion().finally(() => (this.renovacionEnCurso = null));
    return this.renovacionEnCurso;
  }

  async cerrar(): Promise<void> {
    const refreshToken = this.sesion()?.refreshToken;
    await this.limpiar();
    if (refreshToken) {
      await this.revocar(refreshToken);
    }
  }

  async cerrarPorExpiracion(): Promise<void> {
    await this.limpiar();
    this.aviso.set('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  private async ejecutarRenovacion(): Promise<boolean> {
    const refreshToken = this.sesion()?.refreshToken;
    if (!refreshToken) {
      return false;
    }
    try {
      const cuerpo: RefreshRequest = { refreshToken };
      await this.establecer(await firstValueFrom(this.http.post<SesionResponse>(`${this.urlAuth}/refresh`, cuerpo)));
      return true;
    } catch {
      return false;
    }
  }

  private async revocar(refreshToken: string): Promise<void> {
    const cuerpo: RefreshRequest = { refreshToken };
    try {
      await firstValueFrom(this.http.post(`${this.urlAuth}/logout`, cuerpo));
    } catch {
      // La sesión local ya se cerró; el token de refresco vencerá por sí solo.
    }
  }

  private async establecer(sesion: SesionResponse): Promise<void> {
    this.sesion.set(sesion);
    await this.almacen.guardar(sesion);
  }

  private async limpiar(): Promise<void> {
    this.sesion.set(null);
    await this.almacen.borrar();
  }
}
