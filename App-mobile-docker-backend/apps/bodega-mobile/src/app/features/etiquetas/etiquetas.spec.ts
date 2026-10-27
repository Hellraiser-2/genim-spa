import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { trazoQr } from '../../shared/codigo-qr.component';
import { ImpresionService } from '../../shared/impresion.service';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { InventarioApi } from '../inventario/inventario.api';
import { EtiquetasPage, MAXIMO_DE_COPIAS, filtrarVariantes, unidadesDe } from './etiquetas.page';

describe('EtiquetasPage', () => {
  let entorno: EntornoDePrueba;
  let fixture: ComponentFixture<EtiquetasPage>;
  let pagina: EtiquetasPage;
  let elemento: HTMLElement;
  let imprimir: ReturnType<typeof vi.spyOn>;

  const skusImpresos = () =>
    [...(imprimir.mock.calls[0][0] as HTMLElement).querySelectorAll('.rs-etiqueta-codigo')].map((e) => e.textContent);

  beforeEach(async () => {
    entorno = configurarEntorno();
    // La impresión real abre el diálogo del navegador: se observa sin ejecutarla.
    imprimir = vi.spyOn(TestBed.inject(ImpresionService), 'imprimir').mockImplementation(() => undefined);
    await entorno.iniciarSesion();
    fixture = TestBed.createComponent(EtiquetasPage);
    pagina = fixture.componentInstance;
    elemento = fixture.nativeElement;
  });

  it('muestra una etiqueta por SKU, con el código QR de ese SKU', async () => {
    await pagina.cargar();
    fixture.detectChanges();

    const tarjetas = [...elemento.querySelectorAll('ion-card')];
    expect(tarjetas.map((t) => t.querySelector('h2')!.textContent)).toEqual([
      'RS-0001',
      'RS-0002',
      'RS-0003',
      'RS-0004',
      'RS-0005',
      'RS-0006',
      'RS-0007',
      'RS-0008',
    ]);
    // El dibujo de cada tarjeta es el QR de su propio SKU, no un adorno común.
    expect(tarjetas[1]!.querySelector('path')!.getAttribute('d')).toBe(trazoQr('RS-0002').trazo);
    expect(tarjetas[1]!.querySelector('.tenue')!.textContent).toContain('Talla L · Negro · 10 unidades');
  });

  it('el SKU de la etiqueta es el que el escáner reconoce', async () => {
    await pagina.cargar();
    const api = TestBed.inject(InventarioApi);

    for (const variante of pagina.variantes()) {
      expect((await firstValueFrom(api.variantePorCodigo(variante.sku))).idVariante).toBe(variante.idVariante);
    }
  });

  it('filtra por SKU, producto, talla o color', async () => {
    await pagina.cargar();
    const skus = (texto: string) => filtrarVariantes(pagina.variantes(), texto).map((v) => v.sku);

    expect(skus('rs-0004')).toEqual(['RS-0004']);
    expect(skus('calavera')).toEqual(['RS-0001', 'RS-0002']);
    expect(skus('azul')).toEqual(['RS-0004']);
    expect(skus('única')).toEqual(['RS-0006']);
    expect(skus('nada')).toEqual([]);
  });

  it('marca las prendas desactivadas', async () => {
    await pagina.cargar();
    pagina.filtro.set('RS-0006');
    fixture.detectChanges();

    expect(elemento.querySelector('ion-card ion-badge')!.textContent).toBe('Desactivado');
  });

  it('abre directo la etiqueta del SKU pedido en la dirección', async () => {
    fixture.componentRef.setInput('sku', 'RS-0004');

    await pagina.cargar();
    fixture.detectChanges();

    const etiqueta = elemento.querySelector('.detalle .rs-etiqueta')!;
    expect(etiqueta.querySelector('.rs-etiqueta-codigo')!.textContent).toBe('RS-0004');
    expect(etiqueta.querySelector('.rs-etiqueta-producto')!.textContent).toBe('Jeans Rasgado');
    expect(etiqueta.querySelector('.rs-etiqueta-detalle')!.textContent).toBe('Talla 42 · Azul');
    expect(etiqueta.querySelector('svg')!.getAttribute('aria-label')).toBe('Código QR de RS-0004');
  });

  it('imprime la etiqueta de la prenda elegida', async () => {
    await pagina.cargar();
    pagina.skuElegido.set('RS-0003');
    fixture.detectChanges();

    pagina.imprimirElegida();

    const impreso = imprimir.mock.calls[0][0] as HTMLElement;
    expect(impreso.classList.contains('rs-etiqueta')).toBe(true);
    expect(impreso.querySelector('.rs-etiqueta-codigo')!.textContent).toBe('RS-0003');
  });

  it('imprime una etiqueta por cada unidad de la prenda elegida', async () => {
    await pagina.cargar();
    // La Chaqueta de Cuero Rider tiene 4 unidades en bodega y 1 en la sala de ventas.
    pagina.skuElegido.set('RS-0003');
    fixture.detectChanges();

    expect(pagina.copias()).toBe(5);
    pagina.imprimirCopias();

    expect(skusImpresos()).toEqual(Array(5).fill('RS-0003'));
  });

  it('limita las copias de una prenda con mucho stock', async () => {
    await pagina.cargar();
    const [calavera] = pagina.variantes();
    pagina.variantes.update((variantes) =>
      variantes.map((v) => (v === calavera ? { ...v, existencias: [{ ubicacion: 'BODEGA', cantidad: 500 }] } : v)),
    );
    pagina.skuElegido.set(calavera!.sku);

    expect(unidadesDe(pagina.elegida()!)).toBe(500);
    expect(pagina.copias()).toBe(MAXIMO_DE_COPIAS);
  });

  it('imprime una hoja con una etiqueta por prenda visible', async () => {
    await pagina.cargar();
    pagina.filtro.set('polera');
    fixture.detectChanges();

    pagina.imprimirVisibles();

    expect(skusImpresos()).toEqual(['RS-0001', 'RS-0002', 'RS-0007', 'RS-0008']);
  });

  it('informa la falla de conexión al cargar', async () => {
    entorno.red.caida = true;

    await pagina.cargar();

    expect(pagina.mensaje()).toContain('No hay conexión');
  });
});
