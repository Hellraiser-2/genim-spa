import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { LoginRequest, RegistroRequest, SesionResponse } from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/api';
import { CurrentUser, roleLabel } from '../data/models';

const STORAGE_KEY = 'rockstar.tienda.sesion';

function storedSession(): SesionResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SesionResponse) : null;
  } catch {
    return null;
  }
}

/**
 * Sesión contra el backend. Clientes y personal inician sesión con su correo y
 * contraseña; el rol de la cuenta decide qué partes de la app se muestran.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_URL}/usuarios/auth`;

  private readonly session = signal<SesionResponse | null>(storedSession());
  private readonly guest = signal(false);
  /** Renovación de sesión en curso, compartida por las llamadas que fallaron a la vez. */
  private refreshing: Promise<string | null> | null = null;

  readonly user = computed<CurrentUser | null>(() => {
    const session = this.session();
    if (session) {
      const { id, nombre, email, rol } = session.usuario;
      return { id, name: nombre, email, role: roleLabel(rol), rol, isAdmin: rol !== 'CLIENTE' };
    }
    return this.guest() ? { id: 'guest', name: 'Invitado', role: roleLabel('INVITADO'), rol: 'INVITADO', isAdmin: false } : null;
  });

  /** Ya se eligió cómo entrar: con una cuenta o como invitado. */
  readonly entryDismissed = computed(() => this.user() !== null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => this.user()?.isAdmin === true);
  readonly isCustomer = computed(() => this.user()?.rol === 'CLIENTE');
  readonly rol = computed(() => this.user()?.rol ?? null);

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  async login(email: string, password: string): Promise<CurrentUser> {
    const body: LoginRequest = { email, password };
    this.store(await firstValueFrom(this.http.post<SesionResponse>(`${this.url}/login`, body)));
    return this.user()!;
  }

  /** Crea una cuenta de Cliente y la deja con la sesión iniciada. `phone` va completo, con su prefijo. */
  async register(name: string, email: string, password: string, phone: string, address: string): Promise<CurrentUser> {
    const body: RegistroRequest = { nombre: name, email, password, telefono: phone, direccion: address };
    this.store(await firstValueFrom(this.http.post<SesionResponse>(`${this.url}/registro`, body)));
    return this.user()!;
  }

  continueAsGuest(): void {
    this.guest.set(true);
  }

  /** Cierra la sesión en este dispositivo y, si hay conexión, la revoca en el servidor. */
  logout(): void {
    const refreshToken = this.session()?.refreshToken;
    this.store(null);
    this.guest.set(false);
    if (refreshToken) {
      this.http.post(`${this.url}/logout`, { refreshToken }).subscribe({ error: () => undefined });
    }
  }

  /** Renueva la sesión con el token de refresco. Devuelve el token de acceso nuevo, o `null` si la sesión ya no sirve. */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.renew().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async renew(): Promise<string | null> {
    const refreshToken = this.session()?.refreshToken;
    if (!refreshToken) {
      return null;
    }
    try {
      this.store(await firstValueFrom(this.http.post<SesionResponse>(`${this.url}/refresh`, { refreshToken })));
      return this.accessToken();
    } catch {
      this.store(null);
      return null;
    }
  }

  private store(session: SesionResponse | null): void {
    this.session.set(session);
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Sin almacenamiento disponible la sesión dura lo que dure la página abierta.
    }
  }
}
