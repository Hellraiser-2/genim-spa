import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('api client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('salud', () => {
    it('returns true when backend responds ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ estado: 'ok' }),
      });
      const result = await api.salud();
      expect(result).toBe(true);
    });

    it('returns false when backend responds not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ estado: 'error' }),
      });
      const result = await api.salud();
      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    it('returns session on valid credentials', async () => {
      const mockSession = {
        accessToken: 'token123',
        refreshToken: 'refresh123',
        usuario: { id: 1, nombre: 'Vendedor', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockSession),
      });
      const result = await api.login('vendedor@rockstar.cl', 'password');
      expect(result).toEqual(mockSession);
    });

    it('throws error with API message on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ mensaje: 'Credenciales inválidas' }),
      });
      await expect(api.login('wrong@rockstar.cl', 'wrong')).rejects.toThrow('Credenciales inválidas');
    });
  });

  describe('getCatalogo', () => {
    it('returns catalog array', async () => {
      const mockCatalog = [
        {
          idVariante: 1,
          idProducto: 1,
          sku: 'SKU001',
          producto: 'Polera',
          categoria: 'Ropa',
          banda: 'Rockstar',
          talla: 'M',
          color: 'Negro',
          precio: 15000,
          descripcion: 'Polera oficial',
          imagenUrl: 'https://example.com/img.jpg',
          disponible: 10,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockCatalog),
      });
      const result = await api.getCatalogo();
      expect(result).toEqual(mockCatalog);
    });
  });

  describe('getProductos', () => {
    it('returns management products with token', async () => {
      const mockProducts = [
        {
          id: 1,
          idProducto: 1,
          sku: 'SKU001',
          codigo: 'COD001',
          producto: 'Polera',
          categoria: 'Ropa',
          banda: 'Rockstar',
          talla: 'M',
          color: 'Negro',
          precio: 15000,
          descripcion: 'Polera oficial',
          stockTotal: 20,
          disponible: 10,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockProducts),
      });
      const result = await api.getProductos('vendor-token');
      expect(result).toEqual(mockProducts);
    });
  });

  describe('buscarVariantes', () => {
    it('searches variants with query and token', async () => {
      const mockVariants = [
        {
          id: 1,
          idProducto: 1,
          sku: 'SKU001',
          codigo: 'COD001',
          producto: 'Polera',
          categoria: 'Ropa',
          banda: 'Rockstar',
          talla: 'M',
          color: 'Negro',
          precio: 15000,
          descripcion: 'Polera oficial',
          stockTotal: 20,
          disponible: 10,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockVariants),
      });
      const result = await api.buscarVariantes('vendor-token', 'polera');
      expect(result).toEqual(mockVariants);
    });
  });

  describe('registrarVentaPos', () => {
    const comprobante = {
      idVenta: 100,
      fecha: '2024-01-15T10:30:00.000Z',
      vendedor: 'Vendedor Demo',
      cliente: null,
      medioPago: { codigo: 'EFECTIVO', nombre: 'Efectivo' },
      lineas: [
        { idVariante: 1, sku: 'RS-0001', producto: 'Polera', talla: 'M', color: 'Negro', cantidad: 2, precioUnitario: 15000, subtotal: 30000, ubicacion: 'SALA_VENTAS' },
      ],
      total: 30000,
    };

    it('registra la venta con la clave de idempotencia y el token del vendedor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(comprobante),
      });
      const request = {
        claveIdempotencia: 'uuid-123',
        lineas: [{ idVariante: 1, cantidad: 2 }],
        medioPago: 'EFECTIVO' as const,
      };
      const result = await api.registrarVentaPos('vendor-token', request);
      expect(result).toEqual(comprobante);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/ventas/pos'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer vendor-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(request),
        })
      );
    });

    it('entrega el codigo y el detalle del rechazo para ofrecer el retiro desde bodega', async () => {
      const detalle = [{ idVariante: 1, producto: 'Polera', talla: 'M', enSala: 0, enBodega: 5 }];
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ codigo: 'EXISTENCIA_EN_BODEGA', mensaje: 'Hay que retirarla de bodega.', detalle }),
      });
      const error = await api
        .registrarVentaPos('vendor-token', { claveIdempotencia: 'uuid-123', lineas: [{ idVariante: 1, cantidad: 1 }], medioPago: 'EFECTIVO' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(api.ErrorApi);
      expect(error).toMatchObject({ status: 409, codigo: 'EXISTENCIA_EN_BODEGA', detalle, message: 'Hay que retirarla de bodega.' });
    });
  });

  describe('getVentasPos', () => {
    it('devuelve las ventas del dia con el token del vendedor', async () => {
      const ventas = [{ idVenta: 100, total: 30000 }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(ventas),
      });
      const result = await api.getVentasPos('vendor-token');
      expect(result).toEqual(ventas);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/ventas/pos'),
        expect.objectContaining({ headers: { Authorization: 'Bearer vendor-token' } })
      );
    });
  });

  describe('buscarPorCodigo', () => {
    it('consulta el codigo leido con el token del vendedor', async () => {
      const variante = { idVariante: 1, sku: 'RS-0001', codigo: '7800000000001', producto: 'Polera Calavera', talla: 'M', color: 'Negro', disponible: 4 };
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(variante) });
      const result = await api.buscarPorCodigo('vendor-token', '7800000000001');
      expect(result).toEqual(variante);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/inventario/variantes/por-codigo/7800000000001'),
        expect.objectContaining({ headers: { Authorization: 'Bearer vendor-token' } })
      );
    });

    it('codifica el codigo en la URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '{}' });
      await api.buscarPorCodigo('t', 'RS 0001/x');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/por-codigo/RS%200001%2Fx'), expect.anything());
    });

    it('rechaza con status 404 si el codigo no existe', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ codigo: 'NO_ENCONTRADO', mensaje: 'El código no está registrado.' }),
      });
      await expect(api.buscarPorCodigo('t', '000')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getImageUrl', () => {
    it('resuelve fotos del backend al mismo origen del POS', () => {
      expect(api.getImageUrl({ imagenUrl: 'assets/prendas/polera-eddie.webp' })).toBe(
        '/prendas/polera-eddie.webp'
      );
    });

    it('mantiene URLs absolutas y data URIs tal cual', () => {
      expect(api.getImageUrl({ imagenUrl: 'https://cdn.example.com/foto.jpg' })).toBe(
        'https://cdn.example.com/foto.jpg'
      );
    });

    it('devuelve null sin imagen para mostrar placeholder', () => {
      expect(api.getImageUrl({ imagenUrl: null })).toBeNull();
      expect(api.getImageUrl({ imagenUrl: '   ' })).toBeNull();
    });
  });
});
