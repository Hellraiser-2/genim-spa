import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/** Impresión de etiquetas desde el navegador. */
@Injectable({ providedIn: 'root' })
export class ImpresionService {
  /** La app instalada en un teléfono no tiene diálogo de impresión: se imprime desde la versión web. */
  readonly disponible = !Capacitor.isNativePlatform();

  /**
   * Imprime una copia del elemento. La copia se cuelga directamente del documento,
   * fuera de la app: los contenedores de Ionic recortan su contenido a la pantalla y
   * al imprimir solo saldría lo visible. Los estilos de `.rs-impresion` ocultan la app
   * y muestran la copia mientras dura la impresión.
   */
  imprimir(contenido: HTMLElement): void {
    const hoja = document.createElement('div');
    hoja.className = 'rs-impresion';
    hoja.append(contenido.cloneNode(true));
    document.body.append(hoja);

    const retirar = () => {
      hoja.remove();
      window.removeEventListener('afterprint', retirar);
    };
    window.addEventListener('afterprint', retirar);
    window.print();
  }
}
