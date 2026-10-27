import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';

import { ImagenesService } from '../../shared/imagenes.service';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { ProductoNuevoPage } from './producto-nuevo.page';

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('ProductoNuevoPage', () => {
  let entorno: EntornoDePrueba;
  let pagina: ProductoNuevoPage;

  function completar(
    datos: Partial<Record<'nombre' | 'categoria' | 'banda' | 'talla' | 'color' | 'cantidad', string>> = {},
  ): void {
    pagina.nombre.set(datos.nombre ?? 'Polera Ace of Spades');
    pagina.categoria.set(datos.categoria ?? 'Poleras');
    pagina.banda.set(datos.banda ?? 'Motörhead');
    pagina.talla.set(datos.talla ?? 'L');
    pagina.color.set(datos.color ?? 'Negro');
    pagina.cantidad.set(datos.cantidad ?? '10');
    pagina.imagen.set(FOTO);
  }

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
    const fixture = TestBed.createComponent(ProductoNuevoPage);
    fixture.detectChanges();
    pagina = fixture.componentInstance;
  });

  it('crea el producto y muestra el SKU, el código de barras y el código de ubicación generados', async () => {
    completar();

    await pagina.guardar();

    expect(pagina.creada()).toMatchObject({
      producto: 'Polera Ace of Spades',
      categoria: 'Poleras',
      banda: 'Motörhead',
      talla: 'L',
      color: 'Negro',
      imagenUrl: FOTO,
      sku: 'RS-0009',
      codigo: '7800000000009',
      codigoUbicacion: 'B-POL-04',
      disponible: 10,
    });
  });

  it('deja el producto disponible para buscarlo y escanearlo', async () => {
    completar();

    await pagina.guardar();

    await expect(entorno.variante('7800000000009')).resolves.toMatchObject({ sku: 'RS-0009' });
  });

  it('exige nombre, categoría, talla, color, cantidad y foto, y no envía nada si faltan', async () => {
    const solicitudes = entorno.red.solicitudes;

    await pagina.guardar();

    expect(pagina.mostrarErrores()).toBe(true);
    expect(pagina.errores()).toEqual([
      'El nombre es obligatorio.',
      'La categoría es obligatoria.',
      'La talla es obligatoria.',
      'El color es obligatorio.',
      'La cantidad debe ser un entero mayor que cero.',
      'Elige una foto del producto.',
    ]);
    expect(entorno.red.solicitudes).toBe(solicitudes);
  });

  it('admite un producto sin banda', async () => {
    completar({ nombre: 'Cinturón Balas', categoria: 'Cinturones', banda: '  ', talla: 'Única' });

    await pagina.guardar();

    expect(pagina.creada()).toMatchObject({ banda: null, codigoUbicacion: 'B-CIN-02' });
  });

  it('informa cuando el producto ya existe con la misma talla y color', async () => {
    completar({ nombre: 'Polera Calavera', talla: 'M', color: 'Negro' });

    await pagina.guardar();

    expect(pagina.creada()).toBeNull();
    expect(pagina.envio.error()).toBe('Ya existe ese producto con la misma talla y color.');
  });

  it('no duplica el producto al reintentar tras perderse la respuesta', async () => {
    completar();
    entorno.red.pierdeRespuestas = true;

    await pagina.guardar();
    expect(pagina.creada()).toBeNull();
    expect(pagina.envio.reintentable()).toBe(true);
    expect(pagina.nombre()).toBe('Polera Ace of Spades');

    entorno.red.pierdeRespuestas = false;
    await pagina.guardar();

    expect(pagina.creada()).toMatchObject({ sku: 'RS-0009' });
  });

  it('ofrece en listas las categorías, bandas y colores que ya existen', async () => {
    await pagina.cargarSugerencias();

    expect(pagina.nombresDeCategorias()).toEqual(['Chaquetas', 'Cinturones', 'Pantalones', 'Poleras', 'Polerones']);
    expect(pagina.bandas()).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits']);
    expect(pagina.colores()).toEqual(['Azul', 'Gris', 'Negro']);
  });

  describe('campos según la categoría', () => {
    beforeEach(() => pagina.cargarSugerencias());

    it('al elegir Pantalones ofrece las tallas 38 a 50 y no pide banda', () => {
      pagina.cambiarCategoria('Pantalones');

      expect(pagina.tallas()).toEqual(['38', '40', '42', '44', '46', '48', '50']);
      expect(pagina.usaBanda()).toBe(false);
    });

    it('al elegir Poleras ofrece las tallas de letras y pide banda', () => {
      pagina.cambiarCategoria('Poleras');

      expect(pagina.tallas()).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      expect(pagina.usaBanda()).toBe(true);
    });

    it('descarta la talla y la banda que no corresponden al cambiar de categoría', () => {
      pagina.cambiarCategoria('Poleras');
      pagina.banda.set('Metallica');
      pagina.talla.set('L');

      pagina.cambiarCategoria('Pantalones');

      expect(pagina.talla()).toBe('');
      expect(pagina.banda()).toBe('');
    });

    it('conserva la talla y la banda al pasar a una categoría que también las admite', () => {
      pagina.cambiarCategoria('Poleras');
      pagina.banda.set('Metallica');
      pagina.talla.set('L');

      pagina.cambiarCategoria('Polerones');

      expect(pagina.talla()).toBe('L');
      expect(pagina.banda()).toBe('Metallica');
    });

    it('crea un pantalón sin banda con una talla numérica', async () => {
      completar({ nombre: 'Pantalón Cargo', talla: '', banda: '' });
      pagina.cambiarCategoria('Pantalones');
      pagina.talla.set('44');

      await pagina.guardar();

      expect(pagina.creada()).toMatchObject({ categoria: 'Pantalones', talla: '44', banda: null });
    });

    it('usa tallas de letras y pide banda en una categoría que aún no existe', () => {
      pagina.cambiarCategoria('Gorros');

      expect(pagina.categoriaElegida()).toBeNull();
      expect(pagina.tallas()).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      expect(pagina.usaBanda()).toBe(true);
    });

    it('aplica los datos de la categoría recién guardada', async () => {
      pagina.talla.set('42');

      await pagina.agregarCategoria('Gorros');

      expect(pagina.categoria()).toBe('Gorros');
      expect(pagina.categoriaElegida()).toMatchObject({ nombre: 'Gorros', usaBanda: true });
      expect(pagina.talla()).toBe('');
      expect(pagina.avisoCatalogo()).toBe('Categoría "Gorros" guardada.');
    });
  });

  it('deja disponibles la banda y la categoría nuevas para los productos siguientes', async () => {
    completar({ nombre: 'Gorro Bomber', categoria: 'Gorros', banda: 'Motörhead', talla: 'Única' });

    await pagina.guardar();

    expect(pagina.creada()).toMatchObject({ categoria: 'Gorros', banda: 'Motörhead', codigoUbicacion: 'B-GOR-01' });
    expect(pagina.bandas()).toContain('Motörhead');
    expect(pagina.nombresDeCategorias()).toContain('Gorros');
  });

  it('registra una banda nueva de inmediato, sin crear ningún producto', async () => {
    await pagina.cargarSugerencias();

    await pagina.agregarBanda('Motörhead');

    expect(pagina.bandas()).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits', 'Motörhead']);
    expect(pagina.banda()).toBe('Motörhead');
    expect(pagina.avisoBanda()).toBe('Banda "Motörhead" guardada.');
    expect(pagina.creada()).toBeNull();

    // Quedó en el servidor: otra pantalla la ve aunque no exista ningún producto de esa banda.
    const otra = TestBed.createComponent(ProductoNuevoPage).componentInstance;
    await otra.cargarSugerencias();
    expect(otra.bandas()).toContain('Motörhead');
  });

  it('registra una categoría nueva de inmediato', async () => {
    await pagina.agregarCategoria('Gorros');

    expect(pagina.nombresDeCategorias()).toContain('Gorros');
    expect(pagina.categoria()).toBe('Gorros');
  });

  it('no duplica una banda que ya existe y elige la registrada', async () => {
    await pagina.agregarBanda('metallica');

    expect(pagina.bandas()).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits']);
    expect(pagina.banda()).toBe('Metallica');
  });

  it('registra un color nuevo de inmediato y lo deja elegido', async () => {
    await pagina.cargarSugerencias();

    await pagina.agregarColor('Burdeo');

    expect(pagina.colores()).toEqual(['Azul', 'Burdeo', 'Gris', 'Negro']);
    expect(pagina.color()).toBe('Burdeo');
    expect(pagina.avisoColor()).toBe('Color "Burdeo" guardado.');
    expect(pagina.creada()).toBeNull();
  });

  it('no duplica un color que ya existe y elige el registrado', async () => {
    await pagina.agregarColor('NEGRO');

    expect(pagina.colores()).toEqual(['Azul', 'Gris', 'Negro']);
    expect(pagina.color()).toBe('Negro');
  });

  it('registra el color escrito al crear el producto aunque no se haya guardado antes', async () => {
    completar({ color: 'Verde militar' });

    await pagina.guardar();

    expect(pagina.creada()).toMatchObject({ color: 'Verde militar' });
    expect(pagina.colores()).toContain('Verde militar');
  });

  it('avisa si no se pudo guardar la banda y permite seguir con el producto', async () => {
    entorno.red.caida = true;

    await pagina.agregarBanda('Motörhead');

    expect(pagina.avisoBanda()).toContain('No hay conexión');
    expect(pagina.avisoBanda()).toContain('Se guardará al crear el producto.');
  });

  it('usa la foto elegida ya reducida, o informa si no se puede leer', async () => {
    const reducir = vi.spyOn(TestBed.inject(ImagenesService), 'reducir');

    reducir.mockResolvedValueOnce(FOTO);
    await pagina.cargarImagen(new Blob(['foto']));
    expect(pagina.imagen()).toBe(FOTO);

    reducir.mockRejectedValueOnce(new Error('formato no soportado'));
    await pagina.cargarImagen(new Blob(['no es una imagen']));
    expect(pagina.errorImagen()).toBe('No se pudo leer la imagen. Elige otra foto.');
    expect(pagina.imagen()).toBe(FOTO);
  });

  it('ingresa la cantidad indicada en la bodega al crear el producto', async () => {
    completar({ cantidad: '12' });

    await pagina.guardar();

    await expect(entorno.variante('RS-0009')).resolves.toMatchObject({
      existencias: [
        { ubicacion: 'BODEGA', cantidad: 12 },
        { ubicacion: 'SALA_VENTAS', cantidad: 0 },
      ],
      disponible: 12,
    });
  });

  it('ingresa la cantidad en la sala de ventas cuando se elige esa ubicación', async () => {
    completar({ cantidad: '3' });
    pagina.ubicacion.set('SALA_VENTAS');

    await pagina.guardar();

    expect(pagina.creada()?.existencias).toEqual([
      { ubicacion: 'BODEGA', cantidad: 0 },
      { ubicacion: 'SALA_VENTAS', cantidad: 3 },
    ]);
  });

  it.each(['', '0', '-2', '1.5', 'abc'])('no crea el producto con la cantidad no válida "%s"', async (cantidad) => {
    completar({ cantidad });
    const solicitudes = entorno.red.solicitudes;

    await pagina.guardar();

    expect(pagina.errores()).toEqual(['La cantidad debe ser un entero mayor que cero.']);
    expect(pagina.creada()).toBeNull();
    expect(entorno.red.solicitudes).toBe(solicitudes);
  });

  it('no ingresa las unidades dos veces al reintentar tras perderse la respuesta', async () => {
    completar({ cantidad: '5' });
    entorno.red.pierdeRespuestas = true;
    await pagina.guardar();

    entorno.red.pierdeRespuestas = false;
    await pagina.guardar();

    await expect(entorno.variante('RS-0009')).resolves.toMatchObject({ disponible: 5 });
  });

  it('limpia el formulario al volver al ingreso', async () => {
    const volver = vi.spyOn(TestBed.inject(NavController), 'navigateBack').mockResolvedValue(true);
    completar({ cantidad: '4' });
    pagina.ubicacion.set('SALA_VENTAS');
    await pagina.guardar();

    await pagina.volver();

    expect(volver).toHaveBeenCalledWith('/ingreso');
    expect(pagina.creada()).toBeNull();
    expect(pagina.nombre()).toBe('');
    expect(pagina.cantidad()).toBe('');
    expect(pagina.ubicacion()).toBe('BODEGA');
  });
});
