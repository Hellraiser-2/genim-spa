import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let entorno: EntornoDePrueba;
  let pagina: LoginPage;
  let navegar: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    entorno = configurarEntorno();
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    pagina = fixture.componentInstance;
  });

  it('inicia sesión con credenciales correctas y abre la pantalla principal', async () => {
    pagina.email.set('bodega@rockstar.cl');
    pagina.password.set('bodega123');

    await pagina.ingresar();

    expect(entorno.sesion.autenticado()).toBe(true);
    expect(navegar).toHaveBeenCalledWith('/inicio', { replaceUrl: true });
    expect(pagina.error()).toBeNull();
  });

  it('permanece en el inicio de sesión con un mensaje genérico si las credenciales no son válidas', async () => {
    pagina.email.set('bodega@rockstar.cl');
    pagina.password.set('incorrecta');

    await pagina.ingresar();

    expect(entorno.sesion.autenticado()).toBe(false);
    expect(navegar).not.toHaveBeenCalled();
    expect(pagina.error()).toBe('Correo o contraseña no válidos.');
  });

  it('no envía la solicitud y señala los campos incompletos o mal formados', async () => {
    pagina.email.set('correo-sin-arroba');

    await pagina.ingresar();

    expect(entorno.red.solicitudes).toBe(0);
    expect(pagina.errorEmail()).toBe('Ingresa un correo válido.');
    expect(pagina.errorPassword()).toBe('Ingresa tu contraseña.');
  });

  it('informa el error de conexión y permite reintentar', async () => {
    pagina.email.set('bodega@rockstar.cl');
    pagina.password.set('bodega123');
    entorno.red.caida = true;

    await pagina.ingresar();
    expect(pagina.error()).toContain('No hay conexión');
    expect(pagina.enviando()).toBe(false);

    entorno.red.caida = false;
    await pagina.ingresar();
    expect(entorno.sesion.autenticado()).toBe(true);
  });

  it('rechaza las cuentas que no son de bodega', async () => {
    pagina.email.set('vendedor@rockstar.cl');
    pagina.password.set('vendedor123');

    await pagina.ingresar();

    expect(entorno.sesion.autenticado()).toBe(false);
    expect(pagina.error()).toBe('Esta app es solo para el personal de bodega.');
  });
});
