import { Component, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';

import { EnvioIdempotente } from '../core/api/envio-idempotente';

/** Muestra el error del último envío y, si quedó sin confirmar, permite reintentarlo. */
@Component({
  selector: 'app-estado-envio',
  imports: [IonButton],
  template: `
    @if (envio().error(); as error) {
      <div class="estado" role="alert">
        <p class="error">{{ error }}</p>
        @if (envio().reintentable()) {
          <p class="nota">Los datos se conservaron. Reintentar no duplica la operación.</p>
          <ion-button expand="block" [disabled]="envio().enviando()" (click)="reintentar.emit()">
            Reintentar
          </ion-button>
          <ion-button expand="block" fill="clear" [disabled]="envio().enviando()" (click)="envio().reiniciar()">
            Modificar los datos
          </ion-button>
        }
      </div>
    }
  `,
  styles: `
    .estado {
      margin: 12px 16px;
      padding: 14px;
      border: 1px solid rgba(255, 92, 92, 0.32);
      border-radius: var(--rs-radio-chico);
      background: rgba(255, 92, 92, 0.1);
    }
    p {
      margin: 0;
      line-height: 1.45;
    }
    .error {
      color: #ff8f8f;
      font-weight: 600;
    }
    .nota {
      margin: 6px 0 8px;
      color: var(--rs-tenue);
      font-size: 0.9rem;
    }
  `,
})
export class EstadoEnvioComponent {
  readonly envio = input.required<EnvioIdempotente>();
  readonly reintentar = output<void>();
}
