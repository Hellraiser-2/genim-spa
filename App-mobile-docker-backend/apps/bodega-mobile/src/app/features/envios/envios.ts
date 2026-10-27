import type { EstadoPedido, Pedido } from '@rockstar/contracts';

export type GrupoDeEnvio = 'POR_ENVIAR' | 'EN_CAMINO' | 'ENVIADOS';

export const GRUPOS_DE_ENVIO: readonly { valor: GrupoDeEnvio; etiqueta: string }[] = [
  { valor: 'POR_ENVIAR', etiqueta: 'Por enviar' },
  { valor: 'EN_CAMINO', etiqueta: 'En camino' },
  { valor: 'ENVIADOS', etiqueta: 'Enviados' },
];

const ETIQUETAS_DE_ESTADO: Record<EstadoPedido, string> = {
  PAGADO: 'Pagado',
  EN_PREPARACION: 'En preparación',
  DESPACHO_PENDIENTE: 'Despacho pendiente',
  ATENCION_MANUAL: 'Atención manual',
  DESPACHADO: 'En camino',
  ENTREGADO: 'Entregado',
};

/** Horas desde el pago a partir de las cuales un pedido sin despachar se destaca como urgente. */
const HORAS_PARA_URGENTE = 18;
const HORA_MS = 60 * 60 * 1000;

export function etiquetaDeEstado(estado: EstadoPedido): string {
  return ETIQUETAS_DE_ESTADO[estado];
}

export function grupoDeEnvio(estado: EstadoPedido): GrupoDeEnvio {
  switch (estado) {
    case 'DESPACHADO':
      return 'EN_CAMINO';
    case 'ENTREGADO':
      return 'ENVIADOS';
    default:
      return 'POR_ENVIAR';
  }
}

const tiempo = (fecha: string | undefined) => (fecha ? new Date(fecha).getTime() : 0);

/**
 * Separa los pedidos en por enviar (el más antiguo primero, para despacharlo antes),
 * en camino y enviados (los más recientes primero).
 */
export function agruparEnvios(pedidos: Pedido[]): Record<GrupoDeEnvio, Pedido[]> {
  const delGrupo = (grupo: GrupoDeEnvio) => pedidos.filter((pedido) => grupoDeEnvio(pedido.estado) === grupo);
  return {
    POR_ENVIAR: delGrupo('POR_ENVIAR').sort((a, b) => tiempo(a.pagadoEn) - tiempo(b.pagadoEn)),
    EN_CAMINO: delGrupo('EN_CAMINO').sort((a, b) => tiempo(b.despachadoEn) - tiempo(a.despachadoEn)),
    ENVIADOS: delGrupo('ENVIADOS').sort((a, b) => tiempo(b.entregadoEn) - tiempo(a.entregadoEn)),
  };
}

export function esUrgente(pedido: Pedido, ahora = Date.now()): boolean {
  return grupoDeEnvio(pedido.estado) === 'POR_ENVIAR' && ahora - tiempo(pedido.pagadoEn) > HORAS_PARA_URGENTE * HORA_MS;
}

export function haceCuanto(fecha: string, ahora = Date.now()): string {
  const horas = (ahora - tiempo(fecha)) / HORA_MS;
  if (horas < 1) {
    return `hace ${Math.max(1, Math.round(horas * 60))} min`;
  }
  if (horas < 48) {
    return `hace ${Math.floor(horas)} h`;
  }
  return `hace ${Math.floor(horas / 24)} días`;
}

/** Momento que describe el pedido según su grupo: pago, despacho o entrega. */
export function momentoDelPedido(pedido: Pedido, ahora = Date.now()): string {
  switch (grupoDeEnvio(pedido.estado)) {
    case 'EN_CAMINO':
      return pedido.despachadoEn ? `Despachado ${haceCuanto(pedido.despachadoEn, ahora)}` : 'Despachado';
    case 'ENVIADOS':
      return pedido.entregadoEn ? `Entregado ${haceCuanto(pedido.entregadoEn, ahora)}` : 'Entregado';
    default:
      return `Pagado ${haceCuanto(pedido.pagadoEn, ahora)}`;
  }
}
