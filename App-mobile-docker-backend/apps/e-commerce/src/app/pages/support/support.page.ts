import { Component, signal, ElementRef, ViewChild, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonButton,
  IonInput,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sendOutline, callOutline, arrowForwardOutline, chatbubblesOutline, closeOutline } from 'ionicons/icons';
import type { PedidoCliente } from '@rockstar/contracts';
import { CONTEXTO_INICIAL, ContextoRoxy, responder } from '../../data/roxy';
import { AuthService } from '../../services/auth.service';
import { ProductsService } from '../../services/products.service';
import { ShopApi } from '../../services/shop.api';

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonButton, IonInput],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="chatbubbles-outline"></ion-icon> Soporte</div>
          <h1>Hola, soy Roxy 🎸</h1>
          <p class="text-muted">Tu asistente virtual de Rockstar e-commerce. ¿En qué te puedo ayudar?</p>
        </div>

        <div class="chat-card">
          <div class="chat-header">
            <div class="avatar">R</div>
            <div>
              <div class="chat-name">Roxy · Soporte Rockstar</div>
              <div class="chat-status"><span class="dot"></span> En línea</div>
            </div>
          </div>

          <div class="chat-body" #scrollContainer>
            <div *ngFor="let m of messages()" class="bubble" [class.user]="m.from === 'user'">
              <div class="bubble-text" [innerHTML]="format(m.text)"></div>
            </div>
          </div>

          <div class="quick-replies">
            <button class="chip" *ngFor="let q of quickReplies" (click)="send(q)">{{ q }}</button>
          </div>

          <div class="chat-input">
            <ion-input
              [(ngModel)]="inputText"
              (keydown.enter)="send()"
              placeholder="Escribe tu mensaje..."
              fill="outline"
              mode="dark"
            ></ion-input>
            <ion-button class="btn-rockstar send-btn" (click)="send()">
              <ion-icon slot="icon-only" name="send-outline"></ion-icon>
            </ion-button>
          </div>

          <a [href]="whatsappUrl" target="_blank" rel="noopener" class="wa-link">
            <ion-icon name="call-outline"></ion-icon>
            Continuar en WhatsApp
            <ion-icon name="arrow-forward-outline"></ion-icon>
          </a>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 20px; }
    .page-title h1 { margin: 8px 0; font-size: 24px; font-weight: 900; }
    .chat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
    .chat-header { display: flex; align-items: center; gap: 12px; padding: 16px; background: linear-gradient(90deg, #047857, #059669); color: #fff; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); display: grid; place-items: center; font-weight: 900; font-size: 18px; }
    .chat-name { font-weight: 700; font-size: 14px; }
    .chat-status { display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: 0.9; }
    .chat-status .dot { width: 6px; height: 6px; border-radius: 50%; background: #a7f3d0; }
    .chat-body { padding: 16px; min-height: 300px; max-height: 400px; overflow-y: auto; background: #0b141a; display: flex; flex-direction: column; gap: 8px; }
    .bubble { max-width: 80%; padding: 8px 12px; border-radius: 16px; font-size: 13px; line-height: 1.4; align-self: flex-start; background: #27272a; }
    .bubble.user { align-self: flex-end; background: #059669; color: #fff; }
    .bubble-text { white-space: pre-line; }
    .quick-replies { display: flex; gap: 8px; padding: 8px 16px; overflow-x: auto; border-top: 1px solid #18181b; }
    .chip {
      background: #18181b; border: 1px solid var(--border);
      border-radius: 999px; padding: 6px 12px;
      color: var(--text-muted); font-size: 11px; font-weight: 600;
      white-space: nowrap; cursor: pointer;
    }
    .chip:hover { border-color: #059669; color: #fff; }
    .chat-input { display: flex; gap: 8px; padding: 12px 16px; align-items: center; border-top: 1px solid #18181b; }
    .send-btn { margin: 0; --padding-start: 12px; --padding-end: 12px; }
    .wa-link {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px; border-top: 1px solid #18181b;
      color: #34d399; font-size: 12px; font-weight: 600;
      text-decoration: none;
    }
    .wa-link:hover { background: #18181b; }
  `],
})
export class SupportPage implements AfterViewChecked {
  router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductsService);
  private readonly api = inject(ShopApi);
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;

  whatsappUrl = `https://wa.me/56900000000?text=${encodeURIComponent('Hola Roxy, necesito ayuda con un pedido 🎸')}`;

  quickReplies = ['Rastrear mi pedido', 'Quiero hacer una devolución', '¿Qué talla soy?', 'Costo de envío', 'Hablar con un agente'];
  inputText = '';

  /** Lo que Roxy recuerda de la conversación: si ya saludó y qué respuesta espera. */
  private contexto: ContextoRoxy = CONTEXTO_INICIAL;
  /** Pedidos del cliente con sesión, para contestarle por ellos; `null` si no hay o no cargaron. */
  private pedidos: PedidoCliente[] | null = null;

  messages = signal<ChatMessage[]>([
    { from: 'bot', text: '¡Hola! Soy *Roxy*, tu asistente de Rockstar 🚀 ¿En qué te puedo ayudar hoy?' },
    { from: 'bot', text: 'Puedo ayudarte con:\n1. 📦 Rastreo de pedidos\n2. 🔄 Cambios y devoluciones\n3. 💳 Métodos de pago\n4. 👕 Consultas de productos' },
  ]);

  constructor() {
    addIcons({
      'send-outline': sendOutline,
      'call-outline': callOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'chatbubbles-outline': chatbubblesOutline,
      'close-outline': closeOutline,
    });
    // Roxy contesta por precios y tallas con el catálogo, y a un cliente por sus pedidos.
    if (!this.products.loaded() && !this.products.loading()) {
      void this.products.load();
    }
    if (this.auth.isCustomer()) {
      this.api.myOrders().then(
        (pedidos) => (this.pedidos = pedidos),
        () => (this.pedidos = null),
      );
    }
  }

  ngAfterViewChecked() {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  send(text?: string) {
    const value = (text ?? this.inputText).trim();
    if (!value) return;
    this.messages.update((m) => [...m, { from: 'user', text: value }]);
    this.inputText = '';
    const esCliente = this.auth.isCustomer();
    const respuesta = responder(value, this.contexto, {
      nombre: esCliente ? (this.auth.user()?.name ?? null) : null,
      esCliente,
      productos: this.products.products(),
      pedidos: this.pedidos,
    });
    this.contexto = respuesta.contexto;
    setTimeout(() => {
      this.messages.update((m) => [...m, { from: 'bot', text: respuesta.texto }]);
    }, 600);
  }

  /** Lo escrito se muestra como texto: se escapa antes de dar formato a las *negritas* y los saltos de línea. */
  format(text: string): string {
    const escapado = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return escapado.replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }
}
