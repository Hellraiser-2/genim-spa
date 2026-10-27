import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { servidorInterceptor } from './app/core/api/servidor.interceptor';
import { ServidorService } from './app/core/api/servidor.service';
import { mockInterceptor } from './app/core/mock/mock.interceptor';
import { authInterceptor } from './app/core/sesion/auth.interceptor';
import { SesionService } from './app/core/sesion/sesion.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, mockInterceptor, servidorInterceptor])),
    // La conexión y la sesión guardadas se recuperan antes de la primera navegación, para que los guards las vean.
    provideAppInitializer(async () => {
      await inject(ServidorService).restaurar();
    }),
    provideAppInitializer(() => inject(SesionService).restaurar()),
  ],
});
