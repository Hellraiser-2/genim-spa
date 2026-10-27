/** Formato de error común a todos los servicios. */
export interface ErrorApi {
  codigo: CodigoError | string;
  mensaje: string;
  detalle?: unknown;
}

export type CodigoError =
  | 'CREDENCIALES_INVALIDAS'
  | 'SESION_INVALIDA'
  | 'ACCESO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'DATOS_INVALIDOS'
  | 'STOCK_INSUFICIENTE'
  | 'UNIDADES_RESERVADAS'
  | 'EXISTENCIA_EN_BODEGA'
  | 'COBRO_YA_USADO'
  | 'VARIANTE_INACTIVA'
  | 'VARIANTE_DUPLICADA'
  | 'PRODUCTO_DUPLICADO'
  | 'EMAIL_EN_USO'
  | 'PEDIDO_NO_PAGADO'
  | 'TRANSPORTISTA_NO_DISPONIBLE'
  | 'ASESOR_NO_CONFIGURADO'
  | 'ASESOR_NO_DISPONIBLE';
