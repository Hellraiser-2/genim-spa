import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { InventarioApi } from '../../features/inventario/inventario.api';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { sesionGuard, sinSesionGuard } from './sesion.guard';
import { RolNoPermitidoError, SesionService } from './sesion.service';

describe('sesión', () => {
  let entorno: EntornoDePrueba;
  let sesion: SesionService;

  const consultar = () => firstValueFrom(TestBed.inject(InventarioApi).variantePorCodigo('RS-0001'));
  const guard = (fn: typeof sesionGuard) =>
    TestBed.runInInjectionContext(() => fn({} as never, {} as never));

  beforeEach(() => {
    entorno = configurarEntorno();
    sesion = entorno.sesion;
  });

  describe('SesionService', () => {
    it('inicia sesión y guarda la sesión en el dispositivo', async () => {
      await entorno.iniciarSesion();

      expect(sesion.autenticado()).toBe(true);
      expect(sesion.usuario()).toMatchObject({ nombre: 'Bodega Demo', rol: 'BODEGA' });
      expect(entorno.almacen.sesion?.accessToken).toBe(sesion.accessToken());
    });

    it('rechaza credenciales incorrectas sin iniciar sesión', async () => {
      await expect(sesion.iniciar('bodega@rockstar.cl', 'incorrecta')).rejects.toMatchObject({ status: 401 });

      expect(sesion.autenticado()).toBe(false);
      expect(entorno.almacen.sesion).toBeNull();
    });

    it('no admite cuentas de un rol distinto de bodega', async () => {
      await expect(sesion.iniciar('vendedor@rockstar.cl', 'vendedor123')).rejects.toBeInstanceOf(RolNoPermitidoError);

      expect(sesion.autenticado()).toBe(false);
      expect(entorno.almacen.sesion).toBeNull();
    });

    it('recupera la sesión guardada al reabrir la app', async () => {
      await entorno.iniciarSesion();
      const guardada = entorno.almacen.sesion;

      TestBed.resetTestingModule();
      const reabierta = configurarEntorno();
      reabierta.almacen.sesion = guardada;
      await reabierta.sesion.restaurar();

      expect(reabierta.sesion.autenticado()).toBe(true);
      expect(reabierta.sesion.usuario()?.email).toBe('bodega@rockstar.cl');
    });

    it('queda sin sesión al reabrir si no hay nada guardado', async () => {
      await sesion.restaurar();
      expect(sesion.autenticado()).toBe(false);
    });

    it('borra la sesión del dispositivo y la invalida al cerrarla', async () => {
      await entorno.iniciarSesion();
      const refreshToken = entorno.almacen.sesion!.refreshToken;

      await sesion.cerrar();

      expect(sesion.autenticado()).toBe(false);
      expect(entorno.almacen.sesion).toBeNull();
      expect(entorno.backend.manejar('POST', '/usuarios/auth/refresh', { refreshToken }, null).status).toBe(401);
    });
  });

  describe('authInterceptor', () => {
    it('envía el token de acceso en las solicitudes', async () => {
      await entorno.iniciarSesion();
      await expect(consultar()).resolves.toMatchObject({ sku: 'RS-0001' });
    });

    it('renueva la sesión y repite la solicitud cuando el token de acceso expiró', async () => {
      await entorno.iniciarSesion();
      const tokenAnterior = sesion.accessToken();
      entorno.backend.expirarTokensDeAcceso();

      await expect(consultar()).resolves.toMatchObject({ sku: 'RS-0001' });

      expect(sesion.accessToken()).not.toBe(tokenAnterior);
      expect(entorno.almacen.sesion?.accessToken).toBe(sesion.accessToken());
    });

    it('cierra la sesión y vuelve al inicio de sesión cuando no se puede renovar', async () => {
      await entorno.iniciarSesion();
      const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const refreshToken = entorno.almacen.sesion!.refreshToken;
      entorno.backend.manejar('POST', '/usuarios/auth/logout', { refreshToken }, null);
      entorno.backend.expirarTokensDeAcceso();

      await expect(consultar()).rejects.toMatchObject({ status: 401 });

      expect(sesion.autenticado()).toBe(false);
      expect(entorno.almacen.sesion).toBeNull();
      expect(sesion.aviso()).toContain('sesión expiró');
      expect(navegar).toHaveBeenCalledWith('/login');
    });
  });

  describe('guards', () => {
    it('redirige al inicio de sesión cuando no hay sesión', () => {
      const resultado = guard(sesionGuard);
      expect(resultado).toBeInstanceOf(UrlTree);
      expect(String(resultado)).toBe('/login');
    });

    it('permite las pantallas de inventario con sesión', async () => {
      await entorno.iniciarSesion();
      expect(guard(sesionGuard)).toBe(true);
    });

    it('lleva directo a la pantalla principal a quien ya tiene sesión', async () => {
      expect(guard(sinSesionGuard)).toBe(true);
      await entorno.iniciarSesion();
      expect(String(guard(sinSesionGuard))).toBe('/inicio');
    });
  });
});
