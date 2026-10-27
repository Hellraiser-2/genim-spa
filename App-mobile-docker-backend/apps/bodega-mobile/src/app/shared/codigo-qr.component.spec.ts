import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CodigoQrComponent, trazoQr } from './codigo-qr.component';

describe('trazoQr', () => {
  it('genera un código cuadrado con margen en blanco alrededor', () => {
    const { lado, trazo } = trazoQr('B-POL-03');

    // Un código corto cabe en la versión 1: 21 módulos, más 3 de margen por lado.
    expect(lado).toBe(27);
    const columnas = [...trazo.matchAll(/M(\d+),(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(columnas.length).toBeGreaterThan(100);
    expect(columnas.every(([x, y]) => x >= 3 && x < 24 && y >= 3 && y < 24)).toBe(true);
  });

  it('dibuja los tres patrones de esquina que usan los lectores para ubicar el código', () => {
    const oscuros = new Set([...trazoQr('B-POL-03').trazo.matchAll(/M(\d+),(\d+)/g)].map((m) => `${m[1]},${m[2]}`));

    // Cada patrón es un cuadrado de 7 módulos: borde oscuro, anillo claro y centro oscuro.
    // Con el margen de 3, sus esquinas exteriores están en 3 y 23, y sus centros en 6 y 20.
    for (const [borde, anillo, centro] of [
      ['3,3', '4,4', '6,6'],
      ['23,3', '22,4', '20,6'],
      ['3,23', '4,22', '6,20'],
    ]) {
      expect(oscuros.has(borde)).toBe(true);
      expect(oscuros.has(anillo)).toBe(false);
      expect(oscuros.has(centro)).toBe(true);
    }
  });

  it('cambia con el texto y crece cuando el texto es largo', () => {
    expect(trazoQr('B-POL-03').trazo).not.toBe(trazoQr('B-POL-04').trazo);
    expect(trazoQr('B-POL-03'.repeat(12)).lado).toBeGreaterThan(27);
  });
});

describe('CodigoQrComponent', () => {
  let fixture: ComponentFixture<CodigoQrComponent>;
  let elemento: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(CodigoQrComponent);
    fixture.componentRef.setInput('texto', 'B-POL-03');
    fixture.detectChanges();
    elemento = fixture.nativeElement;
  });

  it('dibuja el código en negro sobre blanco y lo describe para lectores de pantalla', () => {
    const svg = elemento.querySelector('svg')!;

    expect(svg.getAttribute('viewBox')).toBe('0 0 27 27');
    expect(svg.getAttribute('aria-label')).toBe('Código QR de B-POL-03');
    expect(svg.querySelector('rect')!.getAttribute('fill')).toBe('#fff');
    expect(svg.querySelector('path')!.getAttribute('fill')).toBe('#000');
  });

  it('se vuelve a dibujar cuando cambia el texto', () => {
    const antes = elemento.querySelector('path')!.getAttribute('d');

    fixture.componentRef.setInput('texto', 'B-CHA-01');
    fixture.detectChanges();

    expect(elemento.querySelector('path')!.getAttribute('d')).not.toBe(antes);
    expect(elemento.querySelector('svg')!.getAttribute('aria-label')).toBe('Código QR de B-CHA-01');
  });
});
