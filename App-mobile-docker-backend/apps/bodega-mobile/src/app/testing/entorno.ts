import { HttpErrorResponse, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SesionResponse, VarianteStock } from '@rockstar/contracts';
import { firstValueFrom, switchMap, throwError } from 'rxjs';

import { BackendSimulado } from '../core/mock/backend-simulado';
import { mockInterceptor } from '../core/mock/mock.interceptor';
import { AlmacenSesion } from '../core/sesion/almacen-sesion';
import { authInterceptor } from '../core/sesion/auth.interceptor';
import { SesionService } from '../core/sesion/sesion.service';
import { EscanerService, ResultadoEscaneo } from '../features/escaner/escaner.service';
import { InventarioApi } from '../features/inventario/inventario.api';
import { AvisosService } from '../shared/avisos.service';

/** Sesión guardada en memoria en lugar del almacenamiento del dispositivo. */
export class AlmacenEnMemoria {
  sesion: SesionResponse | null = null;

  async leer(): Promise<SesionResponse | null> {
    return this.sesion;
  }
  async guardar(sesion: SesionResponse): Promise<void> {
    this.sesion = sesion;
  }
  async borrar(): Promise<void> {
    this.sesion = null;
  }
}

/** Simula fallas de red entre la app y el backend. */
export class Red {
  /** La solicitud no llega al servidor. */
  caida = false;
  /** El servidor procesa la solicitud pero la respuesta se pierde. */
  pierdeRespuestas = false;
  solicitudes = 0;
}

export class EscanerSimulado {
  resultado: ResultadoEscaneo = { estado: 'cancelado' };

  async escanear(): Promise<ResultadoEscaneo> {
    return this.resultado;
  }
}

export class AvisosSimulados {
  mensajes: string[] = [];

  async exito(mensaje: string): Promise<void> {
    this.mensajes.push(mensaje);
  }
}

const sinConexion = () => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });

export interface EntornoDePrueba {
  almacen: AlmacenEnMemoria;
  avisos: AvisosSimulados;
  backend: BackendSimulado;
  escaner: EscanerSimulado;
  red: Red;
  sesion: SesionService;
  /** Inicia sesión con la cuenta de bodega del backend simulado. */
  iniciarSesion(): Promise<void>;
  variante(codigo: string): Promise<VarianteStock>;
}

/** Configura TestBed con el backend simulado completo, sin dispositivo ni servicios reales. */
export function configurarEntorno(): EntornoDePrueba {
  const almacen = new AlmacenEnMemoria();
  const avisos = new AvisosSimulados();
  const escaner = new EscanerSimulado();
  const red = new Red();

  const redInterceptor: HttpInterceptorFn = (solicitud, next) => {
    red.solicitudes++;
    if (red.caida) {
      return throwError(sinConexion);
    }
    if (red.pierdeRespuestas) {
      return next(solicitud).pipe(switchMap(() => throwError(sinConexion)));
    }
    return next(solicitud);
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor, redInterceptor, mockInterceptor])),
      { provide: AlmacenSesion, useValue: almacen },
      { provide: AvisosService, useValue: avisos },
      { provide: EscanerService, useValue: escaner },
    ],
  });

  const sesion = TestBed.inject(SesionService);
  return {
    almacen,
    avisos,
    backend: TestBed.inject(BackendSimulado),
    escaner,
    red,
    sesion,
    iniciarSesion: () => sesion.iniciar('bodega@rockstar.cl', 'bodega123'),
    variante: (codigo) => firstValueFrom(TestBed.inject(InventarioApi).variantePorCodigo(codigo)),
  };
}
