import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string>('');
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, durationMs = 2800): void {
    this.message.set(message);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(''), durationMs);
  }

  clear(): void {
    this.message.set('');
    if (this.timer) clearTimeout(this.timer);
  }
}
