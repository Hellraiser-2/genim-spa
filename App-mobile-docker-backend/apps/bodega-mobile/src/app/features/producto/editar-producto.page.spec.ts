import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';

import { ImagenesService } from '../../shared/imagenes.service';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { ConsultaPage } from '../consulta/consulta.page';
import { InventarioApi } from '../inventario/inventario.api';
import { EditarProductoPage } from './editar-producto.page';

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('EditarProductoPage', () => {
  let entorno: EntornoDePrueba;
  let fixture: ComponentFixture<EditarProductoPage>;
  let pagina: EditarProductoPage;
  let volver: ReturnType<typeof vi.spyOn>;

  /** Abre la edición de una prenda por su SKU, como llega desde la consulta. */
  async function abrir(sku: string | undefined): Promise<void> {
    fixture = TestBed.createComponent(EditarProductoPage);
    fixture.componentRef.setInput('sku', sku);
    fixture.detectChanges();
    pagina = fixture.componentInstance;
    await pagina.cargar();
  }

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
    volver = vi.spyOn(TestBed.inject(NavController), 'navigateBack').mockResolvedValue(true);
  });

  it('parte con los datos guardados de la prenda y sin cambios que enviar', async () => {
    await abrir('RS-0001');

    expect(pagina.original()).toMatchObject({ sku: 'RS-0001', producto: 'Polera Calavera' });
    expect([pagina.nombre(), pagina.categoria(), pagina.banda(), pagina.talla(), pagina.color()]).toEqual([
      'Polera Calavera',
      'Poleras',
      'Misfits',
      'M',
      'Negro',
    ]);
    expect(pagina.imagen()).toBe('assets/prendas/polera-calavera.jpg');
    expect(pagina.hayCambios()).toBe(false);
    expect(pagina.nombresDeCategorias()).toContain('Pantalones');
  });

  it('guarda el nombre, la banda, la talla, el color y la foto nuevos, y vuelve a la consulta', async () => {
    await abrir('RS-0001');
    pagina.nombre.set('Polera Calavera Negra');
    pagina.banda.set('Metallica');
    pagina.talla.set('XL');
    pagina.color.set('Gris');
    pagina.imagenNueva.set(FOTO);

    await pagina.guardar();

    expect(await entorno.variante('RS-0001')).toMatchObject({
      producto: 'Polera Calavera Negra',
      banda: 'Metallica',
      talla: 'XL',
      color: 'Gris',
      imagenUrl: FOTO,
      // Lo que identifica a la prenda y su lugar en la bodega no cambia.
      codigo: '7800000000001',
      codigoUbicacion: 'B-POL-01',
    });
    expect(entorno.avisos.mensajes).toEqual(['Polera Calavera Negra actualizado.']);
    expect(volver).toHaveBeenCalledWith('/consulta');
  });

  it('el nombre, la banda y la foto cambian también en las otras tallas del producto', async () => {
    await abrir('RS-0001');
    pagina.nombre.set('Polera Calavera Negra');
    pagina.banda.set('');
    pagina.imagenNueva.set(FOTO);

    await pagina.guardar();

    // La talla L del mismo producto conserva su talla y recibe lo que es del producto.
    expect(await entorno.variante('RS-0002')).toMatchObject({ producto: 'Polera Calavera Negra', banda: null, imagenUrl: FOTO, talla: 'L' });
  });

  it('envía solo lo que cambió', async () => {
    await abrir('RS-0001');
    const editar = vi.spyOn(TestBed.inject(InventarioApi), 'editarVariante');
    pagina.color.set(' Gris ');

    await pagina.guardar();

    expect(editar).toHaveBeenCalledWith(1, { color: 'Gris' });
  });

  it('sin cambios no envía nada', async () => {
    await abrir('RS-0001');
    const solicitudes = entorno.red.solicitudes;

    await pagina.guardar();

    expect(entorno.red.solicitudes).toBe(solicitudes);
    expect(volver).not.toHaveBeenCalled();
  });

  it('al cambiar de categoría avisa del espacio nuevo, y una sin bandas descarta la banda', async () => {
    await abrir('RS-0001');
    expect(pagina.cambiaDeCategoria()).toBe(false);

    pagina.cambiarCategoria('Pantalones');

    expect(pagina.cambiaDeCategoria()).toBe(true);
    expect(pagina.usaBanda()).toBe(false);
    expect(pagina.banda()).toBe('');
    // La talla es la de la prenda: se conserva aunque la categoría nueva use otras.
    expect(pagina.talla()).toBe('M');
    expect(pagina.cambios()).toEqual({ categoria: 'Pantalones', banda: null });

    await pagina.guardar();

    expect(await entorno.variante('RS-0001')).toMatchObject({ categoria: 'Pantalones', banda: null, codigoUbicacion: 'B-PAN-02', talla: 'M' });
    // Todo el producto se muda de espacio, también su otra talla.
    expect(await entorno.variante('RS-0002')).toMatchObject({ categoria: 'Pantalones', codigoUbicacion: 'B-PAN-02' });
  });

  it('informa cuando el producto ya tiene esa talla y color, y no cambia nada', async () => {
    await abrir('RS-0001');
    pagina.talla.set('L');
    pagina.nombre.set('Otro nombre');

    await pagina.guardar();

    expect(pagina.envio.error()).toBe('Ya existe ese producto con la misma talla y color.');
    expect(volver).not.toHaveBeenCalled();
    expect(await entorno.variante('RS-0001')).toMatchObject({ producto: 'Polera Calavera', talla: 'M' });
    // El formulario conserva lo escrito para corregirlo.
    expect(pagina.nombre()).toBe('Otro nombre');
  });

  it('informa cuando otro producto ya usa ese nombre', async () => {
    await abrir('RS-0001');
    pagina.nombre.set('polera rayo');

    await pagina.guardar();

    expect(pagina.envio.error()).toBe('Ya existe otro producto con ese nombre.');
    expect(await entorno.variante('RS-0001')).toMatchObject({ producto: 'Polera Calavera' });
  });

  it('exige nombre, categoría, talla y color, y no envía nada si faltan', async () => {
    await abrir('RS-0001');
    const solicitudes = entorno.red.solicitudes;
    pagina.nombre.set(' ');
    pagina.categoria.set('');
    pagina.talla.set('');
    pagina.color.set('');

    await pagina.guardar();

    expect(pagina.mostrarErrores()).toBe(true);
    expect(pagina.errores()).toEqual([
      'El nombre es obligatorio.',
      'La categoría es obligatoria.',
      'La talla es obligatoria.',
      'El color es obligatorio.',
    ]);
    expect(entorno.red.solicitudes).toBe(solicitudes);
  });

  it('si la respuesta se pierde, conserva los cambios y permite reintentar', async () => {
    await abrir('RS-0001');
    pagina.color.set('Gris');
    entorno.red.pierdeRespuestas = true;

    await pagina.guardar();
    expect(pagina.envio.reintentable()).toBe(true);
    expect(pagina.color()).toBe('Gris');
    expect(volver).not.toHaveBeenCalled();

    entorno.red.pierdeRespuestas = false;
    await pagina.guardar();

    expect(volver).toHaveBeenCalledWith('/consulta');
    expect(await entorno.variante('RS-0001')).toMatchObject({ color: 'Gris' });
  });

  it('reduce la foto elegida y permite dejar la anterior', async () => {
    await abrir('RS-0001');
    const reducir = vi.spyOn(TestBed.inject(ImagenesService), 'reducir').mockResolvedValue(FOTO);

    await pagina.cargarImagen(new Blob(['foto']));
    expect(reducir).toHaveBeenCalled();
    expect(pagina.imagen()).toBe(FOTO);
    expect(pagina.cambios()).toEqual({ imagen: FOTO });

    pagina.descartarImagen();
    expect(pagina.imagen()).toBe('assets/prendas/polera-calavera.jpg');
    expect(pagina.hayCambios()).toBe(false);
  });

  it('informa una foto que no se puede leer', async () => {
    await abrir('RS-0001');
    vi.spyOn(TestBed.inject(ImagenesService), 'reducir').mockRejectedValue(new Error('formato'));

    await pagina.cargarImagen(new Blob(['no es una foto']));

    expect(pagina.errorImagen()).toBe('No se pudo leer la imagen. Elige otra foto.');
    expect(pagina.hayCambios()).toBe(false);
  });

  it('informa cuando falta el producto o no existe', async () => {
    await abrir(undefined);
    expect(pagina.errorDeCarga()).toContain('Falta indicar qué producto editar');

    await abrir('RS-9999');
    expect(pagina.errorDeCarga()).toBe('No se encontró lo solicitado.');
    expect(pagina.original()).toBeNull();
  });

  it('informa la falla de conexión al cargar y permite reintentar', async () => {
    entorno.red.caida = true;
    await abrir('RS-0001');
    expect(pagina.errorDeCarga()).toContain('No hay conexión');

    entorno.red.caida = false;
    await pagina.cargar();
    expect(pagina.errorDeCarga()).toBeNull();
    expect(pagina.original()).toMatchObject({ sku: 'RS-0001' });
  });

  it('la consulta muestra el producto como quedó al volver de editarlo', async () => {
    const consulta = TestBed.createComponent(ConsultaPage).componentInstance;
    consulta.variante.set(await entorno.variante('RS-0001'));
    const avanzar = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);

    await consulta.editar(consulta.variante()!);
    expect(avanzar).toHaveBeenCalledWith('/producto/editar', { queryParams: { sku: 'RS-0001' } });

    await abrir('RS-0001');
    pagina.nombre.set('Polera Calavera Negra');
    await pagina.guardar();
    await consulta.refrescar();

    expect(consulta.variante()).toMatchObject({ sku: 'RS-0001', producto: 'Polera Calavera Negra' });
  });
});
