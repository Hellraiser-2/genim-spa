import { signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { esFallaDeConexion, mensajeDeError } from './errores';

export function nuevaClaveIdempotencia(): string {
  return crypto.randomUUID();
}

/**
 * Envío de una operación que debe registrarse una sola vez.
 *
 * Mantiene la misma clave de idempotencia mientras el resultado sea incierto
 * (falla de conexión), de modo que un reintento no duplique la operación, e
 * ignora las confirmaciones que llegan mientras hay un envío en curso.
 */
export class EnvioIdempotente {
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  /** Verdadero cuando el último envío falló sin confirmación y puede reintentarse tal cual. */
  readonly reintentable = signal(false);

  private clave = nuevaClaveIdempotencia();

  async ejecutar<T>(operacion: (claveIdempotencia: string) => Observable<T>): Promise<T | undefined> {
    if (this.enviando()) {
      return undefined;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      const resultado = await firstValueFrom(operacion(this.clave));
      this.reiniciar();
      return resultado;
    } catch (error) {
      this.error.set(mensajeDeError(error));
      if (esFallaDeConexion(error)) {
        this.reintentable.set(true);
      } else {
        // El servidor rechazó la operación: el próximo envío es una operación distinta.
        this.reiniciar();
      }
      return undefined;
    } finally {
      this.enviando.set(false);
    }
  }

  /** Descarta el envío pendiente, por ejemplo cuando el usuario cambia los datos del formulario. */
  reiniciar(): void {
    this.clave = nuevaClaveIdempotencia();
    this.reintentable.set(false);
  }
}
