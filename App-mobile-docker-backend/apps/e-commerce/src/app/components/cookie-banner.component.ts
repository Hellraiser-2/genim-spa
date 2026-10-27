import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

const COOKIES_KEY = 'rockstar.tienda.cookies';

type CookieChoice = 'TODAS' | 'NECESARIAS';

function storedChoice(): CookieChoice | null {
  try {
    const raw = localStorage.getItem(COOKIES_KEY);
    return raw ? (JSON.parse(raw) as { decision: CookieChoice }).decision : null;
  } catch {
    return null;
  }
}

/** El aviso está a la vista: aún no se decide. Otros avisos esperan a que se cierre para no encimarse. */
export const cookieBannerVisible = signal(storedChoice() === null);

/**
 * Aviso de cookies de la primera visita. La tienda guarda la sesión y el carrito en el
 * navegador; la decisión queda registrada y el aviso no vuelve a aparecer.
 */
@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="visible()" class="cookie-banner" role="dialog" aria-live="polite" aria-labelledby="cookie-title">
      <div class="cookie-text">
        <p id="cookie-title" class="cookie-title">🍪 Usamos cookies</p>
        <p class="cookie-body">
          Usamos cookies y el almacenamiento de este navegador para mantener tu sesión y tu carrito.
          Puedes aceptarlas todas o quedarte solo con las necesarias para que la tienda funcione.
        </p>
      </div>
      <div class="cookie-actions">
        <button type="button" class="cookie-btn secondary" (click)="decide('NECESARIAS')">Solo necesarias</button>
        <button type="button" class="cookie-btn primary" (click)="decide('TODAS')">Aceptar</button>
      </div>
    </div>
  `,
  styles: [`
    .cookie-banner {
      position: fixed;
      left: 16px;
      right: 16px;
      /* Sobre la barra de pestañas inferior. */
      bottom: calc(72px + env(safe-area-inset-bottom));
      z-index: 1002;
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: var(--bg-elevated);
      border: 1px solid #7f1d1d;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      animation: cookie-in 0.25s ease-out;
    }
    .cookie-text { flex: 1 1 280px; }
    .cookie-title { margin: 0 0 4px; font-size: 14px; font-weight: 900; color: var(--text); }
    .cookie-body { margin: 0; font-size: 13px; line-height: 1.45; color: var(--text-muted); }
    .cookie-actions { display: flex; gap: 8px; flex: 0 0 auto; margin-left: auto; }
    .cookie-btn {
      padding: 10px 16px;
      border-radius: 12px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .cookie-btn.primary { background: var(--accent); border: 1px solid var(--accent); color: #fff; }
    .cookie-btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
    .cookie-btn.secondary { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
    .cookie-btn.secondary:hover { border-color: var(--text-faint); color: var(--text); }
    .cookie-btn:focus-visible { outline: 2px solid var(--accent-hover); outline-offset: 2px; }
    @keyframes cookie-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .cookie-banner { animation: none; }
    }
  `],
})
export class CookieBannerComponent {
  readonly visible = cookieBannerVisible;

  decide(decision: CookieChoice) {
    try {
      localStorage.setItem(COOKIES_KEY, JSON.stringify({ decision, fecha: new Date().toISOString() }));
    } catch {
      // Sin almacenamiento (modo privado estricto) el aviso se cierra igual por esta visita.
    }
    this.visible.set(false);
  }
}
