import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import type { FuenteAsesor, MensajeAsesor } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { sendOutline, sparklesOutline } from 'ionicons/icons';
import { errorMessage } from '../core/api';
import { AdminService } from '../services/admin.service';

/** Un turno tal como se muestra: el del asesor trae además las páginas en que se apoyó. */
interface Turn extends MensajeAsesor {
  sources: FuenteAsesor[];
}

/** Largo máximo de una pregunta; el backend impone el mismo. */
const MAX_QUESTION_LENGTH = 4000;

/**
 * Chat con IA del Gerente, para conversar en qué bandas y tipos de producto invertir. Es
 * opcional: usa un servicio de pago y solo aparece si el backend tiene su clave; sin ella,
 * el panel muestra las recomendaciones por reglas y nada más. El backend le entrega al
 * asesor los datos de la tienda al momento de cada pregunta, y el asesor busca en internet
 * qué pasa con las bandas. La conversación vive solo en esta pantalla: al salir se pierde.
 */
@Component({
  selector: 'app-advisor-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  template: `
    <section class="advisor card-rockstar" *ngIf="ready()">
      <div class="head">
        <ion-icon name="sparkles-outline" color="danger"></ion-icon>
        <div>
          <h3>Pregúntale al asesor</h3>
          <p class="text-faint">
            Un asistente con IA que conoce las ventas y el stock de la tienda y busca en internet lo que pasa con las bandas, para
            conversar las recomendaciones de arriba.
          </p>
        </div>
        <button class="link" *ngIf="turns().length > 0 && !waiting()" (click)="restart()">Nueva conversación</button>
      </div>

      <div class="suggestions" *ngIf="turns().length === 0">
        <button class="chip" *ngFor="let suggestion of suggestions" (click)="ask(suggestion)">{{ suggestion }}</button>
      </div>

      <div class="turns" #turnsBox *ngIf="turns().length > 0" aria-live="polite">
        <div class="turn" *ngFor="let turn of turns()" [class.mine]="turn.rol === 'usuario'">
          <div class="who">{{ turn.rol === 'usuario' ? 'Tú' : 'Asesor' }}</div>
          <!-- Texto plano con interpolación: lo que venga se muestra como texto, nunca como HTML. -->
          <div class="text">{{ turn.texto }}</div>
          <div class="sources" *ngIf="turn.sources.length > 0">
            <span>Fuentes:</span>
            <a *ngFor="let source of turn.sources" [href]="source.url" target="_blank" rel="noopener noreferrer">{{ source.titulo }}</a>
          </div>
        </div>
        <div class="turn waiting" *ngIf="waiting()">
          <div class="who">Asesor</div>
          <div class="text">Revisando los datos de la tienda y buscando en internet… Puede tardar un par de minutos.</div>
        </div>
      </div>

      <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>

      <form class="ask" (ngSubmit)="ask(question)">
        <textarea
          name="question"
          rows="2"
          [(ngModel)]="question"
          [maxlength]="maxLength"
          [disabled]="waiting()"
          placeholder="Pregúntale al asesor: ¿en qué bandas invierto este mes?"
          aria-label="Pregunta para el asesor"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button type="submit" class="send" [disabled]="waiting() || !question.trim()" aria-label="Enviar pregunta">
          <ion-icon name="send-outline"></ion-icon>
        </button>
      </form>
      <p class="fine">
        Cada pregunta consume saldo del servicio de IA. Sus recomendaciones son un apoyo: revisa las fuentes antes de comprar.
      </p>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .advisor { padding: 20px; margin-bottom: 20px; }
    .head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
    .head > ion-icon { flex: none; font-size: 20px; margin-top: 2px; }
    .head > div { flex: 1; min-width: 0; }
    .head h3 { margin: 0 0 4px; font-size: 16px; }
    .head p { margin: 0; font-size: 12px; line-height: 1.5; }
    .link { flex: none; padding: 0; background: none; border: none; color: var(--text-muted); font-size: 12px; text-decoration: underline; cursor: pointer; }
    .link:hover { color: #fff; }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .chip {
      padding: 8px 12px; border: 1px solid var(--border); border-radius: 999px;
      background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; text-align: left; cursor: pointer;
    }
    .chip:hover, .chip:focus-visible { border-color: var(--accent); color: #fff; }
    .turns { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow-y: auto; margin-bottom: 14px; padding-right: 4px; }
    .turn { align-self: flex-start; max-width: 100%; padding: 12px 14px; border: 1px solid #27272a; border-radius: 14px; background: rgba(9, 9, 11, 0.5); }
    .turn.mine { align-self: flex-end; max-width: 85%; border-color: rgba(185, 28, 28, 0.5); background: rgba(127, 29, 29, 0.25); }
    .turn.waiting .text { color: var(--text-muted); font-style: italic; }
    .who { margin-bottom: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
    .text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
    .sources { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #27272a; font-size: 11px; color: var(--text-faint); }
    .sources a { color: #fca5a5; overflow-wrap: anywhere; }
    .error-msg {
      margin: 0 0 12px; padding: 10px 12px; border-radius: 8px;
      background: rgba(127, 29, 29, 0.3); border: 1px solid #7f1d1d; color: #fca5a5; font-size: 13px;
    }
    .ask { display: flex; align-items: flex-end; gap: 8px; }
    .ask textarea {
      flex: 1; min-width: 0; padding: 10px 12px; resize: vertical;
      background: #0c0c0c; border: 1px solid var(--border); border-radius: 12px;
      color: var(--text); font: inherit; font-size: 14px; line-height: 1.5;
    }
    .ask textarea:focus { outline: none; border-color: var(--accent); }
    .send {
      flex: none; display: grid; place-items: center; width: 44px; height: 44px;
      background: var(--accent); border: none; border-radius: 12px; color: #fff; font-size: 18px; cursor: pointer;
    }
    .send:hover:not(:disabled) { background: var(--accent-hover); }
    .send:disabled { opacity: 0.4; cursor: default; }
    .fine { margin: 8px 0 0; font-size: 11px; color: var(--text-faint); }
  `],
})
export class AdvisorChatComponent {
  private readonly admin = inject(AdminService);
  private readonly turnsBox = viewChild<ElementRef<HTMLElement>>('turnsBox');

  /** `null` mientras no se sabe si el asesor tiene su clave. */
  ready = signal<boolean | null>(null);
  turns = signal<Turn[]>([]);
  waiting = signal(false);
  error = signal('');
  question = '';

  maxLength = MAX_QUESTION_LENGTH;
  suggestions = [
    '¿En qué bandas me conviene invertir ahora?',
    '¿Qué tipos de producto debería reponer o sumar?',
    '¿Qué bandas vienen a Chile y qué debería tener en stock para esas fechas?',
  ];

  constructor() {
    addIcons({ 'sparkles-outline': sparklesOutline, 'send-outline': sendOutline });
    void this.checkReady();
  }

  private async checkReady() {
    try {
      this.ready.set(await this.admin.advisorReady());
    } catch {
      // Sin saber si está activado, el chat no se muestra; las recomendaciones no dependen de él.
      this.ready.set(false);
    }
  }

  /** Enter envía la pregunta; con Mayús hace un salto de línea. */
  onEnter(event: Event) {
    if (!(event as KeyboardEvent).shiftKey) {
      event.preventDefault();
      void this.ask(this.question);
    }
  }

  async ask(text: string) {
    const question = text.trim();
    if (question === '' || this.waiting()) return;
    const previous = this.turns();
    this.turns.set([...previous, { rol: 'usuario', texto: question, sources: [] }]);
    this.question = '';
    this.error.set('');
    this.waiting.set(true);
    this.scrollToEnd();
    try {
      const answer = await this.admin.askAdvisor(this.turns().map(({ rol, texto }) => ({ rol, texto })));
      this.turns.update((turns) => [...turns, { rol: 'asesor', texto: answer.texto, sources: answer.fuentes }]);
    } catch (error) {
      // La pregunta que no se respondió vuelve al campo, para reintentarla sin escribirla de nuevo.
      this.turns.set(previous);
      this.question = question;
      this.error.set(errorMessage(error));
    } finally {
      this.waiting.set(false);
      this.scrollToEnd();
    }
  }

  restart() {
    this.turns.set([]);
    this.error.set('');
  }

  /** Deja a la vista lo último de la conversación, una vez que la pantalla lo dibujó. */
  private scrollToEnd() {
    setTimeout(() => {
      const box = this.turnsBox()?.nativeElement;
      box?.scrollTo({ top: box.scrollHeight });
    });
  }
}
