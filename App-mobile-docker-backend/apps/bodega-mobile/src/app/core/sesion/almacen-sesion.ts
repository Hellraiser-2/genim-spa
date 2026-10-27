import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { SesionResponse } from '@rockstar/contracts';

const CLAVE = 'sesion';

/** Persistencia de la sesión en el dispositivo. */
@Injectable({ providedIn: 'root' })
export class AlmacenSesion {
  async leer(): Promise<SesionResponse | null> {
    const { value } = await Preferences.get({ key: CLAVE });
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as SesionResponse;
    } catch {
      return null;
    }
  }

  async guardar(sesion: SesionResponse): Promise<void> {
    await Preferences.set({ key: CLAVE, value: JSON.stringify(sesion) });
  }

  async borrar(): Promise<void> {
    await Preferences.remove({ key: CLAVE });
  }
}
