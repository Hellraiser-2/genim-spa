import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { VarianteStock } from '@rockstar/contracts';

import { ImpresionService } from '../../shared/impresion.service';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { agruparEspacios, esCodigoDeEspacio, filtrarEspacios } from './espacios';
import { EspaciosPage } from './espacios.page';

function variante(datos: Partial<VarianteStock> & { codigoUbicacion: string }): VarianteStock {
  return {
    idVariante: 1,
    sku: 'RS-0001',
    codigo: '7800000000001',
    producto: 'Polera Calavera',
    categoria: 'Poleras',
    banda: 'Misfits',
    imagenUrl: null,
    talla: 'M',
    color: 'Negro',
    activo: true,
    existencias: [
      { ubicacion: 'BODEGA', cantidad: 0 },
      { ubicacion: 'SALA_VENTAS', cantidad: 0 },
    ],
    reservado: 0,
    disponible: 0,
    ...datos,
  };
}

const enBodega = (bodega: number, sala = 0) => [
  { ubicacion: 'BODEGA' as const, cantidad: bodega },
  { ubicacion: 'SALA_VENTAS' as const, cantidad: sala },
];

describe('espacios de bodega', () => {
  it('reconoce el formato del código de un espacio', () => {
    expect(esCodigoDeEspacio('B-POL-03')).toBe(true);
    expect(esCodigoDeEspacio(' b-cha-01 ')).toBe(true);
    expect(esCodigoDeEspacio('RS-0001')).toBe(false);
    expect(esCodigoDeEspacio('7800000000001')).toBe(false);
  });

  it('junta en un espacio todas las tallas del producto y suma lo que hay en bodega', () => {
    const espacios = agruparEspacios([
      variante({ codigoUbicacion: 'B-POL-01', talla: 'M', existencias: enBodega(12, 3) }),
      variante({ codigoUbicacion: 'B-POL-01', talla: 'L', existencias: enBodega(8, 2) }),
    ]);

    expect(espacios).toEqual([
      {
        codigo: 'B-POL-01',
        zona: 'POL',
        numero: '01',
        producto: 'Polera Calavera',
        categoria: 'Poleras',
        banda: 'Misfits',
        imagenUrl: null,
        variantes: 2,
        // Las unidades de la sala de ventas no ocupan el espacio de la bodega.
        unidadesEnBodega: 20,
      },
    ]);
  });

  it('ordena por zona y por número, no como texto', () => {
    const codigos = ['B-POL-10', 'B-POL-2', 'B-CHA-01', 'B-POL-01'];

    const espacios = agruparEspacios(codigos.map((codigoUbicacion) => variante({ codigoUbicacion })));

    expect(espacios.map((e) => e.codigo)).toEqual(['B-CHA-01', 'B-POL-01', 'B-POL-2', 'B-POL-10']);
  });

  it('filtra por código, producto, categoría o banda', () => {
    const espacios = agruparEspacios([
      variante({ codigoUbicacion: 'B-POL-01' }),
      variante({ codigoUbicacion: 'B-PAN-01', producto: 'Jeans Rasgado', categoria: 'Pantalones', banda: null }),
    ]);
    const codigos = (texto: string) => filtrarEspacios(espacios, texto).map((e) => e.codigo);

    expect(codigos('')).toEqual(['B-PAN-01', 'B-POL-01']);
    expect(codigos('b-pan')).toEqual(['B-PAN-01']);
    expect(codigos('JEANS')).toEqual(['B-PAN-01']);
    expect(codigos('misfits')).toEqual(['B-POL-01']);
    expect(codigos('gorros')).toEqual([]);
  });
});

describe('EspaciosPage', () => {
  let entorno: EntornoDePrueba;
  let fixture: ComponentFixture<EspaciosPage>;
  let pagina: EspaciosPage;
  let imprimir: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    entorno = configurarEntorno();
    // La impresión real abre el diálogo del navegador: se observa sin ejecutarla.
    imprimir = vi.spyOn(TestBed.inject(ImpresionService), 'imprimir').mockImplementation(() => undefined);
    await entorno.iniciarSesion();
    fixture = TestBed.createComponent(EspaciosPage);
    pagina = fixture.componentInstance;
  });

  it('lista un espacio por producto, con su código y número', async () => {
    await pagina.cargar();

    expect(pagina.espacios().map((e) => `${e.codigo} ${e.producto}`)).toEqual([
      'B-CHA-01 Chaqueta de Cuero Rider',
      'B-CIN-01 Cinturón Tachas',
      'B-PAN-01 Jeans Rasgado',
      'B-POE-01 Polerón Banda Tour',
      'B-POL-01 Polera Calavera',
      'B-POL-02 Polera Eddie',
      'B-POL-03 Polera Rayo',
    ]);
    expect(pagina.espacios().find((e) => e.codigo === 'B-POL-01')).toMatchObject({ numero: '01', variantes: 2, unidadesEnBodega: 20 });
  });

  it('dibuja el código QR de cada espacio visible', async () => {
    await pagina.cargar();
    pagina.filtro.set('pol-0');
    fixture.detectChanges();

    const tarjetas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ion-card')];
    expect(tarjetas.map((t) => t.querySelector('h2')!.textContent)).toEqual(['B-POL-01', 'B-POL-02', 'B-POL-03']);
    expect(tarjetas.map((t) => t.querySelector('svg')!.getAttribute('aria-label'))).toEqual([
      'Código QR de B-POL-01',
      'Código QR de B-POL-02',
      'Código QR de B-POL-03',
    ]);
  });

  it('abre directo la etiqueta del espacio pedido en la dirección', async () => {
    fixture.componentRef.setInput('codigo', 'B-PAN-01');

    await pagina.cargar();
    fixture.detectChanges();

    expect(pagina.elegido()).toMatchObject({ codigo: 'B-PAN-01', zona: 'PAN', numero: '01', producto: 'Jeans Rasgado' });
    const etiqueta = (fixture.nativeElement as HTMLElement).querySelector('.detalle .rs-etiqueta')!;
    expect(etiqueta.querySelector('.rs-etiqueta-codigo')!.textContent).toBe('B-PAN-01');
    expect(etiqueta.querySelector('svg')!.getAttribute('aria-label')).toBe('Código QR de B-PAN-01');
  });

  it('el código pedido se atiende una vez: volver a la lista no lo reabre', async () => {
    fixture.componentRef.setInput('codigo', 'B-PAN-01');
    await pagina.cargar();

    pagina.codigoElegido.set(null);
    await pagina.cargar();

    expect(pagina.elegido()).toBeNull();
  });

  it('imprime la etiqueta del espacio elegido', async () => {
    await pagina.cargar();
    pagina.codigoElegido.set('B-CHA-01');
    fixture.detectChanges();

    pagina.imprimirElegido();

    const impreso = imprimir.mock.calls[0][0] as HTMLElement;
    expect(impreso.classList.contains('rs-etiqueta')).toBe(true);
    expect(impreso.querySelector('.rs-etiqueta-codigo')!.textContent).toBe('B-CHA-01');
  });

  it('imprime una hoja con las etiquetas de los espacios visibles', async () => {
    await pagina.cargar();
    pagina.filtro.set('poleras');
    fixture.detectChanges();

    pagina.imprimirVisibles();

    const hoja = imprimir.mock.calls[0][0] as HTMLElement;
    expect([...hoja.querySelectorAll('.rs-etiqueta-codigo')].map((e) => e.textContent)).toEqual(['B-POL-01', 'B-POL-02', 'B-POL-03']);
    expect(hoja.querySelectorAll('svg')).toHaveLength(3);
  });

  it('un producto nuevo aparece con el espacio que le asignó el servicio', async () => {
    const creada = await entorno.backend.manejar(
      'POST',
      '/inventario/productos',
      {
        claveIdempotencia: 'espacio-nuevo',
        nombre: 'Polera Nueva',
        categoria: 'Poleras',
        banda: null,
        talla: 'S',
        color: 'Negro',
        cantidad: 5,
        ubicacion: 'BODEGA',
        imagen: 'data:image/png;base64,AAAA',
      },
      entorno.sesion.accessToken(),
    );
    expect(creada.status).toBe(200);

    await pagina.cargar();

    expect(pagina.espacios().find((e) => e.producto === 'Polera Nueva')).toMatchObject({
      codigo: 'B-POL-04',
      numero: '04',
      unidadesEnBodega: 5,
    });
  });
});
