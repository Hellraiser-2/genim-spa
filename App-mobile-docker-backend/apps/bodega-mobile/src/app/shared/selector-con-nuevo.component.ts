import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonButton, IonInput, IonItem, IonSelect, IonSelectOption } from '@ionic/angular';

import { valorDeEvento } from './formato';

/** Valor de la opción que permite escribir un valor que aún no está en la lista. */
export const OPCION_NUEVA = '__nueva__';

/**
 * Lista desplegable de valores existentes con una opción final para agregar uno nuevo.
 * Al elegirla aparece un campo de texto donde escribirlo y un botón para guardarlo.
 */
@Component({
  selector: 'app-selector-con-nuevo',
  imports: [IonButton, IonInput, IonItem, IonSelect, IonSelectOption],
  template: `
    <ion-item>
      <ion-select
        interface="action-sheet"
        cancelText="Cancelar"
        placeholder="Selecciona"
        [label]="etiqueta()"
        [value]="seleccion()"
        [disabled]="deshabilitado()"
        (ionChange)="seleccionar(valorDe($event))"
      >
        @if (opcionVacia(); as vacia) {
          <ion-select-option value="">{{ vacia }}</ion-select-option>
        }
        @for (opcion of opcionesVisibles(); track opcion) {
          <ion-select-option [value]="opcion">{{ opcion }}</ion-select-option>
        }
        <ion-select-option [value]="opcionNueva">{{ textoNueva() }}</ion-select-option>
      </ion-select>
    </ion-item>
    @if (agregando()) {
      <ion-item>
        <ion-input
          labelPlacement="stacked"
          [label]="etiquetaNueva()"
          [value]="valor()"
          [disabled]="deshabilitado()"
          (ionInput)="valor.set(valorDe($event))"
        ></ion-input>
        <ion-button
          slot="end"
          fill="outline"
          [disabled]="deshabilitado() || valor().trim() === ''"
          (click)="guardarNueva()"
        >
          Guardar
        </ion-button>
      </ion-item>
    }
  `,
})
export class SelectorConNuevoComponent {
  readonly etiqueta = input.required<string>();
  readonly opciones = input<string[]>([]);
  /** Texto de la opción que deja el valor vacío, por ejemplo "Sin banda". Sin ella, elegir es obligatorio. */
  readonly opcionVacia = input<string | null>(null);
  /** Texto de la opción para agregar un valor nuevo, por ejemplo "Agregar banda nueva…". */
  readonly textoNueva = input.required<string>();
  /** Etiqueta del campo donde se escribe el valor nuevo. */
  readonly etiquetaNueva = input.required<string>();
  readonly deshabilitado = input(false);
  readonly valor = model('');
  /** Se emite con el nombre escrito cuando se pide guardarlo como valor nuevo de la lista. */
  readonly nueva = output<string>();

  /** Verdadero mientras se escribe un valor que no está en la lista. */
  readonly agregando = signal(false);
  /** Opción marcada en la lista. */
  readonly seleccion = computed(() => (this.agregando() ? OPCION_NUEVA : this.valor()));

  /** Incluye el valor actual aunque la lista aún no lo traiga, para que se vea seleccionado. */
  protected readonly opcionesVisibles = computed(() => {
    const valor = this.valor();
    const opciones = this.opciones();
    return this.agregando() || valor === '' || opciones.includes(valor) ? opciones : [...opciones, valor];
  });

  protected readonly opcionNueva = OPCION_NUEVA;
  protected readonly valorDe = valorDeEvento;

  seleccionar(opcion: string): void {
    this.agregando.set(opcion === OPCION_NUEVA);
    this.valor.set(opcion === OPCION_NUEVA ? '' : opcion);
  }

  /** Deja el nombre escrito como valor elegido y avisa para que se registre en la lista. */
  guardarNueva(): void {
    const nombre = this.valor().trim();
    if (nombre === '') {
      return;
    }
    this.valor.set(nombre);
    this.agregando.set(false);
    this.nueva.emit(nombre);
  }
}
