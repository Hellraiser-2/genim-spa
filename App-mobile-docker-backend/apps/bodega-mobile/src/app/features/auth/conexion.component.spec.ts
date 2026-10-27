import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';

import { ServidorService } from '../../core/api/servidor.service';
import { ConexionComponent } from './conexion.component';

describe('ConexionComponent', () => {
  let servidor: ServidorService;
  let conexion: ConexionComponent;
  let responde: boolean;

  beforeEach(async () => {
    await Preferences.clear();
    servidor = TestBed.inject(ServidorService);
    responde = true;
    vi.spyOn(servidor, 'probar').mockImplementation(async () => responde);
    conexion = TestBed.createComponent(ConexionComponent).componentInstance;
  });

  it('resume a qué está conectada la app', async () => {
    await servidor.guardar({ modoDemo: true, direccion: '' });
    expect(conexion.resumen()).toBe('Modo demostración');

    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.1.20:3000' });
    expect(conexion.resumen()).toBe('Servidor: 192.168.1.20:3000');
  });

  it('al abrirse muestra la conexión actual', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.1.20:3000' });

    conexion.abrir();

    expect(conexion.abierto()).toBe(true);
    expect(conexion.modo()).toBe('SERVIDOR');
    expect(conexion.direccion()).toBe('http://192.168.1.20:3000');
  });

  it('guarda un servidor que responde, con la dirección normalizada', async () => {
    conexion.abrir();
    conexion.cambiarModo('SERVIDOR');
    conexion.escribir(' 192.168.1.30:3000/ ');

    await conexion.guardar();

    expect(servidor.probar).toHaveBeenCalledWith('http://192.168.1.30:3000');
    expect(servidor.modoDemo()).toBe(false);
    expect(servidor.direccion()).toBe('http://192.168.1.30:3000');
    expect(conexion.abierto()).toBe(false);
  });

  it('no guarda un servidor que no responde', async () => {
    await servidor.guardar({ modoDemo: true, direccion: '' });
    responde = false;
    conexion.abrir();
    conexion.cambiarModo('SERVIDOR');
    conexion.escribir('192.168.1.30:3000');

    await conexion.guardar();

    expect(servidor.modoDemo()).toBe(true);
    expect(conexion.abierto()).toBe(true);
    expect(conexion.exito()).toBe(false);
    expect(conexion.mensaje()).toContain('No se pudo conectar');
  });

  it('pide una dirección válida antes de probar', async () => {
    conexion.abrir();
    conexion.cambiarModo('SERVIDOR');
    conexion.escribir('   ');

    expect(await conexion.probar()).toBe(false);

    expect(servidor.probar).not.toHaveBeenCalled();
    expect(conexion.mensaje()).toContain('Escribe la dirección del servidor');
  });

  it('pasa a modo demostración sin necesitar un servidor', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.1.20:3000' });
    conexion.abrir();
    conexion.cambiarModo('DEMO');

    await conexion.guardar();

    expect(servidor.probar).not.toHaveBeenCalled();
    expect(servidor.modoDemo()).toBe(true);
    // La dirección se conserva para volver al servidor sin escribirla de nuevo.
    expect(servidor.direccion()).toBe('http://192.168.1.20:3000');
    expect(conexion.abierto()).toBe(false);
  });

  it('sin servidor elegido se abre sola y pide la IP, sin dejar cancelar', async () => {
    await servidor.guardar({ modoDemo: false, direccion: '' });
    expect(servidor.sinServidor()).toBe(true);

    await conexion.revisar();

    expect(conexion.abierto()).toBe(true);
    expect(conexion.modo()).toBe('SERVIDOR');
    expect(conexion.mensaje()).toContain('Escribe la IP del equipo servidor');
    expect(servidor.probar).not.toHaveBeenCalled();

    conexion.escribir('192.168.43.10');
    await conexion.guardar();
    expect(servidor.direccion()).toBe('http://192.168.43.10:3000');
    expect(servidor.sinServidor()).toBe(false);
  });

  it('avisa y vuelve a pedir la IP si el servidor guardado no responde', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.100.7:3000' });
    responde = false;

    await conexion.revisar();

    expect(servidor.probar).toHaveBeenCalledWith('http://192.168.100.7:3000');
    expect(conexion.abierto()).toBe(true);
    expect(conexion.mensaje()).toContain('192.168.100.7:3000 no responde');
  });

  it('con el servidor guardado respondiendo queda cerrada', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.100.7:3000' });

    await conexion.revisar();

    expect(conexion.abierto()).toBe(false);
  });
});
