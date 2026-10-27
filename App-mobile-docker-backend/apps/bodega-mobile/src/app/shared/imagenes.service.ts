import { Injectable } from '@angular/core';

const LADO_MAXIMO = 800;
const CALIDAD_JPEG = 0.8;

/** Preparación de las fotos que se suben desde el dispositivo. */
@Injectable({ providedIn: 'root' })
export class ImagenesService {
  /**
   * Convierte la foto elegida en un data URL JPEG reducido, para no enviar al servicio
   * los varios megabytes que pesa una foto de cámara.
   */
  async reducir(archivo: Blob): Promise<string> {
    const imagen = await createImageBitmap(archivo);
    try {
      const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(imagen.width * escala);
      lienzo.height = Math.round(imagen.height * escala);
      const contexto = lienzo.getContext('2d');
      if (!contexto) {
        throw new Error('No se pudo procesar la imagen.');
      }
      contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
      return lienzo.toDataURL('image/jpeg', CALIDAD_JPEG);
    } finally {
      imagen.close();
    }
  }
}
