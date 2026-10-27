import { Component, computed, input, signal } from '@angular/core';

/**
 * Foto de una prenda. Muestra un recuadro "Sin foto" cuando el producto no tiene
 * imagen o cuando esta no se puede cargar.
 */
@Component({
  selector: 'app-imagen-prenda',
  template: `
    @if (visible(); as direccion) {
      <img [src]="direccion" [alt]="alt()" loading="lazy" (error)="fallida.set(direccion)" />
    } @else {
      <span class="sin-foto" role="img" [attr.aria-label]="alt() || 'Sin foto'">Sin foto</span>
    }
  `,
  styles: `
    :host {
      display: block;
      flex: none;
      width: var(--tamano, 64px);
      height: var(--tamano, 64px);
      border-radius: 14px;
      overflow: hidden;
      background: var(--rs-superficie-alta, #202027);
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .sin-foto {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      border: 1px dashed var(--rs-borde-fuerte, rgba(255, 255, 255, 0.16));
      border-radius: inherit;
      box-sizing: border-box;
      color: var(--rs-tenue, #a09ea8);
      font-size: 0.7rem;
      font-weight: 600;
      text-align: center;
    }
  `,
})
export class ImagenPrendaComponent {
  readonly url = input<string | null>(null);
  /** Texto alternativo; vacío cuando el nombre de la prenda ya está escrito al lado. */
  readonly alt = input('');

  /** Dirección que no se pudo cargar, para no reintentarla y volver a mostrar la foto si cambia. */
  protected readonly fallida = signal<string | null>(null);
  protected readonly visible = computed(() => {
    const url = this.url();
    return url && url !== this.fallida() ? url : null;
  });
}
