import { TestBed } from '@angular/core/testing';
import { BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

import { EscanerService, LECTOR_DE_CODIGOS, PLATAFORMA } from './escaner.service';

type Permiso = 'granted' | 'denied' | 'prompt';

function crearLector(opciones: { permiso?: Permiso; trasSolicitar?: Permiso; moduloDisponible?: boolean } = {}) {
  return {
    isSupported: vi.fn().mockResolvedValue({ supported: true }),
    checkPermissions: vi.fn().mockResolvedValue({ camera: opciones.permiso ?? 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ camera: opciones.trasSolicitar ?? 'granted' }),
    isGoogleBarcodeScannerModuleAvailable: vi.fn().mockResolvedValue({ available: opciones.moduloDisponible ?? true }),
    installGoogleBarcodeScannerModule: vi.fn().mockResolvedValue(undefined),
    scan: vi.fn().mockResolvedValue({ barcodes: [{ rawValue: '7800000000001' }] }),
  };
}

function crearServicio(lector: ReturnType<typeof crearLector>, plataforma = { nativa: true, nombre: 'android' }) {
  TestBed.configureTestingModule({
    providers: [
      { provide: LECTOR_DE_CODIGOS, useValue: lector },
      { provide: PLATAFORMA, useValue: { esNativa: () => plataforma.nativa, nombre: () => plataforma.nombre } },
    ],
  });
  return TestBed.inject(EscanerService);
}

describe('EscanerService', () => {
  it('devuelve el código leído y pide los formatos soportados', async () => {
    const lector = crearLector();

    await expect(crearServicio(lector).escanear()).resolves.toEqual({ estado: 'leido', codigo: '7800000000001' });

    expect(lector.scan).toHaveBeenCalledWith({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.Code128, BarcodeFormat.QrCode],
    });
  });

  it('informa la cancelación cuando el usuario cierra el lector', async () => {
    const lector = crearLector();
    lector.scan.mockRejectedValue(new Error('scan canceled.'));

    await expect(crearServicio(lector).escanear()).resolves.toEqual({ estado: 'cancelado' });
  });

  it('informa la cancelación cuando el lector no devuelve ningún código', async () => {
    const lector = crearLector();
    lector.scan.mockResolvedValue({ barcodes: [] });

    await expect(crearServicio(lector).escanear()).resolves.toEqual({ estado: 'cancelado' });
  });

  it('solicita el permiso de cámara la primera vez y escanea si se concede', async () => {
    const lector = crearLector({ permiso: 'prompt', trasSolicitar: 'granted' });

    await expect(crearServicio(lector).escanear()).resolves.toMatchObject({ estado: 'leido' });
    expect(lector.requestPermissions).toHaveBeenCalled();
  });

  it('no escanea y ofrece la búsqueda manual cuando se deniega el permiso', async () => {
    const lector = crearLector({ permiso: 'prompt', trasSolicitar: 'denied' });

    const resultado = await crearServicio(lector).escanear();

    expect(resultado.estado).toBe('no-disponible');
    expect(resultado).toMatchObject({ motivo: expect.stringContaining('permiso') });
    expect(lector.scan).not.toHaveBeenCalled();
  });

  it('no está disponible fuera de un dispositivo', async () => {
    const lector = crearLector();

    const resultado = await crearServicio(lector, { nativa: false, nombre: 'web' }).escanear();

    expect(resultado.estado).toBe('no-disponible');
    expect(lector.scan).not.toHaveBeenCalled();
  });

  it('instala el módulo de lectura en Android cuando falta', async () => {
    const lector = crearLector({ moduloDisponible: false });

    const resultado = await crearServicio(lector).escanear();

    expect(resultado.estado).toBe('no-disponible');
    expect(lector.installGoogleBarcodeScannerModule).toHaveBeenCalled();
    expect(lector.scan).not.toHaveBeenCalled();
  });

  it('no consulta el módulo de Google en iOS', async () => {
    const lector = crearLector();

    await crearServicio(lector, { nativa: true, nombre: 'ios' }).escanear();

    expect(lector.isGoogleBarcodeScannerModuleAvailable).not.toHaveBeenCalled();
    expect(lector.scan).toHaveBeenCalled();
  });
});
