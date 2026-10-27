import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImagenPrendaComponent } from './imagen-prenda.component';

describe('ImagenPrendaComponent', () => {
  let fixture: ComponentFixture<ImagenPrendaComponent>;
  let elemento: HTMLElement;

  function mostrar(url: string | null, alt = ''): void {
    fixture.componentRef.setInput('url', url);
    fixture.componentRef.setInput('alt', alt);
    fixture.detectChanges();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ImagenPrendaComponent);
    elemento = fixture.nativeElement;
  });

  it('muestra la foto de la prenda con su texto alternativo', () => {
    mostrar('assets/prendas/polera-calavera.svg', 'Foto de Polera Calavera');

    const imagen = elemento.querySelector('img');
    expect(imagen?.getAttribute('src')).toBe('assets/prendas/polera-calavera.svg');
    expect(imagen?.getAttribute('alt')).toBe('Foto de Polera Calavera');
  });

  it('muestra "Sin foto" cuando el producto no tiene imagen', () => {
    mostrar(null);

    expect(elemento.querySelector('img')).toBeNull();
    expect(elemento.textContent).toContain('Sin foto');
  });

  it('muestra "Sin foto" cuando la imagen no se puede cargar', () => {
    mostrar('assets/prendas/no-existe.svg');

    elemento.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(elemento.querySelector('img')).toBeNull();
    expect(elemento.textContent).toContain('Sin foto');
  });

  it('vuelve a mostrar la foto cuando cambia a una dirección distinta de la que falló', () => {
    mostrar('assets/prendas/no-existe.svg');
    elemento.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    mostrar('assets/prendas/jeans-rasgado.svg');

    expect(elemento.querySelector('img')?.getAttribute('src')).toBe('assets/prendas/jeans-rasgado.svg');
  });
});
