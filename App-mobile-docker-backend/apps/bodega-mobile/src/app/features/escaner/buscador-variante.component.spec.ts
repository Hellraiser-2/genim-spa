import { TestBed } from '@angular/core/testing';
import type { VarianteStock } from '@rockstar/contracts';

import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { BuscadorVarianteComponent } from './buscador-variante.component';

describe('BuscadorVarianteComponent', () => {
  let entorno: EntornoDePrueba;
  let buscador: BuscadorVarianteComponent;
  let seleccionadas: VarianteStock[];
  let elemento: HTMLElement;

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
    const fixture = TestBed.createComponent(BuscadorVarianteComponent);
    fixture.detectChanges();
    buscador = fixture.componentInstance;
    elemento = fixture.nativeElement;
    seleccionadas = [];
    buscador.seleccionada.subscribe((variante) => seleccionadas.push(variante));
  });

  it('selecciona la variante del código escaneado', async () => {
    entorno.escaner.resultado = { estado: 'leido', codigo: '7800000000003' };

    await buscador.escanear();

    expect(seleccionadas.map((v) => v.sku)).toEqual(['RS-0003']);
    expect(buscador.aviso()).toBeNull();
  });

  it('avisa que el código no está registrado y no selecciona nada', async () => {
    entorno.escaner.resultado = { estado: 'leido', codigo: '0000000000000' };

    await buscador.escanear();

    expect(seleccionadas).toEqual([]);
    expect(buscador.aviso()).toBe('El código 0000000000000 no está registrado.');
  });

  it('no hace nada cuando el escaneo se cancela', async () => {
    entorno.escaner.resultado = { estado: 'cancelado' };

    await buscador.escanear();

    expect(seleccionadas).toEqual([]);
    expect(buscador.aviso()).toBeNull();
  });

  it('explica por qué no hay escáner y mantiene la búsqueda manual', async () => {
    entorno.escaner.resultado = { estado: 'no-disponible', motivo: 'El escáner necesita permiso para usar la cámara.' };

    await buscador.escanear();

    expect(buscador.aviso()).toContain('permiso');
    expect(elemento.querySelector('ion-searchbar')).not.toBeNull();
  });

  it('busca por nombre o SKU', async () => {
    await buscador.buscar('rs-0004');
    expect(buscador['resultados']().map((v) => v.producto)).toEqual(['Jeans Rasgado']);

    await buscador.buscar('calavera');
    expect(buscador['resultados']().map((v) => v.sku)).toEqual(['RS-0001', 'RS-0002']);
  });

  it('busca por el código del espacio de bodega', async () => {
    await buscador.buscar('b-pol-02');

    expect(buscador['resultados']().map((v) => v.producto)).toEqual(['Polera Eddie']);
  });

  describe('al escanear la etiqueta de un espacio', () => {
    it('ofrece las tallas y colores guardados en ese espacio', async () => {
      entorno.escaner.resultado = { estado: 'leido', codigo: 'B-POL-01' };

      await buscador.escanear();

      expect(seleccionadas).toEqual([]);
      expect(buscador['resultados']().map((v) => v.sku)).toEqual(['RS-0001', 'RS-0002']);
      expect(buscador.aviso()).toBe('Espacio B-POL-01: elige la talla y el color.');
    });

    it('elige la prenda directamente cuando el espacio guarda una sola', async () => {
      entorno.escaner.resultado = { estado: 'leido', codigo: 'b-cha-01' };

      await buscador.escanear();

      expect(seleccionadas.map((v) => v.sku)).toEqual(['RS-0003']);
      expect(buscador.aviso()).toBeNull();
    });

    it('avisa cuando el espacio no tiene productos', async () => {
      entorno.escaner.resultado = { estado: 'leido', codigo: 'B-POL-99' };

      await buscador.escanear();

      expect(seleccionadas).toEqual([]);
      expect(buscador.aviso()).toBe('El espacio B-POL-99 no tiene productos registrados.');
    });

    it('no confunde un espacio con otro cuyo código empieza igual', async () => {
      // B-POL-0 es prefijo de B-POL-01, 02 y 03, pero no es el código de ninguno.
      entorno.escaner.resultado = { estado: 'leido', codigo: 'B-POL-0' };

      await buscador.escanear();

      expect(seleccionadas).toEqual([]);
      expect(buscador.aviso()).toBe('El espacio B-POL-0 no tiene productos registrados.');
    });
  });

  it('indica cuando la búsqueda no encuentra productos', async () => {
    await buscador.buscar('inexistente');

    expect(buscador['resultados']()).toEqual([]);
    expect(buscador['sinResultados']()).toBe(true);
  });

  it('informa la falla de conexión al buscar', async () => {
    entorno.red.caida = true;

    await buscador.buscar('polera');

    expect(buscador.aviso()).toContain('No hay conexión');
  });
});
