import { alertCircleOutline, checkmarkCircleOutline, warningOutline } from 'ionicons/icons';
import { formatCLP } from './format';

/**
 * Cuenta de la tienda para recibir transferencias. Son datos de ejemplo: reemplazarlos
 * por los de la cuenta real antes de operar.
 */
export const DATOS_TRANSFERENCIA = {
  titular: 'Rockstar Store SpA',
  rut: '76.123.456-7',
  banco: 'Banco de Chile',
  tipoCuenta: 'Cuenta corriente',
  numero: '00-123-45678-90',
  correo: 'pagos@rockstar.cl',
};

/** Montos con que suele pagar el cliente: el siguiente múltiplo de 1.000, 5.000, 10.000 y 20.000. */
export function montosSugeridos(total: number): number[] {
  const montos = [1000, 5000, 10000, 20000].map((m) => Math.ceil(total / m) * m).filter((m) => m > total);
  return [...new Set(montos)].slice(0, 3);
}

/** Vuelto (positivo) o lo que falta (negativo) con lo recibido; `null` sin monto recibido. */
export function vueltoDe(total: number, recibido: number | null): number | null {
  return recibido === null ? null : recibido - total;
}

/** Cuadre de caja: sin diferencia, sobra o falta efectivo. Siempre con ícono y texto. */
export function estadoCuadre(diferencia: number): { clase: string; icono: string; texto: string } {
  if (diferencia === 0) return { clase: 'cuadra', icono: checkmarkCircleOutline, texto: 'Caja cuadrada' };
  return diferencia > 0
    ? { clase: 'sobra', icono: warningOutline, texto: `Sobran ${formatCLP(diferencia)}` }
    : { clase: 'falta', icono: alertCircleOutline, texto: `Faltan ${formatCLP(-diferencia)}` };
}
