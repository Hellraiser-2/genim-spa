import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OPCION_NUEVA, SelectorConNuevoComponent } from './selector-con-nuevo.component';

describe('SelectorConNuevoComponent', () => {
  let fixture: ComponentFixture<SelectorConNuevoComponent>;
  let selector: SelectorConNuevoComponent;
  let elemento: HTMLElement;

  const opciones = () => [...elemento.querySelectorAll('ion-select-option')].map((o) => o.textContent?.trim());

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectorConNuevoComponent);
    fixture.componentRef.setInput('etiqueta', 'Banda');
    fixture.componentRef.setInput('opciones', ['AC/DC', 'Metallica']);
    fixture.componentRef.setInput('opcionVacia', 'Sin banda');
    fixture.componentRef.setInput('textoNueva', 'Agregar banda nueva…');
    fixture.componentRef.setInput('etiquetaNueva', 'Nombre de la banda nueva');
    fixture.detectChanges();
    selector = fixture.componentInstance;
    elemento = fixture.nativeElement;
  });

  it('lista la opción vacía, los valores existentes y la opción para agregar uno nuevo', () => {
    expect(opciones()).toEqual(['Sin banda', 'AC/DC', 'Metallica', 'Agregar banda nueva…']);
  });

  it('no ofrece la opción vacía cuando elegir es obligatorio', () => {
    fixture.componentRef.setInput('opcionVacia', null);
    fixture.detectChanges();

    expect(opciones()).toEqual(['AC/DC', 'Metallica', 'Agregar banda nueva…']);
  });

  it('toma el valor elegido en la lista sin mostrar el campo de texto', () => {
    selector.seleccionar('Metallica');
    fixture.detectChanges();

    expect(selector.valor()).toBe('Metallica');
    expect(selector.seleccion()).toBe('Metallica');
    expect(elemento.querySelector('ion-input')).toBeNull();
  });

  it('muestra un campo para escribir el valor nuevo al elegir agregar', () => {
    selector.seleccionar('Metallica');
    selector.seleccionar(OPCION_NUEVA);
    fixture.detectChanges();

    expect(selector.valor()).toBe('');
    expect(selector.seleccion()).toBe(OPCION_NUEVA);
    expect(elemento.querySelector('ion-input')).not.toBeNull();

    selector.valor.set('Motörhead');
    expect(selector.seleccion()).toBe(OPCION_NUEVA);
  });

  it('al guardar el valor nuevo lo deja elegido, lo muestra en la lista y avisa para registrarlo', () => {
    const guardadas: string[] = [];
    selector.nueva.subscribe((nombre) => guardadas.push(nombre));
    selector.seleccionar(OPCION_NUEVA);
    selector.valor.set('  Motörhead ');

    selector.guardarNueva();
    fixture.detectChanges();

    expect(guardadas).toEqual(['Motörhead']);
    expect(selector.valor()).toBe('Motörhead');
    expect(selector.seleccion()).toBe('Motörhead');
    expect(selector.agregando()).toBe(false);
    expect(opciones()).toEqual(['Sin banda', 'AC/DC', 'Metallica', 'Motörhead', 'Agregar banda nueva…']);
  });

  it('no guarda un nombre vacío', () => {
    const guardadas: string[] = [];
    selector.nueva.subscribe((nombre) => guardadas.push(nombre));
    selector.seleccionar(OPCION_NUEVA);
    selector.valor.set('   ');

    selector.guardarNueva();

    expect(guardadas).toEqual([]);
    expect(selector.agregando()).toBe(true);
  });

  it('oculta el campo de texto al volver a elegir un valor de la lista', () => {
    selector.seleccionar(OPCION_NUEVA);
    selector.valor.set('Motörhead');
    selector.seleccionar('');
    fixture.detectChanges();

    expect(selector.valor()).toBe('');
    expect(selector.agregando()).toBe(false);
    expect(elemento.querySelector('ion-input')).toBeNull();
  });
});
