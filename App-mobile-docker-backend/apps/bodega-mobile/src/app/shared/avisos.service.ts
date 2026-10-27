import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** Avisos breves al usuario. */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly toasts = inject(ToastController);

  async exito(mensaje: string): Promise<void> {
    const toast = await this.toasts.create({ message: mensaje, duration: 2500, color: 'success', position: 'top' });
    await toast.present();
  }
}
