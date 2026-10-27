import { Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** Módulos en blanco alrededor del código; sin ese margen los lectores no lo detectan. */
const MARGEN = 3;

/**
 * Trazo SVG de un código QR: un cuadrado por cada módulo oscuro. Devuelve también el
 * lado total, en módulos, con el margen incluido.
 */
export function trazoQr(texto: string): { lado: number; trazo: string } {
  // Tipo 0: el tamaño mínimo que alcance. Nivel M: tolera hasta 15% de daño, suficiente
  // para una etiqueta pegada en una repisa.
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const modulos = qr.getModuleCount();
  const cuadrados: string[] = [];
  for (let fila = 0; fila < modulos; fila++) {
    for (let columna = 0; columna < modulos; columna++) {
      if (qr.isDark(fila, columna)) {
        cuadrados.push(`M${columna + MARGEN},${fila + MARGEN}h1v1h-1z`);
      }
    }
  }
  return { lado: modulos + MARGEN * 2, trazo: cuadrados.join('') };
}

/**
 * Código QR del texto recibido, dibujado como SVG para que se vea nítido en pantalla y
 * al imprimir. Siempre es negro sobre blanco, aunque la app sea oscura: así lo exigen los lectores.
 */
@Component({
  selector: 'app-codigo-qr',
  template: `
    <svg
      role="img"
      shape-rendering="crispEdges"
      [attr.viewBox]="'0 0 ' + qr().lado + ' ' + qr().lado"
      [attr.aria-label]="'Código QR de ' + texto()"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path fill="#000" [attr.d]="qr().trazo" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
      width: var(--tamano, 160px);
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 6%;
      background: #fff;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class CodigoQrComponent {
  readonly texto = input.required<string>();

  protected readonly qr = computed(() => trazoQr(this.texto()));
}
